import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { Terminal } from "./types";

interface PtyDataEvent {
  id: string;
  data: number[];
}

interface PtyExitEvent {
  id: string;
  code?: number;
}

type TerminalStatus = Terminal["status"];
type StatusSubscriber = (ptyId: string, status: TerminalStatus) => void;

/**
 * Global PTY output buffer.
 * Captures pty-data events for PTYs that have no active xterm consumer,
 * so terminal output is preserved when switching projects.
 * Also tracks terminal status (idle/running/waiting/done/error).
 */

const MAX_BUFFER_BYTES = 1_000_000; // ~1MB per PTY
const IDLE_DEBOUNCE_MS = 3_000;
const RUNNING_DELAY_MS = 300; // delay before showing "running" to filter noise (focus, resize, status line)
const RECENT_OUTPUT_MAX = 4_000; // bytes of recent output to keep for heuristic

const buffers = new Map<string, Uint8Array[]>();
const bufferSizes = new Map<string, number>();
const exitedPtys = new Map<string, number | undefined>(); // ptyId -> exit code
const activePtys = new Set<string>(); // PTYs with a live xterm consumer

// Serialized xterm screen content — preserved across unmount/remount cycles
const serializedScreens = new Map<string, string>();

// Status tracking
const ptyStatuses = new Map<string, TerminalStatus>();
const doneFadeTimers = new Map<string, ReturnType<typeof setTimeout>>();
const DONE_FADE_MS = 2_000; // delay before "done" fades to "idle" on focus
const ptyIsLlm = new Map<string, boolean>();
const statusTimers = new Map<string, ReturnType<typeof setTimeout>>();
const recentOutput = new Map<string, string>(); // rolling window of decoded text
const runningTimers = new Map<string, ReturnType<typeof setTimeout>>(); // delayed "running" transition
const lastDataTime = new Map<string, number>(); // timestamp of most recent pty-data
const lastUserInputTime = new Map<string, number>(); // timestamp of most recent user keystroke
const USER_INPUT_ECHO_MS = 150; // suppress "running" for this long after user input (echo window)
let statusSubscriber: StatusSubscriber | null = null;

let initialized = false;

// Patterns indicating Claude is waiting for user input
const WAITING_PATTERNS = [
  /\?\s*$/m,                    // Line ending with ?
  /\(y\/n\)/i,                  // (y/n) prompt
  /\(Y\/n\)/,                   // (Y/n) prompt
  /\[Y\/n\]/,                   // [Y/n] prompt
  /\[yes\/no\]/i,               // [yes/no] prompt
  /Press Enter/i,               // Press Enter to continue
  /approve|reject|deny/i,       // Plan approval
  /Do you want to proceed/i,    // Confirmation prompt
];

function updateStatus(ptyId: string, status: TerminalStatus) {
  const prev = ptyStatuses.get(ptyId);
  if (prev === status) return;
  ptyStatuses.set(ptyId, status);
  statusSubscriber?.(ptyId, status);
}

function checkWaitingHeuristic(ptyId: string): boolean {
  const text = recentOutput.get(ptyId) || "";
  // Check last ~500 chars for patterns
  const tail = text.slice(-500);
  return WAITING_PATTERNS.some((p) => p.test(tail));
}

function appendRecentOutput(ptyId: string, data: Uint8Array) {
  const decoder = new TextDecoder("utf-8", { fatal: false });
  const text = decoder.decode(data, { stream: true });
  const current = recentOutput.get(ptyId) || "";
  const combined = current + text;
  // Keep only the tail
  recentOutput.set(ptyId, combined.slice(-RECENT_OUTPUT_MAX));
}

export function initPtyBuffer() {
  if (initialized) return;
  initialized = true;

  listen<PtyDataEvent>("pty-data", (event) => {
    const { id, data } = event.payload;
    const chunk = new Uint8Array(data);

    // Always track status and recent output, regardless of active consumer
    appendRecentOutput(id, chunk);

    // Delayed transition to "running" — filter out noise (focus events, resize redraws, status line).
    // Only show "running" if data arrived recently (within RUNNING_DELAY_MS of the timer firing),
    // meaning output is sustained rather than a single brief burst.
    // Also suppress "running" when the output is just the echo of user keystrokes.
    lastDataTime.set(id, Date.now());
    const isLlmPty = ptyIsLlm.get(id) ?? false;
    const lastInput = lastUserInputTime.get(id) ?? 0;
    const isEcho = isLlmPty && (Date.now() - lastInput < USER_INPUT_ECHO_MS);
    const currentStatus = ptyStatuses.get(id);
    if (currentStatus !== "running" && !isEcho) {
      if (!runningTimers.has(id)) {
        runningTimers.set(
          id,
          setTimeout(() => {
            runningTimers.delete(id);
            const last = lastDataTime.get(id) ?? 0;
            const lastInput2 = lastUserInputTime.get(id) ?? 0;
            const stillEcho = Date.now() - lastInput2 < USER_INPUT_ECHO_MS;
            // If data arrived in the last 100ms and it's not just user echo → show running
            if (Date.now() - last < 100 && !stillEcho && ptyStatuses.get(id) !== "running") {
              updateStatus(id, "running");
            }
          }, RUNNING_DELAY_MS),
        );
      }
    }

    // Reset debounce timer
    const existingTimer = statusTimers.get(id);
    if (existingTimer) clearTimeout(existingTimer);

    statusTimers.set(
      id,
      setTimeout(() => {
        statusTimers.delete(id);
        const isLlm = ptyIsLlm.get(id) ?? false;
        if (isLlm) {
          // Check if Claude is waiting for input
          updateStatus(id, checkWaitingHeuristic(id) ? "waiting" : "done");
        } else {
          updateStatus(id, "idle");
        }
      }, IDLE_DEBOUNCE_MS),
    );

    // Skip buffering if an xterm is actively consuming this PTY
    if (activePtys.has(id)) return;

    if (!buffers.has(id)) {
      buffers.set(id, []);
      bufferSizes.set(id, 0);
    }
    const chunks = buffers.get(id)!;
    let size = bufferSizes.get(id)! + chunk.length;

    chunks.push(chunk);

    // Evict old chunks if over budget
    while (size > MAX_BUFFER_BYTES && chunks.length > 1) {
      size -= chunks.shift()!.length;
    }
    bufferSizes.set(id, size);
  });

  listen<PtyExitEvent>("pty-exit", (event) => {
    const { id, code } = event.payload;
    exitedPtys.set(id, code);
    // Clear any pending debounce timer
    const timer = statusTimers.get(id);
    if (timer) {
      clearTimeout(timer);
      statusTimers.delete(id);
    }
    updateStatus(id, code != null && code !== 0 ? "error" : "done");
  });
}

/** Register a callback for status changes. Only one subscriber at a time. */
export function registerStatusSubscriber(cb: StatusSubscriber) {
  statusSubscriber = cb;
}

/** Register whether a PTY is an LLM terminal (affects idle state heuristic). */
export function registerPtyLlm(ptyId: string, isLlm: boolean) {
  ptyIsLlm.set(ptyId, isLlm);
}

/** Notify that the user just typed into this PTY (so we can suppress echo-based "running"). */
export function notifyUserInput(ptyId: string) {
  lastUserInputTime.set(ptyId, Date.now());
}

/** Get the current status of a PTY. */
export function getPtyStatus(ptyId: string): TerminalStatus {
  return ptyStatuses.get(ptyId) ?? "idle";
}

/** Mark a PTY as having an active xterm consumer (stops buffering). */
export function markActive(ptyId: string) {
  activePtys.add(ptyId);
}

/** Mark a PTY as no longer having an active xterm consumer (resumes buffering). */
export function markInactive(ptyId: string) {
  activePtys.delete(ptyId);
}

/** Notify that a PTY was focused by the user. Fades "done" → "idle" after a short delay. */
export function notifyPtyFocused(ptyId: string) {
  // Clear any existing fade timer (e.g. rapid tab switching)
  const existing = doneFadeTimers.get(ptyId);
  if (existing) clearTimeout(existing);

  if (ptyStatuses.get(ptyId) === "done") {
    doneFadeTimers.set(
      ptyId,
      setTimeout(() => {
        doneFadeTimers.delete(ptyId);
        if (ptyStatuses.get(ptyId) === "done") {
          // Clear any pending debounce timer so it doesn't re-set "done"
          // (focus/resize can trigger new PTY data that restarts the debounce)
          const pending = statusTimers.get(ptyId);
          if (pending) {
            clearTimeout(pending);
            statusTimers.delete(ptyId);
          }
          updateStatus(ptyId, "idle");
        }
      }, DONE_FADE_MS),
    );
  }
}

/** Drain buffered data for a PTY. Returns chunks and clears the buffer. */
export function drainBuffer(ptyId: string): Uint8Array[] {
  const chunks = buffers.get(ptyId) || [];
  buffers.set(ptyId, []);
  bufferSizes.set(ptyId, 0);
  return chunks;
}

/** Check whether a PTY has exited while unmounted. */
export function hasExited(ptyId: string): boolean {
  return exitedPtys.has(ptyId);
}

/** Save serialized xterm screen content for a PTY (called before xterm disposal). */
export function saveScreen(ptyId: string, data: string) {
  serializedScreens.set(ptyId, data);
}

/** Retrieve and clear saved screen content for a PTY (called on xterm init). */
export function restoreScreen(ptyId: string): string | undefined {
  const data = serializedScreens.get(ptyId);
  // Don't delete — keep it in case of rapid remounts; it will be overwritten on next save
  return data;
}

/** Clean up buffer for a removed PTY. */
export function removePtyBuffer(ptyId: string) {
  buffers.delete(ptyId);
  bufferSizes.delete(ptyId);
  exitedPtys.delete(ptyId);
  activePtys.delete(ptyId);
  ptyStatuses.delete(ptyId);
  ptyIsLlm.delete(ptyId);
  recentOutput.delete(ptyId);
  serializedScreens.delete(ptyId);
  lastDataTime.delete(ptyId);
  lastUserInputTime.delete(ptyId);
  const ft = doneFadeTimers.get(ptyId);
  if (ft) { clearTimeout(ft); doneFadeTimers.delete(ptyId); }
  const rt = runningTimers.get(ptyId);
  if (rt) { clearTimeout(rt); runningTimers.delete(ptyId); }
  const timer = statusTimers.get(ptyId);
  if (timer) {
    clearTimeout(timer);
    statusTimers.delete(ptyId);
  }
}

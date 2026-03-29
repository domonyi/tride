import { listen, type UnlistenFn } from "@tauri-apps/api/event";

interface PtyDataEvent {
  id: string;
  data: number[];
}

interface PtyExitEvent {
  id: string;
}

/**
 * Global PTY output buffer.
 * Captures pty-data events for PTYs that have no active xterm consumer,
 * so terminal output is preserved when switching projects.
 */

const MAX_BUFFER_BYTES = 500_000; // ~500KB per PTY

const buffers = new Map<string, Uint8Array[]>();
const bufferSizes = new Map<string, number>();
const exitedPtys = new Set<string>();
const activePtys = new Set<string>(); // PTYs with a live xterm consumer
let initialized = false;

export function initPtyBuffer() {
  if (initialized) return;
  initialized = true;

  listen<PtyDataEvent>("pty-data", (event) => {
    const { id, data } = event.payload;
    // Skip buffering if an xterm is actively consuming this PTY
    if (activePtys.has(id)) return;

    if (!buffers.has(id)) {
      buffers.set(id, []);
      bufferSizes.set(id, 0);
    }
    const chunk = new Uint8Array(data);
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
    exitedPtys.add(event.payload.id);
  });
}

/** Mark a PTY as having an active xterm consumer (stops buffering). */
export function markActive(ptyId: string) {
  activePtys.add(ptyId);
}

/** Mark a PTY as no longer having an active xterm consumer (resumes buffering). */
export function markInactive(ptyId: string) {
  activePtys.delete(ptyId);
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

/** Clean up buffer for a removed PTY. */
export function removePtyBuffer(ptyId: string) {
  buffers.delete(ptyId);
  bufferSizes.delete(ptyId);
  exitedPtys.delete(ptyId);
  activePtys.delete(ptyId);
}

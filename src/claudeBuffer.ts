import { listen } from "@tauri-apps/api/event";
import type { ClaudeToolCall } from "./types";

interface ClaudeEventPayload {
  data: string;
}

/**
 * Global Claude session event buffer.
 * Captures claude-event messages for sessions whose pane is not currently
 * mounted (e.g. background projects), so output is preserved on project switch.
 * Also stores serialized xterm screen content across unmount/remount cycles.
 */

// Raw parsed events buffered per sessionId while unmounted
const eventBuffers = new Map<string, any[]>();

// Sessions that currently have a live xterm consumer — skip buffering for these
const activeSessions = new Set<string>();

// Serialized xterm screen content — preserved across unmount/remount cycles
const serializedScreens = new Map<string, string>();

// ---------------------------------------------------------------------------
// Tool group state — groups consecutive tool calls for compact display.
// Only the last MAX_VISIBLE_TOOLS are shown; earlier ones collapse into a
// "+N ✓" counter.  Uses a SINGLE terminal line that is overwritten in-place
// via \x1b[2K\r (clear-line + carriage-return) on each update — this avoids
// the cursor-up approach which breaks when content scrolls into the
// scrollback buffer.
// ---------------------------------------------------------------------------
interface ToolEntry {
  toolName: string;
  toolUseId?: string;
  status: "running" | "approval" | "done";
}

interface ToolGroupState {
  tools: ToolEntry[];
  rendered: boolean; // true once we've written the first render
}

const toolGroups = new Map<string, ToolGroupState>();
const MAX_VISIBLE_TOOLS = 3;

function getOrCreateToolGroup(sessionId: string): ToolGroupState {
  if (!toolGroups.has(sessionId)) {
    toolGroups.set(sessionId, { tools: [], rendered: false });
  }
  return toolGroups.get(sessionId)!;
}

/**
 * End the current tool group.
 * Finalises the single-line display with \r\n so subsequent output appears
 * below it.  Pass `xterm` so we can write the newline.
 */
function endToolGroup(
  sessionId: string,
  xterm: { write: (data: string) => void },
) {
  const group = toolGroups.get(sessionId);
  if (group?.rendered) {
    xterm.write("\r\n"); // finalise the group line
  }
  toolGroups.delete(sessionId);
}

/**
 * Render (or re-render) the tool group on a single terminal line.
 * - First render: writes \r\n to start a new line, then the content.
 * - Subsequent renders: clears the line with \x1b[2K\r and rewrites.
 * - Cursor is left at the end of the content (no trailing \r\n) so the
 *   next render can overwrite it.
 */
function renderToolGroup(
  xterm: { write: (data: string) => void },
  group: ToolGroupState,
) {
  if (group.rendered) {
    // Overwrite current line
    xterm.write("\x1b[2K\r");
  } else {
    // Move to a fresh line before first render
    xterm.write("\r\n");
    group.rendered = true;
  }

  const { tools } = group;
  const visible = tools.slice(-MAX_VISIBLE_TOOLS);
  const hiddenCount = tools.length - visible.length;

  const parts: string[] = [];

  if (hiddenCount > 0) {
    const hiddenDone = tools
      .slice(0, hiddenCount)
      .every((t) => t.status === "done");
    parts.push(`\x1b[2m+${hiddenCount} ${hiddenDone ? "✓" : "…"}\x1b[0m`);
  }

  for (const tool of visible) {
    const icon = getToolIcon(tool.toolName);
    if (tool.status === "done") {
      parts.push(`\x1b[32m${icon} ${tool.toolName} ✓\x1b[0m`);
    } else if (tool.status === "approval") {
      parts.push(`\x1b[36m${icon} ${tool.toolName} ⏳\x1b[0m`);
    } else {
      parts.push(`\x1b[33m${icon} ${tool.toolName}…\x1b[0m`);
    }
  }

  xterm.write(parts.join("  "));
  // NO trailing \r\n — cursor stays at end so we can overwrite later
}

let initialized = false;

export function initClaudeBuffer() {
  if (initialized) return;
  initialized = true;

  listen<ClaudeEventPayload>("claude-event", (event) => {
    let parsed: any;
    try {
      parsed = JSON.parse(event.payload.data);
    } catch {
      return;
    }

    const { sessionId } = parsed;

    // Broadcast events (*) are handled live by all mounted panes — no buffering needed
    if (!sessionId || sessionId === "*") return;

    // Active consumer is mounted — it handles the event directly
    if (activeSessions.has(sessionId)) return;

    if (!eventBuffers.has(sessionId)) {
      eventBuffers.set(sessionId, []);
    }
    eventBuffers.get(sessionId)!.push(parsed);
  });
}

/** Mark a session as having an active xterm consumer (stops buffering). */
export function markClaudeActive(sessionId: string) {
  activeSessions.add(sessionId);
}

/** Mark a session as no longer having an active xterm consumer (resumes buffering). */
export function markClaudeInactive(sessionId: string) {
  activeSessions.delete(sessionId);
}

/** Drain all buffered events for a session. Clears the buffer. */
export function drainClaudeBuffer(sessionId: string): any[] {
  const events = eventBuffers.get(sessionId) ?? [];
  eventBuffers.set(sessionId, []);
  return events;
}

/** Save serialized xterm screen content for a session (call before xterm.dispose()). */
export function saveClaudeScreen(sessionId: string, data: string) {
  serializedScreens.set(sessionId, data);
}

/** Retrieve saved screen content for a session (call on xterm init). */
export function restoreClaudeScreen(sessionId: string): string | undefined {
  return serializedScreens.get(sessionId);
}

/** Remove all buffered state for a closed session. */
export function removeClaudeBuffer(sessionId: string) {
  eventBuffers.delete(sessionId);
  activeSessions.delete(sessionId);
  serializedScreens.delete(sessionId);
  toolGroups.delete(sessionId);
}

// ---------------------------------------------------------------------------
// Shared event → xterm renderer
// Used both by the live listener (with callbacks) and by drainClaudeBuffer replay.
// ---------------------------------------------------------------------------

const TOOL_ICONS: Record<string, string> = {
  Read:         "▶",
  Edit:         "✎",
  Write:        "◆",
  Bash:         "$",
  Grep:         "⌕",
  Glob:         "⊞",
  Agent:        "◈",
  WebSearch:    "⊙",
  WebFetch:     "↓",
  LSP:          "λ",
  NotebookEdit: "▤",
  TodoWrite:    "☑",
  Skill:        "§",
  ToolSearch:   "⌕",
};
const DEFAULT_TOOL_ICON = "●";

function getToolIcon(toolName: string): string {
  return TOOL_ICONS[toolName] ?? DEFAULT_TOOL_ICON;
}

export interface ClaudeEventCallbacks {
  onStatusChange?: (status: string) => void;
  onToolApproval?: (toolCall: ClaudeToolCall) => void;
  onToolApprovalResolved?: (toolUseId: string) => void;
  onTurnComplete?: (totalCost: number) => void;
  onModelInfo?: (model: string) => void;
  onSdkSessionId?: (sdkSessionId: string) => void;
  onError?: (message: string) => void;
  onStartedRef?: React.MutableRefObject<boolean>;
}

/**
 * Apply a parsed claude-event to an xterm instance.
 * Pass `callbacks` to also trigger side-effects (status, approvals, etc.).
 * Omit callbacks when replaying buffered events where only display matters.
 */
export function applyClaudeEvent(
  xterm: { write: (data: string) => void },
  parsed: any,
  callbacks?: ClaudeEventCallbacks,
) {
  const sid: string | undefined = parsed.sessionId;

  switch (parsed.type) {
    case "session_started":
      if (callbacks) {
        if (parsed.model) callbacks.onModelInfo?.(parsed.model);
        if (parsed.sdkSessionId) callbacks.onSdkSessionId?.(parsed.sdkSessionId);
      }
      break;

    case "text_delta":
      if (sid) endToolGroup(sid, xterm);
      xterm.write(parsed.text.replace(/\n/g, "\r\n"));
      break;

    case "text_done":
      // Handled via streaming text_delta — nothing to do
      break;

    case "thinking_delta":
      if (sid) endToolGroup(sid, xterm);
      xterm.write(`\x1b[2m${parsed.text.replace(/\n/g, "\r\n")}\x1b[0m`);
      break;

    case "tool_use_start": {
      if (sid) {
        const group = getOrCreateToolGroup(sid);
        group.tools.push({
          toolName: parsed.toolName,
          toolUseId: parsed.toolUseId,
          status: "running",
        });
        renderToolGroup(xterm, group);
      }
      break;
    }

    case "tool_approval_required": {
      if (sid) {
        const group = getOrCreateToolGroup(sid);
        for (let i = group.tools.length - 1; i >= 0; i--) {
          if (
            group.tools[i].status === "running" &&
            group.tools[i].toolName === parsed.toolName
          ) {
            group.tools[i].status = "approval";
            group.tools[i].toolUseId = parsed.toolUseId;
            break;
          }
        }
        renderToolGroup(xterm, group);
      }
      if (callbacks) {
        callbacks.onToolApproval?.({
          toolUseId: parsed.toolUseId,
          toolName: parsed.toolName,
          input: parsed.input,
          inputDelta: "",
          status: "pending_approval",
          title: parsed.title,
          description: parsed.description,
        });
      }
      break;
    }

    case "tool_use_done": {
      if (sid) {
        const group = getOrCreateToolGroup(sid);
        for (let i = group.tools.length - 1; i >= 0; i--) {
          const t = group.tools[i];
          if (t.status !== "done") {
            const idMatch =
              parsed.toolUseId &&
              t.toolUseId &&
              t.toolUseId === parsed.toolUseId;
            const nameMatch = t.toolName === parsed.toolName;
            if (idMatch || nameMatch) {
              t.status = "done";
              if (parsed.toolUseId) t.toolUseId = parsed.toolUseId;
              break;
            }
          }
        }
        renderToolGroup(xterm, group);
      }
      if (callbacks) callbacks.onToolApprovalResolved?.(parsed.toolUseId);
      break;
    }

    case "status_change":
      if (callbacks) callbacks.onStatusChange?.(parsed.status);
      break;

    case "turn_complete":
      if (sid) endToolGroup(sid, xterm);
      xterm.write("\r\n\x1b[36m❯\x1b[0m ");
      if (callbacks) callbacks.onTurnComplete?.(parsed.totalCost);
      if (callbacks?.onStartedRef) callbacks.onStartedRef.current = true;
      break;

    case "error":
      if (sid) endToolGroup(sid, xterm);
      xterm.write(`\r\n\x1b[31m${parsed.message}\x1b[0m\r\n`);
      xterm.write("\x1b[36m❯\x1b[0m ");
      if (callbacks) callbacks.onError?.(parsed.message);
      break;

    case "session_ended":
      if (sid) endToolGroup(sid, xterm);
      xterm.write("\r\n\x1b[2m[Session ended]\x1b[0m\r\n");
      xterm.write("\x1b[36m❯\x1b[0m ");
      if (callbacks?.onStartedRef) callbacks.onStartedRef.current = false;
      break;
  }
}

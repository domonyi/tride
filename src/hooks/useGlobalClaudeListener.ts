import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import type { AppAction, ClaudeToolCall } from "../types";

interface ClaudeEventPayload {
  data: string;
}

/**
 * Global Claude event listener.
 * Call once at the app root so events are captured even when
 * individual panes are unmounted — the reducer state is always up-to-date.
 */
export function useGlobalClaudeListener(dispatch: React.Dispatch<AppAction>) {
  useEffect(() => {
    let unlisten: (() => void) | null = null;

    const setup = async () => {
      const fn = await listen<ClaudeEventPayload>("claude-event", (event) => {
        let parsed: any;
        try {
          parsed = JSON.parse(event.payload.data);
        } catch {
          return;
        }

        const { sessionId } = parsed;
        if (!sessionId || sessionId === "*") return;

        switch (parsed.type) {
          case "session_started":
            dispatch({
              type: "CLAUDE_SESSION_STARTED",
              sessionId,
              sdkSessionId: parsed.sdkSessionId ?? sessionId,
              model: parsed.model,
            });
            break;

          case "text_delta":
            dispatch({ type: "CLAUDE_TEXT_DELTA", sessionId, text: parsed.text });
            break;

          case "text_done":
            dispatch({ type: "CLAUDE_TEXT_DONE", sessionId, text: parsed.text });
            break;

          case "thinking_delta":
            dispatch({ type: "CLAUDE_THINKING_DELTA", sessionId, text: parsed.text });
            break;

          case "tool_use_start": {
            const tc: ClaudeToolCall = {
              toolUseId: parsed.toolUseId,
              toolName: parsed.toolName,
              input: parsed.input,
              inputDelta: "",
              status: "running",
            };
            dispatch({ type: "CLAUDE_TOOL_USE_START", sessionId, toolCall: tc });
            break;
          }

          case "tool_approval_required": {
            const tc: ClaudeToolCall = {
              toolUseId: parsed.toolUseId,
              toolName: parsed.toolName,
              input: parsed.input,
              inputDelta: "",
              status: "pending_approval",
              title: parsed.title,
              description: parsed.description,
            };
            dispatch({ type: "CLAUDE_TOOL_APPROVAL_REQUIRED", sessionId, toolCall: tc });
            break;
          }

          case "tool_use_done":
            dispatch({
              type: "CLAUDE_TOOL_DONE",
              sessionId,
              toolUseId: parsed.toolUseId,
              output: parsed.output,
            });
            break;

          case "tool_input_delta":
            dispatch({ type: "CLAUDE_TOOL_INPUT_DELTA", sessionId, delta: parsed.delta });
            break;

          case "status_change":
            dispatch({ type: "CLAUDE_STATUS_CHANGE", sessionId, status: parsed.status });
            break;

          case "turn_complete":
            dispatch({
              type: "CLAUDE_TURN_COMPLETE",
              sessionId,
              totalCost: parsed.totalCost,
            });
            break;

          case "error":
            dispatch({ type: "CLAUDE_ERROR", sessionId, message: parsed.message });
            break;

          case "session_ended":
            dispatch({ type: "CLAUDE_STATUS_CHANGE", sessionId, status: "done" });
            break;
        }
      });

      unlisten = fn;
    };

    setup();
    return () => { unlisten?.(); };
  }, [dispatch]);
}

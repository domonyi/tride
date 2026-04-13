import { useEffect, useCallback } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { useAppState, useAppDispatch } from "../state/context";
import type { ClaudeToolCall } from "../types";

interface ClaudeEventPayload {
  data: string;
}

export function useClaudeSession(sessionId: string | undefined) {
  const dispatch = useAppDispatch();
  const state = useAppState();

  useEffect(() => {
    if (!sessionId) return;

    const unlisten = listen<ClaudeEventPayload>("claude-event", (event) => {
      let parsed: any;
      try {
        parsed = JSON.parse(event.payload.data);
      } catch {
        return;
      }

      // Filter by session or broadcast events
      if (parsed.sessionId !== sessionId && parsed.sessionId !== "*") return;

      switch (parsed.type) {
        case "session_started":
          dispatch({
            type: "CLAUDE_SESSION_STARTED",
            sessionId,
            sdkSessionId: parsed.sdkSessionId,
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
            inputTokens: parsed.inputTokens,
            outputTokens: parsed.outputTokens,
          });
          break;

        case "error":
          dispatch({ type: "CLAUDE_ERROR", sessionId, message: parsed.message });
          break;

        case "session_ended":
          console.log("[claude] session ended:", sessionId);
          dispatch({ type: "CLAUDE_STATUS_CHANGE", sessionId, status: "done" });
          break;
      }
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, [sessionId, dispatch]);

  const session = sessionId ? state.claudeSessions[sessionId] : null;

  const sendMessage = useCallback(
    async (message: string) => {
      if (!sessionId) return;
      dispatch({ type: "CLAUDE_USER_MESSAGE", sessionId, text: message });
      dispatch({ type: "CLAUDE_STATUS_CHANGE", sessionId, status: "running" });
      try {
        await invoke("claude_send", { sessionId, message });
      } catch (err) {
        dispatch({ type: "CLAUDE_ERROR", sessionId, message: String(err) });
      }
    },
    [sessionId, dispatch]
  );

  const startSession = useCallback(
    async (cwd: string, prompt: string, model?: string) => {
      if (!sessionId) return;
      // Create session in state immediately so UI can render
      dispatch({
        type: "CLAUDE_SESSION_STARTED",
        sessionId,
        sdkSessionId: sessionId,
        model,
      });
      dispatch({ type: "CLAUDE_USER_MESSAGE", sessionId, text: prompt });
      dispatch({ type: "CLAUDE_STATUS_CHANGE", sessionId, status: "running" });
      try {
        await invoke("claude_start", { sessionId, cwd, prompt, model });
      } catch (err) {
        dispatch({ type: "CLAUDE_ERROR", sessionId, message: String(err) });
      }
    },
    [sessionId, dispatch]
  );

  const approve = useCallback(
    async (toolUseId: string) => {
      if (!sessionId) return;
      dispatch({ type: "CLAUDE_TOOL_APPROVED", sessionId, toolUseId });
      await invoke("claude_approve", { sessionId, toolUseId });
    },
    [sessionId, dispatch]
  );

  const deny = useCallback(
    async (toolUseId: string, reason?: string) => {
      if (!sessionId) return;
      dispatch({ type: "CLAUDE_TOOL_DENIED", sessionId, toolUseId });
      await invoke("claude_deny", { sessionId, toolUseId, reason });
    },
    [sessionId, dispatch]
  );

  const abort = useCallback(async () => {
    if (!sessionId) return;
    await invoke("claude_abort", { sessionId });
  }, [sessionId]);

  const kill = useCallback(async () => {
    if (!sessionId) return;
    await invoke("claude_kill", { sessionId });
    dispatch({ type: "CLAUDE_REMOVE_SESSION", sessionId });
  }, [sessionId, dispatch]);

  return { session, sendMessage, startSession, approve, deny, abort, kill };
}

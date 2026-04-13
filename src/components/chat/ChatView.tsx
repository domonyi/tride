import { useEffect, useRef, useCallback, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useAppState, useAppDispatch } from "../../state/context";
import { ChatMessage, StreamingMessage } from "./ChatMessage";
import { ChatInput } from "./ChatInput";
import { formatModelName, getContextLimit, formatTokens } from "../../utils/modelUtils";
import type { ClaudeSession, ClaudeToolCall } from "../../types";

interface ChatViewProps {
  sessionId: string;
  cwd: string;
  paneId: string;
  resumeSessionId?: string;
  onSdkSessionId?: (sdkSessionId: string) => void;
  onFirstMessage?: (text: string) => void;
  /** Changing this value re-focuses the chat input */
  focusTrigger?: number;
}

export function ChatView({
  sessionId,
  cwd,
  paneId,
  resumeSessionId,
  onSdkSessionId,
  onFirstMessage,
  focusTrigger,
}: ChatViewProps) {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const scrollRef = useRef<HTMLDivElement>(null);
  const startedRef = useRef(false);
  const firstMessageFiredRef = useRef(false);
  const session: ClaudeSession | undefined = state.claudeSessions[sessionId];

  // Track SDK session ID changes
  useEffect(() => {
    if (session?.sdkSessionId && onSdkSessionId) {
      onSdkSessionId(session.sdkSessionId);
    }
  }, [session?.sdkSessionId, onSdkSessionId]);

  // Scroll to bottom on mount when there are existing messages
  const didInitialScroll = useRef(false);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (!didInitialScroll.current && (session?.messages?.length ?? 0) > 0) {
      didInitialScroll.current = true;
      el.scrollTop = el.scrollHeight;
    }
  }, [session?.messages]);

  // Auto-scroll to bottom on new content
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    // Only auto-scroll if near bottom already (within 100px)
    const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 100;
    if (isNearBottom) {
      el.scrollTop = el.scrollHeight;
    }
  }, [session?.messages, session?.streamingText, session?.streamingThinking]);

  // Pre-warm sidecar on mount
  useEffect(() => {
    invoke("claude_warmup").catch(() => {});
  }, []);

  // If resuming, suppress the label-update callback but do NOT mark as started —
  // the first message must still go through claude_start so the resumeSessionId is
  // forwarded to the sidecar.
  useEffect(() => {
    if (resumeSessionId) {
      firstMessageFiredRef.current = true;
    }
  }, [resumeSessionId]);

  const handleSend = useCallback(async (text: string) => {
    if (!text.trim()) return;

    // Fire onFirstMessage callback
    if (!firstMessageFiredRef.current && onFirstMessage) {
      firstMessageFiredRef.current = true;
      onFirstMessage(text);
    }

    if (!startedRef.current) {
      // First message — start a new session
      startedRef.current = true;

      // Create session in state
      dispatch({
        type: "CLAUDE_SESSION_STARTED",
        sessionId,
        sdkSessionId: sessionId,
      });
      dispatch({ type: "CLAUDE_USER_MESSAGE", sessionId, text });
      dispatch({ type: "CLAUDE_STATUS_CHANGE", sessionId, status: "running" });

      try {
        await invoke("claude_start", {
          sessionId,
          cwd,
          prompt: text,
          resumeSessionId: resumeSessionId || undefined,
        });
      } catch (err: any) {
        dispatch({ type: "CLAUDE_ERROR", sessionId, message: String(err) });
      }
    } else {
      // Follow-up message
      dispatch({ type: "CLAUDE_USER_MESSAGE", sessionId, text });
      dispatch({ type: "CLAUDE_STATUS_CHANGE", sessionId, status: "running" });

      try {
        await invoke("claude_send", { sessionId, message: text });
      } catch (err: any) {
        dispatch({ type: "CLAUDE_ERROR", sessionId, message: String(err) });
      }
    }
  }, [sessionId, cwd, resumeSessionId, dispatch, onFirstMessage]);

  const handleAbort = useCallback(async () => {
    try {
      await invoke("claude_abort", { sessionId });
    } catch {}
  }, [sessionId]);

  const handleApprove = useCallback(async (toolUseId: string) => {
    dispatch({ type: "CLAUDE_TOOL_APPROVED", sessionId, toolUseId });
    try {
      await invoke("claude_approve", { sessionId, toolUseId });
    } catch {}
  }, [sessionId, dispatch]);

  const handleDeny = useCallback(async (toolUseId: string) => {
    dispatch({ type: "CLAUDE_TOOL_DENIED", sessionId, toolUseId });
    try {
      await invoke("claude_deny", { sessionId, toolUseId });
    } catch {}
  }, [sessionId, dispatch]);

  const messages = session?.messages ?? [];
  const isRunning = session?.status === "running" || session?.status === "waiting";
  const isStreaming = !!(session?.streamingText || session?.streamingThinking);
  const hasPendingApprovals = (session?.pendingApprovals?.length ?? 0) > 0;

  return (
    <div className="chat-view">
      {/* Status bar */}
      {session?.model && (
        <div className="chat-status-bar">
          <span className="chat-model">{formatModelName(session.model)}</span>
          {session.inputTokens != null && (
            <span className="chat-context-usage">
              {formatTokens(session.inputTokens + (session.outputTokens ?? 0))}
              {" / "}
              {formatTokens(getContextLimit(session.model))}
            </span>
          )}
          {isRunning && <span className="chat-status-dot" />}
        </div>
      )}

      {/* Messages */}
      <div className="chat-messages" ref={scrollRef}>
        {messages.length === 0 && !isStreaming && (
          <div className="chat-empty">
            <div className="chat-empty-text">Start a conversation</div>
          </div>
        )}

        {messages.map((msg, i) => {
          // Compute generation duration for assistant messages
          let durationMs: number | undefined;
          if (msg.role === "assistant" && i > 0) {
            const prev = messages[i - 1];
            if (prev && prev.timestamp) {
              durationMs = msg.timestamp - prev.timestamp;
            }
          }
          return (
            <ChatMessage
              key={msg.id}
              message={msg}
              durationMs={durationMs}
              onApprove={handleApprove}
              onDeny={handleDeny}
            />
          );
        })}

        {/* Streaming message */}
        {isStreaming && (
          <StreamingMessage
            key={messages.length}
            text={session?.streamingText ?? ""}
            thinking={session?.streamingThinking ?? ""}
            onApprove={handleApprove}
            onDeny={handleDeny}
          />
        )}

        {/* Pending approval overlay — shown when waiting and no streaming */}
        {hasPendingApprovals && !isStreaming && (
          <div className="chat-approval-section">
            {session!.pendingApprovals.map((tc) => (
              <div key={tc.toolUseId} className="chat-approval-card">
                <div className="chat-approval-header">
                  <span className="chat-approval-icon">{tc.toolName}</span>
                  <span className="chat-approval-title">
                    {tc.title || `${tc.toolName} requires approval`}
                  </span>
                </div>
                {tc.description && (
                  <div className="chat-approval-desc">{tc.description}</div>
                )}
                <div className="chat-approval-actions">
                  <button
                    className="chat-approve-btn"
                    onClick={() => handleApprove(tc.toolUseId)}
                  >
                    Allow
                  </button>
                  <button
                    className="chat-deny-btn"
                    onClick={() => handleDeny(tc.toolUseId)}
                  >
                    Deny
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Bottom spacer for scroll */}
        <div style={{ height: 8, flexShrink: 0 }} />
      </div>

      {/* Input */}
      <ChatInput
        onSend={handleSend}
        onAbort={handleAbort}
        disabled={false}
        isRunning={isRunning}
        focusTrigger={focusTrigger}
        placeholder={
          isRunning
            ? "Claude is working..."
            : messages.length === 0
              ? "What would you like to do?"
              : "Send a follow-up..."
        }
      />
    </div>
  );
}

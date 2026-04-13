import { memo, useEffect, useRef, useState } from "react";
import { Markdown } from "./Markdown";
import { ThinkingBlock } from "./ThinkingBlock";
import { ToolCallGroup } from "./ToolCallCard";
import type { ClaudeMessage } from "../../types";

interface ChatMessageProps {
  message: ClaudeMessage;
  durationMs?: number;
  onApprove?: (toolUseId: string) => void;
  onDeny?: (toolUseId: string) => void;
}

export function formatTimestamp(ts: number): string {
  const d = new Date(ts);
  let h = d.getHours();
  const m = d.getMinutes();
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${h}:${String(m).padStart(2, "0")} ${ampm}`;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return "<1s";
  const totalSecs = Math.floor(ms / 1000);
  const mins = Math.floor(totalSecs / 60);
  const secs = totalSecs % 60;
  if (mins > 0) return `${mins}m ${secs}s`;
  return `${secs}s`;
}

export const ChatMessage = memo(function ChatMessage({ message, durationMs, onApprove, onDeny }: ChatMessageProps) {
  const isUser = message.role === "user";

  return (
    <div className={`chat-msg ${isUser ? "chat-msg-user" : "chat-msg-assistant"}`}>
      <div className="chat-msg-bubble">
        {/* Thinking block (assistant only) */}
        {!isUser && message.thinking && (
          <ThinkingBlock text={message.thinking} />
        )}

        {/* Message content */}
        {message.content && (
          <div className="chat-msg-content">
            {isUser ? (
              <span className="chat-msg-text-user">{message.content}</span>
            ) : (
              <Markdown text={message.content} />
            )}
          </div>
        )}

        {/* Tool calls (assistant only) */}
        {!isUser && message.toolCalls.length > 0 && (
          <ToolCallGroup
            toolCalls={message.toolCalls}
            onApprove={onApprove}
            onDeny={onDeny}
          />
        )}

        {/* Timestamp + duration */}
        {message.timestamp && (
          <span className="chat-msg-timestamp">
            {formatTimestamp(message.timestamp)}
            {!isUser && durationMs != null && durationMs > 0 && (
              <span className="chat-msg-duration"> ({formatDuration(durationMs)})</span>
            )}
          </span>
        )}
      </div>
    </div>
  );
});

/** Streaming message — the one being actively generated */
interface StreamingMessageProps {
  text: string;
  thinking: string;
  onApprove?: (toolUseId: string) => void;
  onDeny?: (toolUseId: string) => void;
}

/** Small elapsed-time loading indicator shown while AI is working */
function StreamingTimer() {
  const startRef = useRef(Date.now());
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setElapsed(Date.now() - startRef.current), 100);
    return () => clearInterval(id);
  }, []);

  const secs = Math.floor(elapsed / 1000);
  const mins = Math.floor(secs / 60);
  const display = mins > 0 ? `${mins}m ${secs % 60}s` : `${secs}s`;

  return (
    <span className="chat-msg-timestamp">
      {display} <span className="streaming-indicator">working…</span>
    </span>
  );
}

export function StreamingMessage({ text, thinking }: StreamingMessageProps) {
  if (!text && !thinking) return null;

  return (
    <div className="chat-msg chat-msg-assistant chat-msg-streaming">
      <div className="chat-msg-bubble">
        {thinking && (
          <ThinkingBlock text={thinking} isStreaming />
        )}
        {text && (
          <div className="chat-msg-content">
            <Markdown text={text} />
          </div>
        )}
        <StreamingTimer />
      </div>
    </div>
  );
}

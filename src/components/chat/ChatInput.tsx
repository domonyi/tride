import { useState, useCallback, useRef, useEffect } from "react";
import { Send, Square } from "lucide-react";

interface ChatInputProps {
  onSend: (text: string) => void;
  onAbort?: () => void;
  disabled?: boolean;
  isRunning?: boolean;
  placeholder?: string;
  /** Changing this value (truthy) will re-focus the textarea */
  focusTrigger?: number;
}

export function ChatInput({ onSend, onAbort, disabled, isRunning, placeholder, focusTrigger }: ChatInputProps) {
  const [text, setText] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 160) + "px";
  }, [text]);

  // Focus on mount and when focusTrigger changes
  useEffect(() => {
    textareaRef.current?.focus();
  }, [focusTrigger]);

  const handleSend = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setText("");
    // Reset height
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }, [text, disabled, onSend]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
    // Ctrl+C while running → abort
    if (e.key === "c" && e.ctrlKey && isRunning) {
      e.preventDefault();
      onAbort?.();
    }
  }, [handleSend, isRunning, onAbort]);

  const canSend = text.trim().length > 0 && !disabled;

  return (
    <div className="chat-input-area">
      <div className={`chat-input-row ${disabled ? "chat-input-disabled" : ""}`}>
        <textarea
          ref={textareaRef}
          className="chat-textarea"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder ?? "Message Claude..."}
          rows={1}
          disabled={disabled}
        />
        {isRunning ? (
          <button
            className="chat-abort-btn"
            onClick={onAbort}
            title="Stop (Ctrl+C)"
          >
            <Square size={14} />
          </button>
        ) : (
          <button
            className="chat-send-btn"
            onClick={handleSend}
            disabled={!canSend}
            title="Send (Enter)"
          >
            <Send size={14} />
          </button>
        )}
      </div>
      <div className="chat-input-hint">
        {isRunning
          ? "Claude is working... Press Ctrl+C to stop"
          : "Enter to send, Shift+Enter for newline"
        }
      </div>
    </div>
  );
}

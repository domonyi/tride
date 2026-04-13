import { memo, useState } from "react";
import { ChevronRight, Brain } from "lucide-react";

interface ThinkingBlockProps {
  text: string;
  isStreaming?: boolean;
}

export const ThinkingBlock = memo(function ThinkingBlock({ text, isStreaming }: ThinkingBlockProps) {
  const [expanded, setExpanded] = useState(false);

  if (!text) return null;

  const lineCount = text.split("\n").length;
  const charCount = text.length;
  const preview = text.slice(0, 80).replace(/\n/g, " ");

  return (
    <div className={`chat-thinking ${expanded ? "chat-thinking-expanded" : ""}`}>
      <button
        className="chat-thinking-toggle"
        onClick={() => setExpanded((v) => !v)}
      >
        <ChevronRight
          size={12}
          className={`chat-thinking-chevron ${expanded ? "chat-thinking-chevron-open" : ""}`}
        />
        <Brain size={12} />
        <span className="chat-thinking-label">
          Thinking{isStreaming ? "..." : ""}
        </span>
        {!expanded && (
          <span className="chat-thinking-preview">
            {charCount > 80 ? `${preview}...` : preview}
          </span>
        )}
        {!isStreaming && (
          <span className="chat-thinking-meta">
            {lineCount} lines
          </span>
        )}
      </button>
      {expanded && (
        <div className="chat-thinking-content">
          {text}
        </div>
      )}
    </div>
  );
});

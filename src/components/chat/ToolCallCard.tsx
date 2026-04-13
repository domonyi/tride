import { memo, useState } from "react";
import { ChevronRight, ShieldAlert, AlertCircle } from "lucide-react";
import { getToolLucideIcon } from "../../utils/toolIcons";
import type { ClaudeToolCall } from "../../types";

interface ToolCallCardProps {
  toolCall: ClaudeToolCall;
  onApprove?: (toolUseId: string) => void;
  onDeny?: (toolUseId: string) => void;
}

function formatInput(input: unknown): string {
  if (!input) return "";
  if (typeof input === "string") return input;
  try {
    return JSON.stringify(input, null, 2);
  } catch {
    return String(input);
  }
}

function truncateOutput(output: string, maxLines: number = 20): { text: string; truncated: boolean } {
  const lines = output.split("\n");
  if (lines.length <= maxLines) return { text: output, truncated: false };
  return {
    text: lines.slice(0, maxLines).join("\n") + `\n... (${lines.length - maxLines} more lines)`,
    truncated: true,
  };
}

function StatusIcon({ status }: { status: ClaudeToolCall["status"] }) {
  switch (status) {
    case "pending_approval":
      return <ShieldAlert size={12} className="chat-tool-approval-icon" />;
    case "error":
    case "denied":
      return <AlertCircle size={12} className="chat-tool-error-icon" />;
    default:
      return null;
  }
}

export const ToolCallCard = memo(function ToolCallCard({ toolCall, onApprove, onDeny }: ToolCallCardProps) {
  const [expanded, setExpanded] = useState(false);

  const inputStr = formatInput(toolCall.input);
  const outputStr = toolCall.output ?? "";
  const { text: displayOutput } = outputStr ? truncateOutput(outputStr) : { text: "" };

  const isActive = toolCall.status === "running" || toolCall.status === "approved";
  const needsApproval = toolCall.status === "pending_approval";

  // Build a short summary from input for the collapsed view
  let summary = "";
  if (toolCall.input && typeof toolCall.input === "object") {
    const inp = toolCall.input as Record<string, unknown>;
    if (inp.command) summary = String(inp.command).slice(0, 60);
    else if (inp.file_path) summary = String(inp.file_path);
    else if (inp.path) summary = String(inp.path);
    else if (inp.pattern) summary = String(inp.pattern);
    else if (inp.query) summary = String(inp.query).slice(0, 60);
    else if (inp.prompt) summary = String(inp.prompt).slice(0, 60);
    else if (inp.description) summary = String(inp.description).slice(0, 60);
  }

  return (
    <div className={`chat-tool ${needsApproval ? "chat-tool-needs-approval" : ""} ${isActive ? "chat-tool-active" : ""}`}>
      <div
        className="chat-tool-header"
        onClick={() => setExpanded((v) => !v)}
      >
        <ChevronRight
          size={11}
          className={`chat-tool-chevron ${expanded ? "chat-tool-chevron-open" : ""}`}
        />
        <span className="chat-tool-icon">{getToolLucideIcon(toolCall.toolName)}</span>
        <span className="chat-tool-name">{toolCall.toolName}</span>
        {summary && !expanded && (
          <span className="chat-tool-summary">{summary}</span>
        )}
        <span className="chat-tool-status">
          <StatusIcon status={toolCall.status} />
        </span>
      </div>

      {needsApproval && (
        <div className="chat-tool-approval-bar">
          <span className="chat-tool-approval-desc">
            {toolCall.title || `${toolCall.toolName} requires approval`}
          </span>
          <div className="chat-tool-approval-actions">
            <button
              className="chat-tool-approve-btn"
              onClick={(e) => { e.stopPropagation(); onApprove?.(toolCall.toolUseId); }}
            >
              Allow
            </button>
            <button
              className="chat-tool-deny-btn"
              onClick={(e) => { e.stopPropagation(); onDeny?.(toolCall.toolUseId); }}
            >
              Deny
            </button>
          </div>
        </div>
      )}

      {expanded && (
        <div className="chat-tool-details">
          {inputStr && (
            <div className="chat-tool-section">
              <div className="chat-tool-section-label">Input</div>
              <pre className="chat-tool-pre">{inputStr}</pre>
            </div>
          )}
          {displayOutput && (
            <div className="chat-tool-section">
              <div className="chat-tool-section-label">Output</div>
              <pre className="chat-tool-pre">{displayOutput}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
});

const MAX_VISIBLE_TOOLS = 5;

/** Compact group of tool calls displayed inline */
export const ToolCallGroup = memo(function ToolCallGroup({
  toolCalls,
  onApprove,
  onDeny,
}: {
  toolCalls: ClaudeToolCall[];
  onApprove?: (toolUseId: string) => void;
  onDeny?: (toolUseId: string) => void;
}) {
  const [showAll, setShowAll] = useState(false);

  if (toolCalls.length === 0) return null;

  const hiddenCount = toolCalls.length - MAX_VISIBLE_TOOLS;
  const hasHidden = hiddenCount > 0 && !showAll;
  const visibleCalls = hasHidden ? toolCalls.slice(-MAX_VISIBLE_TOOLS) : toolCalls;

  return (
    <div className="chat-tool-group">
      {hasHidden && (
        <button
          className="chat-tool-show-more"
          onClick={() => setShowAll(true)}
        >
          Show {hiddenCount} more tool {hiddenCount === 1 ? "call" : "calls"}
        </button>
      )}
      {visibleCalls.map((tc) => (
        <ToolCallCard
          key={tc.toolUseId}
          toolCall={tc}
          onApprove={onApprove}
          onDeny={onDeny}
        />
      ))}
    </div>
  );
});

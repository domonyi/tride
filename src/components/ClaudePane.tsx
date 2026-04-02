import { useState, useCallback } from "react";
import { useClaudeTerminal } from "../hooks/useClaudeTerminal";
import { useAppDispatch } from "../state/context";
import { invoke } from "@tauri-apps/api/core";
import type { ClaudeToolCall } from "../types";

interface ClaudePaneProps {
  sessionId: string;
  cwd: string;
  isActive: boolean;
  onFocus: () => void;
}

export function ClaudePane({ sessionId, cwd, isActive, onFocus }: ClaudePaneProps) {
  const dispatch = useAppDispatch();
  const [pendingApprovals, setPendingApprovals] = useState<ClaudeToolCall[]>([]);
  const [model, setModel] = useState<string>("");
  const [totalCost, setTotalCost] = useState(0);

  const findProject = useCallback(() => {
    // We don't need project info for the terminal itself
  }, []);

  const onStatusChange = useCallback((status: string) => {
    // Status is shown via the terminal header's status dot — sync it
    // The parent TerminalPane reads terminal.status from state
  }, []);

  const onToolApproval = useCallback((toolCall: ClaudeToolCall) => {
    setPendingApprovals((prev) => [...prev, toolCall]);
  }, []);

  const onToolApprovalResolved = useCallback((toolUseId: string) => {
    setPendingApprovals((prev) => prev.filter((t) => t.toolUseId !== toolUseId));
  }, []);

  const onTurnComplete = useCallback((cost: number) => {
    if (cost) setTotalCost((prev) => prev + cost);
  }, []);

  const onModelInfo = useCallback((m: string) => {
    setModel(m);
  }, []);

  const handleApprove = useCallback(async (toolUseId: string) => {
    setPendingApprovals((prev) => prev.filter((t) => t.toolUseId !== toolUseId));
    await invoke("claude_approve", { sessionId, toolUseId });
  }, [sessionId]);

  const handleDeny = useCallback(async (toolUseId: string) => {
    setPendingApprovals((prev) => prev.filter((t) => t.toolUseId !== toolUseId));
    await invoke("claude_deny", { sessionId, toolUseId });
  }, [sessionId]);

  const { containerRef } = useClaudeTerminal({
    sessionId,
    cwd,
    isActive,
    onStatusChange,
    onToolApproval,
    onToolApprovalResolved,
    onTurnComplete,
    onModelInfo,
  });

  return (
    <div className="claude-pane" onClick={onFocus}>
      {/* Info bar */}
      {(model || totalCost > 0) && (
        <div className="claude-pane-bar">
          {model && <span className="claude-pane-model">{model}</span>}
          {totalCost > 0 && (
            <span className="claude-pane-cost">${totalCost.toFixed(4)}</span>
          )}
        </div>
      )}

      {/* Terminal */}
      <div className="claude-terminal-body" ref={containerRef} />

      {/* Tool approval overlay */}
      {pendingApprovals.length > 0 && (
        <div className="claude-approval-bar">
          {pendingApprovals.map((tc) => (
            <div key={tc.toolUseId} className="claude-approval-item">
              <span className="claude-approval-name">{tc.toolName}</span>
              <button
                className="claude-approve-btn"
                onClick={() => handleApprove(tc.toolUseId)}
              >
                Allow
              </button>
              <button
                className="claude-deny-btn"
                onClick={() => handleDeny(tc.toolUseId)}
              >
                Deny
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

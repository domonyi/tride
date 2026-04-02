import { useState, useCallback } from "react";
import { useAppState, useAppDispatch } from "../state/context";
import { useClaudeTerminal } from "../hooks/useClaudeTerminal";
import { PANE_COLORS } from "../utils/paneUtils";
import { LlmPaneStartScreen } from "./LlmPaneStartScreen";
import { invoke } from "@tauri-apps/api/core";
import type { ClaudeToolCall } from "../types";
import { GitBranch, X } from "lucide-react";

interface Props {
  paneId: string;
  gridArea?: string;
}

export function LlmPane({ paneId, gridArea }: Props) {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const pane = state.panes.panes[paneId];

  if (!pane) return null;

  const accentColor = PANE_COLORS[pane.index % PANE_COLORS.length];
  const hasSession = pane.origin !== "empty";

  return (
    <div
      className="llm-pane"
      style={{ gridArea }}
    >
      {/* Header */}
      <div className="pane-header">
        <span className="pane-badge">
          {pane.index + 1}
        </span>

        {pane.origin === "worktree" && pane.branch && (
          <span className="pane-origin-badge">
            <span className="pane-origin-icon"><GitBranch size={11} /></span>
            <span className="pane-origin-text">{pane.branch}</span>
          </span>
        )}

        {pane.label && pane.origin !== "worktree" && (
          <span style={{ fontSize: 11, color: "#777", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, minWidth: 0 }}>
            {pane.label}
          </span>
        )}

        {!pane.label && <span style={{ flex: 1 }} />}

        {hasSession && (
          <button
            className="pane-clear-btn"
            onClick={() => dispatch({ type: "PANES_CLEAR_PANE", paneId })}
            title="Close session"
            style={{ opacity: 1 }}
          >
            <X size={12} />
          </button>
        )}
      </div>

      {/* Body: start screen or terminal */}
      {hasSession ? (
        <PaneTerminal paneId={paneId} pane={pane} accentColor={accentColor} />
      ) : (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0, overflow: "auto" }}>
          <LlmPaneStartScreen pane={pane} accentColor={accentColor} />
        </div>
      )}
    </div>
  );
}

/** Wraps the Claude SDK terminal for a pane that has an active session */
function PaneTerminal({ paneId, pane, accentColor }: { paneId: string; pane: any; accentColor: string }) {
  const dispatch = useAppDispatch();
  const [pendingApprovals, setPendingApprovals] = useState<ClaudeToolCall[]>([]);
  const [model, setModel] = useState("");
  const [totalCost, setTotalCost] = useState(0);

  const sessionId = `pane-${paneId}`;

  const state2 = useAppState();
  const activeProject = state2.projects.find((p) => p.id === state2.activeProjectId);
  const cwd = pane.worktreePath || activeProject?.path || ".";

  const onStatusChange = useCallback(() => {}, []);

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

  const onSdkSessionId = useCallback((sdkId: string) => {
    dispatch({ type: "PANES_SET_SDK_SESSION_ID", paneId, sdkSessionId: sdkId });
  }, [dispatch, paneId]);

  const onFirstMessage = useCallback((text: string) => {
    const label = text.length > 40 ? text.slice(0, 40) + "…" : text;
    dispatch({ type: "PANES_UPDATE_LABEL", paneId, label });
  }, [dispatch, paneId]);

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
    isActive: true,
    resumeSessionId: pane.sdkSessionId,
    onStatusChange,
    onToolApproval,
    onToolApprovalResolved,
    onSdkSessionId,
    onTurnComplete,
    onModelInfo,
    onFirstMessage,
  });

  return (
    <div className="claude-pane" style={{ flex: 1, minHeight: 0 }}>
      {(model || totalCost > 0) && (
        <div className="claude-pane-bar">
          {model && <span className="claude-pane-model">{model}</span>}
          {totalCost > 0 && <span className="claude-pane-cost">${totalCost.toFixed(4)}</span>}
        </div>
      )}

      <div className="claude-terminal-body" ref={containerRef} />

      {pendingApprovals.length > 0 && (
        <div className="claude-approval-bar">
          {pendingApprovals.map((tc) => (
            <div key={tc.toolUseId} className="claude-approval-item">
              <span className="claude-approval-name">{tc.toolName}</span>
              <button className="claude-approve-btn" onClick={() => handleApprove(tc.toolUseId)}>
                Allow
              </button>
              <button className="claude-deny-btn" onClick={() => handleDeny(tc.toolUseId)}>
                Deny
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

import { useCallback, useState, useEffect } from "react";
import { useAppState, useAppDispatch } from "../state/context";
import { PANE_COLORS } from "../utils/paneUtils";
import { LlmPaneStartScreen } from "./LlmPaneStartScreen";
import { ChatView } from "./chat/ChatView";
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
  // Show ChatView if: pane is active AND this project has a session (or no project has used this pane yet)
  const projectId = state.activeProjectId ?? "default";
  const hasAnySession = !!(pane.sdkSessionIds && Object.keys(pane.sdkSessionIds).length > 0);
  const hasProjectSession = (pane.sdkSessionIds != null && projectId in pane.sdkSessionIds) || !!state.claudeSessions[`pane-${paneId}-proj-${projectId}`];
  const hasSession = pane.origin !== "empty" && (hasProjectSession || !hasAnySession);

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

      {/* Body: start screen or chat */}
      {hasSession ? (
        <PaneChat paneId={paneId} pane={pane} accentColor={accentColor} />
      ) : (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0, overflow: "auto" }}>
          <LlmPaneStartScreen pane={pane} accentColor={accentColor} />
        </div>
      )}
    </div>
  );
}

/** Chat view for a pane that has an active session */
function PaneChat({ paneId, pane }: { paneId: string; pane: any; accentColor: string }) {
  const dispatch = useAppDispatch();
  const state = useAppState();

  // Increment focusTrigger each time this pane becomes the active pane (Ctrl+N)
  const [focusTrigger, setFocusTrigger] = useState(0);
  const isActive = state.panes.activePaneId === paneId;
  useEffect(() => {
    if (isActive) setFocusTrigger((n) => n + 1);
  }, [isActive]);

  const activeProject = state.projects.find((p) => p.id === state.activeProjectId);
  const projectId = state.activeProjectId ?? "default";
  const sessionId = `pane-${paneId}-proj-${projectId}`;
  const cwd = pane.worktreePath || activeProject?.path || ".";

  const resumeSdkId = pane.sdkSessionIds?.[projectId] ?? pane.sdkSessionId;

  const onSdkSessionId = useCallback((sdkId: string) => {
    dispatch({ type: "PANES_SET_SDK_SESSION_ID", paneId, sdkSessionId: sdkId, projectId });
  }, [dispatch, paneId, projectId]);

  const onFirstMessage = useCallback((text: string) => {
    const label = text.length > 40 ? text.slice(0, 40) + "..." : text;
    dispatch({ type: "PANES_UPDATE_LABEL", paneId, label });
  }, [dispatch, paneId]);

  return (
    <ChatView
      sessionId={sessionId}
      cwd={cwd}
      paneId={paneId}
      resumeSessionId={resumeSdkId}
      onSdkSessionId={onSdkSessionId}
      onFirstMessage={onFirstMessage}
      focusTrigger={focusTrigger}
    />
  );
}

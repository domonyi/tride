import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useAppState, useAppDispatch } from "../state/context";

export function ActionBar() {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const [currentBranch, setCurrentBranch] = useState("");

  const activeProject = state.projects.find((p) => p.id === state.activeProjectId);
  const activeTerminal = activeProject?.terminals.find(
    (t) => t.id === state.activeTerminalId
  );
  const cwd = activeTerminal?.cwd || activeProject?.path || null;

  const refreshBranch = useCallback(async () => {
    if (!cwd) { setCurrentBranch(""); return; }
    try {
      const branch = await invoke<string>("git_current_branch", { cwd });
      setCurrentBranch(branch);
    } catch {
      setCurrentBranch("");
    }
  }, [cwd]);

  useEffect(() => {
    refreshBranch();
    const interval = setInterval(refreshBranch, 5000);
    return () => clearInterval(interval);
  }, [refreshBranch]);

  return (
    <div className="action-bar">
      <div className="action-bar-info">
        {currentBranch && (
          <span className="action-bar-branch">
            <span className="scm-branch-icon">&#9741;</span> {currentBranch}
          </span>
        )}
      </div>
      <div className="action-bar-actions">
        <button className="action-btn" title="Commit (C)">
          <kbd>C</kbd> Commit
        </button>
        <button className="action-btn" title="Push (P)">
          <kbd>P</kbd> Push
        </button>
        <button className="action-btn" title="Diff (D)">
          <kbd>D</kbd> Diff
        </button>
        <button className="action-btn" title="Merge (M)">
          <kbd>M</kbd> Merge
        </button>
        <button className="action-btn" title="Kill agent (K)">
          <kbd>K</kbd> Kill
        </button>
        <button
          className="action-btn"
          title="Toggle sidebar"
          onClick={() => dispatch({ type: "TOGGLE_SIDEBAR" })}
        >
          Sidebar
        </button>
        <div className="grid-selector">
          {[
            [1, 1],
            [1, 2],
            [2, 2],
            [3, 2],
            [3, 3],
          ].map(([r, c]) => (
            <button
              key={`${r}x${c}`}
              className={`grid-btn ${
                state.gridLayout.rows === r && state.gridLayout.cols === c ? "active" : ""
              }`}
              onClick={() => dispatch({ type: "SET_GRID_LAYOUT", layout: { rows: r, cols: c } })}
            >
              {r}x{c}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

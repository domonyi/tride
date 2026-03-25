import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useAppState } from "../state/context";

interface GitCommitInfo {
  hash: string;
  short_hash: string;
  message: string;
  author: string;
  date: string;
  refs: string;
}

interface GitBranchInfo {
  name: string;
  current: boolean;
  remote: boolean;
}

interface GitFileStatus {
  path: string;
  status: string;
  staged: boolean;
}

type Tab = "log" | "branches" | "actions";

export function GitPanel() {
  const state = useAppState();
  const [tab, setTab] = useState<Tab>("log");
  const [commits, setCommits] = useState<GitCommitInfo[]>([]);
  const [branches, setBranches] = useState<GitBranchInfo[]>([]);
  const [currentBranch, setCurrentBranch] = useState("");
  const [files, setFiles] = useState<GitFileStatus[]>([]);
  const [commitMsg, setCommitMsg] = useState("");
  const [actionOutput, setActionOutput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeProject = state.projects.find((p) => p.id === state.activeProjectId);
  const activeTerminal = activeProject?.terminals.find((t) => t.id === state.activeTerminalId);
  const cwd = activeTerminal?.cwd || activeProject?.path || null;

  const isVisible = state.sidebarMode === "git" && state.sidebarVisible;

  const refresh = useCallback(async () => {
    if (!cwd) return;
    setError(null);
    try {
      const [logResult, branchResult, branchName, statusResult] = await Promise.all([
        invoke<GitCommitInfo[]>("git_log", { cwd, count: 50 }),
        invoke<GitBranchInfo[]>("git_branches", { cwd }),
        invoke<string>("git_current_branch", { cwd }),
        invoke<GitFileStatus[]>("git_status", { cwd }),
      ]);
      setCommits(logResult);
      setBranches(branchResult);
      setCurrentBranch(branchName);
      setFiles(statusResult);
    } catch (e) {
      setError(String(e));
    }
  }, [cwd]);

  // Only fetch when the panel becomes visible or cwd changes while visible
  useEffect(() => {
    if (isVisible) {
      refresh();
    }
  }, [isVisible, cwd]); // eslint-disable-line react-hooks/exhaustive-deps

  const stageAll = useCallback(async () => {
    if (!cwd) return;
    setLoading(true);
    try {
      await invoke("git_stage", { cwd, path: "." });
      setActionOutput("Staged all files");
      await refresh();
    } catch (e) {
      setActionOutput(`Error: ${e}`);
    } finally {
      setLoading(false);
    }
  }, [cwd, refresh]);

  const doCommit = useCallback(async () => {
    if (!cwd || !commitMsg.trim()) return;
    setLoading(true);
    try {
      const result = await invoke<string>("git_commit", { cwd, message: commitMsg.trim() });
      setActionOutput(result);
      setCommitMsg("");
      await refresh();
    } catch (e) {
      setActionOutput(`Error: ${e}`);
    } finally {
      setLoading(false);
    }
  }, [cwd, commitMsg, refresh]);

  const doPush = useCallback(async () => {
    if (!cwd) return;
    setLoading(true);
    try {
      const result = await invoke<string>("git_push", { cwd });
      setActionOutput(result || "Pushed successfully");
      await refresh();
    } catch (e) {
      setActionOutput(`Error: ${e}`);
    } finally {
      setLoading(false);
    }
  }, [cwd, refresh]);

  const stageFile = useCallback(async (path: string) => {
    if (!cwd) return;
    try {
      await invoke("git_stage", { cwd, path });
      await refresh();
    } catch (e) {
      setActionOutput(`Error staging: ${e}`);
    }
  }, [cwd, refresh]);

  const unstageFile = useCallback(async (path: string) => {
    if (!cwd) return;
    try {
      await invoke("git_unstage", { cwd, path });
      await refresh();
    } catch (e) {
      setActionOutput(`Error unstaging: ${e}`);
    }
  }, [cwd, refresh]);

  if (!cwd) {
    return (
      <div className="sidebar-placeholder">
        <div className="placeholder-icon">*</div>
        <p>No project selected</p>
        <p className="placeholder-sub">Select a terminal to view git info</p>
      </div>
    );
  }

  if (error && commits.length === 0) {
    return (
      <div className="sidebar-placeholder">
        <div className="placeholder-icon">!</div>
        <p>Not a git repository</p>
        <p className="placeholder-sub">{error}</p>
      </div>
    );
  }

  const stagedFiles = files.filter((f) => f.staged);
  const unstagedFiles = files.filter((f) => !f.staged);

  return (
    <div className="git-panel">
      <div className="git-header">
        <span className="git-branch-name">{currentBranch}</span>
        <button className="diff-refresh-btn" onClick={refresh}>Refresh</button>
      </div>
      <div className="git-tabs">
        {(["log", "branches", "actions"] as Tab[]).map((t) => (
          <button
            key={t}
            className={`git-tab-btn ${tab === t ? "active" : ""}`}
            onClick={() => setTab(t)}
          >
            {t === "log" ? "History" : t === "branches" ? "Branches" : "Actions"}
          </button>
        ))}
      </div>

      <div className="git-body">
        {tab === "log" && (
          <div className="git-log-list">
            {commits.map((c) => (
              <div key={c.hash} className="git-commit-item">
                <div className="git-commit-top">
                  <span className="git-commit-hash">{c.short_hash}</span>
                  {c.refs && <span className="git-commit-refs">{c.refs}</span>}
                  <span className="git-commit-date">{c.date}</span>
                </div>
                <div className="git-commit-msg">{c.message}</div>
                <div className="git-commit-author">{c.author}</div>
              </div>
            ))}
          </div>
        )}

        {tab === "branches" && (
          <div className="git-branch-list">
            <div className="git-branch-section-title">Local</div>
            {branches.filter((b) => !b.remote).map((b) => (
              <div key={b.name} className={`git-branch-item ${b.current ? "current" : ""}`}>
                {b.current && <span className="git-branch-indicator">*</span>}
                <span>{b.name}</span>
              </div>
            ))}
            {branches.some((b) => b.remote) && (
              <>
                <div className="git-branch-section-title">Remote</div>
                {branches.filter((b) => b.remote).map((b) => (
                  <div key={b.name} className="git-branch-item remote">
                    <span>{b.name}</span>
                  </div>
                ))}
              </>
            )}
          </div>
        )}

        {tab === "actions" && (
          <div className="git-actions">
            {/* Staged files */}
            <div className="git-section">
              <div className="git-section-header">
                <span>Staged ({stagedFiles.length})</span>
              </div>
              {stagedFiles.map((f, i) => (
                <div key={`s-${i}`} className="git-action-file">
                  <span className="diff-file-status" style={{ color: "var(--green)" }}>{f.status}</span>
                  <span className="diff-file-path">{f.path}</span>
                  <button className="git-file-action" onClick={() => unstageFile(f.path)} title="Unstage">-</button>
                </div>
              ))}
            </div>

            {/* Unstaged files */}
            <div className="git-section">
              <div className="git-section-header">
                <span>Changes ({unstagedFiles.length})</span>
                {unstagedFiles.length > 0 && (
                  <button className="git-stage-all-btn" onClick={stageAll}>Stage All</button>
                )}
              </div>
              {unstagedFiles.map((f, i) => (
                <div key={`u-${i}`} className="git-action-file">
                  <span className="diff-file-status" style={{ color: "var(--yellow)" }}>{f.status}</span>
                  <span className="diff-file-path">{f.path}</span>
                  <button className="git-file-action" onClick={() => stageFile(f.path)} title="Stage">+</button>
                </div>
              ))}
            </div>

            {/* Commit */}
            <div className="git-section">
              <div className="git-section-header">Commit</div>
              <textarea
                className="git-commit-input"
                value={commitMsg}
                onChange={(e) => setCommitMsg(e.target.value)}
                placeholder="Commit message..."
                rows={3}
              />
              <div className="git-action-buttons">
                <button className="git-action-btn" onClick={doCommit} disabled={loading || !commitMsg.trim()}>
                  Commit
                </button>
                <button className="git-action-btn" onClick={doPush} disabled={loading}>
                  Push
                </button>
              </div>
            </div>

            {actionOutput && (
              <div className="git-output">
                <pre>{actionOutput}</pre>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

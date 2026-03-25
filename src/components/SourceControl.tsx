import { useState, useEffect, useCallback } from "react";
import { DiffEditor, type BeforeMount } from "@monaco-editor/react";
import { invoke } from "@tauri-apps/api/core";
import { useAppState } from "../state/context";

interface GitFileStatus {
  path: string;
  status: string;
  staged: boolean;
}

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

type View = "changes" | "history" | "branches";

// Which diff are we showing?
type DiffTarget =
  | { kind: "working"; file: string; staged: boolean }
  | { kind: "commit"; hash: string; file: string };

const defineTheme: BeforeMount = (monaco) => {
  monaco.editor.defineTheme("aiterminal-dark", {
    base: "vs-dark",
    inherit: true,
    rules: [],
    colors: {
      "editor.background": "#181818",
      "editor.foreground": "#d4d4d4",
      "editorLineNumber.foreground": "#444444",
      "editorLineNumber.activeForeground": "#777777",
      "editor.selectionBackground": "#3a3a3a",
      "editor.lineHighlightBackground": "#1e1e1e",
      "diffEditor.insertedTextBackground": "#9ece6a22",
      "diffEditor.removedTextBackground": "#f7768e22",
      "diffEditor.insertedLineBackground": "#9ece6a15",
      "diffEditor.removedLineBackground": "#f7768e15",
    },
  });

  // Enable JSX for TypeScript and JavaScript
  monaco.languages.typescript.typescriptDefaults.setCompilerOptions({
    jsx: monaco.languages.typescript.JsxEmit.React,
    jsxFactory: "React.createElement",
    reactNamespace: "React",
    allowJs: true,
    allowNonTsExtensions: true,
    target: monaco.languages.typescript.ScriptTarget.Latest,
    module: monaco.languages.typescript.ModuleKind.ESNext,
    moduleResolution: (monaco.languages.typescript.ModuleResolutionKind as any).Bundler ?? 100,
    esModuleInterop: true,
  });

  monaco.languages.typescript.javascriptDefaults.setCompilerOptions({
    jsx: monaco.languages.typescript.JsxEmit.React,
    jsxFactory: "React.createElement",
    reactNamespace: "React",
    allowJs: true,
    allowNonTsExtensions: true,
    target: monaco.languages.typescript.ScriptTarget.Latest,
    module: monaco.languages.typescript.ModuleKind.ESNext,
    moduleResolution: (monaco.languages.typescript.ModuleResolutionKind as any).Bundler ?? 100,
    esModuleInterop: true,
  });

  monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions({
    noSemanticValidation: true,
    noSyntaxValidation: false,
  });

  monaco.languages.typescript.javascriptDefaults.setDiagnosticsOptions({
    noSemanticValidation: true,
    noSyntaxValidation: false,
  });
};

function getLanguage(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase();
  const map: Record<string, string> = {
    ts: "typescript", tsx: "typescript", js: "javascript", jsx: "javascript",
    rs: "rust", py: "python", json: "json", css: "css", html: "html",
    md: "markdown", toml: "ini", yaml: "yaml", yml: "yaml", sh: "shell",
    sql: "sql", go: "go", java: "java", cpp: "cpp", c: "c", h: "c",
    cs: "csharp", rb: "ruby", php: "php", swift: "swift", kt: "kotlin",
    lua: "lua", xml: "xml", svg: "xml", vue: "html",
  };
  return map[ext || ""] || "plaintext";
}

function statusIcon(s: string): string {
  switch (s) {
    case "M": return "M";
    case "A": return "A";
    case "D": return "D";
    case "R": return "R";
    case "?": return "U";
    default: return s;
  }
}

function statusColor(s: string): string {
  switch (s) {
    case "M": return "var(--yellow)";
    case "A": case "?": return "var(--green)";
    case "D": return "var(--red)";
    case "R": return "var(--cyan)";
    default: return "var(--text-secondary)";
  }
}

export function SourceControl() {
  const state = useAppState();
  const [view, setView] = useState<View>("changes");
  const [files, setFiles] = useState<GitFileStatus[]>([]);
  const [commits, setCommits] = useState<GitCommitInfo[]>([]);
  const [branches, setBranches] = useState<GitBranchInfo[]>([]);
  const [currentBranch, setCurrentBranch] = useState("");
  const [commitMsg, setCommitMsg] = useState("");
  const [actionOutput, setActionOutput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [diffTarget, setDiffTarget] = useState<DiffTarget | null>(null);
  const [originalContent, setOriginalContent] = useState("");
  const [modifiedContent, setModifiedContent] = useState("");
  const [diffLoading, setDiffLoading] = useState(false);
  const [expandedCommit, setExpandedCommit] = useState<string | null>(null);
  const [commitFiles, setCommitFiles] = useState<GitFileStatus[]>([]);
  const [newBranchName, setNewBranchName] = useState("");
  const [showNewBranch, setShowNewBranch] = useState(false);
  const [branchDropdownOpen, setBranchDropdownOpen] = useState(false);

  const activeProject = state.projects.find((p) => p.id === state.activeProjectId);
  const activeTerminal = activeProject?.terminals.find((t) => t.id === state.activeTerminalId);
  const cwd = activeTerminal?.cwd || activeProject?.path || null;
  const isVisible = state.sidebarMode === "scm" && state.sidebarVisible;

  const refresh = useCallback(async () => {
    if (!cwd) return;
    setError(null);
    try {
      const [statusResult, branchName] = await Promise.all([
        invoke<GitFileStatus[]>("git_status", { cwd }),
        invoke<string>("git_current_branch", { cwd }),
      ]);
      setFiles(statusResult);
      setCurrentBranch(branchName);
    } catch (e) {
      setError(String(e));
    }
  }, [cwd]);

  const refreshHistory = useCallback(async () => {
    if (!cwd) return;
    try {
      const logResult = await invoke<GitCommitInfo[]>("git_log", { cwd, count: 50 });
      setCommits(logResult);
    } catch {}
  }, [cwd]);

  const refreshBranches = useCallback(async () => {
    if (!cwd) return;
    try {
      const branchResult = await invoke<GitBranchInfo[]>("git_branches", { cwd });
      setBranches(branchResult);
    } catch {}
  }, [cwd]);

  useEffect(() => {
    if (!isVisible) return;
    refresh();
    if (view === "history") refreshHistory();
    if (view === "branches") refreshBranches();
  }, [isVisible, cwd, view]); // eslint-disable-line react-hooks/exhaustive-deps

  // Open diff for a working tree file
  const openWorkingDiff = useCallback(async (filePath: string, staged: boolean) => {
    if (!cwd) return;
    const target: DiffTarget = { kind: "working", file: filePath, staged };
    setDiffTarget(target);
    setDiffLoading(true);
    try {
      let original = "";
      try {
        original = await invoke<string>("git_show_head", { cwd, filePath });
      } catch { original = ""; }

      const fullPath = cwd.replace(/\\/g, "/") + "/" + filePath.replace(/\\/g, "/");
      let modified = "";
      try {
        modified = await invoke<string>("read_file", { path: fullPath });
      } catch { modified = ""; }

      setOriginalContent(original);
      setModifiedContent(modified);
    } catch {} finally {
      setDiffLoading(false);
    }
  }, [cwd]);

  // Open diff for a file in a specific commit
  const openCommitDiff = useCallback(async (hash: string, filePath: string) => {
    if (!cwd) return;
    setDiffTarget({ kind: "commit", hash, file: filePath });
    setDiffLoading(true);
    try {
      let original = "";
      try {
        original = await invoke<string>("git_show_file_at_parent", { cwd, hash, filePath });
      } catch { original = ""; }

      let modified = "";
      try {
        modified = await invoke<string>("git_show_file_at", { cwd, hash, filePath });
      } catch { modified = ""; }

      setOriginalContent(original);
      setModifiedContent(modified);
    } catch {} finally {
      setDiffLoading(false);
    }
  }, [cwd]);

  // Expand a commit to see its files
  const toggleCommit = useCallback(async (hash: string) => {
    if (expandedCommit === hash) {
      setExpandedCommit(null);
      setCommitFiles([]);
      setDiffTarget(null);
      return;
    }
    setExpandedCommit(hash);
    if (!cwd) return;
    try {
      const result = await invoke<GitFileStatus[]>("git_commit_files", { cwd, hash });
      setCommitFiles(result);
    } catch {
      setCommitFiles([]);
    }
  }, [cwd, expandedCommit]);

  const stageFile = useCallback(async (path: string) => {
    if (!cwd) return;
    try { await invoke("git_stage", { cwd, path }); await refresh(); } catch (e) { setActionOutput(`Error: ${e}`); }
  }, [cwd, refresh]);

  const unstageFile = useCallback(async (path: string) => {
    if (!cwd) return;
    try { await invoke("git_unstage", { cwd, path }); await refresh(); } catch (e) { setActionOutput(`Error: ${e}`); }
  }, [cwd, refresh]);

  const stageAll = useCallback(async () => {
    if (!cwd) return;
    setLoading(true);
    try { await invoke("git_stage", { cwd, path: "." }); await refresh(); } catch (e) { setActionOutput(`Error: ${e}`); } finally { setLoading(false); }
  }, [cwd, refresh]);

  const doCommit = useCallback(async () => {
    if (!cwd || !commitMsg.trim()) return;
    setLoading(true);
    try {
      const result = await invoke<string>("git_commit", { cwd, message: commitMsg.trim() });
      setActionOutput(result);
      setCommitMsg("");
      await refresh();
    } catch (e) { setActionOutput(`Error: ${e}`); } finally { setLoading(false); }
  }, [cwd, commitMsg, refresh]);

  const doPush = useCallback(async () => {
    if (!cwd) return;
    setLoading(true);
    try {
      const result = await invoke<string>("git_push", { cwd });
      setActionOutput(result || "Pushed successfully");
    } catch (e) { setActionOutput(`Error: ${e}`); } finally { setLoading(false); }
  }, [cwd]);

  const switchBranch = useCallback(async (branch: string) => {
    if (!cwd) return;
    setLoading(true);
    try {
      await invoke<string>("git_checkout_branch", { cwd, branch });
      setBranchDropdownOpen(false);
      await refresh();
      await refreshBranches();
    } catch (e) { setActionOutput(`Error: ${e}`); } finally { setLoading(false); }
  }, [cwd, refresh, refreshBranches]);

  const createBranch = useCallback(async () => {
    if (!cwd || !newBranchName.trim()) return;
    setLoading(true);
    try {
      await invoke<string>("git_create_branch", { cwd, branch: newBranchName.trim() });
      setNewBranchName("");
      setShowNewBranch(false);
      await refresh();
      await refreshBranches();
    } catch (e) { setActionOutput(`Error: ${e}`); } finally { setLoading(false); }
  }, [cwd, newBranchName, refresh, refreshBranches]);

  const deleteBranch = useCallback(async (branch: string) => {
    if (!cwd) return;
    try {
      await invoke<string>("git_delete_branch", { cwd, branch });
      await refreshBranches();
    } catch (e) { setActionOutput(`Error: ${e}`); }
  }, [cwd, refreshBranches]);

  if (!cwd) {
    return (
      <div className="sidebar-placeholder">
        <div className="placeholder-icon">*</div>
        <p>No project selected</p>
        <p className="placeholder-sub">Select a terminal to view source control</p>
      </div>
    );
  }

  if (error && files.length === 0) {
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
  const diffFile = diffTarget?.file ?? null;

  return (
    <div className="scm-panel">
      {/* Header: branch selector */}
      <div className="scm-header">
        <div className="scm-branch-selector" onClick={() => { setBranchDropdownOpen(!branchDropdownOpen); if (!branchDropdownOpen) refreshBranches(); }}>
          <span className="scm-branch-icon">&#9741;</span>
          <span className="scm-branch-label">{currentBranch}</span>
          <span className="scm-branch-arrow">{branchDropdownOpen ? "\u25B4" : "\u25BE"}</span>
        </div>
        <button className="scm-icon-btn" onClick={refresh} title="Refresh">&#8635;</button>
      </div>

      {/* Branch dropdown */}
      {branchDropdownOpen && (
        <div className="scm-branch-dropdown">
          <div className="scm-branch-dropdown-header">
            <span>Branches</span>
            <button className="scm-icon-btn small" onClick={() => setShowNewBranch(!showNewBranch)} title="New branch">+</button>
          </div>
          {showNewBranch && (
            <div className="scm-new-branch">
              <input
                className="scm-input"
                value={newBranchName}
                onChange={(e) => setNewBranchName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") createBranch(); if (e.key === "Escape") setShowNewBranch(false); }}
                placeholder="New branch name..."
                autoFocus
              />
              <button className="scm-icon-btn small" onClick={createBranch}>&#10003;</button>
            </div>
          )}
          {branches.filter((b) => !b.remote).map((b) => (
            <div key={b.name} className={`scm-branch-option ${b.current ? "current" : ""}`} onClick={() => !b.current && switchBranch(b.name)}>
              <span className="scm-branch-option-name">{b.current ? "* " : ""}{b.name}</span>
              {!b.current && <button className="scm-icon-btn tiny" onClick={(e) => { e.stopPropagation(); deleteBranch(b.name); }} title="Delete">x</button>}
            </div>
          ))}
          {branches.some((b) => b.remote) && (
            <>
              <div className="scm-branch-dropdown-divider" />
              {branches.filter((b) => b.remote).map((b) => (
                <div key={b.name} className="scm-branch-option remote" onClick={() => switchBranch(b.name.replace(/^remotes\/origin\//, ""))}>
                  <span className="scm-branch-option-name">{b.name}</span>
                </div>
              ))}
            </>
          )}
        </div>
      )}

      {/* View tabs */}
      <div className="scm-tabs">
        {(["changes", "history", "branches"] as View[]).map((v) => (
          <button key={v} className={`scm-tab ${view === v ? "active" : ""}`} onClick={() => { setView(v); setDiffTarget(null); }}>
            {v === "changes" ? `Changes (${files.length})` : v === "history" ? "History" : "Branches"}
          </button>
        ))}
      </div>

      {/* Main content area - split between list and diff */}
      <div className="scm-body">
        <div className="scm-list-area">
          {/* CHANGES VIEW */}
          {view === "changes" && (
            <>
              {/* Staged section */}
              {stagedFiles.length > 0 && (
                <div className="scm-section">
                  <div className="scm-section-header">
                    <span>Staged Changes ({stagedFiles.length})</span>
                  </div>
                  {stagedFiles.map((f, i) => (
                    <div key={`s-${i}`} className={`scm-file ${diffTarget?.kind === "working" && diffFile === f.path ? "selected" : ""}`} onClick={() => openWorkingDiff(f.path, true)}>
                      <span className="scm-file-indicator" style={{ background: statusColor(f.status) }} />
                      <span className="scm-file-status" style={{ color: statusColor(f.status) }}>{statusIcon(f.status)}</span>
                      <span className="scm-file-path">{f.path}</span>
                      <button className="scm-file-action" onClick={(e) => { e.stopPropagation(); unstageFile(f.path); }} title="Unstage">&minus;</button>
                    </div>
                  ))}
                </div>
              )}

              {/* Unstaged section */}
              <div className="scm-section">
                <div className="scm-section-header">
                  <span>Changes ({unstagedFiles.length})</span>
                  {unstagedFiles.length > 0 && (
                    <button className="scm-icon-btn small" onClick={stageAll} title="Stage All">+</button>
                  )}
                </div>
                {unstagedFiles.length === 0 && stagedFiles.length === 0 && (
                  <div className="scm-empty">No changes</div>
                )}
                {unstagedFiles.map((f, i) => (
                  <div key={`u-${i}`} className={`scm-file ${diffTarget?.kind === "working" && diffFile === f.path ? "selected" : ""}`} onClick={() => openWorkingDiff(f.path, false)}>
                    <span className="scm-file-indicator" style={{ background: statusColor(f.status) }} />
                    <span className="scm-file-status" style={{ color: statusColor(f.status) }}>{statusIcon(f.status)}</span>
                    <span className="scm-file-path">{f.path}</span>
                    <button className="scm-file-action" onClick={(e) => { e.stopPropagation(); stageFile(f.path); }} title="Stage">+</button>
                  </div>
                ))}
              </div>

              {/* Commit area */}
              <div className="scm-commit-area">
                <textarea
                  className="scm-commit-input"
                  value={commitMsg}
                  onChange={(e) => setCommitMsg(e.target.value)}
                  placeholder="Commit message..."
                  rows={2}
                  onKeyDown={(e) => { if (e.ctrlKey && e.key === "Enter") doCommit(); }}
                />
                <div className="scm-commit-actions">
                  <button className="scm-commit-btn" onClick={doCommit} disabled={loading || !commitMsg.trim()}>
                    Commit
                  </button>
                  <button className="scm-push-btn" onClick={doPush} disabled={loading}>
                    Push
                  </button>
                </div>
              </div>
            </>
          )}

          {/* HISTORY VIEW */}
          {view === "history" && (
            <div className="scm-history">
              {commits.map((c) => (
                <div key={c.hash}>
                  <div className={`scm-commit ${expandedCommit === c.hash ? "expanded" : ""}`} onClick={() => toggleCommit(c.hash)}>
                    <div className="scm-commit-left">
                      <span className="scm-commit-hash">{c.short_hash}</span>
                      {c.refs && <span className="scm-commit-refs">{c.refs}</span>}
                    </div>
                    <div className="scm-commit-msg">{c.message}</div>
                    <div className="scm-commit-meta">
                      <span>{c.author}</span>
                      <span>{c.date}</span>
                    </div>
                  </div>
                  {expandedCommit === c.hash && (
                    <div className="scm-commit-files">
                      {commitFiles.map((f, i) => (
                        <div key={i} className={`scm-file ${diffTarget?.kind === "commit" && diffFile === f.path ? "selected" : ""}`} onClick={() => openCommitDiff(c.hash, f.path)}>
                          <span className="scm-file-indicator" style={{ background: statusColor(f.status) }} />
                          <span className="scm-file-status" style={{ color: statusColor(f.status) }}>{statusIcon(f.status)}</span>
                          <span className="scm-file-path">{f.path}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* BRANCHES VIEW */}
          {view === "branches" && (
            <div className="scm-branches">
              <div className="scm-section">
                <div className="scm-section-header">
                  <span>Local</span>
                  <button className="scm-icon-btn small" onClick={() => setShowNewBranch(!showNewBranch)} title="New branch">+</button>
                </div>
                {showNewBranch && (
                  <div className="scm-new-branch" style={{ padding: "2px 8px" }}>
                    <input
                      className="scm-input"
                      value={newBranchName}
                      onChange={(e) => setNewBranchName(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") createBranch(); if (e.key === "Escape") setShowNewBranch(false); }}
                      placeholder="New branch name..."
                      autoFocus
                    />
                  </div>
                )}
                {branches.filter((b) => !b.remote).map((b) => (
                  <div key={b.name} className={`scm-file ${b.current ? "current-branch" : ""}`} onClick={() => !b.current && switchBranch(b.name)}>
                    <span className="scm-file-indicator" style={{ background: b.current ? "var(--green)" : "var(--text-muted)" }} />
                    <span className="scm-file-path" style={{ color: b.current ? "var(--green)" : undefined }}>{b.name}</span>
                    {!b.current && <button className="scm-file-action" onClick={(e) => { e.stopPropagation(); deleteBranch(b.name); }} title="Delete">x</button>}
                  </div>
                ))}
              </div>
              {branches.some((b) => b.remote) && (
                <div className="scm-section">
                  <div className="scm-section-header"><span>Remote</span></div>
                  {branches.filter((b) => b.remote).map((b) => (
                    <div key={b.name} className="scm-file remote" onClick={() => switchBranch(b.name.replace(/^remotes\/origin\//, ""))}>
                      <span className="scm-file-indicator" style={{ background: "var(--text-muted)" }} />
                      <span className="scm-file-path" style={{ color: "var(--text-muted)" }}>{b.name}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Diff viewer */}
        {diffTarget && (
          <div className="scm-diff-area">
            <div className="scm-diff-header">
              <span className="scm-diff-file-name">{diffTarget.file}</span>
              <button className="scm-icon-btn small" onClick={() => setDiffTarget(null)} title="Close diff">x</button>
            </div>
            <div className="scm-diff-editor">
              {diffLoading ? (
                <div className="code-editor-loading">Loading diff...</div>
              ) : (
                <DiffEditor
                  height="100%"
                  language={getLanguage(diffTarget.file)}
                  original={originalContent}
                  modified={modifiedContent}
                  theme="aiterminal-dark"
                  beforeMount={defineTheme}
                  loading={<div className="code-editor-loading">Loading...</div>}
                  options={{
                    readOnly: true,
                    renderSideBySide: true,
                    minimap: { enabled: false },
                    scrollBeyondLastLine: false,
                    fontSize: 13,
                    fontFamily: "'Cascadia Code', 'Fira Code', 'JetBrains Mono', Consolas, monospace",
                    renderOverviewRuler: false,
                    padding: { top: 4 },
                    scrollbar: { verticalScrollbarSize: 8, horizontalScrollbarSize: 8 },
                    automaticLayout: true,
                  }}
                />
              )}
            </div>
          </div>
        )}
      </div>

      {/* Action output */}
      {actionOutput && (
        <div className="scm-output" onClick={() => setActionOutput("")}>
          <pre>{actionOutput}</pre>
        </div>
      )}
    </div>
  );
}

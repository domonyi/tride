import { useState, useEffect, useCallback, useRef } from "react";
import { DiffEditor, type BeforeMount } from "@monaco-editor/react";
import { invoke } from "@tauri-apps/api/core";
import { useAppState } from "../state/context";

interface GitFileStatus {
  path: string;
  status: string;
  staged: boolean;
}

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
      "editorCursor.foreground": "#d4d4d4",
      "diffEditor.insertedTextBackground": "#9ece6a22",
      "diffEditor.removedTextBackground": "#f7768e22",
      "diffEditor.insertedLineBackground": "#9ece6a15",
      "diffEditor.removedLineBackground": "#f7768e15",
    },
  });
};

function getLanguage(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase();
  const map: Record<string, string> = {
    ts: "typescript", tsx: "typescript", js: "javascript", jsx: "javascript",
    rs: "rust", py: "python", json: "json", css: "css", html: "html",
    md: "markdown", toml: "ini", yaml: "yaml", yml: "yaml", sh: "shell",
    bash: "shell", sql: "sql", go: "go", java: "java", cpp: "cpp",
    c: "c", h: "c", cs: "csharp", rb: "ruby", php: "php", swift: "swift",
    kt: "kotlin", lua: "lua", xml: "xml", svg: "xml", vue: "html",
  };
  return map[ext || ""] || "plaintext";
}

function statusLabel(s: string): string {
  switch (s) {
    case "M": return "Modified";
    case "A": return "Added";
    case "D": return "Deleted";
    case "R": return "Renamed";
    case "?": return "Untracked";
    default: return s;
  }
}

function statusColor(s: string): string {
  switch (s) {
    case "M": return "var(--yellow)";
    case "A": case "?": return "var(--green)";
    case "D": return "var(--red)";
    default: return "var(--text-secondary)";
  }
}

export function DiffViewer() {
  const state = useAppState();
  const [files, setFiles] = useState<GitFileStatus[]>([]);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [originalContent, setOriginalContent] = useState("");
  const [modifiedContent, setModifiedContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showStaged, setShowStaged] = useState(false);

  const activeProject = state.projects.find((p) => p.id === state.activeProjectId);
  const activeTerminal = activeProject?.terminals.find((t) => t.id === state.activeTerminalId);
  const cwd = activeTerminal?.cwd || activeProject?.path || null;

  const isVisible = state.sidebarMode === "diff" && state.sidebarVisible;
  const hasFetched = useRef(false);

  const refresh = useCallback(async () => {
    if (!cwd) return;
    setError(null);
    try {
      const result = await invoke<GitFileStatus[]>("git_status", { cwd });
      setFiles(result);
      hasFetched.current = true;
    } catch (e) {
      setError(String(e));
      setFiles([]);
    }
  }, [cwd]);

  // Only fetch when the panel becomes visible or cwd changes while visible
  useEffect(() => {
    if (isVisible) {
      refresh();
    } else {
      hasFetched.current = false;
    }
  }, [isVisible, cwd]); // eslint-disable-line react-hooks/exhaustive-deps

  const openDiff = useCallback(async (filePath: string) => {
    if (!cwd) return;
    setSelectedFile(filePath);
    setLoading(true);
    try {
      // Get the HEAD version
      let original = "";
      try {
        original = await invoke<string>("git_show_head", { cwd, filePath });
      } catch {
        // New file — no HEAD version
        original = "";
      }

      // Get the working copy
      const fullPath = cwd.replace(/\\/g, "/") + "/" + filePath.replace(/\\/g, "/");
      let modified = "";
      try {
        modified = await invoke<string>("read_file", { path: fullPath });
      } catch {
        // Deleted file
        modified = "";
      }

      setOriginalContent(original);
      setModifiedContent(modified);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [cwd]);

  if (!cwd) {
    return (
      <div className="sidebar-placeholder">
        <div className="placeholder-icon">+/-</div>
        <p>No project selected</p>
        <p className="placeholder-sub">Select a terminal to view diffs</p>
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

  const filteredFiles = showStaged ? files.filter((f) => f.staged) : files.filter((f) => !f.staged);

  return (
    <div className="diff-viewer">
      <div className="diff-toolbar">
        <button className="diff-refresh-btn" onClick={refresh} title="Refresh">Refresh</button>
        <div className="diff-toggle">
          <button
            className={`diff-toggle-btn ${!showStaged ? "active" : ""}`}
            onClick={() => setShowStaged(false)}
          >
            Working
          </button>
          <button
            className={`diff-toggle-btn ${showStaged ? "active" : ""}`}
            onClick={() => setShowStaged(true)}
          >
            Staged
          </button>
        </div>
        <span className="diff-file-count">{filteredFiles.length} files</span>
      </div>
      <div className="diff-file-list">
        {filteredFiles.length === 0 ? (
          <div className="diff-empty">No changes</div>
        ) : (
          filteredFiles.map((f, i) => (
            <div
              key={`${f.path}-${f.staged}-${i}`}
              className={`diff-file-item ${selectedFile === f.path ? "selected" : ""}`}
              onClick={() => openDiff(f.path)}
            >
              <span className="diff-file-status" style={{ color: statusColor(f.status) }}>
                {f.status}
              </span>
              <span className="diff-file-path">{f.path}</span>
              <span className="diff-file-label" style={{ color: statusColor(f.status) }}>
                {statusLabel(f.status)}
              </span>
            </div>
          ))
        )}
      </div>
      {selectedFile && (
        <div className="diff-editor-area">
          {loading ? (
            <div className="code-editor-loading">Loading diff...</div>
          ) : (
            <DiffEditor
              height="100%"
              language={getLanguage(selectedFile)}
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
                padding: { top: 8 },
                scrollbar: { verticalScrollbarSize: 8, horizontalScrollbarSize: 8 },
                automaticLayout: true,
              }}
            />
          )}
        </div>
      )}
    </div>
  );
}

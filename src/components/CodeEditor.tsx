import { useState, useCallback, useRef, useEffect } from "react";
import Editor, { type OnMount, type BeforeMount } from "@monaco-editor/react";
import type { editor } from "monaco-editor";
import { invoke } from "@tauri-apps/api/core";
import { FileTree } from "./FileTree";
import { useAppState } from "../state/context";

function getLanguage(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase();
  const map: Record<string, string> = {
    ts: "typescript", tsx: "typescript", js: "javascript", jsx: "javascript",
    rs: "rust", py: "python", json: "json", css: "css", html: "html",
    md: "markdown", toml: "ini", yaml: "yaml", yml: "yaml", sh: "shell",
    bash: "shell", sql: "sql", go: "go", java: "java", cpp: "cpp",
    cc: "cpp", cxx: "cpp", c: "c", h: "c", cs: "csharp", rb: "ruby",
    php: "php", swift: "swift", kt: "kotlin", r: "r", lua: "lua",
    xml: "xml", svg: "xml", vue: "html", svelte: "html",
  };
  return map[ext || ""] || "plaintext";
}

interface OpenTab {
  path: string;
  name: string;
  content: string;
  modified: boolean;
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
      "editorWidget.background": "#1e1e1e",
      "editorWidget.border": "#2a2a2a",
      "input.background": "#111111",
      "input.border": "#2a2a2a",
      "list.activeSelectionBackground": "#333333",
      "list.hoverBackground": "#2a2a2a",
      "editorSuggestWidget.background": "#1e1e1e",
      "editorSuggestWidget.border": "#2a2a2a",
      "editorSuggestWidget.selectedBackground": "#333333",
      "editorHoverWidget.background": "#1e1e1e",
      "editorHoverWidget.border": "#2a2a2a",
    },
  });
};

export function CodeEditor() {
  const state = useAppState();
  const [tabs, setTabs] = useState<OpenTab[]>([]);
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);

  const activeProject = state.projects.find((p) => p.id === state.activeProjectId);
  const activeTerminal = activeProject?.terminals.find((t) => t.id === state.activeTerminalId);
  const rootPath = activeTerminal?.cwd || activeProject?.path || null;

  const currentTab = tabs.find((t) => t.path === activeTab);

  const openFile = useCallback(async (path: string) => {
    // If already open, just switch to it
    const existing = tabs.find((t) => t.path === path);
    if (existing) {
      setActiveTab(path);
      return;
    }

    setLoading(true);
    try {
      const content = await invoke<string>("read_file", { path });
      const name = path.split(/[/\\]/).pop() || "untitled";
      setTabs((prev) => [...prev, { path, name, content, modified: false }]);
      setActiveTab(path);
    } catch (e) {
      console.error("Failed to read file:", e);
    } finally {
      setLoading(false);
    }
  }, [tabs]);

  const closeTab = useCallback((path: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setTabs((prev) => prev.filter((t) => t.path !== path));
    if (activeTab === path) {
      setTabs((prev) => {
        const remaining = prev.filter((t) => t.path !== path);
        setActiveTab(remaining.length > 0 ? remaining[remaining.length - 1].path : null);
        return prev;
      });
    }
  }, [activeTab]);

  const saveFile = useCallback(async () => {
    if (!activeTab || !editorRef.current) return;
    const content = editorRef.current.getValue();
    try {
      await invoke("write_file", { path: activeTab, content });
      setTabs((prev) => prev.map((t) => t.path === activeTab ? { ...t, content, modified: false } : t));
    } catch (e) {
      console.error("Failed to save:", e);
    }
  }, [activeTab]);

  const handleMount: OnMount = (editor) => {
    editorRef.current = editor;
    editor.addCommand(2048 | 49, () => saveFile()); // Ctrl+S
  };

  // Re-bind save when it changes
  useEffect(() => {
    if (editorRef.current) {
      editorRef.current.addCommand(2048 | 49, () => saveFile());
    }
  }, [saveFile]);

  if (!rootPath) {
    return (
      <div className="sidebar-placeholder">
        <div className="placeholder-icon">{"</>"}</div>
        <p>No project selected</p>
        <p className="placeholder-sub">Add a project to browse and edit files</p>
      </div>
    );
  }

  return (
    <div className="code-editor-layout">
      <div className="code-editor-tree">
        <FileTree key={rootPath} rootPath={rootPath} onFileSelect={openFile} selectedFile={activeTab} />
      </div>
      <div className="code-editor-main">
        {tabs.length > 0 && (
          <div className="code-editor-tab-bar">
            {tabs.map((tab) => (
              <div
                key={tab.path}
                className={`code-editor-tab ${activeTab === tab.path ? "active" : ""}`}
                onClick={() => setActiveTab(tab.path)}
              >
                <span>{tab.name}</span>
                {tab.modified && <span className="code-editor-modified">&bull;</span>}
                <span className="code-editor-close" onClick={(e) => closeTab(tab.path, e)}>x</span>
              </div>
            ))}
          </div>
        )}
        {currentTab ? (
          <Editor
            key={currentTab.path}
            height="100%"
            language={getLanguage(currentTab.path)}
            value={currentTab.content}
            theme="aiterminal-dark"
            onChange={(value) => {
              setTabs((prev) =>
                prev.map((t) => t.path === currentTab.path ? { ...t, modified: t.content !== value } : t)
              );
            }}
            onMount={handleMount}
            beforeMount={defineTheme}
            loading={<div className="code-editor-loading">Loading...</div>}
            options={{
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
              fontSize: 13,
              fontFamily: "'Cascadia Code', 'Fira Code', 'JetBrains Mono', Consolas, monospace",
              lineNumbers: "on",
              renderLineHighlight: "line",
              smoothScrolling: true,
              padding: { top: 8 },
              overviewRulerBorder: false,
              hideCursorInOverviewRuler: true,
              bracketPairColorization: { enabled: true },
              guides: { bracketPairs: true },
              scrollbar: { verticalScrollbarSize: 8, horizontalScrollbarSize: 8 },
              automaticLayout: true,
            }}
          />
        ) : (
          <div className="code-editor-empty">
            <p>Select a file to edit</p>
          </div>
        )}
      </div>
    </div>
  );
}

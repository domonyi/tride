import { useState, useCallback, useRef, useEffect } from "react";
import Editor, { type OnMount } from "@monaco-editor/react";
import type { editor } from "monaco-editor";
import { invoke } from "@tauri-apps/api/core";
import { FileTree } from "./FileTree";
import { useAppState } from "../state/context";

function getLanguage(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "ts":
    case "tsx":
      return "typescript";
    case "js":
    case "jsx":
      return "javascript";
    case "rs":
      return "rust";
    case "py":
      return "python";
    case "json":
      return "json";
    case "css":
      return "css";
    case "html":
      return "html";
    case "md":
      return "markdown";
    case "toml":
      return "ini";
    case "yaml":
    case "yml":
      return "yaml";
    case "sh":
    case "bash":
      return "shell";
    case "sql":
      return "sql";
    case "go":
      return "go";
    case "java":
      return "java";
    case "cpp":
    case "cc":
    case "cxx":
      return "cpp";
    case "c":
    case "h":
      return "c";
    default:
      return "plaintext";
  }
}

export function CodeEditor() {
  const state = useAppState();
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string>("");
  const [modified, setModified] = useState(false);
  const [loading, setLoading] = useState(false);
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);

  const activeProject = state.projects.find((p) => p.id === state.activeProjectId);
  const activeTerminal = activeProject?.terminals.find(
    (t) => t.id === state.activeTerminalId
  );
  const rootPath = activeTerminal?.cwd || activeProject?.path || null;

  const openFile = useCallback(async (path: string) => {
    setLoading(true);
    try {
      const content = await invoke<string>("read_file", { path });
      setSelectedFile(path);
      setFileContent(content);
      setModified(false);
    } catch (e) {
      console.error("Failed to read file:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  const saveFile = useCallback(async () => {
    if (!selectedFile || !editorRef.current) return;
    const content = editorRef.current.getValue();
    try {
      await invoke("write_file", { path: selectedFile, content });
      setModified(false);
    } catch (e) {
      console.error("Failed to save file:", e);
    }
  }, [selectedFile]);

  // Ctrl+S to save
  const handleEditorMount: OnMount = (editor) => {
    editorRef.current = editor;
    editor.addCommand(
      // Monaco KeyMod.CtrlCmd | KeyCode.KeyS
      2048 | 49, // CtrlCmd + S
      () => saveFile()
    );
  };

  // Re-bind save when saveFile changes
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
        <FileTree rootPath={rootPath} onFileSelect={openFile} selectedFile={selectedFile} />
      </div>
      <div className="code-editor-main">
        {selectedFile ? (
          <>
            <div className="code-editor-tab-bar">
              <span className="code-editor-tab active">
                {selectedFile.split(/[/\\]/).pop()}
                {modified && <span className="code-editor-modified">&bull;</span>}
              </span>
              {modified && (
                <button className="code-editor-save" onClick={saveFile}>
                  Save
                </button>
              )}
            </div>
            <Editor
              height="100%"
              language={getLanguage(selectedFile)}
              value={fileContent}
              theme="aiterminal-dark"
              onChange={() => setModified(true)}
              onMount={handleEditorMount}
              loading={<div className="code-editor-loading">Loading...</div>}
              beforeMount={(monaco) => {
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
                    "sideBar.background": "#111111",
                    "sideBarTitle.foreground": "#777777",
                  },
                });
              }}
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
                scrollbar: {
                  verticalScrollbarSize: 8,
                  horizontalScrollbarSize: 8,
                },
              }}
            />
          </>
        ) : (
          <div className="code-editor-empty">
            <p>Select a file to edit</p>
          </div>
        )}
      </div>
    </div>
  );
}

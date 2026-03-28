import { useState, useCallback, useRef, useEffect } from "react";
import Editor, { type OnMount, type BeforeMount, type Monaco } from "@monaco-editor/react";
import type { editor } from "monaco-editor";
import { invoke } from "@tauri-apps/api/core";
import { FileTree } from "./FileTree";
import { useAppState, useAppDispatch } from "../state/context";
import { useLsp } from "../hooks/useLsp";
import { ImagePreview } from "./ImagePreview";
import { createHighlighter } from "shiki";
import { textmateThemeToMonacoTheme } from "@shikijs/monaco";
import { INITIAL } from "@shikijs/vscode-textmate";

const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "bmp", "webp", "svg", "ico"]);

function isImageFile(path: string): boolean {
  const ext = path.split(".").pop()?.toLowerCase() || "";
  return IMAGE_EXTENSIONS.has(ext);
}

function getMimeType(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() || "";
  const map: Record<string, string> = {
    png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg",
    gif: "image/gif", bmp: "image/bmp", webp: "image/webp",
    svg: "image/svg+xml", ico: "image/x-icon",
  };
  return map[ext] || "image/png";
}

function getLanguage(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase();
  const map: Record<string, string> = {
    ts: "typescript-lsp", tsx: "typescript-lsp", js: "javascript-lsp", jsx: "javascript-lsp",
    rs: "rust", py: "python", json: "json", css: "css", html: "html",
    md: "markdown", toml: "toml", yaml: "yaml", yml: "yaml", sh: "shellscript",
    bash: "shellscript", sql: "sql", go: "go", java: "java", cpp: "cpp",
    cc: "cpp", cxx: "cpp", c: "c", h: "c", cs: "csharp", rb: "ruby",
    php: "php", swift: "swift", kt: "kotlin", r: "r", lua: "lua",
    xml: "xml", svg: "xml", vue: "vue", svelte: "svelte",
  };
  return map[ext || ""] || "plaintext";
}

/** Map file extensions to LSP languageId strings */
function getLspLanguageId(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase();
  if (ext === "tsx") return "typescriptreact";
  if (ext === "ts") return "typescript";
  if (ext === "jsx") return "javascriptreact";
  if (ext === "js") return "javascript";
  return ext || "plaintext";
}

function fileToUri(filePath: string): string {
  return "file:///" + filePath.replace(/\\/g, "/").replace(/^\//, "");
}

interface OpenTab {
  path: string;
  name: string;
  content: string;
  modified: boolean;
}

// State wrapper for TextMate tokenizer (used by shikiToMonaco internally too)
class TokenizerState {
  constructor(public ruleStack: any) {}
  clone() { return new TokenizerState(this.ruleStack); }
  equals(other: any) { return other instanceof TokenizerState && other.ruleStack === this.ruleStack; }
}

// Shiki highlighter — initialized once, shared across editor instances
let shikiHighlighter: Awaited<ReturnType<typeof createHighlighter>> | null = null;
let shikiInitPromise: Promise<void> | null = null;

function registerThemeInMonaco(monaco: Monaco, theme: string) {
  if (!shikiHighlighter) return;
  const monacoTheme = textmateThemeToMonacoTheme(shikiHighlighter.getTheme(theme));
  monaco.editor.defineTheme(theme, monacoTheme);
}

function registerTokenProviders(monaco: Monaco) {
  if (!shikiHighlighter) return;
  // Register token providers for all loaded languages + our custom LSP language IDs
  const monacoLangs = new Set(monaco.languages.getLanguages().map((l: any) => l.id));
  const langAliases: Record<string, string> = { "typescript-lsp": "tsx", "javascript-lsp": "jsx" };

  for (const lang of [...shikiHighlighter.getLoadedLanguages(), ...Object.keys(langAliases)]) {
    if (!monacoLangs.has(lang)) continue;
    const grammarLang = langAliases[lang] || lang;
    let grammar: any;
    try { grammar = shikiHighlighter.getLanguage(grammarLang); } catch { continue; }

    monaco.languages.setTokensProvider(lang, {
      getInitialState() { return new TokenizerState(INITIAL); },
      tokenize(line: string, state: any) {
        if (line.length >= 20000) {
          return { endState: state, tokens: [{ startIndex: 0, scopes: "" }] };
        }
        const result = grammar.tokenizeLine(line, state.ruleStack, 500);
        const tokens: { startIndex: number; scopes: string }[] = [];
        for (const tok of result.tokens) {
          const scope = tok.scopes[tok.scopes.length - 1] || "";
          tokens.push({ startIndex: tok.startIndex, scopes: scope });
        }
        return { endState: new TokenizerState(result.ruleStack), tokens };
      },
    } as any);
  }
}

async function initShiki(monaco: Monaco, theme: string) {
  if (shikiHighlighter) {
    // Already initialized — just load and apply the new theme
    if (!shikiHighlighter.getLoadedThemes().includes(theme)) {
      await shikiHighlighter.loadTheme(theme as any);
    }
    registerThemeInMonaco(monaco, theme);
    monaco.editor.setTheme(theme);
    return;
  }

  // Prevent double init if called concurrently
  if (shikiInitPromise) { await shikiInitPromise; return initShiki(monaco, theme); }

  shikiInitPromise = (async () => {
    shikiHighlighter = await createHighlighter({
      themes: [theme as any],
      langs: [
        "typescript", "tsx", "javascript", "jsx",
        "rust", "python", "json", "css", "html",
        "markdown", "toml", "yaml", "shellscript",
        "sql", "go", "java", "cpp", "c",
        "csharp", "ruby", "php", "swift", "kotlin",
        "lua", "xml", "vue", "svelte",
      ],
    });

    // Register custom language IDs for LSP
    monaco.languages.register({ id: "typescript-lsp" });
    monaco.languages.register({ id: "javascript-lsp" });

    // Register TextMate token providers for all languages
    registerTokenProviders(monaco);

    // Register and apply the theme
    registerThemeInMonaco(monaco, theme);
    monaco.editor.setTheme(theme);
  })();

  await shikiInitPromise;
}

const defineTheme: BeforeMount = (monaco) => {
  // Define a dark fallback theme immediately so the editor is never white while Shiki loads
  monaco.editor.defineTheme("tride-loading", {
    base: "vs-dark",
    inherit: true,
    rules: [],
    colors: { "editor.background": "#1a1b26" },
  });

  // Disable Monaco's built-in TS worker completely — LSP handles everything.
  monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions({
    noSemanticValidation: true,
    noSyntaxValidation: true,
  });
  monaco.languages.typescript.javascriptDefaults.setDiagnosticsOptions({
    noSemanticValidation: true,
    noSyntaxValidation: true,
  });
  monaco.languages.typescript.typescriptDefaults.setEagerModelSync(false);
  monaco.languages.typescript.javascriptDefaults.setEagerModelSync(false);

  // Register custom language IDs for LSP providers
  monaco.languages.register({ id: "typescript-lsp" });
  monaco.languages.register({ id: "javascript-lsp" });

  // Language configurations (brackets, comments, folding, etc.)
  const tsConfig: any = {
    comments: { lineComment: "//", blockComment: ["/*", "*/"] },
    brackets: [["{", "}"], ["[", "]"], ["(", ")"], ["<", ">"]],
    autoClosingPairs: [
      { open: "{", close: "}" }, { open: "[", close: "]" },
      { open: "(", close: ")" }, { open: "'", close: "'", notIn: ["string", "comment"] },
      { open: '"', close: '"', notIn: ["string"] }, { open: "`", close: "`", notIn: ["string", "comment"] },
    ],
    surroundingPairs: [
      { open: "{", close: "}" }, { open: "[", close: "]" },
      { open: "(", close: ")" }, { open: "<", close: ">" },
      { open: "'", close: "'" }, { open: '"', close: '"' }, { open: "`", close: "`" },
    ],
    folding: { markers: { start: /^\s*\/\/\s*#?region\b/, end: /^\s*\/\/\s*#?endregion\b/ } },
    indentationRules: {
      increaseIndentPattern: /^((?!.*?\/\*).*\*\/)?\s*[\}\]].*$|^.*\{[^}"'`]*$|^.*\([^)"'`]*$|^\s*(export\s+default\s+)?function\b.*\{[^}"'`]*$/,
      decreaseIndentPattern: /^((?!.*?\/\*).*\*\/)?\s*[\}\]].*$/,
    },
  };
  monaco.languages.setLanguageConfiguration("typescript-lsp", tsConfig);
  monaco.languages.setLanguageConfiguration("javascript-lsp", tsConfig);
};

export function CodeEditor() {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const [tabs, setTabs] = useState<OpenTab[]>([]);
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const [monacoInstance, setMonacoInstance] = useState<Monaco | null>(null);
  const restoredRef = useRef(false);
  const versionRef = useRef<Map<string, number>>(new Map());

  const treeRef = useRef<HTMLDivElement>(null);
  const activeProject = state.projects.find((p) => p.id === state.activeProjectId);
  const activeTerminal = activeProject?.terminals.find((t) => t.id === state.activeTerminalId);
  const rootPath = activeTerminal?.cwd || activeProject?.path || null;
  const explorerVisible = state.explorerVisible;
  const explorerWidth = state.explorerWidth;

  const onTreeResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = treeRef.current?.offsetWidth ?? explorerWidth;

    const overlay = document.createElement("div");
    overlay.style.cssText = "position:fixed;inset:0;z-index:9999;cursor:ew-resize;";
    document.body.appendChild(overlay);

    const onMouseMove = (ev: MouseEvent) => {
      const newWidth = Math.max(120, Math.min(startWidth + (ev.clientX - startX), 500));
      if (treeRef.current) {
        treeRef.current.style.width = `${newWidth}px`;
      }
    };

    const onMouseUp = () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      overlay.remove();
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      if (treeRef.current) {
        dispatch({ type: "SET_EXPLORER_WIDTH", width: treeRef.current.offsetWidth });
      }
    };

    document.body.style.cursor = "ew-resize";
    document.body.style.userSelect = "none";
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  }, [explorerWidth, dispatch]);

  // LSP — handles hover, completion, diagnostics via real tsserver
  const lsp = useLsp(monacoInstance, rootPath);

  const currentTab = tabs.find((t) => t.path === activeTab);

  // Save active file and all open tabs to state
  useEffect(() => {
    if (activeTab !== null) {
      dispatch({ type: "SET_LAST_OPENED_FILE", path: activeTab });
    }
  }, [activeTab, dispatch]);

  useEffect(() => {
    dispatch({ type: "SET_OPENED_FILES", files: tabs.map((t) => t.path) });
  }, [tabs, dispatch]);

  // Restore all opened files on initial load
  useEffect(() => {
    if (!restoredRef.current && rootPath) {
      const filesToOpen = state.openedFiles.length > 0 ? state.openedFiles : (state.lastOpenedFile ? [state.lastOpenedFile] : []);
      if (filesToOpen.length === 0) return;
      restoredRef.current = true;
      const timer = setTimeout(async () => {
        for (const file of filesToOpen) {
          await openFileFromPath(file);
        }
        // Set the active tab to lastOpenedFile (the one that was active when session was saved)
        if (state.lastOpenedFile && filesToOpen.includes(state.lastOpenedFile)) {
          setActiveTab(state.lastOpenedFile);
        }
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [state.openedFiles, state.lastOpenedFile, rootPath]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep a ref to openFileFromPath so the event listener always uses the latest
  const openFileRef = useRef<(path: string) => void>(() => {});

  // Open file from external request (e.g. ctrl+click in terminal)
  useEffect(() => {
    const handler = (e: Event) => {
      const filePath = (e as CustomEvent<string>).detail;
      if (filePath) openFileRef.current(filePath);
    };
    window.addEventListener("open-file", handler);
    return () => window.removeEventListener("open-file", handler);
  }, []);

  const openFileFromPath = async (rawPath: string) => {
    try {
      // Resolve relative paths against the project root
      let path = rawPath;
      if (rootPath && !/^[a-zA-Z]:/.test(path) && !path.startsWith("/")) {
        path = rootPath.replace(/\\/g, "/") + "/" + path;
      }
      // Also try if the tab is already open
      const existing = tabs.find((t) => t.path === path);
      if (existing) { setActiveTab(path); return; }

      const name = path.split(/[/\\]/).pop() || "untitled";
      if (isImageFile(path)) {
        const base64 = await invoke<string>("read_file_base64", { path });
        const dataUrl = `data:${getMimeType(path)};base64,${base64}`;
        setTabs((prev) => {
          if (prev.some((t) => t.path === path)) return prev;
          return [...prev, { path, name, content: dataUrl, modified: false }];
        });
        setActiveTab(path);
      } else {
        const content = await invoke<string>("read_file", { path });
        setTabs((prev) => {
          if (prev.some((t) => t.path === path)) return prev;
          return [...prev, { path, name, content, modified: false }];
        });
        setActiveTab(path);
        versionRef.current.set(path, 1);
        lsp.didOpen(fileToUri(path), getLspLanguageId(path), 1, content);
      }
    } catch {}
  };

  // Keep ref in sync so event listener always uses latest closure
  openFileRef.current = openFileFromPath;

  const openFile = useCallback(async (path: string) => {
    const existing = tabs.find((t) => t.path === path);
    if (existing) { setActiveTab(path); return; }

    setLoading(true);
    try {
      if (isImageFile(path)) {
        const base64 = await invoke<string>("read_file_base64", { path });
        const dataUrl = `data:${getMimeType(path)};base64,${base64}`;
        const name = path.split(/[/\\]/).pop() || "untitled";
        setTabs((prev) => [...prev, { path, name, content: dataUrl, modified: false }]);
        setActiveTab(path);
      } else {
        const content = await invoke<string>("read_file", { path });
        const name = path.split(/[/\\]/).pop() || "untitled";
        setTabs((prev) => [...prev, { path, name, content, modified: false }]);
        setActiveTab(path);
        versionRef.current.set(path, 1);
        lsp.didOpen(fileToUri(path), getLspLanguageId(path), 1, content);
      }
    } catch (e) {
      console.error("Failed to read file:", e);
    } finally {
      setLoading(false);
    }
  }, [tabs, lsp]);

  const closeTab = useCallback((path: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    lsp.didClose(fileToUri(path));
    versionRef.current.delete(path);
    setTabs((prev) => prev.filter((t) => t.path !== path));
    if (activeTab === path) {
      setTabs((prev) => {
        const remaining = prev.filter((t) => t.path !== path);
        setActiveTab(remaining.length > 0 ? remaining[remaining.length - 1].path : null);
        return prev;
      });
    }
  }, [activeTab, lsp]);

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

  const handleMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    setMonacoInstance(monaco);
    editor.addCommand(2048 | 49, () => saveFile()); // Ctrl+S
    // Initialize Shiki TextMate grammars and set the theme
    initShiki(monaco, state.editorTheme);
  };

  useEffect(() => {
    if (editorRef.current) {
      editorRef.current.addCommand(2048 | 49, () => saveFile());
    }
  }, [saveFile]);

  // Switch theme dynamically when editorTheme changes
  useEffect(() => {
    if (monacoInstance) {
      initShiki(monacoInstance, state.editorTheme);
    }
  }, [state.editorTheme, monacoInstance]);

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
      {explorerVisible && (
        <>
          <div className="code-editor-tree" ref={treeRef} style={{ width: explorerWidth }}>
            <FileTree key={rootPath} rootPath={rootPath} onFileSelect={openFile} selectedFile={activeTab} />
          </div>
          <div className="code-editor-tree-resize" onMouseDown={onTreeResizeStart} />
        </>
      )}
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
                <span className="code-editor-close" onClick={(e) => closeTab(tab.path, e)}>&times;</span>
              </div>
            ))}
          </div>
        )}
        {currentTab && isImageFile(currentTab.path) ? (
          <ImagePreview src={currentTab.content} name={currentTab.name} />
        ) : currentTab ? (
          <Editor
            key={currentTab.path}
            height="100%"
            language={getLanguage(currentTab.path)}
            path={fileToUri(currentTab.path)}
            value={currentTab.content}
            theme="tride-loading"
            onChange={(value) => {
              setTabs((prev) =>
                prev.map((t) => t.path === currentTab.path ? { ...t, modified: t.content !== value } : t)
              );
              if (value !== undefined) {
                const v = (versionRef.current.get(currentTab.path) || 1) + 1;
                versionRef.current.set(currentTab.path, v);
                lsp.didChange(fileToUri(currentTab.path), v, value);
              }
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
              "semanticHighlighting.enabled": true,
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

import { useState, useCallback, useRef, useEffect } from "react";
import Editor, { type OnMount, type BeforeMount, type Monaco } from "@monaco-editor/react";
import type { editor } from "monaco-editor";
import { invoke } from "@tauri-apps/api/core";
import { FileTree } from "./FileTree";
import { useAppState, useAppDispatch } from "../state/context";
import { useLsp } from "../hooks/useLsp";
import { ImagePreview } from "./ImagePreview";

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
    md: "markdown", toml: "ini", yaml: "yaml", yml: "yaml", sh: "shell",
    bash: "shell", sql: "sql", go: "go", java: "java", cpp: "cpp",
    cc: "cpp", cxx: "cpp", c: "c", h: "c", cs: "csharp", rb: "ruby",
    php: "php", swift: "swift", kt: "kotlin", r: "r", lua: "lua",
    xml: "xml", svg: "xml", vue: "html", svelte: "html",
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

const defineTheme: BeforeMount = (monaco) => {
  monaco.editor.defineTheme("tride-dark", {
    base: "vs-dark",
    inherit: true,
    rules: [
      { token: "keyword", foreground: "bb9af7" },
      { token: "keyword.control", foreground: "bb9af7" },
      { token: "storage", foreground: "bb9af7" },
      { token: "storage.type", foreground: "bb9af7" },
      { token: "type", foreground: "2ac3de" },
      { token: "type.identifier", foreground: "2ac3de" },
      { token: "support.type", foreground: "2ac3de" },
      { token: "variable", foreground: "c0caf5" },
      { token: "variable.parameter", foreground: "e0af68" },
      { token: "identifier", foreground: "c0caf5" },
      { token: "entity.name.function", foreground: "7aa2f7" },
      { token: "support.function", foreground: "7aa2f7" },
      { token: "string", foreground: "9ece6a" },
      { token: "string.template", foreground: "9ece6a" },
      { token: "number", foreground: "ff9e64" },
      { token: "constant.numeric", foreground: "ff9e64" },
      { token: "constant", foreground: "ff9e64" },
      { token: "constant.language", foreground: "ff9e64" },
      { token: "comment", foreground: "565f89", fontStyle: "italic" },
      { token: "operator", foreground: "89ddff" },
      { token: "delimiter", foreground: "9aa5ce" },
      { token: "delimiter.bracket", foreground: "9aa5ce" },
      { token: "tag", foreground: "f7768e" },
      { token: "tag.id", foreground: "f7768e" },
      { token: "tag.class", foreground: "f7768e" },
      { token: "metatag", foreground: "f7768e" },
      { token: "metatag.html", foreground: "f7768e" },
      { token: "metatag.content.html", foreground: "9ece6a" },
      { token: "attribute.name", foreground: "bb9af7" },
      { token: "attribute.value", foreground: "9ece6a" },
      { token: "attribute.name.html", foreground: "bb9af7" },
      { token: "attribute.value.html", foreground: "9ece6a" },
      { token: "regexp", foreground: "b4f9f8" },
      { token: "tag.decorator", foreground: "e0af68" },
    ],
    colors: {
      "editor.background": "#181818",
      "editor.foreground": "#c0caf5",
      "editorLineNumber.foreground": "#3b4261",
      "editorLineNumber.activeForeground": "#737aa2",
      "editor.selectionBackground": "#3a3a5c",
      "editor.lineHighlightBackground": "#1e1e2e",
      "editorCursor.foreground": "#c0caf5",
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
      "editorBracketMatch.background": "#3b4261",
      "editorBracketMatch.border": "#545c7e",
    },
  });

  // Disable Monaco's built-in TS worker completely — LSP handles everything.
  // We do this by disabling all diagnostics AND setting eagarModelSync to false
  // so the TS worker never processes our models.
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

  // Register custom language IDs that use TS/JS tokenizers but have NO built-in worker.
  // This prevents Monaco's built-in hover/completion from firing.
  monaco.languages.register({ id: "typescript-lsp", extensions: [".ts", ".tsx"], mimetypes: ["text/typescript"] });
  monaco.languages.register({ id: "javascript-lsp", extensions: [".js", ".jsx"], mimetypes: ["text/javascript"] });

  // Copy the tokenizer from typescript/javascript
  const tsTokenizer = monaco.languages.getEncodedLanguageId("typescript");
  const jsTokenizer = monaco.languages.getEncodedLanguageId("javascript");

  // Set the tokenization to use the TS/JS monarch tokenizers
  monaco.languages.setLanguageConfiguration("typescript-lsp", {
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
  });
  monaco.languages.setLanguageConfiguration("javascript-lsp", {
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
  });

  // Use the TypeScript monarch tokenizer for syntax highlighting on our custom languages
  monaco.languages.setMonarchTokensProvider("typescript-lsp", (monaco.languages as any).typescript?.monarchLanguage ||
    getTypescriptMonarchTokens());
  monaco.languages.setMonarchTokensProvider("javascript-lsp", (monaco.languages as any).javascript?.monarchLanguage ||
    getTypescriptMonarchTokens());
};

/** Fallback TypeScript monarch tokenizer for syntax highlighting */
function getTypescriptMonarchTokens(): any {
  return {
    defaultToken: "",
    tokenPostfix: ".ts",
    keywords: [
      "abstract", "any", "as", "asserts", "async", "await", "bigint", "boolean", "break",
      "case", "catch", "class", "const", "continue", "debugger", "declare", "default",
      "delete", "do", "else", "enum", "export", "extends", "false", "finally", "for",
      "from", "function", "get", "if", "implements", "import", "in", "infer", "instanceof",
      "interface", "is", "keyof", "let", "module", "namespace", "never", "new", "null",
      "number", "object", "of", "override", "package", "private", "protected", "public",
      "readonly", "return", "satisfies", "set", "static", "string", "super", "switch",
      "symbol", "this", "throw", "true", "try", "type", "typeof", "undefined", "unique",
      "unknown", "var", "void", "while", "with", "yield",
    ],
    operators: [
      "<=", ">=", "==", "!=", "===", "!==", "=>", "+", "-", "**",
      "*", "/", "%", "++", "--", "<<", "</", ">>", ">>>", "&",
      "|", "^", "!", "~", "&&", "||", "??", "?", ":", "=",
      "+=", "-=", "*=", "**=", "/=", "%=", "<<=", ">>=", ">>>=",
      "&=", "|=", "^=", "@",
    ],
    symbols: /[=><!~?:&|+\-*\/\^%]+/,
    escapes: /\\(?:[abfnrtv\\"']|x[0-9A-Fa-f]{1,4}|u[0-9A-Fa-f]{4}|U[0-9A-Fa-f]{8})/,
    digits: /\d+(_+\d+)*/,
    octaldigits: /[0-7]+(_+[0-7]+)*/,
    binarydigits: /[0-1]+(_+[0-1]+)*/,
    hexdigits: /[[0-9a-fA-F]+(_+[0-9a-fA-F]+)*/,
    regexpctl: /[(){}\[\]\$\^|\-*+?\.]/,
    regexpesc: /\\(?:[bBdDfnrstvwWn0\\\/]|@regexpctl|c[A-Z]|x[0-9a-fA-F]{2}|u[0-9a-fA-F]{4})/,
    tokenizer: {
      root: [
        [/[{}]/, "delimiter.bracket"],
        { include: "common" },
      ],
      common: [
        [/[a-z_$][\w$]*/, { cases: { "@keywords": "keyword", "@default": "identifier" } }],
        [/[A-Z][\w\$]*/, "type.identifier"],
        { include: "@whitespace" },
        [/\/(?=([^\\\/]|\\.)+\/([dgimsuy]*)(\s*)(\.|;|,|\)|\]|\}|$))/, { token: "regexp", bracket: "@open", next: "@regexp" }],
        [/[()\[\]]/, "@brackets"],
        [/[<>](?!@symbols)/, "@brackets"],
        [/!(?=([^=]|$))/, "delimiter"],
        [/@symbols/, { cases: { "@operators": "delimiter", "@default": "" } }],
        [/(@digits)[eE]([\-+]?(@digits))?/, "number.float"],
        [/(@digits)\.(@digits)([eE][\-+]?(@digits))?/, "number.float"],
        [/0[xX](@hexdigits)n?/, "number.hex"],
        [/0[oO]?(@octaldigits)n?/, "number.octal"],
        [/0[bB](@binarydigits)n?/, "number.binary"],
        [/(@digits)n?/, "number"],
        [/[;,.]/, "delimiter"],
        [/"([^"\\]|\\.)*$/, "string.invalid"],
        [/'([^'\\]|\\.)*$/, "string.invalid"],
        [/"/, "string", "@string_double"],
        [/'/, "string", "@string_single"],
        [/`/, "string", "@string_backtick"],
      ],
      whitespace: [
        [/[ \t\r\n]+/, ""],
        [/\/\*\*(?!\/)/, "comment.doc", "@jsdoc"],
        [/\/\*/, "comment", "@comment"],
        [/\/\/.*$/, "comment"],
      ],
      comment: [
        [/[^\/*]+/, "comment"],
        [/\*\//, "comment", "@pop"],
        [/[\/*]/, "comment"],
      ],
      jsdoc: [
        [/[^\/*]+/, "comment.doc"],
        [/\*\//, "comment.doc", "@pop"],
        [/[\/*]/, "comment.doc"],
      ],
      regexp: [
        [/(\{)(\d+(?:,\d*)?)(\})/, ["regexp.escape.control", "regexp.escape.control", "regexp.escape.control"]],
        [/(\[)(\^?)(?=(?:[^\]\\\/]|\\.)+)/, ["regexp.escape.control", { token: "regexp.escape.control", next: "@regexrange" }]],
        [/(\()(\?:|\?=|\?!)/, ["regexp.escape.control", "regexp.escape.control"]],
        [/[()]/, "regexp.escape.control"],
        [/@regexpctl/, "regexp.escape.control"],
        [/[^\\\/]/, "regexp"],
        [/@regexpesc/, "regexp.escape"],
        [/\\\./, "regexp.invalid"],
        [/(\/)([dgimsuy]*)/, [{ token: "regexp", bracket: "@close", next: "@pop" }, "keyword.other"]],
      ],
      regexrange: [
        [/-/, "regexp.escape.control"],
        [/\^/, "regexp.invalid"],
        [/@regexpesc/, "regexp.escape"],
        [/[^\]]/, "regexp"],
        [/\]/, { token: "regexp.escape.control", next: "@pop", bracket: "@close" }],
      ],
      string_double: [
        [/[^\\"]+/, "string"],
        [/@escapes/, "string.escape"],
        [/\\./, "string.escape.invalid"],
        [/"/, "string", "@pop"],
      ],
      string_single: [
        [/[^\\']+/, "string"],
        [/@escapes/, "string.escape"],
        [/\\./, "string.escape.invalid"],
        [/'/, "string", "@pop"],
      ],
      string_backtick: [
        [/\$\{/, { token: "delimiter.bracket", next: "@bracketCounting" }],
        [/[^\\`$]+/, "string"],
        [/@escapes/, "string.escape"],
        [/\\./, "string.escape.invalid"],
        [/`/, "string", "@pop"],
      ],
      bracketCounting: [
        [/\{/, "delimiter.bracket", "@bracketCounting"],
        [/\}/, "delimiter.bracket", "@pop"],
        { include: "common" },
      ],
    },
  };
}

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

  // Save active file to state
  useEffect(() => {
    if (activeTab !== null) {
      dispatch({ type: "SET_LAST_OPENED_FILE", path: activeTab });
    }
  }, [activeTab, dispatch]);

  // Restore last opened file on initial load
  useEffect(() => {
    if (!restoredRef.current && state.lastOpenedFile && rootPath) {
      restoredRef.current = true;
      const timer = setTimeout(() => openFileFromPath(state.lastOpenedFile!), 100);
      return () => clearTimeout(timer);
    }
  }, [state.lastOpenedFile, rootPath]); // eslint-disable-line react-hooks/exhaustive-deps

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
  };

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
            theme="tride-dark"
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

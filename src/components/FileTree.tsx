import { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { SEP, parentPath as getParent } from "../utils/platform";

interface FileEntry {
  name: string;
  path: string;
  is_dir: boolean;
}

interface GitFileStatus {
  path: string;
  status: string;
  staged: boolean;
}

interface FileTreeProps {
  rootPath: string;
  onFileSelect: (path: string) => void;
  selectedFile: string | null;
  expandedFolders: Set<string>;
  onToggleFolder: (path: string) => void;
  fileStatuses?: Map<string, string>;
}

interface ContextMenu {
  x: number;
  y: number;
  entry: FileEntry;
  parentPath: string;
}

interface InlineInput {
  parentPath: string;
  kind: "new-file" | "new-folder" | "rename";
  entry?: FileEntry;
}

/* ── Icon resolution using Material Icon Theme SVGs ──────────────────── */

const FILE_NAME_ICONS: Record<string, string> = {
  "package.json": "nodejs",
  "package-lock.json": "nodejs",
  "tsconfig.json": "tsconfig",
  "tsconfig.base.json": "tsconfig",
  ".gitignore": "git",
  ".gitattributes": "git",
  "dockerfile": "docker",
  "docker-compose.yml": "docker",
  "docker-compose.yaml": "docker",
  "readme.md": "readme",
  "license": "license",
  "license.md": "license",
  ".eslintrc.js": "eslint",
  ".eslintrc.json": "eslint",
  "eslint.config.js": "eslint",
  "eslint.config.mjs": "eslint",
  "vite.config.ts": "vite",
  "vite.config.js": "vite",
  "tailwind.config.js": "tailwindcss",
  "tailwind.config.ts": "tailwindcss",
  "next.config.js": "next",
  "next.config.mjs": "next",
  "cargo.toml": "rust",
  ".env": "tune",
  ".env.local": "tune",
  ".env.development": "tune",
  ".env.production": "tune",
};

const FILE_EXT_ICONS: Record<string, string> = {
  ts: "typescript",
  tsx: "react_ts",
  js: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  jsx: "react",
  json: "json",
  css: "css",
  scss: "css",
  less: "css",
  html: "html",
  htm: "html",
  md: "markdown",
  mdx: "markdown",
  rs: "rust",
  py: "python",
  go: "go",
  toml: "toml",
  svg: "svg",
  png: "image",
  jpg: "image",
  jpeg: "image",
  gif: "image",
  webp: "image",
  ico: "image",
  sh: "console",
  bash: "console",
  zsh: "console",
  fish: "console",
  ps1: "console",
  bat: "console",
  cmd: "console",
  sql: "database",
  java: "java",
  cpp: "cpp",
  cc: "cpp",
  cxx: "cpp",
  c: "c",
  h: "h",
  hpp: "h",
  cs: "csharp",
  rb: "ruby",
  php: "php",
  swift: "swift",
  kt: "kotlin",
  lua: "lua",
  xml: "xml",
  vue: "vue",
  svelte: "svelte",
  lock: "lock",
  env: "tune",
  txt: "document",
  log: "log",
  wasm: "webassembly",
  zip: "zip",
  tar: "zip",
  gz: "zip",
  "7z": "zip",
  rar: "zip",
  yaml: "yaml",
  yml: "yaml",
};

const FOLDER_NAME_ICONS: Record<string, string> = {
  src: "folder-src",
  node_modules: "folder-node",
  dist: "folder-dist",
  build: "folder-dist",
  out: "folder-dist",
  public: "folder-public",
  assets: "folder-resource",
  static: "folder-resource",
  resource: "folder-resource",
  resources: "folder-resource",
  components: "folder-components",
  hooks: "folder-hook",
  styles: "folder-css",
  css: "folder-css",
  tests: "folder-test",
  test: "folder-test",
  __tests__: "folder-test",
  spec: "folder-test",
  lib: "folder-lib",
  api: "folder-api",
  config: "folder-config",
  ".git": "folder-git",
  ".github": "folder-git",
  state: "folder-config",
};

function getFileIconUrl(name: string): string {
  const lower = name.toLowerCase();
  const byName = FILE_NAME_ICONS[lower];
  if (byName) return `/file-icons/${byName}.svg`;

  const ext = lower.split(".").pop() || "";
  const byExt = FILE_EXT_ICONS[ext];
  if (byExt) return `/file-icons/${byExt}.svg`;

  return "/file-icons/file.svg";
}

function getFolderIconUrl(name: string, open: boolean): string {
  const lower = name.toLowerCase();
  const byName = FOLDER_NAME_ICONS[lower];
  if (byName) return `/file-icons/${byName}${open ? "-open" : ""}.svg`;
  return `/file-icons/folder${open ? "-open" : ""}.svg`;
}

function getParentPath(filePath: string): string {
  return getParent(filePath);
}

/* ── Components ──────────────────────────────────────────────────────── */

export function FileTree({ rootPath, onFileSelect, selectedFile, expandedFolders, onToggleFolder, fileStatuses }: FileTreeProps) {
  const [ctxMenu, setCtxMenu] = useState<ContextMenu | null>(null);
  const [inlineInput, setInlineInput] = useState<InlineInput | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const treeRef = useRef<HTMLDivElement>(null);

  const triggerRefresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  const closeMenu = useCallback(() => setCtxMenu(null), []);

  // Close context menu on click outside or scroll
  useEffect(() => {
    if (!ctxMenu) return;
    const handler = () => setCtxMenu(null);
    window.addEventListener("click", handler);
    window.addEventListener("scroll", handler, true);
    return () => {
      window.removeEventListener("click", handler);
      window.removeEventListener("scroll", handler, true);
    };
  }, [ctxMenu]);

  const onContextMenu = useCallback((e: React.MouseEvent, entry: FileEntry) => {
    e.preventDefault();
    e.stopPropagation();
    setCtxMenu({ x: e.clientX, y: e.clientY, entry, parentPath: getParentPath(entry.path) });
  }, []);

  // Context menu on empty space creates in root
  const onTreeContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setCtxMenu({
      x: e.clientX,
      y: e.clientY,
      entry: { name: "", path: rootPath, is_dir: true },
      parentPath: rootPath,
    });
  }, [rootPath]);

  const handleAction = useCallback(async (action: string) => {
    if (!ctxMenu) return;
    const { entry } = ctxMenu;
    const targetDir = entry.is_dir ? entry.path : getParentPath(entry.path);
    closeMenu();

    switch (action) {
      case "new-file":
        setInlineInput({ parentPath: targetDir, kind: "new-file" });
        break;
      case "new-folder":
        setInlineInput({ parentPath: targetDir, kind: "new-folder" });
        break;
      case "rename":
        setInlineInput({ parentPath: getParentPath(entry.path), kind: "rename", entry });
        break;
      case "delete":
        try {
          await invoke("delete_entry", { path: entry.path });
          triggerRefresh();
        } catch (e) {
          console.error("Delete failed:", e);
        }
        break;
      case "copy-path":
        try { await writeText(entry.path); } catch {}
        break;
      case "copy-relative": {
        const rel = entry.path.startsWith(rootPath)
          ? entry.path.slice(rootPath.length).replace(/^[/\\]/, "")
          : entry.path;
        try { await writeText(rel); } catch {}
        break;
      }
      case "reveal":
        try { await invoke("reveal_in_explorer", { path: entry.path }); } catch {}
        break;
    }
  }, [ctxMenu, closeMenu, rootPath, triggerRefresh]);

  const handleInlineSubmit = useCallback(async (value: string) => {
    if (!inlineInput || !value.trim()) {
      setInlineInput(null);
      return;
    }
    try {
      if (inlineInput.kind === "rename" && inlineInput.entry) {
        const newPath = inlineInput.parentPath + SEP + value.trim();
        await invoke("rename_entry", { oldPath: inlineInput.entry.path, newPath });
      } else if (inlineInput.kind === "new-file") {
        const newPath = inlineInput.parentPath + SEP + value.trim();
        await invoke("create_file", { path: newPath });
      } else if (inlineInput.kind === "new-folder") {
        const newPath = inlineInput.parentPath + SEP + value.trim();
        await invoke("create_dir", { path: newPath });
      }
      triggerRefresh();
    } catch (e) {
      console.error("File operation failed:", e);
    }
    setInlineInput(null);
  }, [inlineInput, triggerRefresh]);

  return (
    <div className="file-tree" ref={treeRef}>
      <div className="file-tree-header">
        {rootPath.split(/[/\\]/).filter(Boolean).pop()}
      </div>
      <div className="file-tree-list" onContextMenu={onTreeContextMenu}>
        <DirectoryNode
          key={refreshKey}
          path={rootPath}
          depth={0}
          onFileSelect={onFileSelect}
          selectedFile={selectedFile}
          onContextMenu={onContextMenu}
          inlineInput={inlineInput}
          onInlineSubmit={handleInlineSubmit}
          onInlineCancel={() => setInlineInput(null)}
          defaultOpen
          expandedFolders={expandedFolders}
          onToggleFolder={onToggleFolder}
          fileStatuses={fileStatuses}
        />
      </div>

      {/* Context Menu */}
      {ctxMenu && (
        <ContextMenuOverlay
          x={ctxMenu.x}
          y={ctxMenu.y}
          entry={ctxMenu.entry}
          onAction={handleAction}
        />
      )}
    </div>
  );
}

function ContextMenuOverlay({ x, y, entry, onAction }: {
  x: number; y: number; entry: FileEntry; onAction: (action: string) => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x, y });

  // Adjust position if menu overflows viewport
  useEffect(() => {
    const el = menuRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    let adjustedX = x;
    let adjustedY = y;
    if (rect.right > window.innerWidth) adjustedX = window.innerWidth - rect.width - 4;
    if (rect.bottom > window.innerHeight) adjustedY = window.innerHeight - rect.height - 4;
    if (adjustedX !== x || adjustedY !== y) setPos({ x: adjustedX, y: adjustedY });
  }, [x, y]);

  const isRoot = entry.name === "";

  return (
    <div className="ctx-menu" ref={menuRef} style={{ left: pos.x, top: pos.y }} onClick={(e) => e.stopPropagation()}>
      <div className="ctx-menu-item" onClick={() => onAction("new-file")}>New File</div>
      <div className="ctx-menu-item" onClick={() => onAction("new-folder")}>New Folder</div>
      {!isRoot && (
        <>
          <div className="ctx-menu-separator" />
          <div className="ctx-menu-item" onClick={() => onAction("rename")}>Rename</div>
          <div className="ctx-menu-item danger" onClick={() => onAction("delete")}>Delete</div>
          <div className="ctx-menu-separator" />
          <div className="ctx-menu-item" onClick={() => onAction("copy-path")}>Copy Path</div>
          <div className="ctx-menu-item" onClick={() => onAction("copy-relative")}>Copy Relative Path</div>
          <div className="ctx-menu-separator" />
          <div className="ctx-menu-item" onClick={() => onAction("reveal")}>Reveal in File Explorer</div>
        </>
      )}
    </div>
  );
}

function InlineNameInput({ defaultValue, onSubmit, onCancel, depth }: {
  defaultValue: string; onSubmit: (val: string) => void; onCancel: () => void; depth: number;
}) {
  const [value, setValue] = useState(defaultValue);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    if (defaultValue) {
      // Select name without extension for renames
      const dotIdx = defaultValue.lastIndexOf(".");
      inputRef.current?.setSelectionRange(0, dotIdx > 0 ? dotIdx : defaultValue.length);
    }
  }, []);

  return (
    <div className="file-tree-item file" style={{ paddingLeft: `${12 + depth * 16}px` }}>
      <input
        ref={inputRef}
        className="file-tree-inline-input"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") onSubmit(value);
          if (e.key === "Escape") onCancel();
        }}
        onBlur={() => onSubmit(value)}
      />
    </div>
  );
}

function DirectoryNode({
  path,
  depth,
  onFileSelect,
  selectedFile,
  onContextMenu,
  inlineInput,
  onInlineSubmit,
  onInlineCancel,
  defaultOpen = false,
  expandedFolders,
  onToggleFolder,
  fileStatuses,
}: {
  path: string;
  depth: number;
  onFileSelect: (path: string) => void;
  selectedFile: string | null;
  onContextMenu: (e: React.MouseEvent, entry: FileEntry) => void;
  inlineInput: InlineInput | null;
  onInlineSubmit: (value: string) => void;
  onInlineCancel: () => void;
  defaultOpen?: boolean;
  expandedFolders: Set<string>;
  onToggleFolder: (path: string) => void;
  fileStatuses?: Map<string, string>;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    if (loaded) return;
    try {
      const result = await invoke<FileEntry[]>("list_dir", { path });
      setEntries(result);
      setLoaded(true);
    } catch (e) {
      console.error("Failed to list dir:", e);
    }
  }, [path, loaded]);

  useEffect(() => {
    if (open && !loaded) load();
  }, [open, loaded, load]);

  if (!open) return null;

  // Show inline input for new file/folder in this directory
  const showInline = inlineInput && inlineInput.parentPath === path && inlineInput.kind !== "rename";

  return (
    <>
      {showInline && (
        <InlineNameInput defaultValue="" onSubmit={onInlineSubmit} onCancel={onInlineCancel} depth={depth} />
      )}
      {entries.map((entry) =>
        entry.is_dir ? (
          <FolderItem
            key={entry.path}
            entry={entry}
            depth={depth}
            onFileSelect={onFileSelect}
            selectedFile={selectedFile}
            onContextMenu={onContextMenu}
            inlineInput={inlineInput}
            onInlineSubmit={onInlineSubmit}
            onInlineCancel={onInlineCancel}
            expandedFolders={expandedFolders}
            onToggleFolder={onToggleFolder}
            fileStatuses={fileStatuses}
          />
        ) : inlineInput?.kind === "rename" && inlineInput.entry?.path === entry.path ? (
          <InlineNameInput key={entry.path} defaultValue={entry.name} onSubmit={onInlineSubmit} onCancel={onInlineCancel} depth={depth} />
        ) : (
          <FileItem
            key={entry.path}
            entry={entry}
            depth={depth}
            onFileSelect={onFileSelect}
            isSelected={selectedFile === entry.path}
            onContextMenu={onContextMenu}
            fileStatuses={fileStatuses}
          />
        )
      )}
    </>
  );
}

function FolderItem({ entry, depth, onFileSelect, selectedFile, onContextMenu, inlineInput, onInlineSubmit, onInlineCancel, expandedFolders, onToggleFolder, fileStatuses }: {
  entry: FileEntry; depth: number; onFileSelect: (path: string) => void; selectedFile: string | null;
  onContextMenu: (e: React.MouseEvent, entry: FileEntry) => void;
  inlineInput: InlineInput | null; onInlineSubmit: (value: string) => void; onInlineCancel: () => void;
  expandedFolders: Set<string>; onToggleFolder: (path: string) => void;
  fileStatuses?: Map<string, string>;
}) {
  const open = expandedFolders.has(entry.path);
  const isRenaming = inlineInput?.kind === "rename" && inlineInput.entry?.path === entry.path;

  return (
    <>
      {isRenaming ? (
        <InlineNameInput defaultValue={entry.name} onSubmit={onInlineSubmit} onCancel={onInlineCancel} depth={depth} />
      ) : (
        <div
          className="file-tree-item folder"
          style={{ paddingLeft: `${12 + depth * 16}px` }}
          onClick={() => onToggleFolder(entry.path)}
          onContextMenu={(e) => onContextMenu(e, entry)}
        >
          <img className="file-tree-icon" src={getFolderIconUrl(entry.name, open)} alt="" />
          <span className="file-tree-name">{entry.name}</span>
        </div>
      )}
      {open && (
        <DirectoryNode
          path={entry.path}
          depth={depth + 1}
          onFileSelect={onFileSelect}
          selectedFile={selectedFile}
          onContextMenu={onContextMenu}
          inlineInput={inlineInput}
          onInlineSubmit={onInlineSubmit}
          onInlineCancel={onInlineCancel}
          defaultOpen
          expandedFolders={expandedFolders}
          onToggleFolder={onToggleFolder}
          fileStatuses={fileStatuses}
        />
      )}
    </>
  );
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

function statusLabel(s: string): string {
  return s === "?" ? "U" : s;
}

function FileItem({ entry, depth, onFileSelect, isSelected, onContextMenu, fileStatuses }: {
  entry: FileEntry; depth: number; onFileSelect: (path: string) => void; isSelected: boolean;
  onContextMenu: (e: React.MouseEvent, entry: FileEntry) => void;
  fileStatuses?: Map<string, string>;
}) {
  const status = fileStatuses?.get(entry.path);

  return (
    <div
      className={`file-tree-item file ${isSelected ? "selected" : ""}`}
      style={{ paddingLeft: `${12 + depth * 16}px` }}
      onClick={() => onFileSelect(entry.path)}
      onContextMenu={(e) => onContextMenu(e, entry)}
    >
      <img className="file-tree-icon" src={getFileIconUrl(entry.name)} alt="" />
      <span className="file-tree-name" style={status ? { color: statusColor(status) } : undefined}>{entry.name}</span>
      {status && <span className="file-tree-status" style={{ color: statusColor(status) }}>{statusLabel(status)}</span>}
    </div>
  );
}

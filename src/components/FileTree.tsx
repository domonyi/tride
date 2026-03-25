import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";

interface FileEntry {
  name: string;
  path: string;
  is_dir: boolean;
}

interface FileTreeProps {
  rootPath: string;
  onFileSelect: (path: string) => void;
  selectedFile: string | null;
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

/* ── Components ──────────────────────────────────────────────────────── */

export function FileTree({ rootPath, onFileSelect, selectedFile }: FileTreeProps) {
  return (
    <div className="file-tree">
      <div className="file-tree-header">
        {rootPath.split(/[/\\]/).filter(Boolean).pop()}
      </div>
      <div className="file-tree-list">
        <DirectoryNode
          path={rootPath}
          depth={0}
          onFileSelect={onFileSelect}
          selectedFile={selectedFile}
          defaultOpen
        />
      </div>
    </div>
  );
}

function DirectoryNode({
  path,
  depth,
  onFileSelect,
  selectedFile,
  defaultOpen = false,
}: {
  path: string;
  depth: number;
  onFileSelect: (path: string) => void;
  selectedFile: string | null;
  defaultOpen?: boolean;
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

  return (
    <>
      {entries.map((entry) =>
        entry.is_dir ? (
          <FolderItem key={entry.path} entry={entry} depth={depth} onFileSelect={onFileSelect} selectedFile={selectedFile} />
        ) : (
          <FileItem key={entry.path} entry={entry} depth={depth} onFileSelect={onFileSelect} isSelected={selectedFile === entry.path} />
        )
      )}
    </>
  );
}

function FolderItem({ entry, depth, onFileSelect, selectedFile }: {
  entry: FileEntry; depth: number; onFileSelect: (path: string) => void; selectedFile: string | null;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="file-tree-item folder" style={{ paddingLeft: `${12 + depth * 16}px` }} onClick={() => setOpen(!open)}>
        <img className="file-tree-icon" src={getFolderIconUrl(entry.name, open)} alt="" />
        <span className="file-tree-name">{entry.name}</span>
      </div>
      {open && <DirectoryNode path={entry.path} depth={depth + 1} onFileSelect={onFileSelect} selectedFile={selectedFile} defaultOpen />}
    </>
  );
}

function FileItem({ entry, depth, onFileSelect, isSelected }: {
  entry: FileEntry; depth: number; onFileSelect: (path: string) => void; isSelected: boolean;
}) {
  return (
    <div className={`file-tree-item file ${isSelected ? "selected" : ""}`} style={{ paddingLeft: `${12 + depth * 16}px` }} onClick={() => onFileSelect(entry.path)}>
      <img className="file-tree-icon" src={getFileIconUrl(entry.name)} alt="" />
      <span className="file-tree-name">{entry.name}</span>
    </div>
  );
}

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

export function FileTree({ rootPath, onFileSelect, selectedFile }: FileTreeProps) {
  return (
    <div className="file-tree">
      <div className="file-tree-header">
        {rootPath.split(/[/\\]/).filter(Boolean).pop()}
      </div>
      <div className="file-tree-list">
        <DirectoryNode path={rootPath} depth={0} onFileSelect={onFileSelect} selectedFile={selectedFile} defaultOpen />
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
    if (open && !loaded) {
      load();
    }
  }, [open, loaded, load]);

  const toggle = () => {
    setOpen(!open);
  };

  if (!open) return null;

  return (
    <>
      {entries.map((entry) =>
        entry.is_dir ? (
          <FolderItem
            key={entry.path}
            entry={entry}
            depth={depth}
            onFileSelect={onFileSelect}
            selectedFile={selectedFile}
          />
        ) : (
          <FileItem
            key={entry.path}
            entry={entry}
            depth={depth}
            onFileSelect={onFileSelect}
            isSelected={selectedFile === entry.path}
          />
        )
      )}
    </>
  );
}

function FolderItem({
  entry,
  depth,
  onFileSelect,
  selectedFile,
}: {
  entry: FileEntry;
  depth: number;
  onFileSelect: (path: string) => void;
  selectedFile: string | null;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <div
        className="file-tree-item folder"
        style={{ paddingLeft: `${12 + depth * 16}px` }}
        onClick={() => setOpen(!open)}
      >
        <span className="file-tree-icon">{open ? "\u25BE" : "\u25B8"}</span>
        <span className="file-tree-name">{entry.name}</span>
      </div>
      {open && (
        <DirectoryNode
          path={entry.path}
          depth={depth + 1}
          onFileSelect={onFileSelect}
          selectedFile={selectedFile}
          defaultOpen
        />
      )}
    </>
  );
}

function FileItem({
  entry,
  depth,
  onFileSelect,
  isSelected,
}: {
  entry: FileEntry;
  depth: number;
  onFileSelect: (path: string) => void;
  isSelected: boolean;
}) {
  return (
    <div
      className={`file-tree-item file ${isSelected ? "selected" : ""}`}
      style={{ paddingLeft: `${12 + depth * 16}px` }}
      onClick={() => onFileSelect(entry.path)}
    >
      <span className="file-tree-icon">{getFileIcon(entry.name)}</span>
      <span className="file-tree-name">{entry.name}</span>
    </div>
  );
}

function getFileIcon(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "ts":
    case "tsx":
      return "TS";
    case "js":
    case "jsx":
      return "JS";
    case "rs":
      return "RS";
    case "py":
      return "PY";
    case "json":
      return "{}";
    case "css":
      return "#";
    case "html":
      return "<>";
    case "md":
      return "M";
    case "toml":
      return "T";
    case "yaml":
    case "yml":
      return "Y";
    default:
      return "\u00B7";
  }
}

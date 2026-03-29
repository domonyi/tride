import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";

interface SearchBarProps {
  rootPath: string;
  onFileSelect: (path: string) => void;
  onClose: () => void;
}

interface ScoredResult {
  path: string;
  score: number;
  nameMatchPositions: number[];
}

/* ── Fuzzy scoring ─────────────────────────────────────────────────── */

function fuzzyMatch(query: string, target: string): { score: number; positions: number[] } | null {
  const q = query.toLowerCase();
  const t = target.toLowerCase();

  // All query chars must exist in order
  let qi = 0;
  const positions: number[] = [];
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      positions.push(ti);
      qi++;
    }
  }
  if (qi < q.length) return null;

  // Score: consecutive matches, start-of-word bonuses, shorter = better
  let score = 0;
  for (let i = 0; i < positions.length; i++) {
    const pos = positions[i];
    // Consecutive match bonus
    if (i > 0 && positions[i] === positions[i - 1] + 1) {
      score += 10;
    }
    // Start of segment bonus (after / or . or -)
    if (pos === 0 || "/.-_".includes(t[pos - 1])) {
      score += 8;
    }
    // Uppercase in original = camelCase boundary
    if (target[pos] === target[pos].toUpperCase() && target[pos] !== target[pos].toLowerCase()) {
      score += 5;
    }
  }

  // Shorter paths rank higher
  score -= target.length * 0.5;

  // Filename match bonus (query matches the end segment)
  const filename = target.split("/").pop() || "";
  if (filename.toLowerCase().includes(q)) {
    score += 20;
  }

  return { score, positions };
}

/* ── Component ─────────────────────────────────────────────────────── */

export function SearchBar({ rootPath, onFileSelect, onClose }: SearchBarProps) {
  const [query, setQuery] = useState("");
  const [allFiles, setAllFiles] = useState<string[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Load file list on mount
  useEffect(() => {
    invoke<string[]>("walk_files", { root: rootPath }).then(setAllFiles).catch(console.error);
  }, [rootPath]);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Filtered + scored results
  const results = useMemo((): ScoredResult[] => {
    if (!query.trim()) {
      // Show recent/first files when no query
      return allFiles.slice(0, 50).map((path) => ({
        path,
        score: 0,
        nameMatchPositions: [],
      }));
    }

    const scored: ScoredResult[] = [];
    for (const path of allFiles) {
      const match = fuzzyMatch(query, path);
      if (match) {
        scored.push({ path, score: match.score, nameMatchPositions: match.positions });
      }
    }
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, 50);
  }, [query, allFiles]);

  // Reset selection when results change
  useEffect(() => {
    setSelectedIndex(0);
  }, [results]);

  // Scroll selected item into view
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const item = list.children[selectedIndex] as HTMLElement | undefined;
    item?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  const selectFile = useCallback(
    (path: string) => {
      const sep = rootPath.includes("\\") ? "\\" : "/";
      const fullPath = rootPath + sep + path.replace(/\//g, sep);
      onFileSelect(fullPath);
      onClose();
    },
    [rootPath, onFileSelect, onClose],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setSelectedIndex((i) => Math.min(i + 1, results.length - 1));
          break;
        case "ArrowUp":
          e.preventDefault();
          setSelectedIndex((i) => Math.max(i - 1, 0));
          break;
        case "Enter":
          e.preventDefault();
          if (results[selectedIndex]) {
            selectFile(results[selectedIndex].path);
          }
          break;
        case "Escape":
          e.preventDefault();
          onClose();
          break;
      }
    },
    [results, selectedIndex, selectFile, onClose],
  );

  return (
    <div className="search-bar-overlay" onMouseDown={onClose}>
      <div className="search-bar" onMouseDown={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          className="search-bar-input"
          type="text"
          placeholder="Search files by name..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          spellCheck={false}
        />
        {results.length > 0 && (
          <div className="search-bar-results" ref={listRef}>
            {results.map((result, i) => (
              <SearchResultItem
                key={result.path}
                result={result}
                query={query}
                isSelected={i === selectedIndex}
                onSelect={() => selectFile(result.path)}
                onHover={() => setSelectedIndex(i)}
              />
            ))}
          </div>
        )}
        {query && results.length === 0 && (
          <div className="search-bar-empty">No files found</div>
        )}
      </div>
    </div>
  );
}

/* ── File icon helpers (reuse the same logic as FileTree) ──────────── */

const FILE_EXT_ICONS: Record<string, string> = {
  ts: "typescript", tsx: "react_ts", js: "javascript", mjs: "javascript",
  jsx: "react", json: "json", css: "css", scss: "css", html: "html",
  md: "markdown", rs: "rust", py: "python", go: "go", toml: "toml",
  svg: "svg", png: "image", jpg: "image", yaml: "yaml", yml: "yaml",
  sh: "console", sql: "database", java: "java", cpp: "cpp", c: "c",
  vue: "vue", svelte: "svelte", lock: "lock", txt: "document", log: "log",
};

const FILE_NAME_ICONS: Record<string, string> = {
  "package.json": "nodejs", "tsconfig.json": "tsconfig", "cargo.toml": "rust",
  "dockerfile": "docker", "vite.config.ts": "vite", ".env": "tune",
};

function getIconUrl(name: string): string {
  const lower = name.toLowerCase();
  const byName = FILE_NAME_ICONS[lower];
  if (byName) return `/file-icons/${byName}.svg`;
  const ext = lower.split(".").pop() || "";
  const byExt = FILE_EXT_ICONS[ext];
  if (byExt) return `/file-icons/${byExt}.svg`;
  return "/file-icons/file.svg";
}

/* ── Highlighted match rendering ───────────────────────────────────── */

function highlightMatch(text: string, query: string): React.ReactNode {
  if (!query) return text;
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  const parts: React.ReactNode[] = [];
  let qi = 0;
  let lastEnd = 0;

  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      if (ti > lastEnd) {
        parts.push(<span key={`t-${lastEnd}`}>{text.slice(lastEnd, ti)}</span>);
      }
      // Gather consecutive matches
      const start = ti;
      while (ti < t.length && qi < q.length && t[ti] === q[qi]) {
        qi++;
        ti++;
      }
      parts.push(
        <span key={`m-${start}`} className="search-bar-highlight">
          {text.slice(start, ti)}
        </span>,
      );
      lastEnd = ti;
      ti--; // for loop will increment
    }
  }
  if (lastEnd < text.length) {
    parts.push(<span key={`t-${lastEnd}`}>{text.slice(lastEnd)}</span>);
  }
  return parts;
}

function SearchResultItem({ result, query, isSelected, onSelect, onHover }: {
  result: ScoredResult;
  query: string;
  isSelected: boolean;
  onSelect: () => void;
  onHover: () => void;
}) {
  const filename = result.path.split("/").pop() || result.path;
  const dir = result.path.includes("/")
    ? result.path.slice(0, result.path.lastIndexOf("/"))
    : "";

  return (
    <div
      className={`search-bar-item ${isSelected ? "selected" : ""}`}
      onClick={onSelect}
      onMouseEnter={onHover}
    >
      <img className="search-bar-icon" src={getIconUrl(filename)} alt="" />
      <span className="search-bar-filename">{highlightMatch(filename, query)}</span>
      {dir && <span className="search-bar-dir">{dir}</span>}
    </div>
  );
}

import { useState, useCallback, useEffect, useRef } from "react";
import { useAppState, useAppDispatch } from "../state/context";
import type { LlmPane as LlmPaneType, PaneChatHistory } from "../types";
import { FolderOpen, GitBranch, MessageSquare, X, ChevronDown } from "lucide-react";

interface Props {
  pane: LlmPaneType;
  accentColor: string;
}

function timeAgo(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return `${Math.floor(days / 7)}w ago`;
}

const S = {
  screen: {
    flex: 1,
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    padding: 16,
  },
  options: {
    display: "flex",
    flexDirection: "column" as const,
    gap: 6,
    width: "100%",
    maxWidth: 260,
  },
  option: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    width: "100%",
    padding: "10px 14px",
    border: "1px solid #2a2a2a",
    borderRadius: 6,
    background: "#1e1e1e",
    cursor: "pointer",
    textAlign: "left" as const,
    color: "#d4d4d4",
    fontSize: 12,
  },
  optionIcon: {
    flexShrink: 0,
    color: "#999",
  },
  optionTitle: {
    fontWeight: 600,
    fontSize: 12,
    color: "#d4d4d4",
  },
  optionDesc: {
    fontSize: 10,
    color: "#777",
  },
  divider: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    width: "100%",
    maxWidth: 260,
    margin: "4px 0",
  },
  dividerLine: {
    flex: 1,
    height: 1,
    background: "#2a2a2a",
  },
  dividerText: {
    fontSize: 10,
    color: "#777",
    whiteSpace: "nowrap" as const,
  },
  historyItem: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "6px 8px",
    borderRadius: 4,
    cursor: "pointer",
    fontSize: 11,
    color: "#d4d4d4",
    width: "100%",
    maxWidth: 260,
  },
  historyName: {
    fontWeight: 500,
    overflow: "hidden" as const,
    textOverflow: "ellipsis" as const,
    whiteSpace: "nowrap" as const,
  },
  historyMeta: {
    fontSize: 10,
    color: "#777",
    overflow: "hidden" as const,
    textOverflow: "ellipsis" as const,
    whiteSpace: "nowrap" as const,
  },
  hint: {
    fontSize: 12,
    marginTop: 8,
  },
  wtForm: {
    display: "flex",
    flexDirection: "column" as const,
    gap: 10,
    width: "100%",
    maxWidth: 260,
  },
  wtLabel: {
    fontSize: 10,
    fontWeight: 600,
    color: "#777",
    textTransform: "uppercase" as const,
    letterSpacing: 0.5,
  },
  wtInput: {
    padding: "5px 8px",
    border: "1px solid #2a2a2a",
    borderRadius: 4,
    background: "#181818",
    color: "#d4d4d4",
    fontSize: 12,
    fontFamily: "monospace",
    outline: "none",
  },
  wtBtn: {
    flex: 1,
    padding: "5px 12px",
    border: "1px solid #9ece6a",
    borderRadius: 4,
    background: "transparent",
    color: "#9ece6a",
    cursor: "pointer",
    fontSize: 11,
    fontWeight: 600,
  },
  wtCancelBtn: {
    padding: "5px 12px",
    border: "1px solid #2a2a2a",
    borderRadius: 4,
    background: "transparent",
    color: "#777",
    cursor: "pointer",
    fontSize: 11,
  },
};

function WorktreeForm({ pane }: { pane: LlmPaneType }) {
  const dispatch = useAppDispatch();
  const [branch, setBranch] = useState("");
  const [baseBranch, setBaseBranch] = useState("main");

  const handleCreate = useCallback(() => {
    const name = branch.trim();
    if (!name) return;
    dispatch({ type: "PANES_CREATE_WORKTREE", paneId: pane.id, branch: name, baseBranch });
  }, [dispatch, pane.id, branch, baseBranch]);

  const handleCancel = useCallback(() => {
    dispatch({ type: "PANES_CANCEL_WORKTREE_SETUP", paneId: pane.id });
  }, [dispatch, pane.id]);

  return (
    <div style={S.wtForm}>
      <div style={{ fontSize: 12, fontWeight: 600, color: "#d4d4d4", display: "flex", alignItems: "center", gap: 6 }}>
        <GitBranch size={14} color="#9ece6a" /> Create Worktree
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
        <label style={S.wtLabel}>Branch</label>
        <input
          style={S.wtInput}
          type="text"
          placeholder="fix/auth-bug"
          value={branch}
          onChange={(e) => setBranch(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); if (e.key === "Escape") handleCancel(); }}
          autoFocus
        />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
        <label style={S.wtLabel}>Base</label>
        <select style={S.wtInput} value={baseBranch} onChange={(e) => setBaseBranch(e.target.value)}>
          <option value="main">main</option>
          <option value="master">master</option>
          <option value="develop">develop</option>
          <option value="HEAD">HEAD (current)</option>
        </select>
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        <button style={S.wtBtn} onClick={handleCreate} disabled={!branch.trim()}>Create</button>
        <button style={S.wtCancelBtn} onClick={handleCancel}>Cancel</button>
      </div>
    </div>
  );
}

function HistoryItem({ entry, paneId }: { entry: PaneChatHistory; paneId: string }) {
  const dispatch = useAppDispatch();

  return (
    <div
      style={S.historyItem}
      onClick={() => dispatch({ type: "PANES_RESUME_CHAT", paneId, historyId: entry.id })}
      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "#2a2a2a"; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
    >
      <span style={{ flexShrink: 0, color: "#777" }}>
        {entry.origin === "worktree" ? <GitBranch size={14} /> : <MessageSquare size={14} />}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={S.historyName}>{entry.name}</div>
        <div style={S.historyMeta}>
          {entry.origin} · {timeAgo(entry.timestamp)}
        </div>
      </div>
      <button
        style={{ background: "none", border: "none", color: "#555", cursor: "pointer", padding: 2, flexShrink: 0, display: "flex" }}
        onClick={(e) => { e.stopPropagation(); dispatch({ type: "PANES_DELETE_HISTORY", historyId: entry.id }); }}
        title="Remove"
      >
        <X size={12} />
      </button>
    </div>
  );
}

const CHAT_TYPE_KEY = "tride-default-chat-type";

type ChatType = "local" | "worktree";

const chatTypeConfig = {
  local: {
    icon: FolderOpen,
    title: "New Local Chat",
    desc: "Uses current working directory",
  },
  worktree: {
    icon: GitBranch,
    title: "New Worktree Chat",
    desc: "Isolated branch & directory",
  },
};

function getDefaultChatType(): ChatType {
  try {
    const stored = localStorage.getItem(CHAT_TYPE_KEY);
    if (stored === "local" || stored === "worktree") return stored;
  } catch { /* ignore */ }
  return "local";
}

function setDefaultChatType(type: ChatType) {
  try { localStorage.setItem(CHAT_TYPE_KEY, type); } catch { /* ignore */ }
}

export function LlmPaneStartScreen({ pane, accentColor }: Props) {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const chatHistory = state.panes?.chatHistory ?? [];
  const [defaultType, setDefaultType] = useState<ChatType>(getDefaultChatType);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const altType: ChatType = defaultType === "local" ? "worktree" : "local";

  // Close dropdown on outside click
  useEffect(() => {
    if (!dropdownOpen) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [dropdownOpen]);

  const projectId = state.activeProjectId ?? undefined;

  const startChat = useCallback((type: ChatType) => {
    if (type === "local") {
      dispatch({ type: "PANES_START_LOCAL", paneId: pane.id, projectId });
    } else {
      dispatch({ type: "PANES_START_WORKTREE_SETUP", paneId: pane.id });
    }
  }, [dispatch, pane.id, projectId]);

  const handlePrimaryClick = useCallback(() => {
    startChat(defaultType);
  }, [startChat, defaultType]);

  const handleAltClick = useCallback(() => {
    setDefaultChatType(altType);
    setDefaultType(altType);
    setDropdownOpen(false);
    startChat(altType);
  }, [startChat, altType]);

  if (pane.worktreeSetup) {
    return (
      <div style={S.screen}>
        <WorktreeForm pane={pane} />
      </div>
    );
  }

  const recentHistory = chatHistory.slice(0, 5);
  const PrimaryIcon = chatTypeConfig[defaultType].icon;
  const AltIcon = chatTypeConfig[altType].icon;

  return (
    <div style={S.screen}>
      <div style={S.options}>
        {/* Split button */}
        <div ref={dropdownRef} style={{ position: "relative", width: "100%" }}>
          <div style={{ display: "flex", width: "100%" }}>
            {/* Main button */}
            <button
              style={{
                ...S.option,
                borderColor: "#999",
                borderTopRightRadius: 0,
                borderBottomRightRadius: 0,
                borderRight: "none",
                flex: 1,
              }}
              onClick={handlePrimaryClick}
            >
              <span style={S.optionIcon}><PrimaryIcon size={18} /></span>
              <div>
                <div style={S.optionTitle}>{chatTypeConfig[defaultType].title}</div>
                <div style={S.optionDesc}>{chatTypeConfig[defaultType].desc}</div>
              </div>
            </button>
            {/* Dropdown arrow */}
            <button
              style={{
                ...S.option,
                borderColor: "#999",
                borderTopLeftRadius: 0,
                borderBottomLeftRadius: 0,
                width: 32,
                padding: "0",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                borderLeft: "1px solid #444",
              }}
              onClick={() => setDropdownOpen((v) => !v)}
              title="Switch default chat type"
            >
              <ChevronDown size={14} style={{ color: "#999", transition: "transform 0.15s", transform: dropdownOpen ? "rotate(180deg)" : "none" }} />
            </button>
          </div>

          {/* Dropdown menu */}
          {dropdownOpen && (
            <div
              style={{
                position: "absolute",
                top: "calc(100% + 4px)",
                left: 0,
                right: 0,
                zIndex: 10,
                borderRadius: 6,
                border: "1px solid #2a2a2a",
                background: "#1e1e1e",
                boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
                overflow: "hidden",
              }}
            >
              <button
                style={{
                  ...S.option,
                  border: "none",
                  borderRadius: 0,
                  width: "100%",
                }}
                onClick={handleAltClick}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "#2a2a2a"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "#1e1e1e"; }}
              >
                <span style={S.optionIcon}><AltIcon size={18} /></span>
                <div>
                  <div style={S.optionTitle}>{chatTypeConfig[altType].title}</div>
                  <div style={S.optionDesc}>{chatTypeConfig[altType].desc}</div>
                </div>
              </button>
            </div>
          )}
        </div>
      </div>

      {recentHistory.length > 0 && (
        <>
          <div style={S.divider}>
            <div style={S.dividerLine} />
            <span style={S.dividerText}>continue previous</span>
            <div style={S.dividerLine} />
          </div>
          {recentHistory.map((entry) => (
            <HistoryItem key={entry.id} entry={entry} paneId={pane.id} />
          ))}
        </>
      )}

    </div>
  );
}

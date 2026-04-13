import { useCallback } from "react";
import { useTerminal } from "../hooks/useTerminal";
import { Terminal } from "../types";
import { useAppState, useAppDispatch } from "../state/context";
import { invoke } from "@tauri-apps/api/core";
import { getLlmCommand } from "../utils/llmCommand";
import { removePtyBuffer, registerPtyLlm, notifyPtyFocused } from "../ptyBuffer";
import { removeClaudeBuffer } from "../claudeBuffer";
import { ClaudePane } from "./ClaudePane";

interface TerminalPaneProps {
  terminal: Terminal;
}

interface SingleTerminalProps extends TerminalPaneProps {
  onFocus: () => void;
}

function SingleTerminal({ terminal, onFocus }: SingleTerminalProps) {
  const state = useAppState();
  const dispatch = useAppDispatch();

  const activeProject = state.projects.find((p) =>
    p.terminals.some((t) => t.id === terminal.id)
  );

  const handleLinkClick = useCallback((link: string) => {
    // URL — open in browser panel
    if (/^https?:\/\//i.test(link)) {
      dispatch({ type: "SET_SIDEBAR_MODE", mode: "browser" });
      if (!state.sidebarVisible) dispatch({ type: "TOGGLE_SIDEBAR" });
      // Dispatch a custom event so BrowserPanel can navigate
      window.dispatchEvent(new CustomEvent("browser-navigate", { detail: link }));
      return;
    }
    // File path — open in code editor
    // Strip trailing :lineNumber if present
    let filePath = link.replace(/:\d+$/, "").replace(/\\/g, "/");
    // Resolve relative paths against the terminal's cwd
    if (terminal.cwd && !/^[a-zA-Z]:/.test(filePath) && !filePath.startsWith("/")) {
      // Strip leading ./ if present
      const rel = filePath.replace(/^\.\//, "");
      filePath = terminal.cwd.replace(/\\/g, "/") + "/" + rel;
    }
    dispatch({ type: "SET_SIDEBAR_MODE", mode: "code" });
    if (!state.sidebarVisible) dispatch({ type: "TOGGLE_SIDEBAR" });
    dispatch({ type: "SET_LAST_OPENED_FILE", path: filePath });
    window.dispatchEvent(new CustomEvent("open-file", { detail: filePath }));
  }, [dispatch, state.sidebarVisible, terminal.cwd]);

  const isActive = state.activeTerminalId === terminal.id;

  const handleTitleChange = useCallback((title: string) => {
    if (!activeProject) return;
    // Strip any leading non-word symbol (activity dots like ● • · ⏺ etc.) from the title
    const cleaned = title.replace(/^\W\s*/, "");
    dispatch({ type: "UPDATE_TERMINAL", projectId: activeProject.id, terminalId: terminal.id, updates: { title: cleaned } });
  }, [dispatch, activeProject, terminal.id]);

  const { containerRef } = useTerminal({
    ptyId: terminal.ptyId,
    isActive,
    onLinkClick: handleLinkClick,
    onTitleChange: handleTitleChange,
    onFocus,
  });

  return <div className="terminal-pane-body" ref={containerRef} />;
}

export function TerminalPane({ terminal }: TerminalPaneProps) {
  const state = useAppState();
  const dispatch = useAppDispatch();

  const activeProject = state.projects.find((p) => p.id === state.activeProjectId);
  const isActive = state.activeTerminalId === terminal.id;

  const LLM_TITLES: Record<string, string> = {
    claude: "Claude Code",
    codex: "Codex",
    custom: "LLM",
  };

  const handleSplit = async (direction: "horizontal" | "vertical") => {
    if (!activeProject) return;

    const shellMap: Record<string, string> = {
      powershell: "powershell.exe",
      cmd: "cmd.exe",
      bash: "/bin/bash",
      zsh: "/bin/zsh",
      fish: "/usr/bin/fish",
    };

    const llmTitle = state.defaultLlm !== "none" ? (LLM_TITLES[state.defaultLlm] ?? "LLM") : null;
    const title = llmTitle ?? "Terminal";
    const useClaudeSdk = state.defaultLlm === "claude";

    const newId = crypto.randomUUID();
    let ptyId: string | null = null;
    let claudeSessionId: string | undefined;

    if (useClaudeSdk) {
      // Claude SDK session — no PTY needed
      claudeSessionId = crypto.randomUUID();
    } else {
      // Regular terminal (with optional non-claude LLM)
      try {
        ptyId = await invoke<string>("spawn_terminal", {
          cwd: terminal.cwd,
          title,
          shell: shellMap[state.defaultShell] ?? null,
        });

        const cmd = getLlmCommand(state.defaultLlm, state.customLlmCommand);
        if (cmd && ptyId) {
          setTimeout(() => {
            const encoder = new TextEncoder();
            invoke("write_terminal", {
              id: ptyId!,
              data: Array.from(encoder.encode(cmd + "\r")),
            }).catch(() => {});
          }, 500);
        }
        if (ptyId) registerPtyLlm(ptyId, !!llmTitle);
      } catch (e) {
        console.error("Failed to spawn split terminal:", e);
      }
    }

    dispatch({
      type: "SPLIT_TERMINAL",
      projectId: activeProject.id,
      parentId: terminal.id,
      direction,
      child: {
        id: newId,
        title,
        ptyId,
        cwd: terminal.cwd,
        mode: "instance",
        status: "idle",
        isLlm: !!llmTitle,
        claudeSessionId,
      },
    });
  };

  const handleClose = async () => {
    if (!activeProject) return;
    if (terminal.claudeSessionId) {
      invoke("claude_kill", { sessionId: terminal.claudeSessionId }).catch(() => {});
      removeClaudeBuffer(terminal.claudeSessionId);
    }
    if (terminal.ptyId) {
      invoke("kill_terminal", { id: terminal.ptyId }).catch(() => {});
      removePtyBuffer(terminal.ptyId);
    }
    if (terminal.mode === "worktree" && terminal.worktreePath) {
      try {
        await invoke("git_worktree_remove", {
          cwd: activeProject.path,
          worktreePath: terminal.worktreePath,
        });
      } catch (err) {
        console.warn("Failed to remove worktree:", err);
      }
    }
    dispatch({
      type: "REMOVE_TERMINAL",
      projectId: activeProject.id,
      terminalId: terminal.id,
    });
  };

  const allTerminals = activeProject?.terminals ?? [];
  const splitChild = terminal.splitChildId
    ? allTerminals.find((t) => t.id === terminal.splitChildId) ?? null
    : null;

  const renderHeader = (t: Terminal, isChild?: boolean) => {
    const active = state.activeTerminalId === t.id;
    const setActive = () => {
      dispatch({ type: "SET_ACTIVE_TERMINAL", terminalId: t.id });
      if (t.ptyId) notifyPtyFocused(t.ptyId);
    };
    return (
      <div
        className={`terminal-pane ${active ? "focused" : ""}`}
        onMouseDown={setActive}
        style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0, minWidth: 0 }}
      >
        <div className="terminal-pane-header">
          <span className={`status-dot ${t.status}`} />
          <span className="terminal-pane-title">{t.title}</span>
          <span className="terminal-pane-mode">{t.mode}</span>
          {t.branch && <span className="terminal-pane-branch">{t.branch}</span>}
          {t.filesChanged !== undefined && (
            <span className="terminal-pane-changes">+{t.filesChanged}</span>
          )}
          <span className="terminal-pane-spacer" />
          {!isChild && (
            <>
              <button
                className="terminal-split-btn"
                title="Split horizontal"
                onClick={(e) => { e.stopPropagation(); handleSplit("horizontal"); }}
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                  <rect x="1" y="1" width="14" height="14" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
                  <line x1="1" y1="8" x2="15" y2="8" stroke="currentColor" strokeWidth="1.2" />
                </svg>
              </button>
              <button
                className="terminal-split-btn"
                title="Split vertical"
                onClick={(e) => { e.stopPropagation(); handleSplit("vertical"); }}
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                  <rect x="1" y="1" width="14" height="14" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
                  <line x1="8" y1="1" x2="8" y2="15" stroke="currentColor" strokeWidth="1.2" />
                </svg>
              </button>
            </>
          )}
          <button
            className="terminal-split-btn"
            title="Close terminal"
            onClick={(e) => { e.stopPropagation(); handleClose(); }}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <line x1="4" y1="4" x2="12" y2="12" stroke="currentColor" strokeWidth="1.2" />
              <line x1="12" y1="4" x2="4" y2="12" stroke="currentColor" strokeWidth="1.2" />
            </svg>
          </button>
        </div>
        <div className="terminal-nosplit-container">
          {t.claudeSessionId ? (
            <ClaudePane
              sessionId={t.claudeSessionId}
              cwd={t.cwd}
              isActive={state.activeTerminalId === t.id}
              onFocus={setActive}
            />
          ) : (
            <SingleTerminal terminal={t} onFocus={setActive} />
          )}
        </div>
      </div>
    );
  };

  if (splitChild) {
    return (
      <div className={`terminal-split-container ${terminal.splitDirection}`}>
        {renderHeader(terminal)}
        <div className="terminal-split-divider" />
        {renderHeader(splitChild, true)}
      </div>
    );
  }

  return renderHeader(terminal);
}

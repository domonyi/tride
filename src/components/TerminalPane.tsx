import { useCallback } from "react";
import { useTerminal } from "../hooks/useTerminal";
import { Terminal } from "../types";
import { useAppState, useAppDispatch } from "../state/context";

interface TerminalPaneProps {
  terminal: Terminal;
}

export function TerminalPane({ terminal }: TerminalPaneProps) {
  const state = useAppState();
  const dispatch = useAppDispatch();

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

  const { containerRef } = useTerminal({ ptyId: terminal.ptyId, onLinkClick: handleLinkClick });

  const isActive = state.activeTerminalId === terminal.id;

  return (
    <div
      className={`terminal-pane ${isActive ? "focused" : ""}`}
      onClick={() => dispatch({ type: "SET_ACTIVE_TERMINAL", terminalId: terminal.id })}
    >
      <div className="terminal-pane-header">
        <span className={`status-dot ${terminal.status}`} />
        <span className="terminal-pane-title">{terminal.title}</span>
        <span className="terminal-pane-mode">{terminal.mode}</span>
        {terminal.branch && <span className="terminal-pane-branch">{terminal.branch}</span>}
        {terminal.filesChanged !== undefined && (
          <span className="terminal-pane-changes">+{terminal.filesChanged}</span>
        )}
      </div>
      <div className="terminal-pane-body" ref={containerRef} />
    </div>
  );
}

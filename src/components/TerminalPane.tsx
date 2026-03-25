import { useTerminal } from "../hooks/useTerminal";
import { Terminal } from "../types";
import { useAppState, useAppDispatch } from "../state/context";

interface TerminalPaneProps {
  terminal: Terminal;
}

export function TerminalPane({ terminal }: TerminalPaneProps) {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const { containerRef } = useTerminal({ ptyId: terminal.ptyId });

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

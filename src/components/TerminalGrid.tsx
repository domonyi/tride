import { useAppState } from "../state/context";
import { TerminalPane } from "./TerminalPane";

export function TerminalGrid() {
  const state = useAppState();
  const activeProject = state.projects.find((p) => p.id === state.activeProjectId);

  if (!activeProject || activeProject.terminals.length === 0) {
    return (
      <div className="terminal-grid-empty">
        <p>No terminals open.</p>
        <p>Add a project and create a terminal to get started.</p>
      </div>
    );
  }

  const { rows, cols } = state.gridLayout;

  // Only mount terminals for the active project.
  // Background projects are fully unmounted — their PTY processes keep running
  // on the Rust side and output is captured by ptyBuffer / claudeBuffer.
  // Serialized xterm screens are restored instantly on project switch.
  const visibleTerminals = activeProject.terminals.filter((t) => {
    // Child split terminals are rendered inside their parent's split container
    if (t.splitParentId) return false;
    if (!state.activeGroupId) return true;
    const activeGroup = (activeProject.terminalGroups ?? []).find(
      (g) => g.id === state.activeGroupId
    );
    if (!activeGroup) return true;
    return activeGroup.terminalIds.includes(t.id);
  });

  return (
    <div
      className="terminal-grid"
      style={{
        gridTemplateRows: `repeat(${rows}, 1fr)`,
        gridTemplateColumns: `repeat(${cols}, 1fr)`,
      }}
    >
      {visibleTerminals.map((terminal) => (
        <TerminalPane key={terminal.id} terminal={terminal} />
      ))}
    </div>
  );
}

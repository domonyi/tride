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

  // Render ALL projects' terminals to preserve xterm scrollback history.
  // Non-active projects are hidden with CSS but stay mounted.
  return (
    <>
      {state.projects.map((project) => {
        const isActive = project.id === state.activeProjectId;
        if (project.terminals.length === 0) return null;
        return (
          <div
            key={project.id}
            className="terminal-grid"
            style={{
              gridTemplateRows: `repeat(${rows}, 1fr)`,
              gridTemplateColumns: `repeat(${cols}, 1fr)`,
              display: isActive ? "grid" : "none",
            }}
          >
            {project.terminals.map((terminal) => (
              <TerminalPane key={terminal.id} terminal={terminal} />
            ))}
          </div>
        );
      })}
    </>
  );
}

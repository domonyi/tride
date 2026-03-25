import { useAppState, useAppDispatch } from "../state/context";
import { invoke } from "@tauri-apps/api/core";

export function TerminalTabs() {
  const state = useAppState();
  const dispatch = useAppDispatch();

  const activeProject = state.projects.find((p) => p.id === state.activeProjectId);
  if (!activeProject) return null;

  const addTerminal = async (mode: "instance" | "worktree") => {
    const title = `Terminal ${activeProject.terminals.length + 1}`;
    const termId = crypto.randomUUID();

    let ptyId: string | null = null;
    try {
      ptyId = await invoke<string>("spawn_terminal", {
        cwd: activeProject.path,
        title,
        shell: null,
      });
    } catch (e) {
      console.error("Failed to spawn terminal:", e);
    }

    dispatch({
      type: "ADD_TERMINAL",
      projectId: activeProject.id,
      terminal: {
        id: termId,
        title,
        ptyId,
        cwd: activeProject.path,
        mode,
        status: "idle",
      },
    });
  };

  return (
    <div className="terminal-tabs">
      {activeProject.terminals.map((term) => (
        <button
          key={term.id}
          className={`terminal-tab ${state.activeTerminalId === term.id ? "active" : ""}`}
          onClick={() => dispatch({ type: "SET_ACTIVE_TERMINAL", terminalId: term.id })}
        >
          <span className={`status-dot ${term.status}`} />
          {term.title}
          <span
            className="close-btn"
            onClick={(e) => {
              e.stopPropagation();
              if (term.ptyId) {
                invoke("kill_terminal", { id: term.ptyId }).catch(() => {});
              }
              dispatch({
                type: "REMOVE_TERMINAL",
                projectId: activeProject.id,
                terminalId: term.id,
              });
            }}
          >
            x
          </span>
        </button>
      ))}
      <div className="add-terminal-group">
        <button className="terminal-tab add-tab" onClick={() => addTerminal("instance")}>
          + Instance
        </button>
        <button className="terminal-tab add-tab" onClick={() => addTerminal("worktree")}>
          + Worktree
        </button>
      </div>
    </div>
  );
}

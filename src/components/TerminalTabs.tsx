import { useAppState, useAppDispatch } from "../state/context";
import { useTabDrag } from "../hooks/useTabDrag";
import { invoke } from "@tauri-apps/api/core";
import { getLlmCommand } from "../utils/llmCommand";

export function TerminalTabs() {
  const state = useAppState();
  const dispatch = useAppDispatch();

  const activeProject = state.projects.find((p) => p.id === state.activeProjectId);

  const { containerRef, handlePointerDown, handlePointerMove, handlePointerUp } = useTabDrag({
    tabSelector: ".terminal-tab:not(.add-tab)",
    onReorder: (fromIndex, toIndex) => {
      if (activeProject) {
        dispatch({ type: "REORDER_TERMINALS", projectId: activeProject.id, fromIndex, toIndex });
      }
    },
  });

  if (!activeProject) return null;

  const addTerminal = async (mode: "instance" | "worktree") => {
    const title = "Terminal";
    const termId = crypto.randomUUID();

    const shellMap: Record<string, string> = {
      powershell: "powershell.exe",
      cmd: "cmd.exe",
      bash: "/bin/bash",
      zsh: "/bin/zsh",
      fish: "/usr/bin/fish",
    };

    let ptyId: string | null = null;
    try {
      ptyId = await invoke<string>("spawn_terminal", {
        cwd: activeProject.path,
        title,
        shell: shellMap[state.defaultShell] ?? null,
      });

      if (ptyId) {
        const cmd = getLlmCommand(state.defaultLlm, state.customLlmCommand);
        if (cmd) {
          setTimeout(() => {
            const encoder = new TextEncoder();
            invoke("write_terminal", {
              id: ptyId,
              data: Array.from(encoder.encode(cmd + "\r")),
            }).catch(() => {});
          }, 500);
        }
      }
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
    <div className="terminal-tabs" ref={containerRef}>
      {activeProject.terminals.map((term, i) => (
        <div
          key={term.id}
          className={`terminal-tab ${state.activeTerminalId === term.id ? "active" : ""}`}
          onClick={() => dispatch({ type: "SET_ACTIVE_TERMINAL", terminalId: term.id })}
          onPointerDown={(e) => handlePointerDown(e, i)}
          onPointerMove={(e) => handlePointerMove(e, i)}
          onPointerUp={(e) => handlePointerUp(e, i)}
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
        </div>
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

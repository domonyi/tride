import { useAppState, useAppDispatch } from "../state/context";
import { useTabDrag } from "../hooks/useTabDrag";
import { invoke } from "@tauri-apps/api/core";
import { getLlmCommand } from "../utils/llmCommand";
import { removePtyBuffer } from "../ptyBuffer";

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

  const shellMap: Record<string, string> = {
    powershell: "powershell.exe",
    cmd: "cmd.exe",
    bash: "/bin/bash",
    zsh: "/bin/zsh",
    fish: "/usr/bin/fish",
  };

  const spawnWithLlm = async (cwd: string, title: string) => {
    const ptyId = await invoke<string>("spawn_terminal", {
      cwd,
      title,
      shell: shellMap[state.defaultShell] ?? null,
    });

    const cmd = getLlmCommand(state.defaultLlm, state.customLlmCommand);
    if (cmd && ptyId) {
      setTimeout(() => {
        const encoder = new TextEncoder();
        invoke("write_terminal", {
          id: ptyId,
          data: Array.from(encoder.encode(cmd + "\r")),
        }).catch(() => {});
      }, 500);
    }

    return ptyId;
  };

  const addTerminal = async (mode: "instance" | "worktree") => {
    const termId = crypto.randomUUID();

    if (mode === "worktree") {
      const branch = window.prompt("Branch name for worktree:");
      if (!branch) return;

      const projectDir = activeProject.path.replace(/\\/g, "/");
      const projectName = projectDir.split("/").pop() || "project";
      const worktreePath = projectDir.replace(/\/[^/]+$/, `/${projectName}-wt-${branch}`);

      try {
        await invoke("git_worktree_add", {
          cwd: activeProject.path,
          branch,
          worktreePath,
        });

        const ptyId = await spawnWithLlm(worktreePath, `WT: ${branch}`);

        dispatch({
          type: "ADD_TERMINAL",
          projectId: activeProject.id,
          terminal: {
            id: termId,
            title: `WT: ${branch}`,
            ptyId,
            cwd: worktreePath,
            mode,
            status: "idle",
            branch,
            worktreePath,
          },
        });
      } catch (e) {
        console.error("Failed to create worktree:", e);
        alert(`Failed to create worktree: ${e}`);
      }
      return;
    }

    // Instance mode — same as before
    let ptyId: string | null = null;
    try {
      ptyId = await spawnWithLlm(activeProject.path, "Terminal");
    } catch (e) {
      console.error("Failed to spawn terminal:", e);
    }

    dispatch({
      type: "ADD_TERMINAL",
      projectId: activeProject.id,
      terminal: {
        id: termId,
        title: "Terminal",
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
            onClick={async (e) => {
              e.stopPropagation();
              if (term.ptyId) {
                invoke("kill_terminal", { id: term.ptyId }).catch(() => {});
                removePtyBuffer(term.ptyId);
              }
              // Clean up worktree if this was a worktree terminal
              if (term.mode === "worktree" && term.worktreePath) {
                try {
                  await invoke("git_worktree_remove", {
                    cwd: activeProject.path,
                    worktreePath: term.worktreePath,
                  });
                } catch (err) {
                  console.warn("Failed to remove worktree:", err);
                }
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

import { useState, useRef, useEffect } from "react";
import { useAppState, useAppDispatch } from "../state/context";
import { useTabDrag } from "../hooks/useTabDrag";
import { useTabOverflow } from "../hooks/useTabOverflow";
import { invoke } from "@tauri-apps/api/core";
import { getLlmCommand } from "../utils/llmCommand";
import { removePtyBuffer, registerPtyLlm, notifyPtyFocused } from "../ptyBuffer";

interface TerminalCtxMenu {
  x: number;
  y: number;
  terminalId: string;
}

export function TerminalTabs() {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const [ctxMenu, setCtxMenu] = useState<TerminalCtxMenu | null>(null);
  const ctxRef = useRef<HTMLDivElement>(null);

  // Close context menu on outside click
  useEffect(() => {
    if (!ctxMenu) return;
    const close = (e: MouseEvent) => {
      if (ctxRef.current && !ctxRef.current.contains(e.target as Node)) setCtxMenu(null);
    };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [ctxMenu]);

  const activeProject = state.projects.find((p) => p.id === state.activeProjectId);
  const groups = activeProject?.terminalGroups ?? [];

  const { scrollRef, canScrollLeft, canScrollRight, scrollBy } = useTabOverflow();

  const { containerRef, handlePointerDown, handlePointerMove, handlePointerUp } = useTabDrag({
    tabSelector: ".terminal-tab:not(.add-tab)",
    onReorder: (fromIndex, toIndex) => {
      if (activeProject) {
        dispatch({ type: "REORDER_TERMINALS", projectId: activeProject.id, fromIndex, toIndex });
      }
    },
  });

  if (!activeProject) return null;

  const isMultiline = state.tabOverflowMode === "multiline";
  const showArrows = !isMultiline;

  const shellMap: Record<string, string> = {
    powershell: "powershell.exe",
    cmd: "cmd.exe",
    bash: "/bin/bash",
    zsh: "/bin/zsh",
    fish: "/usr/bin/fish",
  };

  const LLM_TITLES: Record<string, string> = {
    claude: "Claude Code",
    codex: "Codex",
    custom: "LLM",
  };

  const getLlmTitle = (): string | null => {
    if (state.defaultLlm === "none") return null;
    return LLM_TITLES[state.defaultLlm] ?? "LLM";
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

  const registerLlm = (ptyId: string | null, isLlm: boolean) => {
    if (ptyId) registerPtyLlm(ptyId, isLlm);
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
        registerLlm(ptyId, !!getLlmTitle());

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

    // Instance mode
    const llmTitle = getLlmTitle();
    const title = llmTitle ?? "Terminal";
    let ptyId: string | null = null;
    try {
      ptyId = await spawnWithLlm(activeProject.path, title);
      registerLlm(ptyId, !!llmTitle);
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
        isLlm: !!llmTitle,
      },
    });
  };

  // Filter terminals by active group
  const activeGroup = state.activeGroupId
    ? groups.find((g) => g.id === state.activeGroupId)
    : null;

  const filteredTerminals = activeGroup
    ? activeProject.terminals.filter((t) => activeGroup.terminalIds.includes(t.id))
    : activeProject.terminals;

  const handleContextMenu = (e: React.MouseEvent, terminalId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setCtxMenu({ x: e.clientX, y: e.clientY, terminalId });
  };

  const handleNewGroupFromTerminal = (terminalId: string) => {
    const name = window.prompt("Group name:");
    if (!name) return;
    const groupId = crypto.randomUUID();
    dispatch({
      type: "CREATE_GROUP",
      projectId: activeProject.id,
      group: { id: groupId, name, terminalIds: [terminalId] },
    });
    setCtxMenu(null);
  };

  const handleMoveToGroup = (groupId: string, terminalId: string) => {
    dispatch({
      type: "ADD_TO_GROUP",
      projectId: activeProject.id,
      groupId,
      terminalId,
    });
    setCtxMenu(null);
  };

  const handleRemoveFromGroup = (terminalId: string) => {
    const group = groups.find((g) => g.terminalIds.includes(terminalId));
    if (group) {
      dispatch({
        type: "REMOVE_FROM_GROUP",
        projectId: activeProject.id,
        groupId: group.id,
        terminalId,
      });
    }
    setCtxMenu(null);
  };

  const mergedRef = (el: HTMLDivElement | null) => {
    (containerRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
    (scrollRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
  };

  const terminalInGroup = (terminalId: string) =>
    groups.some((g) => g.terminalIds.includes(terminalId));

  return (
    <div className={`terminal-tabs-wrapper ${isMultiline ? "multiline" : ""}`}>
      {showArrows && canScrollLeft && (
        <button className="tab-arrow tab-arrow-left" onClick={() => scrollBy("left")}>&#x2039;</button>
      )}
      <div className={`terminal-tabs ${isMultiline ? "multiline" : ""}`} ref={mergedRef}>
        {filteredTerminals.map((term, i) => (
          <div
            key={term.id}
            className={`terminal-tab ${state.activeTerminalId === term.id ? "active" : ""}`}
            title={term.title}
            onClick={() => {
              dispatch({ type: "SET_ACTIVE_TERMINAL", terminalId: term.id });
              if (term.ptyId) notifyPtyFocused(term.ptyId);
            }}
            onPointerDown={(e) => handlePointerDown(e, i)}
            onPointerMove={(e) => handlePointerMove(e, i)}
            onPointerUp={(e) => handlePointerUp(e, i)}
            onContextMenu={(e) => handleContextMenu(e, term.id)}
          >
            <span className={`status-dot ${term.status}`} />

            <span className="tab-title">{term.title}</span>
            <span
              className="close-btn"
              onClick={async (e) => {
                e.stopPropagation();
                if (term.ptyId) {
                  invoke("kill_terminal", { id: term.ptyId }).catch(() => {});
                  removePtyBuffer(term.ptyId);
                }
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
      {showArrows && canScrollRight && (
        <button className="tab-arrow tab-arrow-right" onClick={() => scrollBy("right")}>&#x203a;</button>
      )}

      {/* Context Menu */}
      {ctxMenu && (
        <div ref={ctxRef} className="terminal-ctx-menu" style={{ left: ctxMenu.x, top: ctxMenu.y }}>
          {groups.length > 0 && groups.map((g) => (
            <div
              key={g.id}
              className="ctx-menu-item"
              onClick={() => handleMoveToGroup(g.id, ctxMenu.terminalId)}
            >
              Move to "{g.name}"
            </div>
          ))}
          {terminalInGroup(ctxMenu.terminalId) && (
            <div className="ctx-menu-item" onClick={() => handleRemoveFromGroup(ctxMenu.terminalId)}>
              Remove from group
            </div>
          )}
          <div
            className="ctx-menu-item"
            onClick={() => handleNewGroupFromTerminal(ctxMenu.terminalId)}
          >
            New group...
          </div>
        </div>
      )}
    </div>
  );
}

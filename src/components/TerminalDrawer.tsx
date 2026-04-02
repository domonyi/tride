import { useRef, useCallback, useEffect, useState } from "react";
import { useAppState, useAppDispatch } from "../state/context";
import { useTerminal } from "../hooks/useTerminal";
import { invoke } from "@tauri-apps/api/core";

export function TerminalDrawer() {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const dragRef = useRef<{ startY: number; startH: number } | null>(null);
  const [ptyId, setPtyId] = useState<string | null>(null);
  const spawnedForRef = useRef<string | null>(null);

  const activeProject = state.projects.find((p) => p.id === state.activeProjectId);
  const cwd = activeProject?.path || ".";

  // Spawn a PTY when the drawer opens (or project changes)
  useEffect(() => {
    if (!state.terminalDrawerOpen) return;
    const projectKey = activeProject?.id ?? "none";
    if (spawnedForRef.current === projectKey && ptyId) return;

    spawnedForRef.current = projectKey;
    setPtyId(null);

    const shellMap: Record<string, string> = {
      powershell: "powershell.exe",
      cmd: "cmd.exe",
      bash: "/bin/bash",
      zsh: "/bin/zsh",
      fish: "/usr/bin/fish",
    };
    const shell = shellMap[state.defaultShell] ?? null;

    invoke<string>("spawn_terminal", { cwd, title: "Terminal", shell })
      .then((id) => setPtyId(id))
      .catch(() => {});

    return () => {
      // Kill PTY on unmount
      if (ptyId) {
        invoke("kill_terminal", { id: ptyId }).catch(() => {});
      }
    };
  }, [state.terminalDrawerOpen, activeProject?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const { containerRef } = useTerminal({
    ptyId,
    isActive: state.terminalDrawerOpen,
  });

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      dragRef.current = { startY: e.clientY, startH: state.terminalDrawerHeight };

      const handleMouseMove = (ev: MouseEvent) => {
        if (!dragRef.current) return;
        const delta = dragRef.current.startY - ev.clientY;
        dispatch({
          type: "SET_TERMINAL_DRAWER_HEIGHT",
          height: dragRef.current.startH + delta,
        });
      };

      const handleMouseUp = () => {
        dragRef.current = null;
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
        document.body.style.cursor = "";
        const overlay = document.getElementById("drawer-drag-overlay");
        overlay?.remove();
      };

      const overlay = document.createElement("div");
      overlay.id = "drawer-drag-overlay";
      overlay.style.cssText = "position:fixed;inset:0;z-index:9999;cursor:ns-resize;";
      document.body.appendChild(overlay);

      document.body.style.cursor = "ns-resize";
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    },
    [dispatch, state.terminalDrawerHeight],
  );

  if (!state.terminalDrawerOpen) return null;

  return (
    <div className="terminal-drawer" style={{ height: state.terminalDrawerHeight }}>
      <div className="terminal-drawer-handle" onMouseDown={handleMouseDown}>
        <div className="terminal-drawer-handle-bar" />
      </div>
      <div className="terminal-drawer-body" ref={containerRef} />
    </div>
  );
}

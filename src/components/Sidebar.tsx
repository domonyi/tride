import { useRef, useCallback } from "react";
import { useAppState, useAppDispatch } from "../state/context";
import { CodeEditor } from "./CodeEditor";
import type { SidebarMode } from "../types";

const SIDEBAR_MODES: { key: SidebarMode; label: string; shortcut: string }[] = [
  { key: "code", label: "CODE", shortcut: "F1" },
  { key: "diff", label: "DIFF", shortcut: "F2" },
  { key: "git", label: "GIT", shortcut: "F3" },
  { key: "browser", label: "BROWSER", shortcut: "F4" },
];

export function Sidebar() {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const sidebarRef = useRef<HTMLDivElement>(null);

  const onResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = sidebarRef.current?.offsetWidth ?? 340;

    // Block iframes from stealing mouse events during drag
    const overlay = document.createElement("div");
    overlay.style.cssText = "position:fixed;inset:0;z-index:9999;cursor:col-resize;";
    document.body.appendChild(overlay);

    const onMouseMove = (e: MouseEvent) => {
      const delta = startX - e.clientX;
      const newWidth = Math.max(200, Math.min(startWidth + delta, window.innerWidth * 0.7));
      if (sidebarRef.current) {
        sidebarRef.current.style.width = `${newWidth}px`;
      }
    };

    const onMouseUp = () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      overlay.remove();
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  }, []);

  if (!state.sidebarVisible) return null;

  return (
    <div className="sidebar" ref={sidebarRef}>
      <div className="sidebar-resize-handle" onMouseDown={onResizeStart} />
      <div className="sidebar-inner">
        <div className="sidebar-tabs">
          {SIDEBAR_MODES.map((mode) => (
            <button
              key={mode.key}
              className={`sidebar-tab ${state.sidebarMode === mode.key ? "active" : ""}`}
              onClick={() => dispatch({ type: "SET_SIDEBAR_MODE", mode: mode.key })}
              title={mode.shortcut}
            >
              {mode.label}
            </button>
          ))}
        </div>
        <div className="sidebar-content">
          <SidebarContent mode={state.sidebarMode} />
        </div>
      </div>
    </div>
  );
}

function SidebarContent({ mode }: { mode: SidebarMode }) {
  switch (mode) {
    case "code":
      return <CodeEditor />;
    case "diff":
      return (
        <div className="sidebar-placeholder">
          <div className="placeholder-icon">+/-</div>
          <p>Diff Viewer</p>
          <p className="placeholder-sub">Syntax-highlighted diff of focused terminal's worktree</p>
        </div>
      );
    case "git":
      return (
        <div className="sidebar-placeholder">
          <div className="placeholder-icon">*</div>
          <p>Git Graph</p>
          <p className="placeholder-sub">Branch visualization + commit history</p>
        </div>
      );
    case "browser":
      return (
        <div className="sidebar-placeholder">
          <div className="placeholder-icon">W</div>
          <p>Browser Preview</p>
          <p className="placeholder-sub">Live preview for frontend work</p>
        </div>
      );
  }
}

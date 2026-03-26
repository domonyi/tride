import { useRef, useCallback, lazy, Suspense } from "react";
import { useAppState, useAppDispatch } from "../state/context";
import type { SidebarMode } from "../types";

const CodeEditor = lazy(() => import("./CodeEditor").then((m) => ({ default: m.CodeEditor })));
const SourceControl = lazy(() => import("./SourceControl").then((m) => ({ default: m.SourceControl })));
const BrowserPanel = lazy(() => import("./BrowserPanel").then((m) => ({ default: m.BrowserPanel })));

const SIDEBAR_MODES: { key: SidebarMode; label: string; shortcut: string }[] = [
  { key: "code", label: "CODE", shortcut: "F1" },
  { key: "scm", label: "SOURCE CONTROL", shortcut: "F2" },
  { key: "browser", label: "BROWSER", shortcut: "F3" },
];

export function Sidebar() {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const sidebarRef = useRef<HTMLDivElement>(null);

  const onResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = sidebarRef.current?.offsetWidth ?? state.sidebarWidth;

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
      if (sidebarRef.current) {
        dispatch({ type: "SET_SIDEBAR_WIDTH", width: sidebarRef.current.offsetWidth });
      }
    };

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  }, [state.sidebarWidth, dispatch]);

  if (!state.sidebarVisible) return null;

  return (
    <div className="sidebar" ref={sidebarRef} style={{ width: state.sidebarWidth }}>
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
          <div className="sidebar-panel" style={{ display: state.sidebarMode === "code" ? "flex" : "none" }}>
            <Suspense fallback={<div className="code-editor-loading">Loading...</div>}>
              <CodeEditor />
            </Suspense>
          </div>
          {state.sidebarMode === "scm" && (
            <div className="sidebar-panel" style={{ display: "flex" }}>
              <Suspense fallback={<div className="code-editor-loading">Loading...</div>}>
                <SourceControl />
              </Suspense>
            </div>
          )}
          <div className="sidebar-panel" style={{ display: state.sidebarMode === "browser" ? "flex" : "none" }}>
            <Suspense fallback={<div className="code-editor-loading">Loading...</div>}>
              <BrowserPanel />
            </Suspense>
          </div>
        </div>
      </div>
    </div>
  );
}

import { useEffect, useRef } from "react";
import { AppProvider, useAppState, useAppDispatch } from "./state/context";
import { TitleBar } from "./components/TitleBar";
import { ProjectTabs } from "./components/ProjectTabs";
import { TerminalTabs } from "./components/TerminalTabs";
import { TerminalGrid } from "./components/TerminalGrid";
import { Sidebar } from "./components/Sidebar";
import { ActionBar } from "./components/ActionBar";
import { saveSession, loadSession, respawnTerminals } from "./state/session";
import type { SidebarMode } from "./types";
import "./styles.css";

function AppContent() {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const loadedRef = useRef(false);

  // Restore session on startup
  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;

    loadSession().then((session) => {
      if (session) {
        dispatch({ type: "RESTORE_SESSION", state: session });

        // Re-spawn PTYs for restored terminals
        respawnTerminals(session.projects, (projectId, terminalId, ptyId) => {
          dispatch({
            type: "UPDATE_TERMINAL",
            projectId,
            terminalId,
            updates: { ptyId },
          });
        });
      }
    });
  }, [dispatch]);

  // Auto-save session on state changes (debounced)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!loadedRef.current) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveSession(state);
    }, 1000);
  }, [state]);

  // Global keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const modeMap: Record<string, SidebarMode> = {
        F1: "code",
        F2: "scm",
        F3: "browser",
      };
      if (modeMap[e.key]) {
        e.preventDefault();
        dispatch({ type: "SET_SIDEBAR_MODE", mode: modeMap[e.key] });
      }

      if (e.ctrlKey && e.key === "b") {
        e.preventDefault();
        dispatch({ type: "TOGGLE_SIDEBAR" });
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [dispatch]);

  return (
    <div className="app">
      <TitleBar />
      <div className="tab-bar">
        <ProjectTabs />
        <TerminalTabs />
      </div>
      <div className="main-area">
        <div className="terminal-area">
          <TerminalGrid />
        </div>
        <Sidebar />
      </div>
      <ActionBar />
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  );
}

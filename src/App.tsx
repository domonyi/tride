import { useEffect, useRef, lazy, Suspense } from "react";
import { AppProvider, useAppState, useAppDispatch } from "./state/context";
import { TitleBar } from "./components/TitleBar";
import { ProjectTabs } from "./components/ProjectTabs";
import { TerminalTabs } from "./components/TerminalTabs";
import { Sidebar } from "./components/Sidebar";
import { ActionBar } from "./components/ActionBar";

const TerminalGrid = lazy(() => import("./components/TerminalGrid").then((m) => ({ default: m.TerminalGrid })));
import { saveSession, loadSession, respawnTerminals } from "./state/session";
import { saveLayoutState } from "./state/localStorage";
import type { SidebarMode } from "./types";
import "./styles.css";

function AppContent() {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const loadedRef = useRef(false);
  const restoredRef = useRef(false);

  // Restore session on startup
  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;

    // Tier 1 (projects, layout) is already in initialState from localStorage.
    // Respawn PTYs immediately from the projects already in state.
    respawnTerminals(
      state.projects,
      (projectId, terminalId, ptyId) => {
        dispatch({
          type: "UPDATE_TERMINAL",
          projectId,
          terminalId,
          updates: { ptyId },
        });
      },
      {
        defaultShell: state.defaultShell,
        defaultLlm: state.defaultLlm,
        customLlmCommand: state.customLlmCommand,
      },
    );

    // Tier 2: load remaining state from session file
    loadSession().then((session) => {
      if (session) {
        // Only apply Tier 2 values — Tier 1 is already loaded from localStorage
        dispatch({
          type: "RESTORE_SESSION",
          state: {
            activeTerminalId: session.activeTerminalId,
            lastOpenedFile: session.lastOpenedFile,
            lastBrowserUrl: session.lastBrowserUrl,
            commitMessage: session.commitMessage,
            scmChangesHeight: session.scmChangesHeight,
          },
        });
      }
      restoredRef.current = true;
    });
  }, [dispatch]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-save: localStorage immediately (Tier 1), session file debounced (all state)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!restoredRef.current) return;
    // Tier 1: synchronous localStorage write — no delay
    saveLayoutState(state);
    // Tier 2: debounced file write for everything
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
        dispatch({ type: "TOGGLE_EXPLORER" });
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [dispatch]);

  return (
    <div className="app">
      <TitleBar />
      <div className="main-area">
        <div className="terminal-column">
          <div className="tab-bar">
            <ProjectTabs />
            <TerminalTabs />
          </div>
          <div className="terminal-area">
            <Suspense fallback={null}>
              <TerminalGrid />
            </Suspense>
          </div>
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

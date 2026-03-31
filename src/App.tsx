import { useState, useEffect, useRef, lazy, Suspense } from "react";
import { AppProvider, useAppState, useAppDispatch } from "./state/context";
import { TitleBar } from "./components/TitleBar";
import { ProjectTabs } from "./components/ProjectTabs";
import { TerminalTabs } from "./components/TerminalTabs";
import { GroupTabs } from "./components/GroupTabs";
import { Sidebar } from "./components/Sidebar";
import { ActionBar } from "./components/ActionBar";
import { SearchBar } from "./components/SearchBar";

const TerminalGrid = lazy(() => import("./components/TerminalGrid").then((m) => ({ default: m.TerminalGrid })));
import { saveSession, loadSession, respawnTerminals } from "./state/session";
import { saveLayoutState } from "./state/localStorage";
import { registerStatusSubscriber } from "./ptyBuffer";
import type { SidebarMode } from "./types";
import "./styles.css";

function AppContent() {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const loadedRef = useRef(false);
  const restoredRef = useRef(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const projectsRef = useRef(state.projects);
  projectsRef.current = state.projects;

  // Restore session on startup
  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;

    // Request notification permission for terminal activity alerts
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }

    // Tier 1 (projects, layout) is already in initialState from localStorage.
    // Respawn PTYs immediately from the projects already in state.
    respawnTerminals(
      state.projects,
      (projectId, terminalId, ptyId, isLlm) => {
        dispatch({
          type: "UPDATE_TERMINAL",
          projectId,
          terminalId,
          updates: { ptyId, isLlm },
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
            activeGroupId: (session as any).activeGroupId ?? null,
            lastOpenedFile: session.lastOpenedFile,
            openedFiles: session.openedFiles,
            lastBrowserUrl: session.lastBrowserUrl,
            commitMessages: session.commitMessages,
            scmChangesHeight: session.scmChangesHeight,
            expandedFolders: session.expandedFolders,
          },
        });
      }
      restoredRef.current = true;
    });
  }, [dispatch]); // eslint-disable-line react-hooks/exhaustive-deps

  // Wire up global PTY status changes to React state
  useEffect(() => {
    registerStatusSubscriber((ptyId, status) => {
      for (const project of projectsRef.current) {
        const terminal = project.terminals.find((t) => t.ptyId === ptyId);
        if (terminal && terminal.status !== status) {
          dispatch({
            type: "UPDATE_TERMINAL",
            projectId: project.id,
            terminalId: terminal.id,
            updates: { status },
          });
          break;
        }
      }
    });
  }, [dispatch]);

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
      // Alt+1/2/3 → sidebar modes
      if (e.altKey && !e.ctrlKey && !e.metaKey) {
        const modeMap: Record<string, SidebarMode> = {
          "1": "code",
          "2": "scm",
          "3": "browser",
          "4": "todo",
        };
        if (modeMap[e.key]) {
          e.preventDefault();
          dispatch({ type: "SET_SIDEBAR_MODE", mode: modeMap[e.key] });
          return;
        }
      }

      // F1-F9 → switch project by index
      const fMatch = e.key.match(/^F(\d)$/);
      if (fMatch && !e.ctrlKey && !e.altKey && !e.metaKey) {
        const idx = parseInt(fMatch[1]) - 1;
        if (idx >= 0 && idx < state.projects.length) {
          e.preventDefault();
          dispatch({ type: "SET_ACTIVE_PROJECT", projectId: state.projects[idx].id });
        }
        return;
      }

      if (e.ctrlKey && e.key === "b") {
        e.preventDefault();
        dispatch({ type: "TOGGLE_EXPLORER" });
      }

      if (e.ctrlKey && e.key === "p") {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [dispatch, state.projects]);

  const activeProject = state.projects.find((p) => p.id === state.activeProjectId);

  const handleSearchFileSelect = (path: string) => {
    dispatch({ type: "SET_SIDEBAR_MODE", mode: "code" });
    if (!state.sidebarVisible) dispatch({ type: "TOGGLE_SIDEBAR" });
    window.dispatchEvent(new CustomEvent("open-file", { detail: path }));
  };

  return (
    <div className="app">
      <TitleBar onSearchClick={() => setSearchOpen(true)} />
      <div className="main-area">
        <div className="terminal-column">
          <div className="tab-bar">
            <ProjectTabs />
            <GroupTabs />
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
      {searchOpen && activeProject && (
        <SearchBar
          rootPath={activeProject.path}
          onFileSelect={handleSearchFileSelect}
          onClose={() => setSearchOpen(false)}
        />
      )}
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

import { useState, useEffect, useRef } from "react";
import { AppProvider, useAppState, useAppDispatch } from "./state/context";
import { TitleBar } from "./components/TitleBar";
import { Sidebar } from "./components/Sidebar";
import { ActionBar } from "./components/ActionBar";
import { SearchBar } from "./components/SearchBar";
import { LlmPanes } from "./components/LlmPanes";
import { TerminalDrawer } from "./components/TerminalDrawer";
import { ProjectTabs } from "./components/ProjectTabs";

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

    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }

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

    loadSession().then((session) => {
      if (session) {
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

  // Auto-save
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!restoredRef.current) return;
    saveLayoutState(state);
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveSession(state);
    }, 1000);
  }, [state]);

  // Global keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Alt+1/2/3/4 → sidebar modes
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

      // Ctrl+` or Alt+5 → toggle terminal drawer
      if ((e.ctrlKey && e.key === "`") || (e.altKey && e.key === "5")) {
        e.preventDefault();
        dispatch({ type: "TOGGLE_TERMINAL_DRAWER" });
        return;
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
          </div>

          {/* Panes — always visible, main workspace */}
          <LlmPanes />

          {/* Terminal drawer — push-up from bottom */}
          <TerminalDrawer />
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

import { useEffect } from "react";
import { AppProvider, useAppDispatch } from "./state/context";
import { TitleBar } from "./components/TitleBar";
import { ProjectTabs } from "./components/ProjectTabs";
import { TerminalTabs } from "./components/TerminalTabs";
import { TerminalGrid } from "./components/TerminalGrid";
import { Sidebar } from "./components/Sidebar";
import { ActionBar } from "./components/ActionBar";
import type { SidebarMode } from "./types";
import "./styles.css";

function AppContent() {
  const dispatch = useAppDispatch();

  // Global keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // F1-F4 for sidebar modes
      const modeMap: Record<string, SidebarMode> = {
        F1: "code",
        F2: "diff",
        F3: "git",
        F4: "browser",
      };
      if (modeMap[e.key]) {
        e.preventDefault();
        dispatch({ type: "SET_SIDEBAR_MODE", mode: modeMap[e.key] });
      }

      // Ctrl+B toggle sidebar
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

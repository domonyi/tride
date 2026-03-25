import { invoke } from "@tauri-apps/api/core";
import type { AppState, Project, GridLayout, SidebarMode } from "../types";

interface SavedSession {
  projects: Array<{
    id: string;
    name: string;
    path: string;
  }>;
  activeProjectId: string | null;
  gridLayout: GridLayout;
  sidebarMode: SidebarMode;
  sidebarVisible: boolean;
  sidebarWidth: number | null;
}

const SESSION_PATH = getSessionPath();

function getSessionPath(): string {
  // Will be resolved at runtime
  return "";
}

async function resolveSessionPath(): Promise<string> {
  try {
    const home = await invoke<string>("get_home_dir");
    return `${home}/.aiterminal-session.json`;
  } catch {
    return "C:\\Users\\zdomonyi\\.aiterminal-session.json";
  }
}

export async function saveSession(state: AppState, sidebarWidth?: number): Promise<void> {
  const path = await resolveSessionPath();
  const session: SavedSession = {
    projects: state.projects.map((p) => ({
      id: p.id,
      name: p.name,
      path: p.path,
    })),
    activeProjectId: state.activeProjectId,
    gridLayout: state.gridLayout,
    sidebarMode: state.sidebarMode,
    sidebarVisible: state.sidebarVisible,
    sidebarWidth: sidebarWidth ?? null,
  };

  try {
    await invoke("write_file", {
      path,
      content: JSON.stringify(session, null, 2),
    });
  } catch (e) {
    console.error("Failed to save session:", e);
  }
}

export async function loadSession(): Promise<{
  projects: Project[];
  activeProjectId: string | null;
  gridLayout: GridLayout;
  sidebarMode: SidebarMode;
  sidebarVisible: boolean;
  sidebarWidth: number | null;
} | null> {
  const path = await resolveSessionPath();
  try {
    const content = await invoke<string>("read_file", { path });
    const session: SavedSession = JSON.parse(content);
    return {
      projects: session.projects.map((p) => ({
        ...p,
        terminals: [],
      })),
      activeProjectId: session.activeProjectId,
      gridLayout: session.gridLayout,
      sidebarMode: session.sidebarMode,
      sidebarVisible: session.sidebarVisible,
      sidebarWidth: session.sidebarWidth,
    };
  } catch {
    return null;
  }
}

import { invoke } from "@tauri-apps/api/core";
import type { AppState, Project, Terminal, GridLayout, SidebarMode } from "../types";

interface SavedTerminal {
  id: string;
  title: string;
  cwd: string;
  mode: "worktree" | "instance";
  branch?: string;
}

interface SavedSession {
  projects: Array<{
    id: string;
    name: string;
    path: string;
    terminals: SavedTerminal[];
  }>;
  activeProjectId: string | null;
  activeTerminalId: string | null;
  gridLayout: GridLayout;
  sidebarMode: string; // may contain legacy "diff"/"git" values
  sidebarVisible: boolean;
  sidebarWidth: number;
  lastOpenedFile: string | null;
}

async function resolveSessionPath(): Promise<string> {
  try {
    const home = await invoke<string>("get_home_dir");
    return `${home}/.aiterminal-session.json`;
  } catch {
    return "C:\\Users\\zdomonyi\\.aiterminal-session.json";
  }
}

export async function saveSession(state: AppState): Promise<void> {
  const path = await resolveSessionPath();
  const session: SavedSession = {
    projects: state.projects.map((p) => ({
      id: p.id,
      name: p.name,
      path: p.path,
      terminals: p.terminals.map((t) => ({
        id: t.id,
        title: t.title,
        cwd: t.cwd,
        mode: t.mode,
        branch: t.branch,
      })),
    })),
    activeProjectId: state.activeProjectId,
    activeTerminalId: state.activeTerminalId,
    gridLayout: state.gridLayout,
    sidebarMode: state.sidebarMode,
    sidebarVisible: state.sidebarVisible,
    sidebarWidth: state.sidebarWidth,
    lastOpenedFile: state.lastOpenedFile,
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

export interface RestoredSession {
  projects: Project[];
  activeProjectId: string | null;
  activeTerminalId: string | null;
  gridLayout: GridLayout;
  sidebarMode: SidebarMode;
  sidebarVisible: boolean;
  sidebarWidth: number;
  lastOpenedFile: string | null;
}

export async function loadSession(): Promise<RestoredSession | null> {
  const path = await resolveSessionPath();
  try {
    const content = await invoke<string>("read_file", { path });
    const session: SavedSession = JSON.parse(content);
    return {
      projects: session.projects.map((p) => ({
        ...p,
        terminals: (p.terminals || []).map((t) => ({
          ...t,
          ptyId: null, // will be re-spawned
          status: "idle" as const,
        })),
      })),
      activeProjectId: session.activeProjectId,
      activeTerminalId: session.activeTerminalId ?? null,
      gridLayout: session.gridLayout,
      sidebarMode: (session.sidebarMode === "diff" || session.sidebarMode === "git") ? "scm" as const : session.sidebarMode as "code" | "scm" | "browser",
      sidebarVisible: session.sidebarVisible,
      sidebarWidth: session.sidebarWidth ?? 340,
      lastOpenedFile: session.lastOpenedFile ?? null,
    };
  } catch {
    return null;
  }
}

/** Re-spawn PTYs for all restored terminals */
export async function respawnTerminals(
  projects: Project[],
  onPtySpawned: (projectId: string, terminalId: string, ptyId: string) => void,
) {
  for (const project of projects) {
    for (const terminal of project.terminals) {
      if (terminal.ptyId) continue; // already has a PTY
      try {
        const ptyId = await invoke<string>("spawn_terminal", {
          cwd: terminal.cwd,
          title: terminal.title,
          shell: null,
        });
        onPtySpawned(project.id, terminal.id, ptyId);
      } catch (e) {
        console.error(`Failed to respawn terminal ${terminal.title}:`, e);
      }
    }
  }
}

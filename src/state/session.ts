import { invoke } from "@tauri-apps/api/core";
import type { AppState, Project, Terminal, GridLayout, SidebarMode, DefaultLlm, DefaultShell } from "../types";
import { getLlmCommand } from "../utils/llmCommand";
import { registerPtyLlm } from "../ptyBuffer";

interface SavedTerminal {
  id: string;
  title: string;
  cwd: string;
  mode: "worktree" | "instance";
  branch?: string;
  worktreePath?: string;
}

interface SavedSession {
  projects: Array<{
    id: string;
    name: string;
    path: string;
    terminals: SavedTerminal[];
    terminalGroups?: Array<{ id: string; name: string; terminalIds: string[] }>;
  }>;
  activeProjectId: string | null;
  activeTerminalId: string | null;
  activeGroupId?: string | null;
  gridLayout: GridLayout;
  sidebarMode: string; // may contain legacy "diff"/"git" values
  sidebarVisible: boolean;
  sidebarWidth: number;
  lastOpenedFile: string | null;
  openedFiles?: string[];
  scmChangesHeight: number | null;
  explorerVisible: boolean;
  explorerWidth: number;
  lastBrowserUrl: string | null;
  commitMessages: Record<string, string>;
  expandedFolders?: Record<string, string[]>;
}

async function resolveSessionPath(): Promise<string> {
  try {
    const home = await invoke<string>("get_home_dir");
    return `${home}/.tride-session.json`;
  } catch {
    return ".tride-session.json";
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
        worktreePath: t.worktreePath,
      })),
      terminalGroups: p.terminalGroups,
    })),
    activeProjectId: state.activeProjectId,
    activeTerminalId: state.activeTerminalId,
    activeGroupId: state.activeGroupId,
    gridLayout: state.gridLayout,
    sidebarMode: state.sidebarMode,
    sidebarVisible: state.sidebarVisible,
    sidebarWidth: state.sidebarWidth,
    lastOpenedFile: state.lastOpenedFile,
    openedFiles: state.openedFiles,
    scmChangesHeight: state.scmChangesHeight,
    explorerVisible: state.explorerVisible,
    explorerWidth: state.explorerWidth,
    lastBrowserUrl: state.lastBrowserUrl,
    commitMessages: state.commitMessages,
    expandedFolders: state.expandedFolders,
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
  activeGroupId: string | null;
  gridLayout: GridLayout;
  sidebarMode: SidebarMode;
  sidebarVisible: boolean;
  sidebarWidth: number;
  lastOpenedFile: string | null;
  openedFiles: string[];
  scmChangesHeight: number | null;
  explorerVisible: boolean;
  explorerWidth: number;
  lastBrowserUrl: string | null;
  commitMessages: Record<string, string>;
  expandedFolders: Record<string, string[]>;
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
          worktreePath: t.worktreePath,
        })),
      })),
      activeProjectId: session.activeProjectId,
      activeTerminalId: session.activeTerminalId ?? null,
      activeGroupId: session.activeGroupId ?? null,
      gridLayout: session.gridLayout,
      sidebarMode: (session.sidebarMode === "diff" || session.sidebarMode === "git") ? "scm" as const : session.sidebarMode as "code" | "scm" | "browser",
      sidebarVisible: session.sidebarVisible,
      sidebarWidth: session.sidebarWidth ?? 340,
      lastOpenedFile: session.lastOpenedFile ?? null,
      openedFiles: session.openedFiles ?? (session.lastOpenedFile ? [session.lastOpenedFile] : []),
      scmChangesHeight: session.scmChangesHeight ?? null,
      explorerVisible: session.explorerVisible ?? true,
      explorerWidth: session.explorerWidth ?? 180,
      lastBrowserUrl: session.lastBrowserUrl ?? null,
      commitMessages: (session as any).commitMessages ?? {},
      expandedFolders: session.expandedFolders ?? {},
    };
  } catch {
    return null;
  }
}

/** Re-spawn PTYs for all restored terminals */
export async function respawnTerminals(
  projects: Project[],
  onPtySpawned: (projectId: string, terminalId: string, ptyId: string, isLlm: boolean) => void,
  options?: { defaultShell?: DefaultShell; defaultLlm?: DefaultLlm; customLlmCommand?: string },
) {
  const shellMap: Record<string, string> = {
    powershell: "powershell.exe",
    cmd: "cmd.exe",
    bash: "/bin/bash",
    zsh: "/bin/zsh",
    fish: "/usr/bin/fish",
  };
  const shell = options?.defaultShell ? (shellMap[options.defaultShell] ?? null) : null;

  for (const project of projects) {
    for (const terminal of project.terminals) {
      if (terminal.ptyId) continue; // already has a PTY
      try {
        const ptyId = await invoke<string>("spawn_terminal", {
          cwd: terminal.cwd,
          title: terminal.title,
          shell,
        });
        // Auto-run LLM command after shell is ready
        const cmd = getLlmCommand(options?.defaultLlm ?? "none", options?.customLlmCommand ?? "");
        const isLlm = !!cmd;
        onPtySpawned(project.id, terminal.id, ptyId, isLlm);
        registerPtyLlm(ptyId, isLlm);
        if (cmd) {
          setTimeout(() => {
            const encoder = new TextEncoder();
            invoke("write_terminal", {
              id: ptyId,
              data: Array.from(encoder.encode(cmd + "\r")),
            }).catch(() => {});
          }, 500);
        }
      } catch (e) {
        console.error(`Failed to respawn terminal ${terminal.title}:`, e);
      }
    }
  }
}

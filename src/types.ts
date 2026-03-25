export interface Project {
  id: string;
  name: string;
  path: string;
  terminals: Terminal[];
}

export interface Terminal {
  id: string;
  title: string;
  ptyId: string | null; // null if not yet spawned
  cwd: string;
  mode: "worktree" | "instance";
  status: "idle" | "running" | "done" | "error";
  branch?: string;
  filesChanged?: number;
}

export interface GridLayout {
  rows: number;
  cols: number;
}

export type SidebarMode = "code" | "scm" | "browser";

export interface AppState {
  projects: Project[];
  activeProjectId: string | null;
  activeTerminalId: string | null;
  gridLayout: GridLayout;
  sidebarMode: SidebarMode;
  sidebarVisible: boolean;
  sidebarWidth: number;
  lastOpenedFile: string | null;
  explorerVisible: boolean;
  explorerWidth: number;
}

export type AppAction =
  | { type: "ADD_PROJECT"; project: Project }
  | { type: "REMOVE_PROJECT"; projectId: string }
  | { type: "SET_ACTIVE_PROJECT"; projectId: string }
  | { type: "SET_ACTIVE_TERMINAL"; terminalId: string }
  | { type: "ADD_TERMINAL"; projectId: string; terminal: Terminal }
  | { type: "REMOVE_TERMINAL"; projectId: string; terminalId: string }
  | { type: "UPDATE_TERMINAL"; projectId: string; terminalId: string; updates: Partial<Terminal> }
  | { type: "SET_GRID_LAYOUT"; layout: GridLayout }
  | { type: "SET_SIDEBAR_MODE"; mode: SidebarMode }
  | { type: "TOGGLE_SIDEBAR" }
  | { type: "SET_SIDEBAR_WIDTH"; width: number }
  | { type: "SET_LAST_OPENED_FILE"; path: string | null }
  | { type: "TOGGLE_EXPLORER" }
  | { type: "SET_EXPLORER_WIDTH"; width: number }
  | { type: "RESTORE_SESSION"; state: Partial<AppState> };

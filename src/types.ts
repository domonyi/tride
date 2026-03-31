export interface Project {
  id: string;
  name: string;
  path: string;
  terminals: Terminal[];
  terminalGroups?: TerminalGroup[];
  color?: string;
}

export interface Terminal {
  id: string;
  title: string;
  ptyId: string | null; // null if not yet spawned
  cwd: string;
  mode: "worktree" | "instance";
  status: "idle" | "running" | "waiting" | "done" | "error";
  hasActivity?: boolean;
  branch?: string;
  worktreePath?: string; // absolute path to the git worktree directory
  filesChanged?: number;
  isLlm?: boolean;
  splitDirection?: "horizontal" | "vertical";
  splitChildId?: string;
  splitParentId?: string;
}

export interface TerminalGroup {
  id: string;
  name: string;
  terminalIds: string[];
}

export interface GridLayout {
  rows: number;
  cols: number;
}

export type SidebarMode = "code" | "scm" | "browser" | "todo";

export interface TodoItem {
  id: string;
  text: string;
  done: boolean;
  createdAt: number;
}

export type DefaultLlm = "none" | "claude" | "codex" | "custom";
export type DefaultShell = "powershell" | "cmd" | "bash" | "zsh" | "fish";
export type TabOverflowMode = "arrows" | "multiline";

export interface AppState {
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
  explorerVisible: boolean;
  explorerWidth: number;
  scmChangesHeight: number | null;
  lastBrowserUrl: string | null;
  commitMessages: Record<string, string>;
  editorTheme: string;
  defaultLlm: DefaultLlm;
  customLlmCommand: string;
  defaultShell: DefaultShell;
  tabOverflowMode: TabOverflowMode;
  expandedFolders: Record<string, string[]>;
  todos: TodoItem[];
}

export type AppAction =
  | { type: "ADD_PROJECT"; project: Project }
  | { type: "REMOVE_PROJECT"; projectId: string }
  | { type: "SET_ACTIVE_PROJECT"; projectId: string }
  | { type: "SET_ACTIVE_TERMINAL"; terminalId: string }
  | { type: "ADD_TERMINAL"; projectId: string; terminal: Terminal }
  | { type: "REMOVE_TERMINAL"; projectId: string; terminalId: string }
  | { type: "UPDATE_TERMINAL"; projectId: string; terminalId: string; updates: Partial<Terminal> }
  | { type: "SPLIT_TERMINAL"; projectId: string; parentId: string; child: Terminal; direction: "horizontal" | "vertical" }
  | { type: "SET_GRID_LAYOUT"; layout: GridLayout }
  | { type: "SET_SIDEBAR_MODE"; mode: SidebarMode }
  | { type: "TOGGLE_SIDEBAR" }
  | { type: "SET_SIDEBAR_WIDTH"; width: number }
  | { type: "SET_LAST_OPENED_FILE"; path: string | null }
  | { type: "SET_OPENED_FILES"; files: string[] }
  | { type: "TOGGLE_EXPLORER" }
  | { type: "SET_EXPLORER_WIDTH"; width: number }
  | { type: "SET_SCM_CHANGES_HEIGHT"; height: number | null }
  | { type: "SET_LAST_BROWSER_URL"; url: string | null }
  | { type: "SET_COMMIT_MESSAGE"; projectId: string; message: string }
  | { type: "SET_EDITOR_THEME"; theme: string }
  | { type: "SET_DEFAULT_LLM"; llm: DefaultLlm }
  | { type: "SET_CUSTOM_LLM_COMMAND"; command: string }
  | { type: "SET_DEFAULT_SHELL"; shell: DefaultShell }
  | { type: "SET_TAB_OVERFLOW_MODE"; mode: TabOverflowMode }
  | { type: "REORDER_PROJECTS"; fromIndex: number; toIndex: number }
  | { type: "REORDER_TERMINALS"; projectId: string; fromIndex: number; toIndex: number }
  | { type: "CREATE_GROUP"; projectId: string; group: TerminalGroup }
  | { type: "REMOVE_GROUP"; projectId: string; groupId: string }
  | { type: "RENAME_GROUP"; projectId: string; groupId: string; name: string }
  | { type: "SET_ACTIVE_GROUP"; groupId: string | null }
  | { type: "ADD_TO_GROUP"; projectId: string; groupId: string; terminalId: string }
  | { type: "REMOVE_FROM_GROUP"; projectId: string; groupId: string; terminalId: string }
  | { type: "REORDER_GROUPS"; projectId: string; fromIndex: number; toIndex: number }
  | { type: "SET_PROJECT_COLOR"; projectId: string; color: string }
  | { type: "SET_EXPANDED_FOLDERS"; rootPath: string; folders: string[] }
  | { type: "ADD_TODO"; todo: TodoItem }
  | { type: "UPDATE_TODO"; todoId: string; updates: Partial<TodoItem> }
  | { type: "REMOVE_TODO"; todoId: string }
  | { type: "REORDER_TODOS"; fromIndex: number; toIndex: number }
  | { type: "RESTORE_SESSION"; state: Partial<AppState> };

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
  claudeSessionId?: string; // links to a Claude SDK session
  splitDirection?: "horizontal" | "vertical";
  splitChildId?: string;
  splitParentId?: string;
}

// ── Claude Session Types ────────────────────────────────────────────────────

export interface ClaudeToolCall {
  toolUseId: string;
  toolName: string;
  input: unknown;
  inputDelta: string; // accumulates streaming input JSON
  output?: string;
  status: "pending_approval" | "approved" | "denied" | "running" | "done" | "error";
  title?: string;
  description?: string;
}

export interface ClaudeMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  toolCalls: ClaudeToolCall[];
  thinking?: string;
  timestamp: number;
}

export interface ClaudeSession {
  sessionId: string;
  sdkSessionId?: string;
  messages: ClaudeMessage[];
  status: "idle" | "running" | "waiting" | "done" | "error";
  streamingText: string;
  streamingThinking: string;
  pendingApprovals: ClaudeToolCall[];
  totalCost: number;
  model?: string;
}

export interface TerminalGroup {
  id: string;
  name: string;
  terminalIds: string[];
}

export interface ProjectTabGroup {
  id: string;
  name: string;
  projectIds: string[];
  collapsed: boolean;
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

// ── LLM Pane Types ───────────────────────────────────────────────────────

export type PaneOrigin = "empty" | "local" | "worktree";

export interface PaneChatHistory {
  id: string;
  name: string;
  timestamp: number;
  origin: "local" | "worktree";
  branch?: string;
  sessionId: string;
  sdkSessionId?: string;  // Claude SDK session ID for resume
}

export interface LlmPane {
  id: string;
  index: number;
  label: string;
  origin: PaneOrigin;
  branch?: string;
  worktreePath?: string;
  chatHistoryId?: string;
  worktreeSetup?: boolean;
  sdkSessionId?: string;  // Claude SDK session ID for resume
}

export interface PanesState {
  visible: boolean;
  panes: Record<string, LlmPane>;
  paneOrder: string[];
  paneCount: number;
  layoutId: string;
  activePaneId: string | null;
  lastActivePaneId: string | null;
  broadcastOpen: boolean;
  broadcastTargets: string[];
  broadcastDraft: string;
  chatHistory: PaneChatHistory[];
}

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
  projectTabGroups: ProjectTabGroup[];
  expandedFolders: Record<string, string[]>;
  todos: TodoItem[];
  claudeSessions: Record<string, ClaudeSession>;
  panes: PanesState;
  terminalDrawerOpen: boolean;
  terminalDrawerHeight: number;
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
  | { type: "CREATE_PROJECT_GROUP"; name: string; projectIds: string[] }
  | { type: "REMOVE_PROJECT_GROUP"; groupId: string }
  | { type: "RENAME_PROJECT_GROUP"; groupId: string; name: string }
  | { type: "TOGGLE_PROJECT_GROUP_COLLAPSE"; groupId: string }
  | { type: "ADD_TO_PROJECT_GROUP"; groupId: string; projectId: string }
  | { type: "REMOVE_FROM_PROJECT_GROUP"; groupId: string; projectId: string }
  | { type: "UNGROUP_PROJECT_GROUP"; groupId: string }
  | { type: "SET_EXPANDED_FOLDERS"; rootPath: string; folders: string[] }
  | { type: "ADD_TODO"; todo: TodoItem }
  | { type: "UPDATE_TODO"; todoId: string; updates: Partial<TodoItem> }
  | { type: "REMOVE_TODO"; todoId: string }
  | { type: "REORDER_TODOS"; fromIndex: number; toIndex: number }
  | { type: "CLAUDE_SESSION_STARTED"; sessionId: string; sdkSessionId: string; model?: string }
  | { type: "CLAUDE_TEXT_DELTA"; sessionId: string; text: string }
  | { type: "CLAUDE_TEXT_DONE"; sessionId: string; text: string }
  | { type: "CLAUDE_THINKING_DELTA"; sessionId: string; text: string }
  | { type: "CLAUDE_TOOL_USE_START"; sessionId: string; toolCall: ClaudeToolCall }
  | { type: "CLAUDE_TOOL_APPROVAL_REQUIRED"; sessionId: string; toolCall: ClaudeToolCall }
  | { type: "CLAUDE_TOOL_APPROVED"; sessionId: string; toolUseId: string }
  | { type: "CLAUDE_TOOL_DENIED"; sessionId: string; toolUseId: string }
  | { type: "CLAUDE_TOOL_DONE"; sessionId: string; toolUseId: string; output?: string }
  | { type: "CLAUDE_TOOL_INPUT_DELTA"; sessionId: string; delta: string }
  | { type: "CLAUDE_STATUS_CHANGE"; sessionId: string; status: ClaudeSession["status"] }
  | { type: "CLAUDE_TURN_COMPLETE"; sessionId: string; totalCost: number }
  | { type: "CLAUDE_ERROR"; sessionId: string; message: string }
  | { type: "CLAUDE_REMOVE_SESSION"; sessionId: string }
  | { type: "CLAUDE_USER_MESSAGE"; sessionId: string; text: string }
  | { type: "RESTORE_SESSION"; state: Partial<AppState> }
  | { type: "TOGGLE_TERMINAL_DRAWER" }
  | { type: "SET_TERMINAL_DRAWER_HEIGHT"; height: number }
  // ── Panes Actions ──────────────────────────────────────────────────
  | { type: "PANES_SET_LAYOUT"; layoutId: string }
  | { type: "PANES_SET_ACTIVE_PANE"; paneId: string }
  | { type: "PANES_CLEAR_FOCUS" }
  | { type: "PANES_TOGGLE_BROADCAST" }
  | { type: "PANES_CLOSE_BROADCAST" }
  | { type: "PANES_SET_BROADCAST_DRAFT"; text: string }
  | { type: "PANES_TOGGLE_BROADCAST_TARGET"; paneId: string }
  | { type: "PANES_SELECT_ALL_TARGETS" }
  | { type: "PANES_CLEAR_PANE"; paneId: string }
  | { type: "PANES_CLEAR_ALL" }
  | { type: "PANES_START_LOCAL"; paneId: string }
  | { type: "PANES_START_WORKTREE_SETUP"; paneId: string }
  | { type: "PANES_CANCEL_WORKTREE_SETUP"; paneId: string }
  | { type: "PANES_CREATE_WORKTREE"; paneId: string; branch: string; baseBranch: string }
  | { type: "PANES_RESUME_CHAT"; paneId: string; historyId: string }
  | { type: "PANES_DELETE_HISTORY"; historyId: string }
  | { type: "PANES_SET_SDK_SESSION_ID"; paneId: string; sdkSessionId: string }
  | { type: "PANES_UPDATE_LABEL"; paneId: string; label: string };

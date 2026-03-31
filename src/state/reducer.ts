import { AppState, AppAction } from "../types";
import { loadLayoutState } from "./localStorage";
import { IS_WINDOWS } from "../utils/platform";

const PROJECT_COLORS = [
  "#4a6fa5", // steel blue
  "#6a8f6b", // sage green
  "#8b6bb0", // muted purple
  "#b07a4a", // warm amber
  "#4a9b9b", // teal
  "#b04a6a", // dusty rose
  "#7a8b4a", // olive
  "#6a7fb0", // periwinkle
];

const cached = loadLayoutState();

export const initialState: AppState = {
  projects: cached.projects ?? [],
  activeProjectId: cached.activeProjectId ?? null,
  activeTerminalId: null,
  activeGroupId: null,
  gridLayout: cached.gridLayout ?? { rows: 2, cols: 2 },
  sidebarMode: cached.sidebarMode ?? "code",
  sidebarVisible: cached.sidebarVisible ?? true,
  sidebarWidth: cached.sidebarWidth ?? 340,
  lastOpenedFile: null,
  openedFiles: [],
  explorerVisible: cached.explorerVisible ?? true,
  explorerWidth: cached.explorerWidth ?? 180,
  scmChangesHeight: null,
  lastBrowserUrl: null,
  commitMessages: {},
  editorTheme: cached.editorTheme ?? "dark-plus",
  defaultLlm: cached.defaultLlm ?? "none",
  customLlmCommand: cached.customLlmCommand ?? "",
  defaultShell: cached.defaultShell ?? (IS_WINDOWS ? "powershell" : "bash"),
  tabOverflowMode: cached.tabOverflowMode ?? "arrows",
  expandedFolders: {},
  todos: cached.todos ?? [],
};

export function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case "ADD_PROJECT": {
      const usedColors = new Set(state.projects.map((p) => p.color));
      const autoColor =
        action.project.color ??
        PROJECT_COLORS.find((c) => !usedColors.has(c)) ??
        PROJECT_COLORS[state.projects.length % PROJECT_COLORS.length];
      return {
        ...state,
        projects: [...state.projects, { ...action.project, color: autoColor }],
        activeProjectId: action.project.id,
        activeTerminalId: null,
      };
    }

    case "REMOVE_PROJECT": {
      const remaining = state.projects.filter((p) => p.id !== action.projectId);
      const { [action.projectId]: _, ...remainingMessages } = state.commitMessages;
      return {
        ...state,
        projects: remaining,
        commitMessages: remainingMessages,
        activeProjectId:
          state.activeProjectId === action.projectId
            ? remaining[0]?.id ?? null
            : state.activeProjectId,
        activeTerminalId:
          state.activeProjectId === action.projectId
            ? null
            : state.activeTerminalId,
      };
    }

    case "SET_ACTIVE_PROJECT":
      return {
        ...state,
        activeProjectId: action.projectId,
        activeTerminalId: null,
        activeGroupId: null,
      };

    case "SET_ACTIVE_TERMINAL":
      return {
        ...state,
        activeTerminalId: action.terminalId,
      };

    case "ADD_TERMINAL":
      return {
        ...state,
        projects: state.projects.map((p) => {
          if (p.id !== action.projectId) return p;
          const updated = { ...p, terminals: [...p.terminals, action.terminal] };
          // Auto-add to active group if one is selected
          if (state.activeGroupId && updated.terminalGroups) {
            updated.terminalGroups = updated.terminalGroups.map((g) =>
              g.id === state.activeGroupId
                ? { ...g, terminalIds: [...g.terminalIds, action.terminal.id] }
                : g
            );
          }
          return updated;
        }),
        activeTerminalId: action.terminal.id,
      };

    case "REMOVE_TERMINAL": {
      const project = state.projects.find((p) => p.id === action.projectId);
      const removed = project?.terminals.find((t) => t.id === action.terminalId);
      return {
        ...state,
        projects: state.projects.map((p) => {
          if (p.id !== action.projectId) return p;
          let terminals = p.terminals.filter((t) => t.id !== action.terminalId);
          // If removing a split child, clear the parent's split fields
          if (removed?.splitParentId) {
            terminals = terminals.map((t) =>
              t.id === removed.splitParentId
                ? { ...t, splitDirection: undefined, splitChildId: undefined }
                : t
            );
          }
          // If removing a split parent, clear the child's splitParentId
          if (removed?.splitChildId) {
            terminals = terminals.map((t) =>
              t.id === removed.splitChildId
                ? { ...t, splitParentId: undefined }
                : t
            );
          }
          // Also remove from any group
          const terminalGroups = (p.terminalGroups ?? []).map((g) => ({
            ...g,
            terminalIds: g.terminalIds.filter((id) => id !== action.terminalId),
          }));
          return { ...p, terminals, terminalGroups };
        }),
        activeTerminalId:
          state.activeTerminalId === action.terminalId ? null : state.activeTerminalId,
      };
    }

    case "UPDATE_TERMINAL":
      return {
        ...state,
        projects: state.projects.map((p) =>
          p.id === action.projectId
            ? {
                ...p,
                terminals: p.terminals.map((t) =>
                  t.id === action.terminalId ? { ...t, ...action.updates } : t
                ),
              }
            : p
        ),
      };

    case "SPLIT_TERMINAL":
      return {
        ...state,
        projects: state.projects.map((p) => {
          if (p.id !== action.projectId) return p;
          const terminals = p.terminals.map((t) =>
            t.id === action.parentId
              ? { ...t, splitDirection: action.direction, splitChildId: action.child.id }
              : t
          );
          return { ...p, terminals: [...terminals, { ...action.child, splitParentId: action.parentId }] };
        }),
        activeTerminalId: action.child.id,
      };

    case "SET_GRID_LAYOUT":
      return { ...state, gridLayout: action.layout };

    case "SET_SIDEBAR_MODE":
      return { ...state, sidebarMode: action.mode };

    case "TOGGLE_SIDEBAR":
      return { ...state, sidebarVisible: !state.sidebarVisible };

    case "SET_SIDEBAR_WIDTH":
      return { ...state, sidebarWidth: action.width };

    case "SET_LAST_OPENED_FILE":
      return { ...state, lastOpenedFile: action.path };

    case "SET_OPENED_FILES":
      return { ...state, openedFiles: action.files };

    case "TOGGLE_EXPLORER":
      return { ...state, explorerVisible: !state.explorerVisible };

    case "SET_EXPLORER_WIDTH":
      return { ...state, explorerWidth: action.width };

    case "SET_SCM_CHANGES_HEIGHT":
      return { ...state, scmChangesHeight: action.height };

    case "SET_LAST_BROWSER_URL":
      return { ...state, lastBrowserUrl: action.url };

    case "SET_COMMIT_MESSAGE":
      return { ...state, commitMessages: { ...state.commitMessages, [action.projectId]: action.message } };

    case "SET_EDITOR_THEME":
      return { ...state, editorTheme: action.theme };

    case "SET_DEFAULT_LLM":
      return { ...state, defaultLlm: action.llm };

    case "SET_CUSTOM_LLM_COMMAND":
      return { ...state, customLlmCommand: action.command };

    case "SET_DEFAULT_SHELL":
      return { ...state, defaultShell: action.shell };

    case "SET_TAB_OVERFLOW_MODE":
      return { ...state, tabOverflowMode: action.mode };

    case "SET_PROJECT_COLOR":
      return {
        ...state,
        projects: state.projects.map((p) =>
          p.id === action.projectId ? { ...p, color: action.color } : p
        ),
      };

    case "REORDER_PROJECTS": {
      const projects = [...state.projects];
      const [moved] = projects.splice(action.fromIndex, 1);
      projects.splice(action.toIndex, 0, moved);
      return { ...state, projects };
    }

    case "REORDER_TERMINALS": {
      return {
        ...state,
        projects: state.projects.map((p) => {
          if (p.id !== action.projectId) return p;
          const terminals = [...p.terminals];
          const [moved] = terminals.splice(action.fromIndex, 1);
          terminals.splice(action.toIndex, 0, moved);
          return { ...p, terminals };
        }),
      };
    }

    case "SET_EXPANDED_FOLDERS":
      return { ...state, expandedFolders: { ...state.expandedFolders, [action.rootPath]: action.folders } };

    case "ADD_TODO":
      return { ...state, todos: [...state.todos, action.todo] };

    case "UPDATE_TODO":
      return { ...state, todos: state.todos.map((t) => (t.id === action.todoId ? { ...t, ...action.updates } : t)) };

    case "REMOVE_TODO":
      return { ...state, todos: state.todos.filter((t) => t.id !== action.todoId) };

    case "REORDER_TODOS": {
      const todos = [...state.todos];
      const [moved] = todos.splice(action.fromIndex, 1);
      todos.splice(action.toIndex, 0, moved);
      return { ...state, todos };
    }

    case "CREATE_GROUP": {
      return {
        ...state,
        projects: state.projects.map((p) =>
          p.id === action.projectId
            ? { ...p, terminalGroups: [...(p.terminalGroups ?? []), action.group] }
            : p
        ),
        activeGroupId: action.group.id,
      };
    }

    case "REMOVE_GROUP": {
      return {
        ...state,
        projects: state.projects.map((p) =>
          p.id === action.projectId
            ? { ...p, terminalGroups: (p.terminalGroups ?? []).filter((g) => g.id !== action.groupId) }
            : p
        ),
        activeGroupId: state.activeGroupId === action.groupId ? null : state.activeGroupId,
      };
    }

    case "RENAME_GROUP": {
      return {
        ...state,
        projects: state.projects.map((p) =>
          p.id === action.projectId
            ? {
                ...p,
                terminalGroups: (p.terminalGroups ?? []).map((g) =>
                  g.id === action.groupId ? { ...g, name: action.name } : g
                ),
              }
            : p
        ),
      };
    }

    case "SET_ACTIVE_GROUP":
      return { ...state, activeGroupId: action.groupId };

    case "ADD_TO_GROUP": {
      return {
        ...state,
        projects: state.projects.map((p) => {
          if (p.id !== action.projectId) return p;
          return {
            ...p,
            terminalGroups: (p.terminalGroups ?? []).map((g) => {
              // Remove from other groups first, then add to target
              const filtered = g.terminalIds.filter((id) => id !== action.terminalId);
              if (g.id === action.groupId) {
                return { ...g, terminalIds: [...filtered, action.terminalId] };
              }
              return { ...g, terminalIds: filtered };
            }),
          };
        }),
      };
    }

    case "REMOVE_FROM_GROUP": {
      return {
        ...state,
        projects: state.projects.map((p) =>
          p.id === action.projectId
            ? {
                ...p,
                terminalGroups: (p.terminalGroups ?? []).map((g) =>
                  g.id === action.groupId
                    ? { ...g, terminalIds: g.terminalIds.filter((id) => id !== action.terminalId) }
                    : g
                ),
              }
            : p
        ),
      };
    }

    case "REORDER_GROUPS": {
      return {
        ...state,
        projects: state.projects.map((p) => {
          if (p.id !== action.projectId) return p;
          const groups = [...(p.terminalGroups ?? [])];
          const [moved] = groups.splice(action.fromIndex, 1);
          groups.splice(action.toIndex, 0, moved);
          return { ...p, terminalGroups: groups };
        }),
      };
    }

    case "RESTORE_SESSION":
      return { ...state, ...action.state };

    default:
      return state;
  }
}

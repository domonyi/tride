import { AppState, AppAction } from "../types";
import { loadLayoutState } from "./localStorage";

const cached = loadLayoutState();

export const initialState: AppState = {
  projects: cached.projects ?? [],
  activeProjectId: cached.activeProjectId ?? null,
  activeTerminalId: null,
  gridLayout: cached.gridLayout ?? { rows: 2, cols: 2 },
  sidebarMode: cached.sidebarMode ?? "code",
  sidebarVisible: cached.sidebarVisible ?? true,
  sidebarWidth: cached.sidebarWidth ?? 340,
  lastOpenedFile: null,
  explorerVisible: cached.explorerVisible ?? true,
  explorerWidth: cached.explorerWidth ?? 180,
  scmChangesHeight: null,
  lastBrowserUrl: null,
  commitMessage: "",
  editorTheme: cached.editorTheme ?? "tokyo-night",
  defaultLlm: cached.defaultLlm ?? "none",
  customLlmCommand: cached.customLlmCommand ?? "",
  defaultShell: cached.defaultShell ?? (navigator.platform.startsWith("Win") ? "powershell" : "bash"),
};

export function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case "ADD_PROJECT":
      return {
        ...state,
        projects: [...state.projects, action.project],
        activeProjectId: action.project.id,
        activeTerminalId: null,
      };

    case "REMOVE_PROJECT": {
      const remaining = state.projects.filter((p) => p.id !== action.projectId);
      return {
        ...state,
        projects: remaining,
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
      return { ...state, activeProjectId: action.projectId, activeTerminalId: null };

    case "SET_ACTIVE_TERMINAL":
      return { ...state, activeTerminalId: action.terminalId };

    case "ADD_TERMINAL":
      return {
        ...state,
        projects: state.projects.map((p) =>
          p.id === action.projectId
            ? { ...p, terminals: [...p.terminals, action.terminal] }
            : p
        ),
        activeTerminalId: action.terminal.id,
      };

    case "REMOVE_TERMINAL":
      return {
        ...state,
        projects: state.projects.map((p) =>
          p.id === action.projectId
            ? { ...p, terminals: p.terminals.filter((t) => t.id !== action.terminalId) }
            : p
        ),
        activeTerminalId:
          state.activeTerminalId === action.terminalId ? null : state.activeTerminalId,
      };

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

    case "TOGGLE_EXPLORER":
      return { ...state, explorerVisible: !state.explorerVisible };

    case "SET_EXPLORER_WIDTH":
      return { ...state, explorerWidth: action.width };

    case "SET_SCM_CHANGES_HEIGHT":
      return { ...state, scmChangesHeight: action.height };

    case "SET_LAST_BROWSER_URL":
      return { ...state, lastBrowserUrl: action.url };

    case "SET_COMMIT_MESSAGE":
      return { ...state, commitMessage: action.message };

    case "SET_EDITOR_THEME":
      return { ...state, editorTheme: action.theme };

    case "SET_DEFAULT_LLM":
      return { ...state, defaultLlm: action.llm };

    case "SET_CUSTOM_LLM_COMMAND":
      return { ...state, customLlmCommand: action.command };

    case "SET_DEFAULT_SHELL":
      return { ...state, defaultShell: action.shell };

    case "RESTORE_SESSION":
      return { ...state, ...action.state };

    default:
      return state;
  }
}

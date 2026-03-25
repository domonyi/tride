import { AppState, AppAction } from "../types";

export const initialState: AppState = {
  projects: [],
  activeProjectId: null,
  activeTerminalId: null,
  gridLayout: { rows: 2, cols: 2 },
  sidebarMode: "code",
  sidebarVisible: true,
};

export function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case "ADD_PROJECT":
      return {
        ...state,
        projects: [...state.projects, action.project],
        activeProjectId: state.activeProjectId ?? action.project.id,
      };

    case "REMOVE_PROJECT":
      return {
        ...state,
        projects: state.projects.filter((p) => p.id !== action.projectId),
        activeProjectId:
          state.activeProjectId === action.projectId
            ? state.projects[0]?.id ?? null
            : state.activeProjectId,
      };

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

    case "RESTORE_SESSION":
      return { ...state, ...action.state };

    default:
      return state;
  }
}

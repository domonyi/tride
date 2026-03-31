import type { AppState, GridLayout, SidebarMode, DefaultLlm, DefaultShell, TabOverflowMode, TodoItem } from "../types";

const KEY = "tride-layout";

/**
 * Tier 1 state — layout-critical values read synchronously on startup.
 * Stored in localStorage for instant access before React's first render.
 */
export interface LayoutState {
  projects: AppState["projects"];
  activeProjectId: string | null;
  gridLayout: GridLayout;
  sidebarVisible: boolean;
  sidebarWidth: number;
  sidebarMode: SidebarMode;
  explorerVisible: boolean;
  explorerWidth: number;
  editorTheme: string;
  defaultLlm: DefaultLlm;
  customLlmCommand: string;
  defaultShell: DefaultShell;
  tabOverflowMode: TabOverflowMode;
  todos: TodoItem[];
}

export function loadLayoutState(): Partial<LayoutState> {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

export function saveLayoutState(state: AppState): void {
  try {
    const layout: LayoutState = {
      projects: state.projects.map((p) => ({
        ...p,
        terminals: p.terminals.map((t) => ({
          ...t,
          ptyId: null, // don't store PTY handles
          status: "idle" as const, // don't persist transient status
          hasActivity: false,
        })),
      })),
      activeProjectId: state.activeProjectId,
      gridLayout: state.gridLayout,
      sidebarVisible: state.sidebarVisible,
      sidebarWidth: state.sidebarWidth,
      sidebarMode: state.sidebarMode,
      explorerVisible: state.explorerVisible,
      explorerWidth: state.explorerWidth,
      editorTheme: state.editorTheme,
      defaultLlm: state.defaultLlm,
      customLlmCommand: state.customLlmCommand,
      defaultShell: state.defaultShell,
      tabOverflowMode: state.tabOverflowMode,
      todos: state.todos,
    };
    localStorage.setItem(KEY, JSON.stringify(layout));
  } catch {
    // localStorage full or unavailable — ignore
  }
}

import type { AppState, GridLayout, SidebarMode, DefaultLlm, DefaultShell, TabOverflowMode, TodoItem, PanesState, LlmPane, PaneChatHistory, ProjectTabGroup } from "../types";

const KEY = "tride-layout";

interface SavedPanesState {
  visible: boolean;
  panes: Record<string, LlmPane>;
  paneOrder: string[];
  paneCount: number;
  layoutId?: string;
  chatHistory: PaneChatHistory[];
}

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
  projectTabGroups: ProjectTabGroup[];
  todos: TodoItem[];
  panes: SavedPanesState;
}

export function loadLayoutState(): Partial<LayoutState> {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed.panes && parsed.arena) {
      parsed.panes = parsed.arena;
      delete parsed.arena;
    }
    if (parsed.panes && (!parsed.panes.paneOrder || !parsed.panes.panes)) {
      delete parsed.panes;
    }
    return parsed;
  } catch {
    return {};
  }
}

export function restorePanesState(saved: SavedPanesState): PanesState {
  const panes: Record<string, LlmPane> = {};
  let chatHistory = [...(saved.chatHistory ?? [])];

  for (const [id, sp] of Object.entries(saved.panes)) {
    const hadSession = sp.origin && sp.origin !== "empty";

    if (hadSession) {
      // Save previous session to history before resetting
      const alreadyInHistory = chatHistory.some((h) => h.id === (sp.chatHistoryId ?? id));
      if (!alreadyInHistory) {
        chatHistory.unshift({
          id: sp.chatHistoryId ?? id,
          name: sp.label || "Previous session",
          timestamp: Date.now(),
          origin: sp.origin === "worktree" ? "worktree" : "local",
          branch: sp.branch,
          sessionId: `pane-${id}`,
          sdkSessionId: sp.sdkSessionId,
        });
      }
    }

    // Reset all panes to empty on restore — Claude sessions can't survive restart
    panes[id] = {
      id: sp.id ?? id,
      index: sp.index ?? 0,
      label: "",
      origin: "empty",
      worktreeSetup: false,
    };
  }

  return {
    visible: saved.visible,
    panes,
    paneOrder: saved.paneOrder,
    paneCount: saved.paneCount,
    layoutId: saved.layoutId ?? "2-cols",
    activePaneId: null,
    lastActivePaneId: null,
    broadcastOpen: false,
    broadcastTargets: [...saved.paneOrder],
    broadcastDraft: "",
    chatHistory,
  };
}

export function saveLayoutState(state: AppState): void {
  try {
    const layout: LayoutState = {
      projects: state.projects.map((p) => ({
        ...p,
        terminals: p.terminals.map((t) => ({
          ...t,
          ptyId: null,
          status: "idle" as const,
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
      projectTabGroups: state.projectTabGroups,
      todos: state.todos,
      panes: {
        visible: state.panes.visible,
        panes: state.panes.panes,
        paneOrder: state.panes.paneOrder,
        paneCount: state.panes.paneCount,
        layoutId: state.panes.layoutId,
        chatHistory: state.panes.chatHistory,
      },
    };
    localStorage.setItem(KEY, JSON.stringify(layout));
  } catch {
    // localStorage full or unavailable
  }
}

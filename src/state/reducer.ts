import { AppState, AppAction, ClaudeSession, ClaudeMessage, LlmPane, PanesState, PaneChatHistory, ProjectTabGroup } from "../types";
import { loadLayoutState, restorePanesState } from "./localStorage";
import { IS_WINDOWS } from "../utils/platform";
import { getLayout, DEFAULT_LAYOUT_ID } from "../utils/paneUtils";

// ── Panes Helpers ───────────────────────────────────────────────────────

function createLlmPane(index: number): LlmPane {
  return {
    id: crypto.randomUUID(),
    index,
    label: "",
    origin: "empty",
  };
}

function createInitialPanesState(): PanesState {
  const p1 = createLlmPane(0);
  const p2 = createLlmPane(1);
  return {
    visible: false,
    panes: { [p1.id]: p1, [p2.id]: p2 },
    paneOrder: [p1.id, p2.id],
    paneCount: 2,
    layoutId: DEFAULT_LAYOUT_ID,
    activePaneId: null,
    lastActivePaneId: null,
    broadcastOpen: false,
    broadcastTargets: [p1.id, p2.id],
    broadcastDraft: "",
    chatHistory: [],
  };
}

function updateLlmPane(ps: PanesState, paneId: string, updates: Partial<LlmPane>): PanesState {
  const pane = ps.panes[paneId];
  if (!pane) return ps;
  return {
    ...ps,
    panes: { ...ps.panes, [paneId]: { ...pane, ...updates } },
  };
}

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
  projectTabGroups: cached.projectTabGroups ?? [],
  expandedFolders: {},
  todos: cached.todos ?? [],
  claudeSessions: {},
  panes: cached.panes ? restorePanesState(cached.panes) : createInitialPanesState(),
  terminalDrawerOpen: false,
  terminalDrawerHeight: 250,
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
      // Remove from any tab group
      const cleanedGroups = state.projectTabGroups
        .map((g) => ({ ...g, projectIds: g.projectIds.filter((id) => id !== action.projectId) }))
        .filter((g) => g.projectIds.length > 0);
      return {
        ...state,
        projects: remaining,
        commitMessages: remainingMessages,
        projectTabGroups: cleanedGroups,
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

    // ── Project Tab Groups (Chrome-style) ──────────────────────────────

    case "CREATE_PROJECT_GROUP": {
      const group: ProjectTabGroup = {
        id: crypto.randomUUID(),
        name: action.name,
        projectIds: action.projectIds,
        collapsed: false,
      };
      // Remove these projects from any existing groups
      const updatedGroups = state.projectTabGroups.map((g) => ({
        ...g,
        projectIds: g.projectIds.filter((id) => !action.projectIds.includes(id)),
      }));
      // Ensure grouped projects are contiguous in the projects array
      const groupedSet = new Set(action.projectIds);
      const groupedProjects = state.projects.filter((p) => groupedSet.has(p.id));
      const ungroupedBefore = state.projects.filter(
        (p) => !groupedSet.has(p.id) &&
          state.projects.indexOf(p) <= state.projects.findIndex((pp) => groupedSet.has(pp.id))
      );
      const ungroupedAfter = state.projects.filter(
        (p) => !groupedSet.has(p.id) && !ungroupedBefore.includes(p)
      );
      return {
        ...state,
        projects: [...ungroupedBefore, ...groupedProjects, ...ungroupedAfter],
        projectTabGroups: [...updatedGroups.filter((g) => g.projectIds.length > 0), group],
      };
    }

    case "REMOVE_PROJECT_GROUP": {
      return {
        ...state,
        projectTabGroups: state.projectTabGroups.filter((g) => g.id !== action.groupId),
      };
    }

    case "RENAME_PROJECT_GROUP": {
      return {
        ...state,
        projectTabGroups: state.projectTabGroups.map((g) =>
          g.id === action.groupId ? { ...g, name: action.name } : g
        ),
      };
    }

    case "TOGGLE_PROJECT_GROUP_COLLAPSE": {
      return {
        ...state,
        projectTabGroups: state.projectTabGroups.map((g) =>
          g.id === action.groupId ? { ...g, collapsed: !g.collapsed } : g
        ),
      };
    }

    case "ADD_TO_PROJECT_GROUP": {
      // Remove from other groups first
      let groups = state.projectTabGroups.map((g) => ({
        ...g,
        projectIds: g.projectIds.filter((id) => id !== action.projectId),
      }));
      // Add to target group
      groups = groups.map((g) =>
        g.id === action.groupId
          ? { ...g, projectIds: [...g.projectIds, action.projectId] }
          : g
      );
      return { ...state, projectTabGroups: groups };
    }

    case "REMOVE_FROM_PROJECT_GROUP": {
      const groups = state.projectTabGroups.map((g) =>
        g.id === action.groupId
          ? { ...g, projectIds: g.projectIds.filter((id) => id !== action.projectId) }
          : g
      ).filter((g) => g.projectIds.length > 0);
      return { ...state, projectTabGroups: groups };
    }

    case "UNGROUP_PROJECT_GROUP": {
      return {
        ...state,
        projectTabGroups: state.projectTabGroups.filter((g) => g.id !== action.groupId),
      };
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

    // ── Claude Session Actions ──────────────────────────────────────────

    case "CLAUDE_SESSION_STARTED": {
      const existing = state.claudeSessions[action.sessionId];
      if (existing) {
        // Session already exists (created optimistically) — just update metadata
        return {
          ...state,
          claudeSessions: {
            ...state.claudeSessions,
            [action.sessionId]: {
              ...existing,
              sdkSessionId: action.sdkSessionId || existing.sdkSessionId,
              model: action.model || existing.model,
            },
          },
        };
      }
      const session: ClaudeSession = {
        sessionId: action.sessionId,
        sdkSessionId: action.sdkSessionId,
        model: action.model,
        messages: [],
        status: "idle",
        streamingText: "",
        streamingThinking: "",
        pendingApprovals: [],
        totalCost: 0,
      };
      return { ...state, claudeSessions: { ...state.claudeSessions, [action.sessionId]: session } };
    }

    case "CLAUDE_USER_MESSAGE": {
      const cs = state.claudeSessions[action.sessionId];
      if (!cs) return state;
      const msg: ClaudeMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content: action.text,
        toolCalls: [],
        timestamp: Date.now(),
      };
      return {
        ...state,
        claudeSessions: {
          ...state.claudeSessions,
          [action.sessionId]: { ...cs, messages: [...cs.messages, msg] },
        },
      };
    }

    case "CLAUDE_TEXT_DELTA": {
      const cs = state.claudeSessions[action.sessionId];
      if (!cs) return state;
      return {
        ...state,
        claudeSessions: {
          ...state.claudeSessions,
          [action.sessionId]: { ...cs, streamingText: cs.streamingText + action.text },
        },
      };
    }

    case "CLAUDE_THINKING_DELTA": {
      const cs = state.claudeSessions[action.sessionId];
      if (!cs) return state;
      return {
        ...state,
        claudeSessions: {
          ...state.claudeSessions,
          [action.sessionId]: { ...cs, streamingThinking: cs.streamingThinking + action.text },
        },
      };
    }

    case "CLAUDE_TEXT_DONE": {
      const cs = state.claudeSessions[action.sessionId];
      if (!cs) return state;
      const msg: ClaudeMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: action.text,
        thinking: cs.streamingThinking || undefined,
        toolCalls: [],
        timestamp: Date.now(),
      };
      return {
        ...state,
        claudeSessions: {
          ...state.claudeSessions,
          [action.sessionId]: {
            ...cs,
            messages: [...cs.messages, msg],
            streamingText: "",
            streamingThinking: "",
          },
        },
      };
    }

    case "CLAUDE_TOOL_USE_START": {
      const cs = state.claudeSessions[action.sessionId];
      if (!cs) return state;
      const msgs = [...cs.messages];
      let lastAssistantIdx = -1;
      let lastUserIdx = -1;
      for (let j = msgs.length - 1; j >= 0; j--) {
        if (lastAssistantIdx === -1 && msgs[j].role === "assistant") lastAssistantIdx = j;
        if (lastUserIdx === -1 && msgs[j].role === "user") lastUserIdx = j;
        if (lastAssistantIdx !== -1 && lastUserIdx !== -1) break;
      }
      // If there's a user message after the last assistant message (or no assistant at all),
      // create a new assistant message for this tool call instead of appending to the old one.
      if (lastAssistantIdx === -1 || lastUserIdx > lastAssistantIdx) {
        const newMsg: ClaudeMessage = {
          id: crypto.randomUUID(),
          role: "assistant",
          content: "",
          toolCalls: [action.toolCall],
          timestamp: Date.now(),
        };
        msgs.push(newMsg);
      } else {
        const lastAssistant = msgs[lastAssistantIdx];
        msgs[lastAssistantIdx] = { ...lastAssistant, toolCalls: [...lastAssistant.toolCalls, action.toolCall] };
      }
      return {
        ...state,
        claudeSessions: {
          ...state.claudeSessions,
          [action.sessionId]: { ...cs, messages: msgs },
        },
      };
    }

    case "CLAUDE_TOOL_APPROVAL_REQUIRED": {
      const cs = state.claudeSessions[action.sessionId];
      if (!cs) return state;
      const projects = state.projects.map((p) => ({
        ...p,
        terminals: p.terminals.map((t) =>
          t.claudeSessionId === action.sessionId ? { ...t, status: "waiting" as const } : t
        ),
      }));
      return {
        ...state,
        projects,
        claudeSessions: {
          ...state.claudeSessions,
          [action.sessionId]: {
            ...cs,
            pendingApprovals: [...cs.pendingApprovals, action.toolCall],
            status: "waiting",
          },
        },
      };
    }

    case "CLAUDE_TOOL_APPROVED": {
      const cs = state.claudeSessions[action.sessionId];
      if (!cs) return state;
      // Update tool status in messages to "running" so the spinner shows correctly
      const msgs = cs.messages.map((m) => {
        if (!m.toolCalls.some((tc) => tc.toolUseId === action.toolUseId)) return m;
        return {
          ...m,
          toolCalls: m.toolCalls.map((tc) =>
            tc.toolUseId === action.toolUseId
              ? { ...tc, status: "running" as const }
              : tc
          ),
        };
      });
      return {
        ...state,
        claudeSessions: {
          ...state.claudeSessions,
          [action.sessionId]: {
            ...cs,
            messages: msgs,
            pendingApprovals: cs.pendingApprovals.filter((t) => t.toolUseId !== action.toolUseId),
          },
        },
      };
    }

    case "CLAUDE_TOOL_DENIED": {
      const cs = state.claudeSessions[action.sessionId];
      if (!cs) return state;
      // Update tool status in messages to "denied"
      const deniedMsgs = cs.messages.map((m) => {
        if (!m.toolCalls.some((tc) => tc.toolUseId === action.toolUseId)) return m;
        return {
          ...m,
          toolCalls: m.toolCalls.map((tc) =>
            tc.toolUseId === action.toolUseId
              ? { ...tc, status: "denied" as const }
              : tc
          ),
        };
      });
      return {
        ...state,
        claudeSessions: {
          ...state.claudeSessions,
          [action.sessionId]: {
            ...cs,
            messages: deniedMsgs,
            pendingApprovals: cs.pendingApprovals.filter((t) => t.toolUseId !== action.toolUseId),
          },
        },
      };
    }

    case "CLAUDE_TOOL_DONE": {
      const cs = state.claudeSessions[action.sessionId];
      if (!cs) return state;
      // Update tool call status in messages
      const msgs = cs.messages.map((m) => {
        if (!m.toolCalls.some((tc) => tc.toolUseId === action.toolUseId)) return m;
        return {
          ...m,
          toolCalls: m.toolCalls.map((tc) =>
            tc.toolUseId === action.toolUseId
              ? { ...tc, status: "done" as const, output: action.output }
              : tc
          ),
        };
      });
      return {
        ...state,
        claudeSessions: {
          ...state.claudeSessions,
          [action.sessionId]: { ...cs, messages: msgs },
        },
      };
    }

    case "CLAUDE_TOOL_INPUT_DELTA": {
      // Could accumulate streaming tool input — for now just skip
      return state;
    }

    case "CLAUDE_STATUS_CHANGE": {
      const cs = state.claudeSessions[action.sessionId];
      if (!cs) return state;
      // Also sync status to any terminal linked to this session
      const projects = state.projects.map((p) => ({
        ...p,
        terminals: p.terminals.map((t) =>
          t.claudeSessionId === action.sessionId ? { ...t, status: action.status } : t
        ),
      }));
      return {
        ...state,
        projects,
        claudeSessions: {
          ...state.claudeSessions,
          [action.sessionId]: { ...cs, status: action.status },
        },
      };
    }

    case "CLAUDE_TURN_COMPLETE": {
      const cs = state.claudeSessions[action.sessionId];
      if (!cs) return state;
      // Flush any remaining streaming text as a message
      let msgs = cs.messages;
      if (cs.streamingText) {
        msgs = [...msgs, {
          id: crypto.randomUUID(),
          role: "assistant" as const,
          content: cs.streamingText,
          thinking: cs.streamingThinking || undefined,
          toolCalls: [],
          timestamp: Date.now(),
        }];
      }
      // Safety net: mark any tools still "running" or "approved" as "done"
      // so the spinner doesn't get stuck if tool_use_done was never received.
      msgs = msgs.map((m) => ({
        ...m,
        toolCalls: m.toolCalls.map((tc) =>
          tc.status === "running" || tc.status === "approved"
            ? { ...tc, status: "done" as const }
            : tc
        ),
      }));
      const projects = state.projects.map((p) => ({
        ...p,
        terminals: p.terminals.map((t) =>
          t.claudeSessionId === action.sessionId ? { ...t, status: "idle" as const } : t
        ),
      }));
      return {
        ...state,
        projects,
        claudeSessions: {
          ...state.claudeSessions,
          [action.sessionId]: {
            ...cs,
            messages: msgs,
            streamingText: "",
            streamingThinking: "",
            status: "idle",
            totalCost: action.totalCost ?? cs.totalCost,
            inputTokens: action.inputTokens ?? cs.inputTokens,
            outputTokens: action.outputTokens ?? cs.outputTokens,
          },
        },
      };
    }

    case "CLAUDE_ERROR": {
      const cs = state.claudeSessions[action.sessionId];
      if (!cs) return state;
      const errMsg: ClaudeMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: `Error: ${action.message}`,
        toolCalls: [],
        timestamp: Date.now(),
      };
      return {
        ...state,
        claudeSessions: {
          ...state.claudeSessions,
          [action.sessionId]: {
            ...cs,
            messages: [...cs.messages, errMsg],
            status: "error",
          },
        },
      };
    }

    case "CLAUDE_REMOVE_SESSION": {
      const { [action.sessionId]: _, ...rest } = state.claudeSessions;
      return { ...state, claudeSessions: rest };
    }

    case "RESTORE_SESSION":
      return { ...state, ...action.state };

    case "TOGGLE_TERMINAL_DRAWER":
      return { ...state, terminalDrawerOpen: !state.terminalDrawerOpen };

    case "SET_TERMINAL_DRAWER_HEIGHT":
      return { ...state, terminalDrawerHeight: Math.max(100, Math.min(600, action.height)) };

    // ── Panes Actions ──────────────────────────────────────────────────

    case "PANES_SET_LAYOUT": {
      const layout = getLayout(action.layoutId);
      const count = layout.paneCount;
      const ps = state.panes;
      let { panes, paneOrder, broadcastTargets } = ps;

      if (count > ps.paneCount) {
        panes = { ...panes };
        paneOrder = [...paneOrder];
        broadcastTargets = [...broadcastTargets];
        for (let i = ps.paneCount; i < count; i++) {
          const p = createLlmPane(i);
          panes[p.id] = p;
          paneOrder.push(p.id);
          broadcastTargets.push(p.id);
        }
      } else if (count < ps.paneCount) {
        const removed = new Set(paneOrder.slice(count));
        paneOrder = paneOrder.slice(0, count);
        panes = { ...panes };
        for (const id of removed) delete panes[id];
        broadcastTargets = broadcastTargets.filter((id) => !removed.has(id));
      }

      return {
        ...state,
        panes: {
          ...ps,
          panes,
          paneOrder,
          paneCount: count,
          layoutId: action.layoutId,
          broadcastTargets,
          activePaneId: ps.activePaneId && panes[ps.activePaneId] ? ps.activePaneId : null,
          lastActivePaneId: ps.lastActivePaneId && panes[ps.lastActivePaneId] ? ps.lastActivePaneId : null,
        },
      };
    }

    case "PANES_SET_ACTIVE_PANE":
      return {
        ...state,
        panes: {
          ...state.panes,
          activePaneId: action.paneId,
          lastActivePaneId: action.paneId,
        },
      };

    case "PANES_CLEAR_FOCUS":
      return {
        ...state,
        panes: { ...state.panes, activePaneId: null },
      };

    case "PANES_TOGGLE_BROADCAST":
      return {
        ...state,
        panes: {
          ...state.panes,
          broadcastOpen: !state.panes.broadcastOpen,
          broadcastTargets: !state.panes.broadcastOpen ? [...state.panes.paneOrder] : state.panes.broadcastTargets,
        },
      };

    case "PANES_CLOSE_BROADCAST":
      return { ...state, panes: { ...state.panes, broadcastOpen: false, broadcastDraft: "" } };

    case "PANES_SET_BROADCAST_DRAFT":
      return { ...state, panes: { ...state.panes, broadcastDraft: action.text } };

    case "PANES_TOGGLE_BROADCAST_TARGET": {
      const targets = state.panes.broadcastTargets;
      const has = targets.includes(action.paneId);
      return {
        ...state,
        panes: {
          ...state.panes,
          broadcastTargets: has ? targets.filter((id) => id !== action.paneId) : [...targets, action.paneId],
        },
      };
    }

    case "PANES_SELECT_ALL_TARGETS":
      return { ...state, panes: { ...state.panes, broadcastTargets: [...state.panes.paneOrder] } };

    case "PANES_START_LOCAL": {
      const pane = state.panes.panes[action.paneId];
      if (!pane) return state;
      const historyId = crypto.randomUUID();
      const entry: PaneChatHistory = {
        id: historyId,
        name: "New Chat",
        timestamp: Date.now(),
        origin: "local",
        sessionId: `pane-${pane.id}`,
      };
      // Mark this project as active in the pane so switching back shows the chat
      const sdkSessionIds = { ...(pane.sdkSessionIds ?? {}) };
      if (action.projectId) {
        sdkSessionIds[action.projectId] = sdkSessionIds[action.projectId] ?? "";
      }
      return {
        ...state,
        panes: {
          ...updateLlmPane(state.panes, action.paneId, {
            origin: "local",
            label: "New Chat",
            chatHistoryId: historyId,
            worktreeSetup: false,
            sdkSessionIds,
          }),
          chatHistory: [entry, ...state.panes.chatHistory],
        },
      };
    }

    case "PANES_CLEAR_PANE": {
      const pane = state.panes.panes[action.paneId];
      if (!pane) return state;
      // Save to history if it had a session
      let chatHistory = state.panes.chatHistory;
      if (pane.origin !== "empty") {
        const entry: PaneChatHistory = {
          id: pane.chatHistoryId ?? crypto.randomUUID(),
          name: pane.label || "Untitled",
          timestamp: Date.now(),
          origin: pane.origin === "worktree" ? "worktree" : "local",
          branch: pane.branch,
          sessionId: `pane-${pane.id}`,
          sdkSessionId: pane.sdkSessionId,
        };
        const existingIdx = chatHistory.findIndex((h) => h.id === entry.id);
        if (existingIdx >= 0) {
          chatHistory = [...chatHistory];
          chatHistory[existingIdx] = entry;
        } else {
          chatHistory = [entry, ...chatHistory];
        }
      }
      return {
        ...state,
        panes: {
          ...updateLlmPane(state.panes, action.paneId, {
            origin: "empty",
            label: "",
            branch: undefined,
            worktreePath: undefined,
            chatHistoryId: undefined,
            worktreeSetup: false,
          }),
          chatHistory,
        },
      };
    }

    case "PANES_CLEAR_ALL": {
      let chatHistory = [...state.panes.chatHistory];
      const panes = { ...state.panes.panes };
      for (const id of state.panes.paneOrder) {
        const pane = panes[id];
        if (pane.origin !== "empty") {
          const entry: PaneChatHistory = {
            id: pane.chatHistoryId ?? crypto.randomUUID(),
            name: pane.label || "Untitled",
            timestamp: Date.now(),
            origin: pane.origin === "worktree" ? "worktree" : "local",
            branch: pane.branch,
            sessionId: `pane-${pane.id}`,
          };
          const existingIdx = chatHistory.findIndex((h) => h.id === entry.id);
          if (existingIdx >= 0) {
            chatHistory[existingIdx] = entry;
          } else {
            chatHistory = [entry, ...chatHistory];
          }
        }
        panes[id] = { ...pane, origin: "empty", label: "", branch: undefined, worktreePath: undefined, chatHistoryId: undefined, worktreeSetup: false };
      }
      return {
        ...state,
        panes: {
          ...state.panes,
          panes,
          chatHistory,
          activePaneId: null,
          lastActivePaneId: null,
          broadcastOpen: false,
          broadcastDraft: "",
        },
      };
    }

    case "PANES_START_WORKTREE_SETUP":
      return { ...state, panes: updateLlmPane(state.panes, action.paneId, { worktreeSetup: true }) };

    case "PANES_CANCEL_WORKTREE_SETUP":
      return { ...state, panes: updateLlmPane(state.panes, action.paneId, { worktreeSetup: false }) };

    case "PANES_CREATE_WORKTREE": {
      const pane = state.panes.panes[action.paneId];
      if (!pane) return state;
      const worktreePath = `/tmp/tride-worktrees/${action.branch}`;
      const wtHistoryId = crypto.randomUUID();
      const wtEntry: PaneChatHistory = {
        id: wtHistoryId,
        name: action.branch,
        timestamp: Date.now(),
        origin: "worktree",
        branch: action.branch,
        sessionId: `pane-${pane.id}`,
      };
      return {
        ...state,
        panes: {
          ...updateLlmPane(state.panes, action.paneId, {
            origin: "worktree",
            branch: action.branch,
            worktreePath,
            worktreeSetup: false,
            label: action.branch,
            chatHistoryId: wtHistoryId,
          }),
          chatHistory: [wtEntry, ...state.panes.chatHistory],
        },
      };
    }

    case "PANES_RESUME_CHAT": {
      const pane = state.panes.panes[action.paneId];
      const historyEntry = state.panes.chatHistory.find((h) => h.id === action.historyId);
      if (!pane || !historyEntry) return state;
      // Populate sdkSessionIds for the active project so the hasSession check works
      const projectId = state.activeProjectId ?? "default";
      const sdkSessionIds = { ...(pane.sdkSessionIds ?? {}) };
      if (historyEntry.sdkSessionId) {
        sdkSessionIds[projectId] = historyEntry.sdkSessionId;
      }
      return {
        ...state,
        panes: updateLlmPane(state.panes, action.paneId, {
          origin: historyEntry.origin === "worktree" ? "worktree" : "local",
          label: historyEntry.name,
          branch: historyEntry.branch,
          chatHistoryId: historyEntry.id,
          sdkSessionId: historyEntry.sdkSessionId,
          sdkSessionIds,
          worktreeSetup: false,
        }),
      };
    }

    case "PANES_DELETE_HISTORY":
      return {
        ...state,
        panes: {
          ...state.panes,
          chatHistory: state.panes.chatHistory.filter((h) => h.id !== action.historyId),
        },
      };

    case "PANES_SET_SDK_SESSION_ID": {
      const pane = state.panes.panes[action.paneId];
      const perProjectIds = { ...(pane?.sdkSessionIds ?? {}) };
      if (action.projectId) {
        perProjectIds[action.projectId] = action.sdkSessionId;
      }
      const updatedPs = updateLlmPane(state.panes, action.paneId, {
        sdkSessionId: action.sdkSessionId,
        sdkSessionIds: perProjectIds,
      });
      // Also update the matching history entry
      const p = updatedPs.panes[action.paneId];
      if (p?.chatHistoryId) {
        const hIdx = updatedPs.chatHistory.findIndex((h) => h.id === p.chatHistoryId);
        if (hIdx >= 0) {
          const updatedHistory = [...updatedPs.chatHistory];
          updatedHistory[hIdx] = { ...updatedHistory[hIdx], sdkSessionId: action.sdkSessionId, timestamp: Date.now() };
          return { ...state, panes: { ...updatedPs, chatHistory: updatedHistory } };
        }
      }
      return { ...state, panes: updatedPs };
    }

    case "PANES_UPDATE_LABEL": {
      const updatedPs = updateLlmPane(state.panes, action.paneId, { label: action.label });
      // Also update the matching history entry name
      const p = updatedPs.panes[action.paneId];
      if (p?.chatHistoryId) {
        const hIdx = updatedPs.chatHistory.findIndex((h) => h.id === p.chatHistoryId);
        if (hIdx >= 0) {
          const updatedHistory = [...updatedPs.chatHistory];
          updatedHistory[hIdx] = { ...updatedHistory[hIdx], name: action.label, timestamp: Date.now() };
          return { ...state, panes: { ...updatedPs, chatHistory: updatedHistory } };
        }
      }
      return { ...state, panes: updatedPs };
    }

    default:
      return state;
  }
}

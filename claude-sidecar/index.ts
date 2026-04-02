import { query } from "@anthropic-ai/claude-agent-sdk";
import { createInterface } from "readline";

// ── Types ─────────────────────────────────────────────────────────────────

interface StartCommand {
  type: "start";
  sessionId: string;
  cwd: string;
  prompt: string;
  model?: string;
  resumeSessionId?: string;
}

interface SendCommand {
  type: "send";
  sessionId: string;
  message: string;
}

interface ApproveCommand {
  type: "approve";
  sessionId: string;
  toolUseId: string;
}

interface DenyCommand {
  type: "deny";
  sessionId: string;
  toolUseId: string;
  reason?: string;
}

interface AbortCommand {
  type: "abort";
  sessionId: string;
}

interface KillCommand {
  type: "kill";
  sessionId: string;
}

type SidecarCommand = StartCommand | SendCommand | ApproveCommand | DenyCommand | AbortCommand | KillCommand;

// ── Session Management ────────────────────────────────────────────────────

interface PendingApproval {
  resolve: (result: { behavior: "allow" } | { behavior: "deny"; message: string }) => void;
}

interface Session {
  cwd: string;
  model?: string;
  sdkSessionId?: string;
  abortController: AbortController;
  pendingApprovals: Map<string, PendingApproval>;
  running: boolean;
}

const sessions = new Map<string, Session>();

function emit(event: Record<string, unknown>) {
  process.stdout.write(JSON.stringify(event) + "\n");
}

// Run a single query turn (string prompt). For multi-turn, we resume the SDK session.
async function runTurn(sessionId: string, prompt: string) {
  const session = sessions.get(sessionId);
  if (!session) return;
  if (session.running) {
    emit({ type: "error", sessionId, message: "Session is already processing a turn" });
    return;
  }

  session.running = true;
  session.abortController = new AbortController();

  const opts: Record<string, any> = {
    cwd: session.cwd,
    model: session.model,
    abortController: session.abortController,
    includePartialMessages: true,
    permissionMode: "default",
    canUseTool: async (toolName: string, input: any, options: any) => {
      const toolUseId = options.toolUseID;
      emit({
        type: "tool_approval_required",
        sessionId,
        toolUseId,
        toolName,
        input,
        title: options.title,
        description: options.description,
      });
      return new Promise<any>((resolve) => {
        session.pendingApprovals.set(toolUseId, { resolve });
      });
    },
  };

  // Resume existing session for multi-turn
  if (session.sdkSessionId) {
    opts.resume = session.sdkSessionId;
  }

  try {
    const q = query({ prompt, options: opts });

    for await (const message of q) {
      switch (message.type) {
        case "assistant": {
          const content = message.message?.content;
          if (Array.isArray(content)) {
            for (const block of content) {
              if (block.type === "text") {
                emit({ type: "text_done", sessionId, text: block.text });
              } else if (block.type === "tool_use") {
                emit({
                  type: "tool_use_start",
                  sessionId,
                  toolUseId: block.id,
                  toolName: block.name,
                  input: block.input,
                });
              }
            }
          }
          break;
        }

        case "stream_event": {
          const event = message.event;
          if (event.type === "content_block_delta") {
            const delta = (event as any).delta;
            if (delta?.type === "text_delta") {
              emit({ type: "text_delta", sessionId, text: delta.text });
            } else if (delta?.type === "thinking_delta") {
              emit({ type: "thinking_delta", sessionId, text: delta.thinking });
            } else if (delta?.type === "input_json_delta") {
              emit({ type: "tool_input_delta", sessionId, delta: delta.partial_json });
            }
          }
          break;
        }

        case "result": {
          if (message.subtype === "success") {
            emit({
              type: "turn_complete",
              sessionId,
              result: (message as any).result,
              totalCost: (message as any).total_cost_usd,
              durationMs: (message as any).duration_ms,
              numTurns: (message as any).num_turns,
            });
          } else {
            emit({
              type: "error",
              sessionId,
              message: (message as any).errors?.join(", ") ?? `Error: ${message.subtype}`,
            });
          }
          break;
        }

        case "system": {
          const subtype = (message as any).subtype;
          if (subtype === "init") {
            // Capture the SDK session ID for future resume
            session.sdkSessionId = (message as any).session_id;
            emit({
              type: "session_started",
              sessionId,
              sdkSessionId: session.sdkSessionId,
              model: (message as any).model,
            });
          } else if (subtype === "session_state_changed") {
            const sdkState = (message as any).state as string;
            const statusMap: Record<string, string> = {
              idle: "idle",
              running: "running",
              requires_action: "waiting",
            };
            emit({
              type: "status_change",
              sessionId,
              status: statusMap[sdkState] ?? sdkState,
            });
          }
          break;
        }

        case "tool_use_summary": {
          emit({
            type: "tool_use_done",
            sessionId,
            toolUseId: (message as any).tool_use_id,
            toolName: (message as any).tool_name,
            output: (message as any).output,
          });
          break;
        }
      }
    }
  } catch (err: any) {
    if (err.name !== "AbortError") {
      emit({ type: "error", sessionId, message: String(err) });
    }
  } finally {
    session.running = false;
  }
}

function handleCommand(cmd: SidecarCommand) {
  switch (cmd.type) {
    case "start": {
      const session: Session = {
        cwd: cmd.cwd,
        model: cmd.model,
        sdkSessionId: cmd.resumeSessionId,
        abortController: new AbortController(),
        pendingApprovals: new Map(),
        running: false,
      };
      sessions.set(cmd.sessionId, session);
      emit({ type: "session_started", sessionId: cmd.sessionId, sdkSessionId: cmd.resumeSessionId ?? cmd.sessionId });
      runTurn(cmd.sessionId, cmd.prompt);
      break;
    }

    case "send": {
      const session = sessions.get(cmd.sessionId);
      if (!session) {
        emit({ type: "error", sessionId: cmd.sessionId, message: "Session not found" });
        return;
      }
      runTurn(cmd.sessionId, cmd.message);
      break;
    }

    case "approve": {
      const session = sessions.get(cmd.sessionId);
      if (!session) return;
      const pending = session.pendingApprovals.get(cmd.toolUseId);
      if (pending) {
        pending.resolve({ behavior: "allow" });
        session.pendingApprovals.delete(cmd.toolUseId);
      }
      break;
    }

    case "deny": {
      const session = sessions.get(cmd.sessionId);
      if (!session) return;
      const pending = session.pendingApprovals.get(cmd.toolUseId);
      if (pending) {
        pending.resolve({ behavior: "deny", message: cmd.reason ?? "User denied" });
        session.pendingApprovals.delete(cmd.toolUseId);
      }
      break;
    }

    case "abort": {
      const session = sessions.get(cmd.sessionId);
      if (session) {
        session.abortController.abort();
      }
      break;
    }

    case "kill": {
      const session = sessions.get(cmd.sessionId);
      if (session) {
        session.abortController.abort();
        sessions.delete(cmd.sessionId);
      }
      break;
    }
  }
}

// ── Stdin Reader ──────────────────────────────────────────────────────────

const rl = createInterface({ input: process.stdin });

rl.on("line", (line) => {
  try {
    const cmd = JSON.parse(line) as SidecarCommand;
    handleCommand(cmd);
  } catch (err) {
    emit({ type: "error", sessionId: "", message: `Invalid command: ${err}` });
  }
});

rl.on("close", () => {
  for (const [, session] of sessions) {
    session.abortController.abort();
  }
  process.exit(0);
});

process.on("uncaughtException", (err) => {
  emit({ type: "error", sessionId: "*", message: `Uncaught: ${err.message}` });
});

process.on("unhandledRejection", (err) => {
  emit({ type: "error", sessionId: "*", message: `Unhandled rejection: ${err}` });
});

emit({ type: "ready" });

import { useEffect, useRef, useCallback } from "react";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { SerializeAddon } from "@xterm/addon-serialize";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import type { ClaudeToolCall } from "../types";
import {
  applyClaudeEvent,
  drainClaudeBuffer,
  markClaudeActive,
  markClaudeInactive,
  restoreClaudeScreen,
  saveClaudeScreen,
  type ClaudeEventCallbacks,
} from "../claudeBuffer";

interface ClaudeEventPayload {
  data: string;
}

interface HistoryMessage {
  role: "user" | "assistant";
  text: string;
}

/** Read a Claude SDK session JSONL and extract user/assistant messages */
async function loadSessionHistory(sdkSessionId: string, cwd: string): Promise<HistoryMessage[]> {
  try {
    const homeDir = await invoke<string>("get_home_dir");
    // Encode project path: C:\DEV\Tride -> C--DEV-Tride
    const normalized = cwd.replace(/\\/g, "/");
    const encoded = normalized.replace(/:/g, "-").replace(/\//g, "-");
    const jsonlPath = `${homeDir}/.claude/projects/${encoded}/${sdkSessionId}.jsonl`;

    const content = await invoke<string>("read_file", { path: jsonlPath });
    const lines = content.split("\n").filter(Boolean);
    const messages: HistoryMessage[] = [];
    const seenTexts = new Set<string>();

    for (const line of lines) {
      try {
        const obj = JSON.parse(line);
        if (obj.type === "user" && obj.message?.content) {
          const text = typeof obj.message.content === "string"
            ? obj.message.content
            : "";
          if (text && !seenTexts.has(`u:${text}`)) {
            seenTexts.add(`u:${text}`);
            messages.push({ role: "user", text });
          }
        } else if (obj.type === "assistant" && Array.isArray(obj.message?.content)) {
          for (const block of obj.message.content) {
            if (block.type === "text" && block.text) {
              const key = `a:${block.text}`;
              if (!seenTexts.has(key)) {
                seenTexts.add(key);
                messages.push({ role: "assistant", text: block.text });
              }
            }
          }
        }
      } catch {
        // skip malformed lines
      }
    }

    return messages;
  } catch {
    return [];
  }
}

interface UseClaudeTerminalOptions {
  sessionId: string;
  cwd: string;
  isActive?: boolean;
  resumeSessionId?: string;
  onStatusChange?: (status: string) => void;
  onToolApproval?: (toolCall: ClaudeToolCall) => void;
  onToolApprovalResolved?: (toolUseId: string) => void;
  onTurnComplete?: (totalCost: number) => void;
  onModelInfo?: (model: string) => void;
  onSdkSessionId?: (sdkSessionId: string) => void;
  onError?: (message: string) => void;
  onFirstMessage?: (text: string) => void;
}

export function useClaudeTerminal({
  sessionId,
  cwd,
  isActive,
  resumeSessionId,
  onStatusChange,
  onToolApproval,
  onToolApprovalResolved,
  onTurnComplete,
  onModelInfo,
  onSdkSessionId,
  onError,
  onFirstMessage,
}: UseClaudeTerminalOptions) {
  const containerRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const serializeAddonRef = useRef<SerializeAddon | null>(null);
  const inputBufferRef = useRef("");
  const startedRef = useRef(false);
  const sessionIdRef = useRef(sessionId);
  sessionIdRef.current = sessionId;

  // Stable callback refs
  const onStatusChangeRef = useRef(onStatusChange);
  onStatusChangeRef.current = onStatusChange;
  const onToolApprovalRef = useRef(onToolApproval);
  onToolApprovalRef.current = onToolApproval;
  const onToolApprovalResolvedRef = useRef(onToolApprovalResolved);
  onToolApprovalResolvedRef.current = onToolApprovalResolved;
  const onTurnCompleteRef = useRef(onTurnComplete);
  onTurnCompleteRef.current = onTurnComplete;
  const onModelInfoRef = useRef(onModelInfo);
  onModelInfoRef.current = onModelInfo;
  const onSdkSessionIdRef = useRef(onSdkSessionId);
  onSdkSessionIdRef.current = onSdkSessionId;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;
  const onFirstMessageRef = useRef(onFirstMessage);
  onFirstMessageRef.current = onFirstMessage;
  const firstMessageFiredRef = useRef(false);
  const resumeSessionIdRef = useRef(resumeSessionId);
  resumeSessionIdRef.current = resumeSessionId;

  // Build a callbacks object that always reads current refs — used by applyClaudeEvent
  const buildCallbacks = useCallback((): ClaudeEventCallbacks => ({
    onStatusChange: (s) => onStatusChangeRef.current?.(s),
    onToolApproval: (tc) => onToolApprovalRef.current?.(tc),
    onToolApprovalResolved: (id) => onToolApprovalResolvedRef.current?.(id),
    onTurnComplete: (cost) => onTurnCompleteRef.current?.(cost),
    onModelInfo: (m) => onModelInfoRef.current?.(m),
    onSdkSessionId: (id) => onSdkSessionIdRef.current?.(id),
    onError: (msg) => onErrorRef.current?.(msg),
    onStartedRef: startedRef,
  }), []);

  // Initialize xterm
  useEffect(() => {
    if (!containerRef.current) return;

    const xterm = new XTerm({
      scrollback: 50_000,
      cursorBlink: true,
      cursorStyle: "bar",
      cursorWidth: 2,
      fontSize: 13,
      fontFamily: "'Cascadia Code', 'Fira Code', 'JetBrains Mono', Consolas, monospace",
      theme: {
        background: "#181818",
        foreground: "#d4d4d4",
        cursor: "#d4d4d4",
        selectionBackground: "#3a3a3a",
        black: "#111111",
        red: "#f7768e",
        green: "#9ece6a",
        yellow: "#e0af68",
        blue: "#7aa2f7",
        magenta: "#bb9af7",
        cyan: "#7dcfff",
        white: "#d4d4d4",
        brightBlack: "#555555",
        brightRed: "#f7768e",
        brightGreen: "#9ece6a",
        brightYellow: "#e0af68",
        brightBlue: "#7aa2f7",
        brightMagenta: "#bb9af7",
        brightCyan: "#7dcfff",
        brightWhite: "#e8e8e8",
      },
    });

    const fitAddon = new FitAddon();
    const serializeAddon = new SerializeAddon();
    xterm.loadAddon(fitAddon);
    xterm.loadAddon(serializeAddon);
    xterm.open(containerRef.current);

    xtermRef.current = xterm;
    fitAddonRef.current = fitAddon;
    serializeAddonRef.current = serializeAddon;

    // Pre-warm the sidecar process so it's ready when the user sends their first message
    invoke("claude_warmup").catch(() => {});

    const savedScreen = restoreClaudeScreen(sessionId);

    if (savedScreen) {
      // Restoring after a project switch — replay saved display then any buffered events
      xterm.write(savedScreen);
      startedRef.current = true;
      firstMessageFiredRef.current = true;

      // Drain events that arrived while the pane was unmounted
      const buffered = drainClaudeBuffer(sessionId);
      for (const event of buffered) {
        applyClaudeEvent(xterm, event, buildCallbacks());
      }
    } else if (resumeSessionIdRef.current) {
      // Resuming a previous session — load history from disk
      loadSessionHistory(resumeSessionIdRef.current, cwd).then((messages) => {
        for (const msg of messages) {
          if (msg.role === "user") {
            xterm.write(`\r\n\x1b[36m❯\x1b[0m \x1b[1m${msg.text.replace(/\n/g, "\r\n")}\x1b[0m\r\n`);
          } else if (msg.role === "assistant") {
            xterm.write(`\r\n${msg.text.replace(/\n/g, "\r\n")}\r\n`);
          }
        }
        xterm.write("\r\n\x1b[36m❯\x1b[0m ");
      }).catch(() => {
        xterm.write("\x1b[36m❯\x1b[0m ");
      });
    } else {
      // Fresh session
      xterm.write("\x1b[36m❯\x1b[0m ");
    }

    // Mark active after restoring so the global buffer stops capturing for this session
    markClaudeActive(sessionId);

    requestAnimationFrame(() => {
      try { fitAddon.fit(); } catch {}
    });

    return () => {
      // Serialize the full scrollback before destroying so it can be restored on remount
      try {
        const content = serializeAddon.serialize({ scrollback: 50_000 });
        if (content) saveClaudeScreen(sessionId, content);
      } catch {}

      markClaudeInactive(sessionId);
      xterm.dispose();
      xtermRef.current = null;
      fitAddonRef.current = null;
      serializeAddonRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Focus management
  useEffect(() => {
    const xterm = xtermRef.current;
    if (!xterm) return;
    if (isActive) xterm.focus();
    else xterm.blur();
  }, [isActive]);

  // Handle user keyboard input
  useEffect(() => {
    const xterm = xtermRef.current;
    if (!xterm) return;

    const disposable = xterm.onData((data) => {
      if (data === "\r") {
        // Enter pressed — send the input
        const text = inputBufferRef.current.trim();
        xterm.write("\r\n");
        inputBufferRef.current = "";

        if (text) {
          if (!startedRef.current) {
            startedRef.current = true;
            if (!firstMessageFiredRef.current && onFirstMessageRef.current) {
              firstMessageFiredRef.current = true;
              onFirstMessageRef.current(text);
            }
            invoke("claude_start", {
              sessionId: sessionIdRef.current,
              cwd,
              prompt: text,
              resumeSessionId: resumeSessionIdRef.current || undefined,
            }).catch((err: any) => {
              xterm.write(`\x1b[31mError: ${err}\x1b[0m\r\n`);
            });
          } else {
            invoke("claude_send", {
              sessionId: sessionIdRef.current,
              message: text,
            }).catch((err: any) => {
              xterm.write(`\x1b[31mError: ${err}\x1b[0m\r\n`);
            });
          }
        } else {
          xterm.write("\x1b[36m❯\x1b[0m ");
        }
      } else if (data === "\x7f" || data === "\b") {
        // Backspace
        if (inputBufferRef.current.length > 0) {
          inputBufferRef.current = inputBufferRef.current.slice(0, -1);
          xterm.write("\b \b");
        }
      } else if (data === "\x03") {
        // Ctrl+C — abort
        xterm.write("^C\r\n");
        inputBufferRef.current = "";
        invoke("claude_abort", { sessionId: sessionIdRef.current }).catch(() => {});
        xterm.write("\x1b[36m❯\x1b[0m ");
      } else if (data >= " " || data === "\t") {
        // Printable character
        inputBufferRef.current += data;
        xterm.write(data);
      }
    });

    return () => disposable.dispose();
  }, [cwd]);

  // Listen for Claude events and apply them to xterm
  useEffect(() => {
    let unlisten: UnlistenFn | null = null;

    const setup = async () => {
      unlisten = await listen<ClaudeEventPayload>("claude-event", (event) => {
        let parsed: any;
        try {
          parsed = JSON.parse(event.payload.data);
        } catch {
          return;
        }

        if (parsed.sessionId !== sessionIdRef.current && parsed.sessionId !== "*") return;

        const xterm = xtermRef.current;
        if (!xterm) return;

        applyClaudeEvent(xterm, parsed, buildCallbacks());
      });
    };

    setup();
    return () => { unlisten?.(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Resize handling
  const fit = useCallback(() => {
    if (fitAddonRef.current && xtermRef.current && containerRef.current) {
      const { clientWidth, clientHeight } = containerRef.current;
      if (clientWidth < 10 || clientHeight < 10) return;
      try { fitAddonRef.current.fit(); } catch {}
    }
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const observer = new ResizeObserver(() => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => fit(), 80);
    });
    observer.observe(containerRef.current);
    return () => {
      if (timer) clearTimeout(timer);
      observer.disconnect();
    };
  }, [fit]);

  return { containerRef };
}

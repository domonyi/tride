import { useEffect, useRef, useCallback } from "react";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebglAddon } from "@xterm/addon-webgl";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

interface UseTerminalOptions {
  ptyId: string | null;
}

interface PtyDataEvent {
  id: string;
  data: number[];
}

interface PtyExitEvent {
  id: string;
}

export function useTerminal({ ptyId }: UseTerminalOptions) {
  const containerRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);

  // Initialize xterm
  useEffect(() => {
    if (!containerRef.current) return;

    const xterm = new XTerm({
      cursorBlink: true,
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
    xterm.loadAddon(fitAddon);
    xterm.open(containerRef.current);

    // WebGL renderer for better performance and color support
    try {
      const webglAddon = new WebglAddon();
      webglAddon.onContextLoss(() => webglAddon.dispose());
      xterm.loadAddon(webglAddon);
    } catch {
      // WebGL not available, fall back to canvas
    }

    requestAnimationFrame(() => {
      try {
        fitAddon.fit();
      } catch {}
    });

    xtermRef.current = xterm;
    fitAddonRef.current = fitAddon;

    return () => {
      xterm.dispose();
      xtermRef.current = null;
      fitAddonRef.current = null;
    };
  }, []);

  // Wire up PTY input (user typing -> PTY) and output (PTY events -> xterm)
  useEffect(() => {
    if (!ptyId || !xtermRef.current) return;

    const xterm = xtermRef.current;

    // User input -> write to PTY
    const inputDisposable = xterm.onData((data) => {
      const encoder = new TextEncoder();
      invoke("write_terminal", {
        id: ptyId,
        data: Array.from(encoder.encode(data)),
      }).catch(() => {});
    });

    // PTY output -> write to xterm (event-based, no polling)
    let unlistenData: UnlistenFn | null = null;
    let unlistenExit: UnlistenFn | null = null;

    const setupListeners = async () => {
      unlistenData = await listen<PtyDataEvent>("pty-data", (event) => {
        if (event.payload.id === ptyId && xtermRef.current) {
          xtermRef.current.write(new Uint8Array(event.payload.data));
        }
      });

      unlistenExit = await listen<PtyExitEvent>("pty-exit", (event) => {
        if (event.payload.id === ptyId && xtermRef.current) {
          xtermRef.current.write("\r\n\x1b[90m[Process exited]\x1b[0m\r\n");
        }
      });
    };

    setupListeners();

    return () => {
      inputDisposable.dispose();
      unlistenData?.();
      unlistenExit?.();
    };
  }, [ptyId]);

  // Resize handling
  const fit = useCallback(() => {
    if (fitAddonRef.current && xtermRef.current) {
      try {
        fitAddonRef.current.fit();
        if (ptyId) {
          invoke("resize_terminal", {
            id: ptyId,
            rows: xtermRef.current.rows,
            cols: xtermRef.current.cols,
          }).catch(() => {});
        }
      } catch {}
    }
  }, [ptyId]);

  // ResizeObserver for auto-fit
  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver(() => fit());
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [fit]);

  return { containerRef, fit };
}

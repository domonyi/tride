import { useEffect, useRef, useCallback } from "react";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebglAddon } from "@xterm/addon-webgl";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { readText, writeText } from "@tauri-apps/plugin-clipboard-manager";

interface UseTerminalOptions {
  ptyId: string | null;
  onLinkClick?: (link: string) => void;
}

interface PtyDataEvent {
  id: string;
  data: number[];
}

interface PtyExitEvent {
  id: string;
}

export function useTerminal({ ptyId, onLinkClick }: UseTerminalOptions) {
  const containerRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const onLinkClickRef = useRef(onLinkClick);
  onLinkClickRef.current = onLinkClick;

  // Initialize xterm
  useEffect(() => {
    if (!containerRef.current) return;

    const xterm = new XTerm({
      cursorBlink: false,
      cursorStyle: "bar",
      cursorWidth: 1,
      cursorInactiveStyle: "none",
      fontSize: 13,
      fontFamily: "'Cascadia Code', 'Fira Code', 'JetBrains Mono', Consolas, monospace",
      theme: {
        background: "#181818",
        foreground: "#d4d4d4",
        cursor: "transparent",
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

    // Ctrl+Click link detection (URLs and file paths)
    const URL_REGEX = /https?:\/\/[^\s'"\]>)]+/;
    // Matches: C:\path, ./path, ../path, \path, and bare relative paths like src\file.ext or src/file.ext
    const FILE_PATH_REGEX = /(?:[a-zA-Z]:[/\\]|\.{0,2}[/\\])[^\s:'"()]+(?::\d+)?|(?<=[(\s]|^)[a-zA-Z_][\w\-.]*([\\/][\w\-. ]+)+\.\w+(?::\d+)?/;

    xterm.registerLinkProvider({
      provideLinks: (lineNumber, callback) => {
        const line = xterm.buffer.active.getLine(lineNumber - 1);
        if (!line) { callback(undefined); return; }
        const text = line.translateToString();
        const links: any[] = [];

        // Find URLs
        let match: RegExpExecArray | null;
        const urlRegex = new RegExp(URL_REGEX.source, "g");
        while ((match = urlRegex.exec(text)) !== null) {
          links.push({
            range: { start: { x: match.index + 1, y: lineNumber }, end: { x: match.index + match[0].length, y: lineNumber } },
            text: match[0],
            activate: (_: any, linkText: string) => { onLinkClickRef.current?.(linkText); },
          });
        }

        // Find file paths
        const fileRegex = new RegExp(FILE_PATH_REGEX.source, "g");
        while ((match = fileRegex.exec(text)) !== null) {
          // Skip if already covered by a URL match
          const start = match.index;
          const end = start + match[0].length;
          const overlaps = links.some((l) => start < l.range.end.x - 1 && end > l.range.start.x - 1);
          if (!overlaps) {
            links.push({
              range: { start: { x: start + 1, y: lineNumber }, end: { x: end, y: lineNumber } },
              text: match[0],
              activate: (_: any, linkText: string) => { onLinkClickRef.current?.(linkText); },
            });
          }
        }

        callback(links.length > 0 ? links : undefined);
      },
    });

    // Clipboard: Ctrl+C (copy when selection) and Ctrl+V (paste)
    xterm.attachCustomKeyEventHandler((event: KeyboardEvent) => {
      if (event.type !== "keydown") return true;
      const isCtrl = event.ctrlKey || event.metaKey;

      // Ctrl+Shift+C: always copy
      if (isCtrl && event.shiftKey && event.key === "C") {
        const sel = xterm.getSelection();
        if (sel) writeText(sel);
        return false;
      }

      // Ctrl+C: copy if there's a selection, otherwise send SIGINT
      if (isCtrl && !event.shiftKey && event.key === "c") {
        const sel = xterm.getSelection();
        if (sel) {
          writeText(sel);
          xterm.clearSelection();
          return false;
        }
        return true; // let xterm send ^C to PTY
      }

      // Ctrl+V or Ctrl+Shift+V: paste from clipboard (supports images)
      if (isCtrl && (event.key === "v" || event.key === "V")) {
        event.preventDefault();
        (async () => {
          try {
            const clipboardItems = await navigator.clipboard.read();
            for (const item of clipboardItems) {
              // Check for image types first
              const imageType = item.types.find((t) => t.startsWith("image/"));
              if (imageType) {
                const blob = await item.getType(imageType);
                const ext = imageType.split("/")[1] === "jpeg" ? "jpg" : imageType.split("/")[1] || "png";
                const arrayBuf = await blob.arrayBuffer();
                const bytes = Array.from(new Uint8Array(arrayBuf));
                const path = await invoke<string>("save_clipboard_image", { data: bytes, extension: ext });
                xterm.paste(path);
                return;
              }
            }
          } catch {
            // navigator.clipboard.read() may not be available — fall through to text
          }
          // Fallback: plain text paste
          readText().then((text) => {
            if (text) xterm.paste(text);
          });
        })();
        return false;
      }

      return true;
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

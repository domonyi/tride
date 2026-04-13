import { useEffect, useRef, useCallback } from "react";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { SerializeAddon } from "@xterm/addon-serialize";
import { WebglAddon } from "@xterm/addon-webgl";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { readText, writeText } from "@tauri-apps/plugin-clipboard-manager";
import { drainBuffer, hasExited, markActive, markInactive, saveScreen, restoreScreen, notifyUserInput } from "../ptyBuffer";


interface UseTerminalOptions {
  ptyId: string | null;
  isActive?: boolean;
  onLinkClick?: (link: string) => void;
  onTitleChange?: (title: string) => void;
  onFocus?: () => void;
}

interface PtyDataEvent {
  id: string;
  data: number[];
}

interface PtyExitEvent {
  id: string;
  code?: number;
}

export function useTerminal({ ptyId, isActive, onLinkClick, onTitleChange, onFocus }: UseTerminalOptions) {
  const containerRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const serializeAddonRef = useRef<SerializeAddon | null>(null);
  const webglAddonRef = useRef<WebglAddon | null>(null);
  const ptyIdRef = useRef(ptyId);
  ptyIdRef.current = ptyId;
  const onLinkClickRef = useRef(onLinkClick);
  onLinkClickRef.current = onLinkClick;
  const onTitleChangeRef = useRef(onTitleChange);
  onTitleChangeRef.current = onTitleChange;
  const onFocusRef = useRef(onFocus);
  onFocusRef.current = onFocus;

  // Initialize xterm
  useEffect(() => {
    if (!containerRef.current) return;

    const xterm = new XTerm({
      scrollback: 50_000,
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
    const serializeAddon = new SerializeAddon();
    xterm.loadAddon(fitAddon);
    xterm.loadAddon(serializeAddon);
    xterm.open(containerRef.current);

    // GPU-accelerated rendering — falls back to DOM renderer if WebGL is unavailable
    const webglAddon = new WebglAddon();
    webglAddon.onContextLoss(() => {
      // WebGL context was lost (too many contexts, driver reset, etc.) — dispose cleanly
      // and let xterm fall back to its built-in DOM renderer
      webglAddon.dispose();
      webglAddonRef.current = null;
    });
    try {
      xterm.loadAddon(webglAddon);
      webglAddonRef.current = webglAddon;
    } catch {
      // WebGL not supported in this environment
      webglAddon.dispose();
    }

    // Hide xterm's cursor — Claude Code draws its own
    xterm.write("\x1b[?25l");

    // Restore previously serialized screen content
    if (ptyIdRef.current) {
      const saved = restoreScreen(ptyIdRef.current);
      if (saved) {
        xterm.write(saved);
      }
      // Re-hide cursor after restore (restore may reset cursor visibility)
      xterm.write("\x1b[?25l");
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

      // Let F1-F9 pass through to window handler (project tab switching)
      if (/^F[1-9]$/.test(event.key) && !event.ctrlKey && !event.altKey && !event.metaKey) {
        return false;
      }

      // Let Alt+1/2/3 pass through to window handler (sidebar mode switching)
      if (event.altKey && !event.ctrlKey && !event.metaKey && ["1", "2", "3"].includes(event.key)) {
        return false;
      }

      // Let Ctrl+B pass through (toggle sidebar)
      if ((event.ctrlKey || event.metaKey) && !event.shiftKey && event.key === "b") {
        return false;
      }

      // Let Ctrl+P pass through (search)
      if ((event.ctrlKey || event.metaKey) && !event.shiftKey && event.key === "p") {
        return false;
      }

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

    // Listen for OSC title change sequences (shells/programs set window title)
    const titleDisposable = xterm.onTitleChange((title) => {
      onTitleChangeRef.current?.(title);
    });

    // When xterm receives focus (click, tab, etc.), notify parent so active terminal state stays in sync
    const focusHandler = () => onFocusRef.current?.();
    xterm.textarea?.addEventListener("focus", focusHandler);

    xtermRef.current = xterm;
    fitAddonRef.current = fitAddon;
    serializeAddonRef.current = serializeAddon;

    return () => {
      // Serialize the full scrollback before destroying so it can be restored on remount
      if (ptyIdRef.current) {
        try {
          const content = serializeAddon.serialize({ scrollback: 50_000 });
          if (content) {
            saveScreen(ptyIdRef.current, content);
          }
        } catch {}
      }
      xterm.textarea?.removeEventListener("focus", focusHandler);
      titleDisposable.dispose();
      webglAddonRef.current?.dispose();
      webglAddonRef.current = null;
      xterm.dispose();
      xtermRef.current = null;
      fitAddonRef.current = null;
      serializeAddonRef.current = null;
    };
  }, []);

  // Manage xterm focus/blur based on active terminal state
  useEffect(() => {
    const xterm = xtermRef.current;
    if (!xterm) return;
    if (isActive) {
      xterm.focus();
    } else {
      xterm.blur();
    }
  }, [isActive]);

  // Wire up PTY input (user typing -> PTY) and output (PTY events -> xterm)
  useEffect(() => {
    if (!ptyId || !xtermRef.current) return;

    const xterm = xtermRef.current;

    // Replay any buffered output that arrived while this terminal was unmounted
    const buffered = drainBuffer(ptyId);
    for (const chunk of buffered) {
      xterm.write(chunk);
    }
    if (hasExited(ptyId)) {
      xterm.write("\r\n\x1b[90m[Process exited]\x1b[0m\r\n");
    }

    // Mark this PTY as actively consumed so the global buffer skips it
    markActive(ptyId);

    // User input -> write to PTY
    const inputDisposable = xterm.onData((data) => {
      notifyUserInput(ptyId);
      const encoder = new TextEncoder();
      invoke("write_terminal", {
        id: ptyId,
        data: Array.from(encoder.encode(data)),
      }).catch(() => {});
    });

    let unlistenData: UnlistenFn | null = null;
    let unlistenExit: UnlistenFn | null = null;

    const setupListeners = async () => {
      unlistenData = await listen<PtyDataEvent>("pty-data", (event) => {
        if (event.payload.id === ptyId && xtermRef.current) {
          // Strip "show cursor" escape sequences so only Claude Code's cursor is visible
          const raw = new Uint8Array(event.payload.data);
          const text = new TextDecoder().decode(raw);
          const filtered = text.replace(/\x1b\[\?25h/g, "");
          xtermRef.current.write(filtered);
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
      markInactive(ptyId);
    };
  }, [ptyId]);

  // Resize handling
  const fit = useCallback(() => {
    if (fitAddonRef.current && xtermRef.current && containerRef.current) {
      // Skip fitting when the container is collapsed (e.g. window minimized)
      // so xterm keeps its dimensions and re-fits correctly on restore.
      const { clientWidth, clientHeight } = containerRef.current;
      if (clientWidth < 10 || clientHeight < 10) return;
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

  // ResizeObserver for auto-fit (debounced to avoid reflow issues during maximize/minimize)
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

  // Drag-and-drop: images are saved to temp and path is pasted, files paste their path
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const onDragOver = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
      el.classList.add("drop-active");
    };

    const onDragLeave = (e: DragEvent) => {
      e.preventDefault();
      el.classList.remove("drop-active");
    };

    const onDrop = async (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      el.classList.remove("drop-active");
      if (!ptyId || !xtermRef.current || !e.dataTransfer) return;

      const xterm = xtermRef.current;

      // Handle dropped files from file explorer
      if (e.dataTransfer.files.length > 0) {
        const paths: string[] = [];
        for (const file of Array.from(e.dataTransfer.files)) {
          if (file.type.startsWith("image/") && !(file as any).path) {
            // Browser-origin image blob — save to temp
            const arrayBuf = await file.arrayBuffer();
            const bytes = Array.from(new Uint8Array(arrayBuf));
            const ext = file.name.split(".").pop() || "png";
            const savedPath = await invoke<string>("save_clipboard_image", { data: bytes, extension: ext });
            paths.push(savedPath);
          } else {
            // File from OS file explorer — use its path directly
            paths.push((file as any).path || file.name);
          }
        }
        if (paths.length > 0) {
          xterm.paste(paths.join(" "));
        }
        return;
      }

      // Handle dragged image data (e.g. from browser)
      for (const item of Array.from(e.dataTransfer.items)) {
        if (item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (!file) continue;
          const arrayBuf = await file.arrayBuffer();
          const bytes = Array.from(new Uint8Array(arrayBuf));
          const ext = item.type.split("/")[1] === "jpeg" ? "jpg" : item.type.split("/")[1] || "png";
          const savedPath = await invoke<string>("save_clipboard_image", { data: bytes, extension: ext });
          xterm.paste(savedPath);
          return;
        }
      }
    };

    el.addEventListener("dragover", onDragOver);
    el.addEventListener("dragleave", onDragLeave);
    el.addEventListener("drop", onDrop);
    return () => {
      el.removeEventListener("dragover", onDragOver);
      el.removeEventListener("dragleave", onDragLeave);
      el.removeEventListener("drop", onDrop);
    };
  }, [ptyId]);

  return { containerRef, fit };
}

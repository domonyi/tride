import { invoke } from "@tauri-apps/api/core";

const LOG_PATH = "C:/DEV/Tride/pty-escape-sequences.log";
let buffer = "";
let flushTimer: ReturnType<typeof setTimeout> | null = null;

function flush() {
  flushTimer = null;
  if (!buffer) return;
  const chunk = buffer;
  buffer = "";
  invoke("append_file", { path: LOG_PATH, content: chunk }).catch(() => {});
}

/** Append a line to the debug log file (batched for performance). */
export function debugLog(line: string) {
  buffer += line + "\n";
  if (!flushTimer) {
    flushTimer = setTimeout(flush, 200);
  }
}

/** Log all ANSI/OSC escape sequences found in raw PTY text. */
export function logEscapeSequences(ptyId: string, text: string) {
  // Match ESC sequences: CSI (ESC[), OSC (ESC]), DCS (ESCP), and simple ESC( ESC) etc.
  const matches = text.match(/\x1b[\[\]P()][^\x1b\x07]*[\x07]?|\x1b[^\[\]P()][^\x1b]*/g);
  if (!matches || matches.length === 0) return;

  const timestamp = new Date().toISOString().slice(11, 23);
  for (const seq of matches) {
    // Make control chars visible
    const readable = seq
      .replace(/\x1b/g, "ESC")
      .replace(/\x07/g, "BEL")
      .replace(/\x00/g, "NUL")
      .replace(/\r/g, "\\r")
      .replace(/\n/g, "\\n");
    debugLog(`[${timestamp}] pty=${ptyId} ${readable}`);
  }
}

import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useAppState } from "../state/context";

const THEIA_PORT = 3100;
let theiaStarted = false;

export function CodeEditor() {
  const state = useAppState();
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const startedRef = useRef(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const lastFolderRef = useRef<string | null>(null);

  const activeProject = state.projects.find((p) => p.id === state.activeProjectId);
  const activeTerminal = activeProject?.terminals.find(
    (t) => t.id === state.activeTerminalId
  );
  const folderPath = activeTerminal?.cwd || activeProject?.path || null;

  // Start Theia server (once)
  useEffect(() => {
    if (startedRef.current) {
      if (theiaStarted) setReady(true);
      return;
    }
    if (!folderPath) return;

    startedRef.current = true;

    const startTheia = async () => {
      try {
        try {
          await fetch(`http://localhost:${THEIA_PORT}`, { mode: "no-cors" });
          theiaStarted = true;
          setReady(true);
          return;
        } catch {}

        await invoke("start_theia", {
          port: THEIA_PORT,
          rootDir: folderPath,
        });

        for (let i = 0; i < 30; i++) {
          await new Promise((r) => setTimeout(r, 1000));
          try {
            await fetch(`http://localhost:${THEIA_PORT}`, { mode: "no-cors" });
            theiaStarted = true;
            setReady(true);
            return;
          } catch {}
        }
        setError("Theia did not start in time");
      } catch (e) {
        setError(`Failed to start Theia: ${e}`);
      }
    };

    startTheia();
  }, [folderPath]);

  // Update iframe when folder changes — must force full reload
  useEffect(() => {
    if (!ready || !folderPath || !iframeRef.current) return;
    if (folderPath === lastFolderRef.current) return;

    lastFolderRef.current = folderPath;
    const normalized = folderPath.replace(/\\/g, "/");
    const url = `http://localhost:${THEIA_PORT}/#${normalized}`;

    // Force reload by briefly setting to blank then back
    iframeRef.current.src = "about:blank";
    setTimeout(() => {
      if (iframeRef.current) {
        iframeRef.current.src = url;
      }
    }, 50);
  }, [ready, folderPath]);

  if (error) {
    return (
      <div className="sidebar-placeholder">
        <div className="placeholder-icon">!</div>
        <p>Failed to start Theia</p>
        <p className="placeholder-sub">{error}</p>
      </div>
    );
  }

  if (!folderPath) {
    return (
      <div className="sidebar-placeholder">
        <div className="placeholder-icon">{"</>"}</div>
        <p>No project selected</p>
        <p className="placeholder-sub">Add a project to open the editor</p>
      </div>
    );
  }

  if (!ready) {
    return (
      <div className="sidebar-placeholder">
        <div className="placeholder-icon">{"</>"}</div>
        <p>Starting Theia IDE...</p>
        <p className="placeholder-sub">First launch takes a few seconds</p>
      </div>
    );
  }

  const normalized = folderPath.replace(/\\/g, "/");

  return (
    <div className="vscode-embed">
      <iframe
        ref={iframeRef}
        src={`http://localhost:${THEIA_PORT}/#${normalized}`}
        className="vscode-iframe"
        title="Theia IDE"
      />
    </div>
  );
}

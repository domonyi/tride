import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useAppState } from "../state/context";

const OPENVSCODE_PORT = 3000;
let serverStarted = false;

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

  const vsUrl = `http://localhost:${OPENVSCODE_PORT}/?folder=/home/workspace`;

  // Start OpenVSCode Server container (once)
  useEffect(() => {
    if (startedRef.current) {
      if (serverStarted) setReady(true);
      return;
    }
    if (!folderPath) return;

    startedRef.current = true;

    const startServer = async () => {
      try {
        try {
          await fetch(`http://localhost:${OPENVSCODE_PORT}`, { mode: "no-cors" });
          serverStarted = true;
          setReady(true);
          return;
        } catch {}

        await invoke("start_openvscode", {
          port: OPENVSCODE_PORT,
          rootDir: folderPath,
        });

        for (let i = 0; i < 45; i++) {
          await new Promise((r) => setTimeout(r, 1000));
          try {
            await fetch(`http://localhost:${OPENVSCODE_PORT}`, { mode: "no-cors" });
            serverStarted = true;
            setReady(true);
            return;
          } catch {}
        }
        setError("OpenVSCode Server did not start in time. Is Docker running?");
      } catch (e) {
        setError(`Failed to start IDE: ${e}`);
      }
    };

    startServer();
  }, [folderPath]);

  // Update iframe when folder changes
  useEffect(() => {
    if (!ready || !folderPath || !iframeRef.current) return;
    if (folderPath === lastFolderRef.current) return;

    lastFolderRef.current = folderPath;

    iframeRef.current.src = "about:blank";
    setTimeout(() => {
      if (iframeRef.current) {
        iframeRef.current.src = vsUrl;
      }
    }, 50);
  }, [ready, folderPath, vsUrl]);

  if (error) {
    return (
      <div className="sidebar-placeholder">
        <div className="placeholder-icon">!</div>
        <p>Failed to start IDE</p>
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
      <div className="sidebar-placeholder" style={{ background: "#1e1e1e" }}>
        <div className="placeholder-icon">{"</>"}</div>
        <p>Starting IDE...</p>
        <p className="placeholder-sub">Waiting for Docker container</p>
      </div>
    );
  }

  return (
    <div className="vscode-embed">
      <iframe
        ref={iframeRef}
        src={vsUrl}
        className="vscode-iframe"
        title="OpenVSCode Server"
        style={{ background: "#1e1e1e" }}
      />
    </div>
  );
}

import { useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { SettingsPanel } from "./SettingsPanel";

const Logo = () => (
  <img src="/icon.ico" alt="Tride" width="16" height="16" style={{ display: "block" }} />
);

const MinimizeIcon = () => (
  <svg width="10" height="1" viewBox="0 0 10 1" fill="currentColor">
    <rect width="10" height="1" />
  </svg>
);

const MaximizeIcon = () => (
  <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1">
    <rect x="0.5" y="0.5" width="9" height="9" />
  </svg>
);

const CloseIcon = () => (
  <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.2">
    <line x1="0" y1="0" x2="10" y2="10" />
    <line x1="10" y1="0" x2="0" y2="10" />
  </svg>
);

const SettingsIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
);

export function TitleBar() {
  const appWindow = getCurrentWindow();
  const [settingsOpen, setSettingsOpen] = useState(false);

  const onDragStart = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest(".title-bar-controls")) return;
    if ((e.target as HTMLElement).closest(".title-bar-settings")) return;
    e.preventDefault();
    appWindow.startDragging();
  };

  const onDoubleClick = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest(".title-bar-controls")) return;
    if ((e.target as HTMLElement).closest(".title-bar-settings")) return;
    appWindow.toggleMaximize();
  };

  return (
    <>
      <div
        className="title-bar"
        onMouseDown={onDragStart}
        onDoubleClick={onDoubleClick}
      >
        <div className="title-bar-left">
          <span className="title-bar-logo"><Logo /></span>
          <button
            className="title-bar-settings"
            onClick={() => setSettingsOpen(!settingsOpen)}
            title="Settings"
          >
            <SettingsIcon />
          </button>
        </div>
        <div className="title-bar-controls">
          <button className="title-btn minimize" onClick={() => appWindow.minimize()}>
            <MinimizeIcon />
          </button>
          <button className="title-btn maximize" onClick={() => appWindow.toggleMaximize()}>
            <MaximizeIcon />
          </button>
          <button className="title-btn close" onClick={() => appWindow.close()}>
            <CloseIcon />
          </button>
        </div>
      </div>
      {settingsOpen && <SettingsPanel onClose={() => setSettingsOpen(false)} />}
    </>
  );
}

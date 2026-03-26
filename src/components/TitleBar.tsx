import { getCurrentWindow } from "@tauri-apps/api/window";

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

export function TitleBar() {
  const appWindow = getCurrentWindow();

  const onDragStart = (e: React.MouseEvent) => {
    // Only drag from the bar itself, not from buttons
    if ((e.target as HTMLElement).closest(".title-bar-controls")) return;
    e.preventDefault();
    appWindow.startDragging();
  };

  const onDoubleClick = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest(".title-bar-controls")) return;
    appWindow.toggleMaximize();
  };

  return (
    <div
      className="title-bar"
      onMouseDown={onDragStart}
      onDoubleClick={onDoubleClick}
    >
      <span className="title-bar-label">AI Terminal</span>
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
  );
}

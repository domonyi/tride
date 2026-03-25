import { getCurrentWindow } from "@tauri-apps/api/window";

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
          &#x2013;
        </button>
        <button className="title-btn maximize" onClick={() => appWindow.toggleMaximize()}>
          &#x25A1;
        </button>
        <button className="title-btn close" onClick={() => appWindow.close()}>
          &#x2715;
        </button>
      </div>
    </div>
  );
}

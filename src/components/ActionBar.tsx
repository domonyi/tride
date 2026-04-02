import { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useAppState, useAppDispatch } from "../state/context";
import { PANE_LAYOUTS, getLayout, type PaneLayout } from "../utils/paneUtils";

function LayoutSvg({
  layout,
  size = 32,
  active = false,
}: {
  layout: PaneLayout;
  size?: number;
  active?: boolean;
}) {
  // Parse areas: `"p0 p1" "p2 p2"` → [["p0","p1"],["p2","p2"]]
  const areaRows = layout.areas.match(/"[^"]+"/g)?.map((r) => r.replace(/"/g, "").trim().split(/\s+/)) ?? [];
  const gridRows = areaRows.length;
  const gridCols = areaRows[0]?.length ?? 1;

  const padding = 2;
  const gap = 1.5;
  const innerW = size - padding * 2;
  const innerH = size - padding * 2;
  const cellW = (innerW - gap * (gridCols - 1)) / gridCols;
  const cellH = (innerH - gap * (gridRows - 1)) / gridRows;

  // Find bounding box for each pane area (p0, p1, etc.)
  const paneRects: Map<string, { minR: number; maxR: number; minC: number; maxC: number }> = new Map();
  for (let r = 0; r < gridRows; r++) {
    for (let c = 0; c < gridCols; c++) {
      const name = areaRows[r][c];
      const existing = paneRects.get(name);
      if (existing) {
        existing.minR = Math.min(existing.minR, r);
        existing.maxR = Math.max(existing.maxR, r);
        existing.minC = Math.min(existing.minC, c);
        existing.maxC = Math.max(existing.maxC, c);
      } else {
        paneRects.set(name, { minR: r, maxR: r, minC: c, maxC: c });
      }
    }
  }

  const rects = Array.from(paneRects.values()).map((b) => ({
    x: padding + b.minC * (cellW + gap),
    y: padding + b.minR * (cellH + gap),
    w: (b.maxC - b.minC + 1) * cellW + (b.maxC - b.minC) * gap,
    h: (b.maxR - b.minR + 1) * cellH + (b.maxR - b.minR) * gap,
  }));

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} fill="none" style={{ flexShrink: 0 }}>
      {rects.map((r, i) => (
        <rect
          key={i}
          x={r.x}
          y={r.y}
          width={r.w}
          height={r.h}
          rx={1}
          fill={active ? "var(--accent)" : "var(--text-muted)"}
          opacity={active ? 0.8 : 0.4}
        />
      ))}
    </svg>
  );
}

export function ActionBar() {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const [currentBranch, setCurrentBranch] = useState<string | null>(null);
  const [layoutOpen, setLayoutOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const activeProject = state.projects.find((p) => p.id === state.activeProjectId);

  const refreshBranch = useCallback(async () => {
    if (!activeProject) { setCurrentBranch(null); return; }
    try {
      const branch = await invoke<string>("git_current_branch", { cwd: activeProject.path });
      setCurrentBranch(branch);
    } catch {
      setCurrentBranch(null);
    }
  }, [activeProject?.path]);

  useEffect(() => {
    refreshBranch();
    const id = setInterval(refreshBranch, 5000);
    return () => clearInterval(id);
  }, [refreshBranch]);

  // Close dropdown on outside click
  useEffect(() => {
    if (!layoutOpen) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setLayoutOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [layoutOpen]);

  const currentLayout = getLayout(state.panes.layoutId);

  const handleSelectLayout = (l: PaneLayout) => {
    dispatch({ type: "PANES_SET_LAYOUT", layoutId: l.id });
    setLayoutOpen(false);
  };

  // Group layouts by pane count
  const grouped = new Map<number, PaneLayout[]>();
  for (const l of PANE_LAYOUTS) {
    const arr = grouped.get(l.paneCount) ?? [];
    arr.push(l);
    grouped.set(l.paneCount, arr);
  }

  return (
    <div className="action-bar">
      <div className="action-bar-info">
        {currentBranch && (
          <span className="action-bar-branch">
            <span className="scm-branch-icon">&#9741;</span> {currentBranch}
          </span>
        )}
      </div>
      <div className="action-bar-actions">
        <button
          className="action-btn"
          title="Toggle sidebar"
          onClick={() => dispatch({ type: "TOGGLE_SIDEBAR" })}
        >
          Sidebar
        </button>
        <div className="layout-dropdown" ref={dropdownRef}>
          <button
            className={`layout-dropdown-trigger ${layoutOpen ? "active" : ""}`}
            onClick={() => setLayoutOpen((v) => !v)}
            title="Pane layout"
          >
            <LayoutSvg layout={currentLayout} size={20} active />
            <span className="layout-dropdown-label">{currentLayout.label}</span>
            <svg width="10" height="6" viewBox="0 0 10 6" fill="none" style={{ marginLeft: 2, transform: layoutOpen ? "rotate(180deg)" : undefined, transition: "transform 0.15s" }}>
              <path d="M1 1L5 5L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
          {layoutOpen && (
            <div className="layout-dropdown-menu">
              {Array.from(grouped.entries()).sort((a, b) => a[0] - b[0]).map(([count, layouts]) => (
                <div key={count} className="layout-dropdown-group">
                  <div className="layout-dropdown-group-label">{count} {count === 1 ? "Pane" : "Panes"}</div>
                  {layouts.map((l) => {
                    const isActive = l.id === state.panes.layoutId;
                    return (
                      <button
                        key={l.id}
                        className={`layout-dropdown-item ${isActive ? "active" : ""}`}
                        onClick={() => handleSelectLayout(l)}
                      >
                        <LayoutSvg layout={l} size={36} active={isActive} />
                        <div className="layout-dropdown-item-info">
                          <span className="layout-dropdown-item-label">{l.label}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

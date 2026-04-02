import { useEffect, useState, useRef } from "react";
import { useAppState, useAppDispatch } from "../state/context";
import { getLayout, PANE_LAYOUTS, type PaneLayout } from "../utils/paneUtils";
import { LlmPane } from "./LlmPane";
import { PanesBroadcastBar } from "./PanesBroadcastBar";
import { LayoutGrid } from "lucide-react";

export function LlmPanes() {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const { panes } = state;
  const [layoutPickerOpen, setLayoutPickerOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  const layout = getLayout(panes.layoutId);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === "B") {
        e.preventDefault();
        dispatch({ type: "PANES_TOGGLE_BROADCAST" });
        return;
      }

      if (e.ctrlKey && !e.shiftKey && !e.altKey && !e.metaKey) {
        const num = parseInt(e.key);
        if (num >= 1 && num <= 9 && num <= panes.paneCount) {
          e.preventDefault();
          const paneId = panes.paneOrder[num - 1];
          if (paneId) {
            dispatch({ type: "PANES_SET_ACTIVE_PANE", paneId });
          }
          return;
        }
      }

      if (e.key === "Escape") {
        if (layoutPickerOpen) {
          setLayoutPickerOpen(false);
          return;
        }
        if (panes.broadcastOpen) {
          e.preventDefault();
          dispatch({ type: "PANES_CLOSE_BROADCAST" });
        } else if (panes.activePaneId) {
          e.preventDefault();
          dispatch({ type: "PANES_CLEAR_FOCUS" });
        }
        return;
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [dispatch, panes.broadcastOpen, panes.activePaneId, panes.paneCount, panes.paneOrder, layoutPickerOpen]);

  // Close layout picker on outside click
  useEffect(() => {
    if (!layoutPickerOpen) return;
    const handler = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setLayoutPickerOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [layoutPickerOpen]);

  const handleSelectLayout = (id: string) => {
    dispatch({ type: "PANES_SET_LAYOUT", layoutId: id });
    setLayoutPickerOpen(false);
  };

  return (
    <div className="panes-container">
      {/* Layout selector button — top right corner */}
      <div className="panes-layout-btn-wrap" ref={pickerRef}>
        <button
          className="panes-layout-btn"
          onClick={() => setLayoutPickerOpen((v) => !v)}
          title="Change layout"
        >
          <LayoutGrid size={14} />
        </button>

        {layoutPickerOpen && (
          <div className="panes-layout-picker">
            {groupByCount(PANE_LAYOUTS).map(([count, layouts]) => (
              <div key={count} className="panes-layout-group">
                <div className="panes-layout-group-label">{count} {count === 1 ? "Pane" : "Panes"}</div>
                <div className="panes-layout-group-items">
                  {layouts.map((l) => (
                    <button
                      key={l.id}
                      className={`panes-layout-item ${l.id === panes.layoutId ? "active" : ""}`}
                      onClick={() => handleSelectLayout(l.id)}
                      title={l.label}
                    >
                      <LayoutThumbnail layout={l} />
                      <span className="panes-layout-item-label">{l.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Pane grid */}
      <div
        className="panes-grid"
        style={{
          gridTemplateRows: `repeat(${layout.rows}, 1fr)`,
          gridTemplateColumns: `repeat(${layout.cols}, 1fr)`,
          gridTemplateAreas: layout.areas,
        }}
      >
        {panes.paneOrder.map((id, idx) => (
          <LlmPane key={id} paneId={id} gridArea={`p${idx}`} />
        ))}
      </div>

      <PanesBroadcastBar />
    </div>
  );
}

/** Group layouts by pane count */
function groupByCount(layouts: PaneLayout[]): [number, PaneLayout[]][] {
  const map = new Map<number, PaneLayout[]>();
  for (const l of layouts) {
    const arr = map.get(l.paneCount) ?? [];
    arr.push(l);
    map.set(l.paneCount, arr);
  }
  return Array.from(map.entries()).sort((a, b) => a[0] - b[0]);
}

/** Mini visual preview of a layout */
function LayoutThumbnail({ layout }: { layout: PaneLayout }) {
  // Parse areas: `"p0 p1" "p2 p2"` → [["p0","p1"],["p2","p2"]]
  const rows = layout.areas.match(/"[^"]+"/g)?.map((r) => r.replace(/"/g, "").trim().split(/\s+/)) ?? [];

  return (
    <div
      style={{
        display: "grid",
        gridTemplateRows: `repeat(${rows.length}, 1fr)`,
        gridTemplateColumns: `repeat(${rows[0]?.length ?? 1}, 1fr)`,
        gridTemplateAreas: layout.areas,
        gap: 1,
        width: 32,
        height: 24,
        flexShrink: 0,
      }}
    >
      {Array.from({ length: layout.paneCount }, (_, i) => (
        <div
          key={i}
          style={{
            gridArea: `p${i}`,
            background: "#555",
            borderRadius: 1,
            minWidth: 0,
            minHeight: 0,
          }}
        />
      ))}
    </div>
  );
}

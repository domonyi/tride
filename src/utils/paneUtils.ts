export const PANE_COLORS = [
  "#60a5fa", // blue
  "#f472b6", // pink
  "#34d399", // emerald
  "#fbbf24", // amber
  "#a78bfa", // violet
  "#fb923c", // orange
  "#22d3ee", // cyan
  "#e879f9", // fuchsia
  "#4ade80", // green
];

export interface PaneLayout {
  id: string;
  label: string;
  paneCount: number;
  rows: number;
  cols: number;
  /** CSS grid-template-areas string. Each pane is named "p0", "p1", etc. */
  areas: string;
}

export const PANE_LAYOUTS: PaneLayout[] = [
  // ── 1 Pane ──
  {
    id: "1",
    label: "Single",
    paneCount: 1,
    rows: 1,
    cols: 1,
    areas: `"p0"`,
  },

  // ── 2 Panes ──
  {
    id: "2-cols",
    label: "2 Columns",
    paneCount: 2,
    rows: 1,
    cols: 2,
    areas: `"p0 p1"`,
  },
  {
    id: "2-rows",
    label: "2 Rows",
    paneCount: 2,
    rows: 2,
    cols: 1,
    areas: `"p0" "p1"`,
  },

  // ── 3 Panes ──
  {
    id: "3-cols",
    label: "3 Columns",
    paneCount: 3,
    rows: 1,
    cols: 3,
    areas: `"p0 p1 p2"`,
  },
  {
    id: "3-rows",
    label: "3 Rows",
    paneCount: 3,
    rows: 3,
    cols: 1,
    areas: `"p0" "p1" "p2"`,
  },
  {
    id: "2t-1b",
    label: "2 Top + 1 Bottom",
    paneCount: 3,
    rows: 2,
    cols: 2,
    areas: `"p0 p1" "p2 p2"`,
  },
  {
    id: "1t-2b",
    label: "1 Top + 2 Bottom",
    paneCount: 3,
    rows: 2,
    cols: 2,
    areas: `"p0 p0" "p1 p2"`,
  },
  {
    id: "1l-2r",
    label: "1 Left + 2 Right",
    paneCount: 3,
    rows: 2,
    cols: 2,
    areas: `"p0 p1" "p0 p2"`,
  },
  {
    id: "2l-1r",
    label: "2 Left + 1 Right",
    paneCount: 3,
    rows: 2,
    cols: 2,
    areas: `"p0 p2" "p1 p2"`,
  },

  // ── 4 Panes ──
  {
    id: "2x2",
    label: "2×2 Grid",
    paneCount: 4,
    rows: 2,
    cols: 2,
    areas: `"p0 p1" "p2 p3"`,
  },
  {
    id: "4-cols",
    label: "4 Columns",
    paneCount: 4,
    rows: 1,
    cols: 4,
    areas: `"p0 p1 p2 p3"`,
  },
  {
    id: "1t-3b",
    label: "1 Top + 3 Bottom",
    paneCount: 4,
    rows: 2,
    cols: 3,
    areas: `"p0 p0 p0" "p1 p2 p3"`,
  },
  {
    id: "3t-1b",
    label: "3 Top + 1 Bottom",
    paneCount: 4,
    rows: 2,
    cols: 3,
    areas: `"p0 p1 p2" "p3 p3 p3"`,
  },

  // ── 6 Panes ──
  {
    id: "3x2",
    label: "3×2 Grid",
    paneCount: 6,
    rows: 2,
    cols: 3,
    areas: `"p0 p1 p2" "p3 p4 p5"`,
  },
  {
    id: "2x3",
    label: "2×3 Grid",
    paneCount: 6,
    rows: 3,
    cols: 2,
    areas: `"p0 p1" "p2 p3" "p4 p5"`,
  },

  // ── 9 Panes ──
  {
    id: "3x3",
    label: "3×3 Grid",
    paneCount: 9,
    rows: 3,
    cols: 3,
    areas: `"p0 p1 p2" "p3 p4 p5" "p6 p7 p8"`,
  },
];

export const DEFAULT_LAYOUT_ID = "2-cols";

export function getLayout(id: string): PaneLayout {
  return PANE_LAYOUTS.find((l) => l.id === id) ?? PANE_LAYOUTS.find((l) => l.id === DEFAULT_LAYOUT_ID)!;
}

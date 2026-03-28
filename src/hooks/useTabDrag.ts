import { useRef, useCallback } from "react";

interface DragState {
  index: number;
  startX: number;
  tabRects: DOMRect[];
  currentIndex: number;
  draggedEl: HTMLElement | null;
  pointerId: number;
}

export function useTabDrag(opts: {
  tabSelector: string;
  onReorder: (fromIndex: number, toIndex: number) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);

  const getTabs = useCallback((): HTMLElement[] => {
    if (!containerRef.current) return [];
    return Array.from(containerRef.current.querySelectorAll<HTMLElement>(opts.tabSelector));
  }, [opts.tabSelector]);

  const handlePointerDown = useCallback((e: React.PointerEvent, index: number) => {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest(".close-btn, .project-tab-close")) return;

    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);

    const tabs = getTabs();
    const tabRects = tabs.map((t) => t.getBoundingClientRect());

    dragRef.current = {
      index,
      startX: e.clientX,
      tabRects,
      currentIndex: index,
      draggedEl: el,
      pointerId: e.pointerId,
    };
  }, [getTabs]);

  const handlePointerMove = useCallback((e: React.PointerEvent, index: number) => {
    const drag = dragRef.current;
    if (!drag || drag.index !== index) return;

    const dx = e.clientX - drag.startX;
    if (Math.abs(dx) < 5 && !drag.draggedEl?.classList.contains("tab-dragging")) return;

    const el = drag.draggedEl;
    if (!el) return;

    // Mark as dragging
    el.classList.add("tab-dragging");
    el.style.transform = `translateX(${dx}px)`;
    el.style.zIndex = "100";

    // Determine which position we should be at based on cursor
    const tabs = getTabs();
    const draggedCenter = drag.tabRects[drag.index].left + drag.tabRects[drag.index].width / 2 + dx;

    let newIndex = drag.index;
    for (let i = 0; i < drag.tabRects.length; i++) {
      const rect = drag.tabRects[i];
      const mid = rect.left + rect.width / 2;
      if (i < drag.index && draggedCenter < mid) {
        newIndex = i;
        break;
      }
      if (i > drag.index && draggedCenter > mid) {
        newIndex = i;
      }
    }

    // Apply transforms to displaced tabs
    const draggedWidth = drag.tabRects[drag.index].width + 2; // +2 for gap
    for (let i = 0; i < tabs.length; i++) {
      if (i === drag.index) continue;
      const tab = tabs[i];

      if (drag.index < newIndex && i > drag.index && i <= newIndex) {
        // Dragging right: shift these tabs left
        tab.style.transform = `translateX(${-draggedWidth}px)`;
        tab.style.transition = "transform 0.15s ease";
      } else if (drag.index > newIndex && i >= newIndex && i < drag.index) {
        // Dragging left: shift these tabs right
        tab.style.transform = `translateX(${draggedWidth}px)`;
        tab.style.transition = "transform 0.15s ease";
      } else {
        tab.style.transform = "";
        tab.style.transition = "transform 0.15s ease";
      }
    }

    drag.currentIndex = newIndex;
  }, [getTabs]);

  const handlePointerUp = useCallback((e: React.PointerEvent, index: number) => {
    const drag = dragRef.current;
    if (!drag || drag.index !== index) return;

    const el = drag.draggedEl;
    if (el) {
      el.releasePointerCapture(e.pointerId);
      el.classList.remove("tab-dragging");
      el.style.transform = "";
      el.style.zIndex = "";
    }

    // Clear all tab transforms
    const tabs = getTabs();
    for (const tab of tabs) {
      tab.style.transform = "";
      tab.style.transition = "";
    }

    if (drag.currentIndex !== drag.index) {
      opts.onReorder(drag.index, drag.currentIndex);
    }

    dragRef.current = null;
  }, [getTabs, opts]);

  return { containerRef, handlePointerDown, handlePointerMove, handlePointerUp };
}

import { useState, useRef, useEffect } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { useAppState, useAppDispatch } from "../state/context";
import { useTabDrag } from "../hooks/useTabDrag";
import { useTabOverflow } from "../hooks/useTabOverflow";

const PROJECT_COLORS = [
  "#4a6fa5", "#6a8f6b", "#8b6bb0", "#b07a4a",
  "#4a9b9b", "#b04a6a", "#7a8b4a", "#6a7fb0",
];

export function ProjectTabs() {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const [colorPicker, setColorPicker] = useState<{ projectId: string; x: number; y: number } | null>(null);
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!colorPicker) return;
    const close = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setColorPicker(null);
      }
    };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [colorPicker]);

  const { scrollRef, canScrollLeft, canScrollRight, scrollBy } = useTabOverflow();

  const { containerRef, handlePointerDown, handlePointerMove, handlePointerUp } = useTabDrag({
    tabSelector: ".project-tab:not(.add-tab)",
    onReorder: (fromIndex, toIndex) => {
      dispatch({ type: "REORDER_PROJECTS", fromIndex, toIndex });
    },
  });

  const isMultiline = state.tabOverflowMode === "multiline";
  const showArrows = !isMultiline;

  const addProject = async () => {
    const selected = await open({
      directory: true,
      multiple: false,
      title: "Select project folder",
    });

    if (!selected) return;

    const path = selected as string;
    const name = path.split(/[/\\]/).filter(Boolean).pop() || "Project";

    dispatch({
      type: "ADD_PROJECT",
      project: {
        id: crypto.randomUUID(),
        name,
        path,
        terminals: [],
      },
    });
  };

  // Merge refs
  const mergedRef = (el: HTMLDivElement | null) => {
    (containerRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
    (scrollRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
  };

  return (
    <div className={`project-tabs-wrapper ${isMultiline ? "multiline" : ""}`}>
      {showArrows && canScrollLeft && (
        <button className="tab-arrow tab-arrow-left" onClick={() => scrollBy("left")}>&#x2039;</button>
      )}
      <div className={`project-tabs ${isMultiline ? "multiline" : ""}`} ref={mergedRef}>
        {state.projects.map((project, idx) => {
          return (
            <div
              key={project.id}
              className={`project-tab ${state.activeProjectId === project.id ? "active" : ""}`}
              onClick={() => dispatch({ type: "SET_ACTIVE_PROJECT", projectId: project.id })}
              title={`${project.path}${idx < 9 ? ` (F${idx + 1})` : ""}`}
              onPointerDown={(e) => handlePointerDown(e, idx)}
              onPointerMove={(e) => handlePointerMove(e, idx)}
              onPointerUp={(e) => handlePointerUp(e, idx)}
              onContextMenu={(e) => {
                e.preventDefault();
                setColorPicker({ projectId: project.id, x: e.clientX, y: e.clientY });
              }}
            >
              <span>{project.name}</span>
              <span
                className="project-tab-close"
                onClick={(e) => {
                  e.stopPropagation();
                  dispatch({ type: "REMOVE_PROJECT", projectId: project.id });
                }}
                title="Close project"
              >
                &times;
              </span>
            </div>
          );
        })}
        <button className="project-tab add-tab" onClick={addProject} title="Add project">
          +
        </button>
      </div>
      {showArrows && canScrollRight && (
        <button className="tab-arrow tab-arrow-right" onClick={() => scrollBy("right")}>&#x203a;</button>
      )}
      {colorPicker && (
        <div
          ref={pickerRef}
          className="color-picker-popup"
          style={{ left: colorPicker.x, top: colorPicker.y }}
        >
          {PROJECT_COLORS.map((c) => (
            <button
              key={c}
              className="color-swatch"
              style={{ background: c }}
              onClick={() => {
                dispatch({ type: "SET_PROJECT_COLOR", projectId: colorPicker.projectId, color: c });
                setColorPicker(null);
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

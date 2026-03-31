import type React from "react";
import { useAppState, useAppDispatch } from "../state/context";
import { useTabDrag } from "../hooks/useTabDrag";
import { useTabOverflow } from "../hooks/useTabOverflow";

export function GroupTabs() {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const activeProject = state.projects.find((p) => p.id === state.activeProjectId);

  const { scrollRef, canScrollLeft, canScrollRight, scrollBy } = useTabOverflow();

  const { containerRef, handlePointerDown, handlePointerMove, handlePointerUp } = useTabDrag({
    tabSelector: ".group-tab:not(.add-tab):not(.all-tab)",
    onReorder: (fromIndex, toIndex) => {
      if (activeProject) {
        dispatch({ type: "REORDER_GROUPS", projectId: activeProject.id, fromIndex, toIndex });
      }
    },
  });

  const groups = activeProject?.terminalGroups ?? [];

  if (!activeProject || groups.length === 0) return null;

  const isMultiline = state.tabOverflowMode === "multiline";
  const showArrows = !isMultiline;

  const mergedRef = (el: HTMLDivElement | null) => {
    (containerRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
    (scrollRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
  };

  const addGroup = () => {
    const name = window.prompt("Group name:");
    if (!name) return;
    dispatch({
      type: "CREATE_GROUP",
      projectId: activeProject.id,
      group: { id: crypto.randomUUID(), name, terminalIds: [] },
    });
  };

  const handleRename = (groupId: string) => {
    const group = groups.find((g) => g.id === groupId);
    if (!group) return;
    const name = window.prompt("Rename group:", group.name);
    if (!name || name === group.name) return;
    dispatch({ type: "RENAME_GROUP", projectId: activeProject.id, groupId, name });
  };

  return (
    <div className={`group-tabs-wrapper ${isMultiline ? "multiline" : ""}`}>
      {showArrows && canScrollLeft && (
        <button className="tab-arrow tab-arrow-left" onClick={() => scrollBy("left")}>&#x2039;</button>
      )}
      <div className={`group-tabs ${isMultiline ? "multiline" : ""}`} ref={mergedRef}>
        <div
          className={`group-tab all-tab ${state.activeGroupId === null ? "active" : ""}`}
          onClick={() => dispatch({ type: "SET_ACTIVE_GROUP", groupId: null })}
        >
          <span className="tab-title">All</span>
        </div>
        {groups.map((group, i) => (
          <div
            key={group.id}
            className={`group-tab ${state.activeGroupId === group.id ? "active" : ""}`}
            onClick={() => dispatch({ type: "SET_ACTIVE_GROUP", groupId: group.id })}
            onDoubleClick={() => handleRename(group.id)}
            title={`${group.name} (${group.terminalIds.length} terminals)`}
            onPointerDown={(e) => handlePointerDown(e, i)}
            onPointerMove={(e) => handlePointerMove(e, i)}
            onPointerUp={(e) => handlePointerUp(e, i)}
          >
            <span className="tab-title">{group.name}</span>
            <span className="tab-count">{group.terminalIds.length}</span>
            <span
              className="close-btn"
              onClick={(e) => {
                e.stopPropagation();
                dispatch({ type: "REMOVE_GROUP", projectId: activeProject.id, groupId: group.id });
              }}
            >
              x
            </span>
          </div>
        ))}
        <button className="group-tab add-tab" onClick={addGroup}>
          + Group
        </button>
      </div>
      {showArrows && canScrollRight && (
        <button className="tab-arrow tab-arrow-right" onClick={() => scrollBy("right")}>&#x203a;</button>
      )}
    </div>
  );
}

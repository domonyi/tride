import { useState, useRef, useEffect, useCallback } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { useAppState, useAppDispatch } from "../state/context";
import { useTabDrag } from "../hooks/useTabDrag";
import { useTabOverflow } from "../hooks/useTabOverflow";
import type { ProjectTabGroup, Project } from "../types";

const PROJECT_COLORS = [
  "#4a6fa5", "#6a8f6b", "#8b6bb0", "#b07a4a",
  "#4a9b9b", "#b04a6a", "#7a8b4a", "#6a7fb0",
];

export function ProjectTabs() {
  const state = useAppState();
  const dispatch = useAppDispatch();

  // Context menu state
  const [ctxMenu, setCtxMenu] = useState<{
    projectId: string;
    x: number;
    y: number;
  } | null>(null);
  const [colorSubmenu, setColorSubmenu] = useState(false);
  const [groupSubmenu, setGroupSubmenu] = useState(false);
  const ctxRef = useRef<HTMLDivElement>(null);

  // Group chip rename
  const [renamingGroupId, setRenamingGroupId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const renameRef = useRef<HTMLInputElement>(null);

  // Group chip context menu
  const [groupCtxMenu, setGroupCtxMenu] = useState<{
    groupId: string;
    x: number;
    y: number;
  } | null>(null);
  const groupCtxRef = useRef<HTMLDivElement>(null);

  // Close menus on outside click
  useEffect(() => {
    if (!ctxMenu && !groupCtxMenu) return;
    const close = (e: MouseEvent) => {
      if (ctxRef.current && !ctxRef.current.contains(e.target as Node)) {
        setCtxMenu(null);
        setColorSubmenu(false);
        setGroupSubmenu(false);
      }
      if (groupCtxRef.current && !groupCtxRef.current.contains(e.target as Node)) {
        setGroupCtxMenu(null);
      }
    };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [ctxMenu, groupCtxMenu]);

  // Focus rename input
  useEffect(() => {
    if (renamingGroupId && renameRef.current) {
      renameRef.current.focus();
      renameRef.current.select();
    }
  }, [renamingGroupId]);

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

  // Helper: find group for a project
  const getGroupForProject = useCallback(
    (projectId: string): ProjectTabGroup | undefined =>
      state.projectTabGroups.find((g) => g.projectIds.includes(projectId)),
    [state.projectTabGroups]
  );

  // Build render items: groups are wrapped in a container, ungrouped tabs are standalone
  const renderItems: Array<
    | { type: "group"; group: ProjectTabGroup; projects: { project: Project; index: number }[] }
    | { type: "tab"; project: Project; index: number }
  > = [];

  const renderedGroupIds = new Set<string>();

  state.projects.forEach((project, idx) => {
    const group = getGroupForProject(project.id);
    if (group) {
      if (!renderedGroupIds.has(group.id)) {
        renderedGroupIds.add(group.id);
        const groupProjects = group.collapsed
          ? []
          : group.projectIds
              .map((pid) => {
                const pIdx = state.projects.findIndex((p) => p.id === pid);
                const proj = state.projects[pIdx];
                return proj ? { project: proj, index: pIdx } : null;
              })
              .filter(Boolean) as { project: Project; index: number }[];
        renderItems.push({ type: "group", group, projects: groupProjects });
      }
    } else {
      renderItems.push({ type: "tab", project, index: idx });
    }
  });

  const commitRename = () => {
    if (renamingGroupId && renameValue.trim()) {
      dispatch({ type: "RENAME_PROJECT_GROUP", groupId: renamingGroupId, name: renameValue.trim() });
    }
    setRenamingGroupId(null);
  };

  const renderTab = (project: Project, idx: number, group?: ProjectTabGroup) => {
    const isActive = state.activeProjectId === project.id;
    return (
      <div
        key={project.id}
        className={`project-tab ${isActive ? "active" : ""} ${group ? "grouped" : ""}`}
        onClick={() => dispatch({ type: "SET_ACTIVE_PROJECT", projectId: project.id })}
        title={`${project.path}${idx < 9 ? ` (F${idx + 1})` : ""}`}
        onPointerDown={(e) => handlePointerDown(e, idx)}
        onPointerMove={(e) => handlePointerMove(e, idx)}
        onPointerUp={(e) => handlePointerUp(e, idx)}
        onContextMenu={(e) => {
          e.preventDefault();
          setCtxMenu({ projectId: project.id, x: e.clientX, y: e.clientY });
          setColorSubmenu(false);
          setGroupSubmenu(false);
          setGroupCtxMenu(null);
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
  };

  return (
    <div className={`project-tabs-wrapper ${isMultiline ? "multiline" : ""}`}>
      {showArrows && canScrollLeft && (
        <button className="tab-arrow tab-arrow-left" onClick={() => scrollBy("left")}>&#x2039;</button>
      )}
      <div className={`project-tabs ${isMultiline ? "multiline" : ""}`} ref={mergedRef}>
        {renderItems.map((item) => {
          if (item.type === "group") {
            const { group, projects } = item;

            return (
              <div
                key={`group-${group.id}`}
                className={`tab-group-container ${group.collapsed ? "collapsed" : ""}`}
              >
                <div
                  className={`tab-group-chip ${group.collapsed ? "collapsed" : ""}`}
                  onClick={() => dispatch({ type: "TOGGLE_PROJECT_GROUP_COLLAPSE", groupId: group.id })}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    setRenamingGroupId(group.id);
                    setRenameValue(group.name);
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setGroupCtxMenu({ groupId: group.id, x: e.clientX, y: e.clientY });
                    setCtxMenu(null);
                  }}
                >
                  {renamingGroupId === group.id ? (
                    <input
                      ref={renameRef}
                      className="tab-group-rename-input"
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onBlur={commitRename}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") commitRename();
                        if (e.key === "Escape") setRenamingGroupId(null);
                      }}
                      onClick={(e) => e.stopPropagation()}
                    />
                  ) : (
                    <span className="tab-group-chip-name">{group.name}</span>
                  )}
                </div>
                {projects.map(({ project, index }) =>
                  renderTab(project, index, group)
                )}
              </div>
            );
          }

          const { project, index } = item;
          return renderTab(project, index);
        })}
        <button className="project-tab add-tab" onClick={addProject} title="Add project">
          +
        </button>
      </div>
      {showArrows && canScrollRight && (
        <button className="tab-arrow tab-arrow-right" onClick={() => scrollBy("right")}>&#x203a;</button>
      )}

      {/* ── Project Tab Context Menu ── */}
      {ctxMenu && (
        <div
          ref={ctxRef}
          className="project-ctx-menu"
          style={{ left: ctxMenu.x, top: ctxMenu.y }}
        >
          {/* Color picker */}
          <div
            className="ctx-menu-item"
            onMouseEnter={() => { setColorSubmenu(true); setGroupSubmenu(false); }}
          >
            Color
            <span className="ctx-submenu-arrow">&#x25B6;</span>
            {colorSubmenu && (
              <div className="ctx-submenu color-submenu">
                {PROJECT_COLORS.map((c) => (
                  <button
                    key={c}
                    className="color-swatch"
                    style={{ background: c }}
                    onClick={() => {
                      dispatch({ type: "SET_PROJECT_COLOR", projectId: ctxMenu.projectId, color: c });
                      setCtxMenu(null);
                    }}
                  />
                ))}
              </div>
            )}
          </div>

          <div className="ctx-menu-separator" />

          {/* Add to group / Move to group */}
          {(() => {
            const currentGroup = getGroupForProject(ctxMenu.projectId);
            return (
              <>
                <div
                  className="ctx-menu-item"
                  onMouseEnter={() => { setGroupSubmenu(true); setColorSubmenu(false); }}
                >
                  {currentGroup ? "Move to group" : "Add to group"}
                  <span className="ctx-submenu-arrow">&#x25B6;</span>
                  {groupSubmenu && (
                    <div className="ctx-submenu">
                      {/* New group option */}
                      <div
                        className="ctx-menu-item"
                        onClick={() => {
                          dispatch({
                            type: "CREATE_PROJECT_GROUP",
                            name: "New Group",
                            projectIds: [ctxMenu.projectId],
                          });
                          setCtxMenu(null);
                        }}
                      >
                        + New group
                      </div>
                      {state.projectTabGroups.length > 0 && (
                        <div className="ctx-menu-separator" />
                      )}
                      {state.projectTabGroups
                        .filter((g) => g.id !== currentGroup?.id)
                        .map((g) => (
                          <div
                            key={g.id}
                            className="ctx-menu-item"
                            onClick={() => {
                              dispatch({
                                type: "ADD_TO_PROJECT_GROUP",
                                groupId: g.id,
                                projectId: ctxMenu.projectId,
                              });
                              setCtxMenu(null);
                            }}
                          >
                            {g.name}
                          </div>
                        ))}
                    </div>
                  )}
                </div>

                {/* Remove from group */}
                {currentGroup && (
                  <div
                    className="ctx-menu-item"
                    onClick={() => {
                      dispatch({
                        type: "REMOVE_FROM_PROJECT_GROUP",
                        groupId: currentGroup.id,
                        projectId: ctxMenu.projectId,
                      });
                      setCtxMenu(null);
                    }}
                  >
                    Remove from group
                  </div>
                )}
              </>
            );
          })()}

          <div className="ctx-menu-separator" />

          <div
            className="ctx-menu-item danger"
            onClick={() => {
              dispatch({ type: "REMOVE_PROJECT", projectId: ctxMenu.projectId });
              setCtxMenu(null);
            }}
          >
            Close project
          </div>
        </div>
      )}

      {/* ── Group Chip Context Menu ── */}
      {groupCtxMenu && (
        <div
          ref={groupCtxRef}
          className="project-ctx-menu"
          style={{ left: groupCtxMenu.x, top: groupCtxMenu.y }}
        >
          <div
            className="ctx-menu-item"
            onClick={() => {
              const group = state.projectTabGroups.find((g) => g.id === groupCtxMenu.groupId);
              if (group) {
                setRenamingGroupId(group.id);
                setRenameValue(group.name);
              }
              setGroupCtxMenu(null);
            }}
          >
            Rename group
          </div>

          <div className="ctx-menu-separator" />

          <div
            className="ctx-menu-item"
            onClick={() => {
              dispatch({ type: "UNGROUP_PROJECT_GROUP", groupId: groupCtxMenu.groupId });
              setGroupCtxMenu(null);
            }}
          >
            Ungroup
          </div>

          <div
            className="ctx-menu-item danger"
            onClick={() => {
              const group = state.projectTabGroups.find((g) => g.id === groupCtxMenu.groupId);
              if (group) {
                group.projectIds.forEach((pid) => {
                  dispatch({ type: "REMOVE_PROJECT", projectId: pid });
                });
              }
              dispatch({ type: "REMOVE_PROJECT_GROUP", groupId: groupCtxMenu.groupId });
              setGroupCtxMenu(null);
            }}
          >
            Close group
          </div>
        </div>
      )}
    </div>
  );
}

import { open } from "@tauri-apps/plugin-dialog";
import { useAppState, useAppDispatch } from "../state/context";
import { useTabDrag } from "../hooks/useTabDrag";

export function ProjectTabs() {
  const state = useAppState();
  const dispatch = useAppDispatch();

  const { containerRef, handlePointerDown, handlePointerMove, handlePointerUp } = useTabDrag({
    tabSelector: ".project-tab:not(.add-tab)",
    onReorder: (fromIndex, toIndex) => {
      dispatch({ type: "REORDER_PROJECTS", fromIndex, toIndex });
    },
  });

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

  return (
    <div className="project-tabs" ref={containerRef}>
      {state.projects.map((project, i) => (
        <div
          key={project.id}
          className={`project-tab ${state.activeProjectId === project.id ? "active" : ""}`}
          onClick={() => dispatch({ type: "SET_ACTIVE_PROJECT", projectId: project.id })}
          title={`${project.path}${i < 9 ? ` (F${i + 1})` : ""}`}
          onPointerDown={(e) => handlePointerDown(e, i)}
          onPointerMove={(e) => handlePointerMove(e, i)}
          onPointerUp={(e) => handlePointerUp(e, i)}
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
      ))}
      <button className="project-tab add-tab" onClick={addProject}>
        +
      </button>
    </div>
  );
}

import { open } from "@tauri-apps/plugin-dialog";
import { useAppState, useAppDispatch } from "../state/context";

export function ProjectTabs() {
  const state = useAppState();
  const dispatch = useAppDispatch();

  const addProject = async () => {
    const selected = await open({
      directory: true,
      multiple: false,
      title: "Select project folder",
    });

    if (!selected) return;

    // Use the folder name as the project name
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
    <div className="project-tabs">
      {state.projects.map((project) => (
        <div
          key={project.id}
          className={`project-tab ${state.activeProjectId === project.id ? "active" : ""}`}
          onClick={() => dispatch({ type: "SET_ACTIVE_PROJECT", projectId: project.id })}
          title={project.path}
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

import { useState, useRef, useCallback, useEffect } from "react";
import { useAppState, useAppDispatch } from "../state/context";
import type { TodoItem } from "../types";

export function TodoPanel() {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const [input, setInput] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const editRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const dragStartY = useRef(0);
  const dragEl = useRef<HTMLElement | null>(null);

  // pointer-based reorder
  const onGripDown = useCallback((e: React.PointerEvent, id: string) => {
    e.preventDefault();
    const el = (e.target as HTMLElement).closest(".todo-item") as HTMLElement;
    if (!el) return;
    el.setPointerCapture(e.pointerId);
    dragEl.current = el;
    dragStartY.current = e.clientY;
    setDragId(id);
  }, []);

  useEffect(() => {
    if (!dragId) return;
    const onMove = (e: PointerEvent) => {
      if (!listRef.current) return;
      const items = listRef.current.querySelectorAll<HTMLElement>(".todo-item");
      for (const item of items) {
        const rect = item.getBoundingClientRect();
        if (e.clientY >= rect.top && e.clientY < rect.bottom) {
          const id = item.dataset.todoId ?? null;
          setOverId(id);
          break;
        }
      }
    };
    const onUp = () => {
      if (dragId && overId && dragId !== overId) {
        const fromIndex = state.todos.findIndex((t) => t.id === dragId);
        const toIndex = state.todos.findIndex((t) => t.id === overId);
        if (fromIndex !== -1 && toIndex !== -1) {
          dispatch({ type: "REORDER_TODOS", fromIndex, toIndex });
        }
      }
      setDragId(null);
      setOverId(null);
      dragEl.current = null;
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [dragId, overId, state.todos, dispatch]);

  const addTodo = useCallback(() => {
    const text = input.trim();
    if (!text) return;
    const todo: TodoItem = {
      id: crypto.randomUUID(),
      text,
      done: false,
      createdAt: Date.now(),
    };
    dispatch({ type: "ADD_TODO", todo });
    setInput("");
    inputRef.current?.focus();
  }, [input, dispatch]);

  const startEdit = useCallback((item: TodoItem) => {
    setEditingId(item.id);
    setEditText(item.text);
    setTimeout(() => editRef.current?.focus(), 0);
  }, []);

  const commitEdit = useCallback(() => {
    if (editingId && editText.trim()) {
      dispatch({ type: "UPDATE_TODO", todoId: editingId, updates: { text: editText.trim() } });
    }
    setEditingId(null);
  }, [editingId, editText, dispatch]);

  const pending = state.todos.filter((t) => !t.done);
  const done = state.todos.filter((t) => t.done);

  return (
    <div className="todo-panel">
      <div className="todo-input-row">
        <input
          ref={inputRef}
          className="todo-input"
          type="text"
          placeholder="Add a task..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") addTodo();
            e.stopPropagation();
          }}
        />
        <button className="todo-add-btn" onClick={addTodo} title="Add task">
          +
        </button>
      </div>

      <div className="todo-list" ref={listRef}>
        {pending.length === 0 && done.length === 0 && (
          <div className="todo-empty">No tasks yet</div>
        )}

        {pending.map((item) => (
          <div
            key={item.id}
            data-todo-id={item.id}
            className={`todo-item${overId === item.id && dragId !== item.id ? " todo-drag-over" : ""}${dragId === item.id ? " todo-dragging" : ""}`}
          >
            <span
              className="todo-grip"
              onPointerDown={(e) => onGripDown(e, item.id)}
              title="Drag to reorder"
            >⠿</span>
            <button
              className="todo-check"
              onClick={() => dispatch({ type: "UPDATE_TODO", todoId: item.id, updates: { done: true } })}
              title="Mark done"
            />
            {editingId === item.id ? (
              <input
                ref={editRef}
                className="todo-edit-input"
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitEdit();
                  if (e.key === "Escape") setEditingId(null);
                  e.stopPropagation();
                }}
                onBlur={commitEdit}
              />
            ) : (
              <span className="todo-text" onDoubleClick={() => startEdit(item)}>
                {item.text}
              </span>
            )}
            <button
              className="todo-delete"
              onClick={() => dispatch({ type: "REMOVE_TODO", todoId: item.id })}
              title="Delete"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
            </button>
          </div>
        ))}

        {done.length > 0 && (
          <>
            <div className="todo-section-header">
              <span>Done ({done.length})</span>
              <button
                className="todo-clear-done"
                onClick={() => done.forEach((t) => dispatch({ type: "REMOVE_TODO", todoId: t.id }))}
              >
                Clear
              </button>
            </div>
            {done.map((item) => (
              <div
                key={item.id}
                data-todo-id={item.id}
                className={`todo-item done${overId === item.id && dragId !== item.id ? " todo-drag-over" : ""}${dragId === item.id ? " todo-dragging" : ""}`}
              >
                <span
                  className="todo-grip"
                  onPointerDown={(e) => onGripDown(e, item.id)}
                  title="Drag to reorder"
                >⠿</span>
                <button
                  className="todo-check checked"
                  onClick={() => dispatch({ type: "UPDATE_TODO", todoId: item.id, updates: { done: false } })}
                  title="Undo"
                />
                <span className="todo-text">{item.text}</span>
                <button
                  className="todo-delete"
                  onClick={() => dispatch({ type: "REMOVE_TODO", todoId: item.id })}
                  title="Delete"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
                </button>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

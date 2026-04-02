import { useRef, useEffect, useCallback } from "react";
import { useAppState, useAppDispatch } from "../state/context";
import { PANE_COLORS } from "../utils/paneUtils";
import { X } from "lucide-react";

export function PanesBroadcastBar() {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const { panes } = state;
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (panes.broadcastOpen) {
      setTimeout(() => textareaRef.current?.focus(), 50);
    }
  }, [panes.broadcastOpen]);

  const handleClose = useCallback(() => {
    dispatch({ type: "PANES_CLOSE_BROADCAST" });
  }, [dispatch]);

  const handleSend = useCallback(() => {
    const text = panes.broadcastDraft.trim();
    if (!text || panes.broadcastTargets.length === 0) return;

    // TODO: wire broadcast to send text to each pane's Claude SDK session
    // For now, broadcast is a placeholder
    dispatch({ type: "PANES_CLOSE_BROADCAST" });
  }, [dispatch, panes.broadcastDraft, panes.broadcastTargets, panes.panes]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
      if (e.key === "Escape") {
        e.preventDefault();
        handleClose();
      }
    },
    [handleSend, handleClose],
  );

  useEffect(() => {
    const ta = textareaRef.current;
    if (ta) {
      ta.style.height = "auto";
      ta.style.height = Math.min(ta.scrollHeight, 120) + "px";
    }
  }, [panes.broadcastDraft]);

  if (!panes.broadcastOpen) return null;

  const targetColors = panes.broadcastTargets.map((id) => {
    const pane = panes.panes[id];
    return pane ? PANE_COLORS[pane.index % PANE_COLORS.length] : "#555";
  });

  const stripeGradient =
    targetColors.length > 0
      ? `linear-gradient(90deg, ${targetColors.map((c, i) => `${c} ${(i / targetColors.length) * 100}%, ${c} ${((i + 1) / targetColors.length) * 100}%`).join(", ")})`
      : "var(--bg-active)";

  return (
    <div className="pane-broadcast-bar">
      <div className="pane-broadcast-stripe" style={{ background: stripeGradient }} />
      <div className="pane-broadcast-header">
        <span className="pane-broadcast-label">BROADCAST</span>
        <span className="pane-broadcast-info">
          {panes.broadcastTargets.length} of {panes.paneOrder.length} panes
        </span>
        <div className="pane-broadcast-targets">
          {panes.paneOrder.map((id) => {
            const pane = panes.panes[id];
            if (!pane) return null;
            const color = PANE_COLORS[pane.index % PANE_COLORS.length];
            const isTarget = panes.broadcastTargets.includes(id);
            return (
              <button
                key={id}
                className={`pane-broadcast-target-btn ${isTarget ? "active" : ""}`}
                style={isTarget ? { background: color, borderColor: color } : { borderColor: color, color }}
                onClick={() => dispatch({ type: "PANES_TOGGLE_BROADCAST_TARGET", paneId: id })}
                title={`Pane ${pane.index + 1}: ${pane.label}`}
              >
                {pane.index + 1}
              </button>
            );
          })}
        </div>
        <button className="pane-broadcast-close" onClick={handleClose} title="Close (Esc)">
          <X size={12} />
        </button>
      </div>
      <div className="pane-broadcast-input-row">
        <textarea
          ref={textareaRef}
          className="pane-broadcast-textarea"
          placeholder="Type a message to send to all selected panes..."
          value={panes.broadcastDraft}
          onChange={(e) => dispatch({ type: "PANES_SET_BROADCAST_DRAFT", text: e.target.value })}
          onKeyDown={handleKeyDown}
          rows={1}
        />
        <button
          className="pane-broadcast-send"
          onClick={handleSend}
          disabled={!panes.broadcastDraft.trim() || panes.broadcastTargets.length === 0}
        >
          Broadcast
        </button>
      </div>
    </div>
  );
}

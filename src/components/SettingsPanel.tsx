import { useAppState, useAppDispatch } from "../state/context";
import type { DefaultLlm, DefaultShell } from "../types";

const THEMES = [
  { id: "tokyo-night", name: "Tokyo Night" },
  { id: "andromeeda", name: "Andromeeda" },
  { id: "aurora-x", name: "Aurora X" },
  { id: "ayu-dark", name: "Ayu Dark" },
  { id: "catppuccin-mocha", name: "Catppuccin Mocha" },
  { id: "catppuccin-macchiato", name: "Catppuccin Macchiato" },
  { id: "catppuccin-frappe", name: "Catppuccin Frappe" },
  { id: "dark-plus", name: "Dark+" },
  { id: "dracula", name: "Dracula" },
  { id: "dracula-soft", name: "Dracula Soft" },
  { id: "everforest-dark", name: "Everforest Dark" },
  { id: "github-dark", name: "GitHub Dark" },
  { id: "github-dark-default", name: "GitHub Dark Default" },
  { id: "github-dark-dimmed", name: "GitHub Dark Dimmed" },
  { id: "gruvbox-dark-medium", name: "Gruvbox Dark" },
  { id: "houston", name: "Houston" },
  { id: "kanagawa-wave", name: "Kanagawa Wave" },
  { id: "kanagawa-dragon", name: "Kanagawa Dragon" },
  { id: "laserwave", name: "Laserwave" },
  { id: "material-theme", name: "Material Theme" },
  { id: "material-theme-darker", name: "Material Darker" },
  { id: "material-theme-ocean", name: "Material Ocean" },
  { id: "material-theme-palenight", name: "Material Palenight" },
  { id: "min-dark", name: "Min Dark" },
  { id: "monokai", name: "Monokai" },
  { id: "night-owl", name: "Night Owl" },
  { id: "nord", name: "Nord" },
  { id: "one-dark-pro", name: "One Dark Pro" },
  { id: "plastic", name: "Plastic" },
  { id: "poimandres", name: "Poimandres" },
  { id: "red", name: "Red" },
  { id: "rose-pine", name: "Rose Pine" },
  { id: "rose-pine-moon", name: "Rose Pine Moon" },
  { id: "slack-dark", name: "Slack Dark" },
  { id: "solarized-dark", name: "Solarized Dark" },
  { id: "synthwave-84", name: "Synthwave '84" },
  { id: "vesper", name: "Vesper" },
  { id: "vitesse-black", name: "Vitesse Black" },
  { id: "vitesse-dark", name: "Vitesse Dark" },
];

const IS_WINDOWS = navigator.platform.startsWith("Win");
const IS_MAC = navigator.platform.startsWith("Mac");

const SHELL_OPTIONS = IS_WINDOWS
  ? [
      { id: "powershell", name: "PowerShell" },
      { id: "cmd", name: "Command Prompt (cmd)" },
    ]
  : [
      { id: "bash", name: "Bash" },
      { id: "zsh", name: "Zsh" },
      { id: "fish", name: "Fish" },
    ];

export function SettingsPanel({ onClose }: { onClose: () => void }) {
  const state = useAppState();
  const dispatch = useAppDispatch();

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-panel" onClick={(e) => e.stopPropagation()}>
        <div className="settings-header">
          <span>Settings</span>
          <button className="settings-close" onClick={onClose}>&times;</button>
        </div>
        <div className="settings-body">
          <div className="settings-section">
            <label className="settings-label">Editor Theme</label>
            <select
              className="settings-select"
              value={state.editorTheme}
              onChange={(e) => dispatch({ type: "SET_EDITOR_THEME", theme: e.target.value })}
            >
              {THEMES.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>

          <div className="settings-section">
            <label className="settings-label">Default Terminal Shell</label>
            <select
              className="settings-select"
              value={state.defaultShell}
              onChange={(e) => dispatch({ type: "SET_DEFAULT_SHELL", shell: e.target.value as DefaultShell })}
            >
              {SHELL_OPTIONS.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>

          <div className="settings-section">
            <label className="settings-label">Default LLM</label>
            <select
              className="settings-select"
              value={state.defaultLlm}
              onChange={(e) => dispatch({ type: "SET_DEFAULT_LLM", llm: e.target.value as DefaultLlm })}
            >
              <option value="none">None</option>
              <option value="claude">Claude</option>
              <option value="codex">Codex</option>
              <option value="custom">Custom command</option>
            </select>
            <span className="settings-hint">
              {state.defaultLlm === "none"
                ? "Terminal opens with a plain shell"
                : state.defaultLlm === "custom"
                ? "Runs your custom command on terminal start"
                : `Runs "${state.defaultLlm}" on terminal start`}
            </span>
          </div>

          {state.defaultLlm === "custom" && (
            <div className="settings-section">
              <label className="settings-label">Custom Command</label>
              <input
                className="settings-input"
                type="text"
                placeholder="e.g. claude --resume"
                value={state.customLlmCommand}
                onChange={(e) => dispatch({ type: "SET_CUSTOM_LLM_COMMAND", command: e.target.value })}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

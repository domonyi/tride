import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { initPtyBuffer } from "./ptyBuffer";
import { initClaudeBuffer } from "./claudeBuffer";

// Start buffering PTY and Claude output globally before any component mounts
initPtyBuffer();
initClaudeBuffer();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);

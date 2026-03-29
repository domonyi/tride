import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { initPtyBuffer } from "./ptyBuffer";

// Start buffering PTY output globally before any component mounts
initPtyBuffer();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);

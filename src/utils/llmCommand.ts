import type { DefaultLlm } from "../types";

const LLM_COMMANDS: Record<string, string> = {
  claude: "claude",
  codex: "codex",
};

export function getLlmCommand(llm: DefaultLlm, customCommand: string): string | null {
  if (llm === "none") return null;
  if (llm === "custom") return customCommand.trim() || null;
  return LLM_COMMANDS[llm] ?? null;
}

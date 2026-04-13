import React from "react";
import {
  FileText,
  Pencil,
  FilePlus,
  Terminal,
  Search,
  FolderSearch,
  Bot,
  Globe,
  Download,
  Code,
  NotebookPen,
  CheckCircle,
  Puzzle,
  Wrench,
} from "lucide-react";

const TOOL_ICON_MAP: Record<string, React.ReactNode> = {
  Read:          <FileText size={13} />,
  Edit:          <Pencil size={13} />,
  Write:         <FilePlus size={13} />,
  Bash:          <Terminal size={13} />,
  Grep:          <Search size={13} />,
  Glob:          <FolderSearch size={13} />,
  Agent:         <Bot size={13} />,
  WebSearch:     <Globe size={13} />,
  WebFetch:      <Download size={13} />,
  LSP:           <Code size={13} />,
  NotebookEdit:  <NotebookPen size={13} />,
  TodoWrite:     <CheckCircle size={13} />,
  Skill:         <Puzzle size={13} />,
  ToolSearch:    <Search size={13} />,
};

const DEFAULT_ICON = <Wrench size={13} />;

export function getToolLucideIcon(toolName: string): React.ReactNode {
  return TOOL_ICON_MAP[toolName] ?? DEFAULT_ICON;
}

import React, { memo, useState, useCallback } from "react";

/**
 * Lightweight Markdown renderer for chat messages.
 * Handles: headings, bold, italic, inline code, code blocks,
 * bullet/numbered lists, links, and horizontal rules.
 * No external dependencies.
 */

interface MarkdownProps {
  text: string;
  className?: string;
}

/** Render a fenced code block with optional language label */
function CodeBlock({ code, lang }: { code: string; lang?: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [code]);

  return (
    <div className="chat-code-block">
      <div className="chat-code-header">
        <span className="chat-code-lang">{lang || "text"}</span>
        <button className="chat-code-copy" onClick={handleCopy}>
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="chat-code-pre">
        <code>{code}</code>
      </pre>
    </div>
  );
}

/** Parse inline markdown (bold, italic, code, links) into React nodes */
function parseInline(text: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  let remaining = text;
  let key = 0;

  while (remaining.length > 0) {
    // Inline code: `...`
    let match = remaining.match(/^`([^`]+)`/);
    if (match) {
      nodes.push(<code key={key++} className="chat-inline-code">{match[1]}</code>);
      remaining = remaining.slice(match[0].length);
      continue;
    }

    // Bold: **...** or __...__
    match = remaining.match(/^(\*\*|__)(.+?)\1/);
    if (match) {
      nodes.push(<strong key={key++}>{parseInline(match[2])}</strong>);
      remaining = remaining.slice(match[0].length);
      continue;
    }

    // Italic: *...* or _..._  (but not ** or __)
    match = remaining.match(/^(\*|_)(?!\1)(.+?)\1/);
    if (match) {
      nodes.push(<em key={key++}>{parseInline(match[2])}</em>);
      remaining = remaining.slice(match[0].length);
      continue;
    }

    // Strikethrough: ~~...~~
    match = remaining.match(/^~~(.+?)~~/);
    if (match) {
      nodes.push(<del key={key++}>{parseInline(match[1])}</del>);
      remaining = remaining.slice(match[0].length);
      continue;
    }

    // Link: [text](url)
    match = remaining.match(/^\[([^\]]+)\]\(([^)]+)\)/);
    if (match) {
      nodes.push(
        <a
          key={key++}
          href={match[2]}
          className="chat-link"
          target="_blank"
          rel="noopener noreferrer"
        >
          {match[1]}
        </a>
      );
      remaining = remaining.slice(match[0].length);
      continue;
    }

    // Plain text — consume until next special character
    match = remaining.match(/^[^`*_~\[]+/);
    if (match) {
      nodes.push(match[0]);
      remaining = remaining.slice(match[0].length);
      continue;
    }

    // Single special char that didn't start a pattern — output it literally
    nodes.push(remaining[0]);
    remaining = remaining.slice(1);
  }

  return nodes;
}

/** Parse full markdown text into block-level React elements */
export const Markdown = memo(function Markdown({ text, className }: MarkdownProps) {
  const elements: React.ReactNode[] = [];
  const lines = text.split("\n");
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Fenced code block: ```lang
    if (line.trimStart().startsWith("```")) {
      const lang = line.trimStart().slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trimStart().startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // skip closing ```
      elements.push(<CodeBlock key={key++} code={codeLines.join("\n")} lang={lang || undefined} />);
      continue;
    }

    // Heading: # ## ### etc
    const headingMatch = line.match(/^(#{1,6})\s+(.+)/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const content = parseInline(headingMatch[2]);
      const cls = `chat-heading chat-h${level}`;
      if (level === 1) elements.push(<h1 key={key++} className={cls}>{content}</h1>);
      else if (level === 2) elements.push(<h2 key={key++} className={cls}>{content}</h2>);
      else if (level === 3) elements.push(<h3 key={key++} className={cls}>{content}</h3>);
      else if (level === 4) elements.push(<h4 key={key++} className={cls}>{content}</h4>);
      else if (level === 5) elements.push(<h5 key={key++} className={cls}>{content}</h5>);
      else elements.push(<h6 key={key++} className={cls}>{content}</h6>);
      i++;
      continue;
    }

    // Horizontal rule: ---, ***, ___
    if (/^(\-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      elements.push(<hr key={key++} className="chat-hr" />);
      i++;
      continue;
    }

    // Bullet list
    if (/^\s*[-*+]\s/.test(line)) {
      const items: React.ReactNode[] = [];
      while (i < lines.length && /^\s*[-*+]\s/.test(lines[i])) {
        const itemText = lines[i].replace(/^\s*[-*+]\s+/, "");
        items.push(<li key={items.length}>{parseInline(itemText)}</li>);
        i++;
      }
      elements.push(<ul key={key++} className="chat-list">{items}</ul>);
      continue;
    }

    // Numbered list
    if (/^\s*\d+[.)]\s/.test(line)) {
      const items: React.ReactNode[] = [];
      while (i < lines.length && /^\s*\d+[.)]\s/.test(lines[i])) {
        const itemText = lines[i].replace(/^\s*\d+[.)]\s+/, "");
        items.push(<li key={items.length}>{parseInline(itemText)}</li>);
        i++;
      }
      elements.push(<ol key={key++} className="chat-list">{items}</ol>);
      continue;
    }

    // Blockquote: > text
    if (line.startsWith("> ")) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].startsWith("> ")) {
        quoteLines.push(lines[i].slice(2));
        i++;
      }
      elements.push(
        <blockquote key={key++} className="chat-blockquote">
          {parseInline(quoteLines.join("\n"))}
        </blockquote>
      );
      continue;
    }

    // Empty line
    if (line.trim() === "") {
      i++;
      continue;
    }

    // Paragraph — collect consecutive non-empty, non-special lines
    const paraLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !lines[i].trimStart().startsWith("```") &&
      !lines[i].match(/^#{1,6}\s/) &&
      !lines[i].match(/^\s*[-*+]\s/) &&
      !lines[i].match(/^\s*\d+[.)]\s/) &&
      !lines[i].startsWith("> ") &&
      !/^(\-{3,}|\*{3,}|_{3,})\s*$/.test(lines[i])
    ) {
      paraLines.push(lines[i]);
      i++;
    }
    if (paraLines.length > 0) {
      elements.push(
        <p key={key++} className="chat-paragraph">
          {parseInline(paraLines.join("\n"))}
        </p>
      );
    }
  }

  return <div className={`chat-markdown ${className ?? ""}`}>{elements}</div>;
});

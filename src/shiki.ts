import { createHighlighter } from "shiki";
import { textmateThemeToMonacoTheme } from "@shikijs/monaco";
import { INITIAL } from "@shikijs/vscode-textmate";
import type { Monaco } from "@monaco-editor/react";

// State wrapper for TextMate tokenizer
class TokenizerState {
  constructor(public ruleStack: any) {}
  clone() { return new TokenizerState(this.ruleStack); }
  equals(other: any) { return other instanceof TokenizerState && other.ruleStack === this.ruleStack; }
}

// Shiki highlighter — initialized once, shared across editor instances
let shikiHighlighter: Awaited<ReturnType<typeof createHighlighter>> | null = null;
let shikiInitPromise: Promise<void> | null = null;

function registerThemeInMonaco(monaco: Monaco, theme: string) {
  if (!shikiHighlighter) return;
  const monacoTheme = textmateThemeToMonacoTheme(shikiHighlighter.getTheme(theme));
  monaco.editor.defineTheme(theme, monacoTheme);
}

function registerTokenProviders(monaco: Monaco) {
  if (!shikiHighlighter) return;
  const monacoLangs = new Set(monaco.languages.getLanguages().map((l: any) => l.id));
  const langAliases: Record<string, string> = { "typescript-lsp": "tsx", "javascript-lsp": "jsx" };

  for (const lang of [...shikiHighlighter.getLoadedLanguages(), ...Object.keys(langAliases)]) {
    if (!monacoLangs.has(lang)) continue;
    const grammarLang = langAliases[lang] || lang;
    let grammar: any;
    try { grammar = shikiHighlighter.getLanguage(grammarLang); } catch { continue; }

    monaco.languages.setTokensProvider(lang, {
      getInitialState() { return new TokenizerState(INITIAL); },
      tokenize(line: string, state: any) {
        if (line.length >= 20000) {
          return { endState: state, tokens: [{ startIndex: 0, scopes: "" }] };
        }
        const result = grammar.tokenizeLine(line, state.ruleStack, 500);
        const tokens: { startIndex: number; scopes: string }[] = [];
        for (const tok of result.tokens) {
          const scope = tok.scopes[tok.scopes.length - 1] || "";
          tokens.push({ startIndex: tok.startIndex, scopes: scope });
        }
        return { endState: new TokenizerState(result.ruleStack), tokens };
      },
    } as any);
  }
}

export async function initShiki(monaco: Monaco, theme: string) {
  if (shikiHighlighter) {
    // Already initialized — just load and apply the new theme
    if (!shikiHighlighter.getLoadedThemes().includes(theme)) {
      await shikiHighlighter.loadTheme(theme as any);
    }
    registerThemeInMonaco(monaco, theme);
    monaco.editor.setTheme(theme);
    return;
  }

  // Prevent double init if called concurrently
  if (shikiInitPromise) { await shikiInitPromise; return initShiki(monaco, theme); }

  shikiInitPromise = (async () => {
    shikiHighlighter = await createHighlighter({
      themes: [theme as any],
      langs: [
        "typescript", "tsx", "javascript", "jsx",
        "rust", "python", "json", "css", "html",
        "markdown", "toml", "yaml", "shellscript",
        "sql", "go", "java", "cpp", "c",
        "csharp", "ruby", "php", "swift", "kotlin",
        "lua", "xml", "vue", "svelte",
      ],
    });

    // Register custom language IDs for LSP
    monaco.languages.register({ id: "typescript-lsp" });
    monaco.languages.register({ id: "javascript-lsp" });

    // Register TextMate token providers for all languages
    registerTokenProviders(monaco);

    // Register and apply the theme
    registerThemeInMonaco(monaco, theme);
    monaco.editor.setTheme(theme);
  })();

  await shikiInitPromise;
}

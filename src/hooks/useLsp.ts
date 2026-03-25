import { useEffect, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { Monaco } from "@monaco-editor/react";
import type { editor, languages, Position, IDisposable } from "monaco-editor";

interface LspMessageEvent {
  id: string;
  data: string;
}

interface LspRequest {
  resolve: (result: any) => void;
  reject: (error: any) => void;
}

function fileToUri(filePath: string): string {
  return "file:///" + filePath.replace(/\\/g, "/").replace(/^\//, "");
}

/** Convert Monaco's model URI to the format tsserver expects.
 *  Monaco encodes ':' as '%3A' and lowercases the drive letter.
 *  tsserver expects: file:///C:/... with unencoded colon and uppercase drive. */
function modelUriToLspUri(monacoUri: string): string {
  let uri = decodeURIComponent(monacoUri);
  // Uppercase the drive letter: file:///c:/ -> file:///C:/
  uri = uri.replace(/^file:\/\/\/([a-z]):/, (_, letter) => `file:///${letter.toUpperCase()}:`);
  return uri;
}

function lspPos(line: number, col: number) {
  return { line: line - 1, character: col - 1 };
}

/**
 * Full LSP integration — tsserver handles hover, completion, diagnostics.
 * Monaco's built-in TS worker is disabled; only the tokenizer runs for syntax colors.
 */
export function useLsp(monaco: Monaco | null, projectRoot: string | null) {
  const lspId = useRef<string | null>(null);
  const reqId = useRef(1);
  const pending = useRef<Map<number, LspRequest>>(new Map());
  const ready = useRef(false);
  const monacoRef = useRef(monaco);
  const disposables = useRef<IDisposable[]>([]);
  const providersRegistered = useRef(false);
  monacoRef.current = monaco;

  // Stable ref so providers can access current sendRequest
  const sendReqFn = useRef<((m: string, p: any) => Promise<any>) | null>(null);

  // (Rust backend finds typescript-language-server automatically by searching upward from exe)

  const sendMsg = useCallback((method: string, params: any, id?: number) => {
    if (!lspId.current) return;
    const msg: any = { jsonrpc: "2.0", method, params };
    if (id !== undefined) msg.id = id;
    invoke("lsp_send", { id: lspId.current, message: JSON.stringify(msg) }).catch(() => {});
  }, []);

  const sendRequest = useCallback((method: string, params: any): Promise<any> => {
    return new Promise((resolve, reject) => {
      const id = reqId.current++;
      pending.current.set(id, { resolve, reject });
      sendMsg(method, params, id);
      setTimeout(() => {
        if (pending.current.has(id)) {
          pending.current.delete(id);
          reject(new Error("LSP timeout"));
        }
      }, 15000);
    });
  }, [sendMsg]);

  const notify = useCallback((method: string, params: any) => {
    sendMsg(method, params);
  }, [sendMsg]);

  // sendReqFn is set directly when ready becomes true (in the start() function below)

  // Register Monaco providers backed by LSP
  const registerProviders = useCallback((m: Monaco) => {
    if (providersRegistered.current) return;
    providersRegistered.current = true;

    const langs = ["typescript-lsp", "javascript-lsp"];

    for (const lang of langs) {
      // Hover
      disposables.current.push(
        m.languages.registerHoverProvider(lang, {
          provideHover: async (model: editor.ITextModel, position: Position) => {
            const fn = sendReqFn.current;
            if (!fn) return null;
            try {
              // Use our own URI format, not Monaco's (which encodes ':' as '%3A')
              const uri = modelUriToLspUri(model.uri.toString());
              const r = await fn("textDocument/hover", {
                textDocument: { uri },
                position: lspPos(position.lineNumber, position.column),
              });
              if (!r?.contents) return null;
              let value: string;
              if (typeof r.contents === "string") value = r.contents;
              else if (r.contents.value) value = r.contents.value;
              else if (Array.isArray(r.contents)) value = r.contents.map((c: any) => typeof c === "string" ? c : c.value).join("\n\n");
              else value = String(r.contents);

              return {
                range: r.range ? {
                  startLineNumber: r.range.start.line + 1,
                  startColumn: r.range.start.character + 1,
                  endLineNumber: r.range.end.line + 1,
                  endColumn: r.range.end.character + 1,
                } : undefined,
                contents: [{ value, isTrusted: true }],
              };
            } catch { return null; }
          },
        })
      );

      // Completion
      disposables.current.push(
        m.languages.registerCompletionItemProvider(lang, {
          triggerCharacters: [".", '"', "'", "/", "<", "@"],
          provideCompletionItems: async (model: editor.ITextModel, position: Position) => {
            const fn = sendReqFn.current;
            if (!fn) return { suggestions: [] };
            try {
              const uri = modelUriToLspUri(model.uri.toString());
              const r = await fn("textDocument/completion", {
                textDocument: { uri },
                position: lspPos(position.lineNumber, position.column),
              });
              if (!r) return { suggestions: [] };
              const items = Array.isArray(r) ? r : r.items || [];
              return {
                suggestions: items.map((item: any) => ({
                  label: item.label,
                  kind: mapCompletionKind(m, item.kind),
                  insertText: item.insertText || item.label,
                  detail: item.detail,
                  documentation: item.documentation?.value || item.documentation,
                  sortText: item.sortText,
                  filterText: item.filterText,
                  range: undefined as any,
                })),
              };
            } catch { return { suggestions: [] }; }
          },
        })
      );

      // Signature help
      disposables.current.push(
        m.languages.registerSignatureHelpProvider(lang, {
          signatureHelpTriggerCharacters: ["(", ","],
          provideSignatureHelp: async (model: editor.ITextModel, position: Position) => {
            const fn = sendReqFn.current;
            if (!fn) return null;
            try {
              const uri = modelUriToLspUri(model.uri.toString());
              const r = await fn("textDocument/signatureHelp", {
                textDocument: { uri },
                position: lspPos(position.lineNumber, position.column),
              });
              if (!r) return null;
              return {
                value: {
                  signatures: (r.signatures || []).map((s: any) => ({
                    label: s.label,
                    documentation: s.documentation?.value || s.documentation,
                    parameters: (s.parameters || []).map((p: any) => ({
                      label: p.label,
                      documentation: p.documentation?.value || p.documentation,
                    })),
                  })),
                  activeSignature: r.activeSignature ?? 0,
                  activeParameter: r.activeParameter ?? 0,
                },
                dispose: () => {},
              };
            } catch { return null; }
          },
        })
      );
    }
  }, []);

  const handleMsg = useCallback((data: string) => {
    let msg: any;
    try { msg = JSON.parse(data); } catch { return; }

    // Response
    if (msg.id !== undefined && !msg.method) {
      const p = pending.current.get(msg.id);
      if (p) {
        pending.current.delete(msg.id);
        if (msg.error) p.reject(msg.error); else p.resolve(msg.result);
      }
      return;
    }

    // Diagnostics
    if (msg.method === "textDocument/publishDiagnostics") {
      const m = monacoRef.current;
      if (!m) return;
      const params = msg.params;
      const uri = m.Uri.parse(params.uri);
      const model = m.editor.getModel(uri);
      if (!model) return;
      m.editor.setModelMarkers(model, "lsp", (params.diagnostics || []).map((d: any) => ({
        severity: d.severity === 1 ? m.MarkerSeverity.Error
          : d.severity === 2 ? m.MarkerSeverity.Warning
          : d.severity === 3 ? m.MarkerSeverity.Info
          : m.MarkerSeverity.Hint,
        startLineNumber: d.range.start.line + 1,
        startColumn: d.range.start.character + 1,
        endLineNumber: d.range.end.line + 1,
        endColumn: d.range.end.character + 1,
        message: d.message,
        source: d.source || "ts",
      })));
    }
  }, []);

  // Start/stop LSP
  useEffect(() => {
    if (!projectRoot || !monaco) return;

    let unlisten: UnlistenFn | null = null;
    const id = `lsp-${projectRoot.replace(/[^a-zA-Z0-9]/g, "-")}`;

    // Disable Monaco's built-in TS worker entirely — LSP handles everything
    monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions({
      noSemanticValidation: true,
      noSyntaxValidation: true,
    });
    monaco.languages.typescript.javascriptDefaults.setDiagnosticsOptions({
      noSemanticValidation: true,
      noSyntaxValidation: true,
    });

    registerProviders(monaco);

    const debugLog: string[] = [];
    const debug = (msg: string) => {
      debugLog.push(`[${new Date().toISOString()}] ${msg}`);
      invoke("write_file", {
        path: projectRoot!.replace(/\\/g, "/") + "/.aiterminal-lsp-debug.txt",
        content: debugLog.join("\n"),
      }).catch(() => {});
    };

    const start = async () => {
      debug(`Starting LSP for project: ${projectRoot}`);
      debug(`Project root: ${projectRoot}`);
      debug(`LSP ID: ${id}`);

      unlisten = await listen<LspMessageEvent>("lsp-message", (event) => {
        if (event.payload.id === id) {
          debug(`LSP response: ${event.payload.data.substring(0, 200)}`);
          handleMsg(event.payload.data);
        }
      });

      try {
        await invoke("lsp_start", { id, projectRoot });
        debug("lsp_start succeeded");
        lspId.current = id;

        const rootUri = fileToUri(projectRoot);
        debug(`Sending initialize, rootUri: ${rootUri}`);
        await sendRequest("initialize", {
          processId: null,
          rootUri,
          rootPath: projectRoot,
          capabilities: {
            textDocument: {
              hover: { contentFormat: ["markdown", "plaintext"] },
              completion: {
                completionItem: { snippetSupport: true, documentationFormat: ["markdown", "plaintext"] },
              },
              signatureHelp: { signatureInformation: { documentationFormat: ["markdown", "plaintext"] } },
              publishDiagnostics: { relatedInformation: true },
              definition: {},
              references: {},
            },
            workspace: { workspaceFolders: true },
          },
          workspaceFolders: [{ uri: rootUri, name: projectRoot.split(/[/\\]/).pop() || "project" }],
        });
        notify("initialized", {});
        ready.current = true;
        sendReqFn.current = sendRequest;
        debug("LSP fully initialized, ready=true, sendReqFn set");
        // Flush any didOpen calls that were queued before init
        debug(`Flushing ${openQueue.current.length} queued didOpen calls`);
        for (const item of openQueue.current) {
          debug(`  didOpen: ${item.uri}`);
          notify("textDocument/didOpen", { textDocument: { uri: item.uri, languageId: item.languageId, version: item.version, text: item.text } });
        }
        openQueue.current = [];
      } catch (e) {
        debug(`LSP start FAILED: ${e}`);
        console.error("Failed to start LSP:", e);
      }
    };

    start();

    return () => {
      unlisten?.();
      ready.current = false;
      sendReqFn.current = null;
      pending.current.clear();
      if (lspId.current) {
        invoke("lsp_stop", { id: lspId.current }).catch(() => {});
        lspId.current = null;
      }
    };
  }, [projectRoot, monaco]); // eslint-disable-line react-hooks/exhaustive-deps

  // Cleanup providers on unmount
  useEffect(() => {
    return () => {
      for (const d of disposables.current) d.dispose();
      disposables.current = [];
      providersRegistered.current = false;
    };
  }, []);

  // Queue for didOpen calls that arrive before LSP is ready
  const openQueue = useRef<Array<{ uri: string; languageId: string; version: number; text: string }>>([]);
  const openedFiles = useRef<Set<string>>(new Set());

  const didOpen = useCallback((uri: string, languageId: string, version: number, text: string) => {
    openedFiles.current.add(uri);
    if (!ready.current) {
      openQueue.current.push({ uri, languageId, version, text });
      return;
    }
    notify("textDocument/didOpen", { textDocument: { uri, languageId, version, text } });
  }, [notify]);

  const didChange = useCallback((uri: string, version: number, text: string) => {
    if (!ready.current) return;
    // Ensure file is opened first
    if (!openedFiles.current.has(uri)) return;
    notify("textDocument/didChange", { textDocument: { uri, version }, contentChanges: [{ text }] });
  }, [notify]);

  const didClose = useCallback((uri: string) => {
    openedFiles.current.delete(uri);
    if (!ready.current) return;
    notify("textDocument/didClose", { textDocument: { uri } });
  }, [notify]);

  /** Flush queued didOpen calls — called after LSP initializes */
  const flushQueue = useCallback(() => {
    for (const item of openQueue.current) {
      notify("textDocument/didOpen", { textDocument: { uri: item.uri, languageId: item.languageId, version: item.version, text: item.text } });
    }
    openQueue.current = [];
  }, [notify]);

  return { didOpen, didChange, didClose, flushQueue };
}

function mapCompletionKind(m: Monaco, kind?: number): languages.CompletionItemKind {
  if (!kind) return m.languages.CompletionItemKind.Text;
  const map: Record<number, languages.CompletionItemKind> = {
    1: m.languages.CompletionItemKind.Text, 2: m.languages.CompletionItemKind.Method,
    3: m.languages.CompletionItemKind.Function, 4: m.languages.CompletionItemKind.Constructor,
    5: m.languages.CompletionItemKind.Field, 6: m.languages.CompletionItemKind.Variable,
    7: m.languages.CompletionItemKind.Class, 8: m.languages.CompletionItemKind.Interface,
    9: m.languages.CompletionItemKind.Module, 10: m.languages.CompletionItemKind.Property,
    13: m.languages.CompletionItemKind.Enum, 14: m.languages.CompletionItemKind.Keyword,
    15: m.languages.CompletionItemKind.Snippet, 21: m.languages.CompletionItemKind.Constant,
    22: m.languages.CompletionItemKind.Struct, 25: m.languages.CompletionItemKind.TypeParameter,
  };
  return map[kind] ?? m.languages.CompletionItemKind.Text;
}

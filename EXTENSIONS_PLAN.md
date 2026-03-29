# VS Code Extension Compatibility for Tride

## Context

Tride is a Tauri 2 + React + Monaco IDE. It already uses Shiki TextMate grammars for syntax highlighting, has a working LSP manager (Node.js process spawning), and PTY management. The goal is to enable installing and running VS Code extensions — starting with declarative contributions (themes, grammars, snippets) and building up to a full Extension Host for programmatic extensions.

We use the **Open VSX Registry** (open-vsx.org) instead of VS Code Marketplace due to licensing restrictions. VSIX files are ZIP archives containing a `package.json` manifest and extension assets.

---

## Phase 1: Rust Backend — Extension Manager

### New file: `src-tauri/src/extensions.rs`

**Extension storage:** `~/.tride/extensions/{publisher}.{name}-{version}/`
**Metadata index:** `~/.tride/extensions/extensions.json`

**Key structs:**
- `ExtensionManager` — manages installed extensions, reads/writes index
- `ExtensionManifest` — parsed from extension's `package.json`
- `ExtensionContributions` — themes, grammars, languages, snippets, commands, iconThemes, keybindings, configuration
- `ThemeContribution`, `GrammarContribution`, `LanguageContribution`, `SnippetContribution` — individual contribution types
- `InstalledExtension` — id, path, manifest, enabled flag
- `MarketplaceSearchResult`, `MarketplaceExtension` — Open VSX API response types

**Tauri commands (10):**
1. `ext_list_installed()` → `Vec<InstalledExtension>` — read index file
2. `ext_install(namespace, name)` → `InstalledExtension` — download from Open VSX, extract VSIX, update index
3. `ext_install_vsix(vsix_path)` → `InstalledExtension` — install from local file
4. `ext_uninstall(extension_id)` → delete dir, update index
5. `ext_enable(extension_id, enabled)` → toggle in index
6. `ext_read_file(extension_id, relative_path)` → `String` — read text file from extension
7. `ext_read_file_base64(extension_id, relative_path)` → `String` — read binary file
8. `ext_search_marketplace(query, offset, limit)` → `MarketplaceSearchResult` — GET open-vsx.org/api/-/search
9. `ext_get_detail(namespace, name)` → `MarketplaceExtensionDetail` — GET open-vsx.org/api/{ns}/{name}
10. `ext_get_readme(namespace, name)` → `String` — fetch README content

**New Cargo deps:** `reqwest` (with `rustls-tls`), `zip`

**Modify:** `src-tauri/src/lib.rs` — add `ExtensionManager` to AppState, register all `ext_*` commands
**Modify:** `src-tauri/Cargo.toml` — add reqwest, zip dependencies

### VSIX installation flow:
1. Query Open VSX API for download URL: `GET /api/{namespace}/{name}/{version}/file/{filename}`
2. Download VSIX (ZIP) to temp dir
3. Extract to `~/.tride/extensions/{publisher}.{name}-{version}/`
4. Parse `extension/package.json` from the extracted contents
5. Write entry to `extensions.json` index
6. Return `InstalledExtension` to frontend

---

## Phase 2: Extension Types & Registry (Frontend)

### New file: `src/extensions/types.ts`
Mirror Rust structs in TypeScript for type-safe IPC.

### New file: `src/extensions/registry.ts`
Singleton `ExtensionRegistry` class:
- `initialize()` — calls `ext_list_installed`, caches results
- `getThemes()`, `getGrammars()`, `getLanguages()`, `getSnippets()` — filter contributions
- `readFile(extensionId, path)` — delegates to `ext_read_file`
- `refresh()` — re-fetch after install/uninstall
- Event emitter for change notifications

---

## Phase 3: Declarative Contribution Loading

### Themes → Shiki/Monaco
**Modify: `src/components/CodeEditor.tsx`**

In `initShiki()`, after highlighter is created:
1. Get all extension themes from registry
2. For each, read the theme JSON via `ext_read_file`
3. Load into Shiki: `shikiHighlighter.loadTheme(parsedTheme)`
4. Register in Monaco: `registerThemeInMonaco(monaco, themeId)`

Extension themes appear alongside built-in themes in settings.

### Grammars → Shiki/Monaco
**Modify: `src/components/CodeEditor.tsx`**

In `initShiki()`, after highlighter is created:
1. Get all extension grammars from registry
2. For each, read the grammar JSON via `ext_read_file`
3. Load into Shiki: `shikiHighlighter.loadLanguage(parsedGrammar)`
4. Register Monaco language if needed: `monaco.languages.register({ id: langId })`
5. Call `registerTokenProviders(monaco)` to pick up new languages

### Language configurations
**Modify: `src/components/CodeEditor.tsx`**

For each `contributes.languages` with a `configuration` path:
- Read `language-configuration.json` from extension
- Call `monaco.languages.setLanguageConfiguration(langId, config)` for brackets, comments, auto-closing, etc.

### Snippets
**New file: `src/extensions/snippets.ts`**

For each language with extension snippets:
- Read snippet JSON files
- Register `monaco.languages.registerCompletionItemProvider` with snippet completions
- VS Code snippet format: `{ "Name": { "prefix": "trigger", "body": ["lines"], "description": "..." } }`

### Extend `getLanguage()` in CodeEditor
Build dynamic extension map from `contributes.languages[].extensions` → language ID, checked before the hardcoded map.

---

## Phase 4: Extensions UI Panel

### Modify: `src/types.ts`
```typescript
export type SidebarMode = "code" | "scm" | "browser" | "extensions";
```

### New file: `src/components/ExtensionsPanel.tsx`

Two-tab layout: **Marketplace** | **Installed**

**Marketplace tab:**
- Search input with debounced query
- Grid/list of results: icon, name, publisher, description, install count, rating
- "Install" button per result → calls `ext_install`
- Loading states and pagination

**Installed tab:**
- List of installed extensions with icon, name, version, publisher
- Enable/disable toggle
- Uninstall button
- "Reload required" indicator when contributions change

### Modify: `src/components/Sidebar.tsx`
- Add `{ key: "extensions", label: "EXTENSIONS", shortcut: "F4" }` to SIDEBAR_MODES
- Lazy-load `ExtensionsPanel`
- Render in sidebar-content

### Modify: `src/App.tsx`
- Add `F4: "extensions"` to keyboard shortcut map

### Modify: `src/styles.css`
- Styles for extension panel: search bar, extension cards, install/uninstall buttons, marketplace grid

---

## Phase 5: Extension Host (Node.js Process)

### New Rust module: `src-tauri/src/ext_host.rs`

Follows the `LspManager` pattern: spawn Node.js process, communicate via stdin/stdout JSON messages.

**Struct:** `ExtensionHostManager` with `HashMap<String, ExtHostInstance>`

**Protocol (newline-delimited JSON):**
- **→ ExtHost:** `{ type: "activate", extensionId, extensionPath, activationEvent }`
- **→ ExtHost:** `{ type: "request", id, provider, method, params }` (e.g., hover request)
- **→ ExtHost:** `{ type: "fileEvent", event, uri, content?, version? }` (didOpen/didChange/didClose)
- **← ExtHost:** `{ type: "registerProvider", providerId, kind, languages }` (hover, completion, etc.)
- **← ExtHost:** `{ type: "response", id, result }` / `{ type: "error", id, message }`
- **← ExtHost:** `{ type: "diagnostics", uri, diagnostics }`
- **← ExtHost:** `{ type: "showMessage", severity, message }`

**Tauri commands:**
- `ext_host_start(project_root)` — spawn host process
- `ext_host_send(project_root, message)` — send JSON to stdin
- `ext_host_stop(project_root)` — kill process

**Modify:** `src-tauri/src/lib.rs` — add ExtensionHostManager, register commands

### New directory: `ext-host/`

**`ext-host/main.js`** — Entry point:
- Reads newline-delimited JSON from stdin
- Creates `vscode` API shim
- Intercepts `require('vscode')` via `Module._resolveFilename` hook
- Loads extensions by `require(extensionPath)` and calling `activate(context)`
- Routes provider requests to registered handlers
- Writes responses as newline-delimited JSON to stdout

**`ext-host/vscode-shim/index.js`** — Main vscode namespace:
- Exports all sub-modules as `vscode.*`
- Exports data types: `Uri`, `Position`, `Range`, `Location`, `Selection`, `TextEdit`
- Exports enums: `DiagnosticSeverity`, `CompletionItemKind`, `SymbolKind`, `FileType`

**`ext-host/vscode-shim/languages.js`** — Provider registration:
- `registerHoverProvider(selector, provider)` — register, notify Rust
- `registerCompletionItemProvider(selector, provider, ...triggerChars)`
- `registerDefinitionProvider(selector, provider)`
- `registerSignatureHelpProvider(selector, provider, ...metadata)`
- `createDiagnosticCollection(name)` — push diagnostics to frontend
- `registerDocumentFormattingEditProvider(selector, provider)`
- `registerCodeActionsProvider(selector, provider)`

**`ext-host/vscode-shim/commands.js`** — Command system:
- `registerCommand(id, handler)` — store handler
- `executeCommand(id, ...args)` — call handler or forward to frontend

**`ext-host/vscode-shim/workspace.js`** — Workspace API:
- `getConfiguration(section)` — reads from extension settings
- `workspaceFolders` — from project root
- `onDidOpenTextDocument`, `onDidChangeTextDocument`, `onDidCloseTextDocument` — event emitters
- `fs` — delegates file operations to Tauri backend via stdout messages

**`ext-host/vscode-shim/window.js`** — UI API:
- `showInformationMessage()`, `showWarningMessage()`, `showErrorMessage()` — forward to frontend
- `createOutputChannel(name)` — log channel
- `showQuickPick()`, `showInputBox()` — forward to frontend UI

**`ext-host/vscode-shim/types.js`** — Pure data classes:
- `Uri`, `Position`, `Range`, `Location`, `Selection`, `TextEdit`, `WorkspaceEdit`
- `Diagnostic`, `CompletionItem`, `Hover`, `SignatureHelp`
- `EventEmitter`, `Disposable`, `CancellationTokenSource`

### New file: `src/extensions/ExtensionHostBridge.ts`

Frontend bridge that:
1. Listens for `ext-host-message` Tauri events
2. When ext host registers a provider → registers corresponding Monaco provider
3. Monaco provider calls forward requests through bridge → Tauri → ext host stdin
4. Responses route back: ext host stdout → Tauri event → bridge → Monaco callback
5. Uses request ID matching (same pattern as `useLsp.ts`)

### Activation events support:
- `*` — activate on host start
- `onLanguage:{id}` — frontend sends activation trigger when file of that language is opened
- `onCommand:{id}` — trigger on command execution
- `onStartupFinished` — after all `*` extensions activate

---

## Phase 6: Command Palette & Polish

### New file: `src/components/CommandPalette.tsx`
- Triggered by `Ctrl+Shift+P`
- Fuzzy-search filter
- Sources: built-in commands + extension `contributes.commands` + host-registered commands
- Renders as overlay with keyboard navigation

### Modify: `src/components/SettingsPanel.tsx`
- Extension themes appear in theme picker under "Extension Themes" section
- Extension settings section (auto-generated from `contributes.configuration` JSON schema)

### Extension settings storage
- `~/.tride/extension-settings.json` — per-extension configuration values
- Read by ext host on startup, forwarded to `workspace.getConfiguration()`

---

## Files Summary

### New files (18):
| File | Purpose |
|------|---------|
| `src-tauri/src/extensions.rs` | VSIX management, marketplace API, extension storage |
| `src-tauri/src/ext_host.rs` | Extension host process manager |
| `src/extensions/types.ts` | TypeScript types for extension manifest/contributions |
| `src/extensions/registry.ts` | Extension registry singleton |
| `src/extensions/snippets.ts` | Snippet completion providers |
| `src/extensions/ExtensionHostBridge.ts` | Frontend ↔ ext host bridge |
| `src/components/ExtensionsPanel.tsx` | Marketplace/installed UI |
| `src/components/CommandPalette.tsx` | Ctrl+Shift+P command palette |
| `ext-host/main.js` | Extension host entry point |
| `ext-host/vscode-shim/index.js` | vscode namespace root |
| `ext-host/vscode-shim/languages.js` | Language provider API |
| `ext-host/vscode-shim/commands.js` | Command API |
| `ext-host/vscode-shim/workspace.js` | Workspace API |
| `ext-host/vscode-shim/window.js` | Window/UI API |
| `ext-host/vscode-shim/types.js` | Data types and enums |
| `ext-host/vscode-shim/EventEmitter.js` | Event system |
| `ext-host/package.json` | Node deps for ext host |

### Modified files (7):
| File | Change |
|------|--------|
| `src-tauri/Cargo.toml` | Add `reqwest`, `zip` deps |
| `src-tauri/src/lib.rs` | Add ExtensionManager + ExtensionHostManager to state, register commands |
| `src/types.ts` | Add `"extensions"` to SidebarMode |
| `src/components/Sidebar.tsx` | Add extensions tab + panel |
| `src/components/CodeEditor.tsx` | Load extension themes/grammars/language-configs into Shiki/Monaco |
| `src/App.tsx` | Add F4 shortcut |
| `src/styles.css` | Extension panel styles, command palette styles |

---

## Implementation Order

1. **Phase 1** — Rust backend (extensions.rs, Cargo deps, lib.rs commands)
2. **Phase 2** — Frontend types + registry
3. **Phase 4** — Extensions UI panel (types.ts, Sidebar.tsx, App.tsx, ExtensionsPanel.tsx, styles)
4. **Phase 3** — Declarative contribution loading (themes, grammars, snippets in CodeEditor)
5. **Phase 5** — Extension Host (ext_host.rs, ext-host/ directory, bridge)
6. **Phase 6** — Command palette + polish

This order gives a testable E2E flow early: search marketplace → install extension → see theme/grammar applied.

---

## Verification

1. **Search & Install:** Open Extensions panel (F4), search for "One Dark Pro" theme, install it
2. **Theme loading:** Switch to the installed theme in Settings — verify syntax colors change
3. **Grammar loading:** Install a language extension (e.g., "Prisma"), open a `.prisma` file — verify highlighting
4. **Snippets:** Install a snippet extension, verify completions appear in editor
5. **Extension Host:** Install a simple language extension with programmatic features, verify hover/completion works
6. **Uninstall:** Uninstall an extension, verify it's removed and contributions are deregistered

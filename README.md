# Tride

Tride is a minimal, terminal-centric IDE built for working with AI coding agents like Claude Code and Codex. Terminal-based tools often break in existing GUI terminals, so Tride gives them a proper environment alongside integrated code editing, git, and file management as an all-in-one tool.

## Installation

> [!WARNING]
> Install and authenticate at least one provider before use:
>
> - Codex: install [Codex CLI](https://github.com/openai/codex) and run `codex login`
> - Claude: install Claude Code and run `claude auth login`

> Tride is very early in development. Expect bugs.

### Desktop app

Install the latest version from [GitHub Releases](https://github.com/domonyi/tride/releases).

### Build from source

Requires [Bun](https://bun.sh/), [Rust](https://rustup.rs/) (stable toolchain), and [Tauri CLI](https://tauri.app/start/) (`npx @tauri-apps/cli`).

```bash
git clone https://github.com/domonyi/tride.git
cd tride
bun install
bun run tauri build
```

### Run in development mode

```bash
bun install
bun run tauri dev
```

## Contributing

Contributions are welcome while the volume of PRs is low. As activity grows, I'll be more selective. Please read [CONTRIBUTING.md](./CONTRIBUTING.md) before opening an issue or PR.

---
name: cli-project-structure
description: Directory layout, entry points, config file resolution, and plugin directory structure for CLI projects
topics: [cli, project-structure, directory-layout, config-resolution, bin, plugins]
---

A well-structured CLI project makes it easy to add subcommands, locate business logic, and onboard contributors. The structure should reflect the mental model of the tool: commands are the public API, utilities are shared infrastructure, and configuration drives runtime behavior.

## Summary

### Canonical Directory Layout

```
my-cli/
├── bin/
│   └── my-cli          # Entry point (Node shebang or compiled binary symlink)
├── src/
│   ├── commands/       # One file per subcommand
│   │   ├── init.ts
│   │   ├── build.ts
│   │   └── deploy.ts
│   ├── utils/          # Shared helpers (not command-specific)
│   │   ├── logger.ts
│   │   ├── config.ts
│   │   └── fs.ts
│   ├── types/          # Shared type definitions
│   └── index.ts        # CLI entry point (parses argv, routes to commands)
├── tests/
│   ├── commands/       # Integration tests per command
│   └── utils/          # Unit tests for utilities
├── package.json        # (Node) or Cargo.toml (Rust) or pyproject.toml (Python)
└── README.md
```

### Command File Convention

Each command file owns one subcommand and should export:
- A `command` descriptor (name, aliases, description, flags schema)
- A `handler` function that receives parsed arguments and executes the operation

Keep handler functions thin: validate inputs, call service functions from `utils/`, handle errors, format output. Business logic belongs in `utils/`, not in command handlers.

### bin/ Entry Point

The `bin/` entry point is what users run. It should:
1. Set up the Node/Python/Rust runtime minimum (e.g., `#!/usr/bin/env node`)
2. Import and invoke the CLI router from `src/index.ts`
3. Contain no business logic

For Node.js, declare the bin in `package.json`:
```json
{
  "bin": {
    "my-cli": "./bin/my-cli"
  }
}
```

For compiled languages (Rust, Go), `bin/` may contain the compiled binary or a wrapper script. The real entry point is `src/main.rs` or `cmd/root.go`.

### Config File Resolution

Config files should be discovered in order from most-specific to most-general:

1. Path from `--config` flag (explicit override)
2. `MYCLI_CONFIG` environment variable
3. `./mycli.config.json` (project-local, in current working directory)
4. `.myclirc` (project-local dotfile)
5. `~/.config/mycli/config.json` (XDG Base Directory standard)
6. `~/.myclirc` (legacy home dotfile)
7. Built-in defaults

Use XDG Base Directory (`~/.config/<name>/`) as the preferred user config location on Linux/macOS. On Windows, use `%APPDATA%\<name>\config.json`. Libraries like `env-paths` (Node) or the `dirs` crate (Rust) handle cross-platform config paths correctly.

Walk the directory tree upward from CWD when looking for project-local config (same pattern as `.gitignore`). Stop at the home directory or filesystem root.

### Plugin Directory Structure

If the tool supports plugins:

```
~/.config/mycli/
├── config.json         # User config
└── plugins/
    ├── my-plugin/
    │   ├── package.json
    │   └── index.js
    └── another-plugin/
        └── ...
```

Plugin discovery scans `~/.config/mycli/plugins/` at startup. Each plugin directory must have a manifest (`package.json` or `plugin.json`) declaring:
- `name`: Plugin identifier
- `version`: Semver
- `main`: Entry point relative to plugin directory
- `commands`: Array of subcommand names the plugin registers

## Deep Guidance

### Monorepo CLI Structure

When a CLI is part of a larger monorepo:

```
packages/
├── cli/                # The CLI package
│   ├── src/commands/
│   └── package.json
├── core/               # Shared business logic (used by CLI + SDK + server)
└── sdk/                # Programmatic API (no CLI dependency)
```

Keep the CLI package thin. Business logic in `core/` can be tested without CLI overhead and reused by other consumers. The CLI is a delivery mechanism, not the application.

### State File Convention

Runtime state (auth tokens, cached data, last-run timestamps) should be stored separately from config:

- Config: user-editable settings (`~/.config/mycli/config.json`)
- State: machine-managed runtime data (`~/.local/share/mycli/state.json` per XDG, or `~/.mycli/state.json`)

Never overwrite user config with machine-managed state. Mixing them causes painful merge conflicts and makes it hard to commit config to a dotfiles repo.

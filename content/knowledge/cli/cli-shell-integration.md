---
name: cli-shell-integration
description: Shell completion generation for bash/zsh/fish, man page generation, dotfile conventions, PATH management, and shell aliases
topics: [cli, shell-integration, completion, man-pages, dotfiles, path-management, aliases]
---

Shell integration is the difference between a CLI that feels native and one that feels like a foreign object. Completion, man pages, and dotfile patterns are not optional polish — they are the features that determine whether power users adopt the tool or abandon it for something that respects their shell workflow.

## Summary

### Shell Completion Generation

Provide completion scripts for bash, zsh, and fish. Generate them from the CLI definition rather than hand-writing them — they will stay in sync as commands and flags evolve:

**Node.js (yargs)**
```bash
my-cli completion     # Outputs bash/zsh completion script
my-cli completion >> ~/.bashrc
```

**Cobra (Go)**
```bash
my-cli completion bash   # bash
my-cli completion zsh    # zsh
my-cli completion fish   # fish
my-cli completion powershell
```

**clap (Rust)** with `clap_complete`:
```rust
// Generate at build time and install to /usr/local/share/bash-completion/completions/
generate(Shell::Bash, &mut cmd, "my-cli", &mut io::stdout());
```

**click (Python)**: Use `click-completion` or the built-in `shell_complete` parameter.

Completion installation patterns:
- **bash**: Source from `~/.bashrc` or drop in `/etc/bash_completion.d/` or `~/.bash_completion.d/`
- **zsh**: Drop in `$fpath` directory, e.g., `/usr/local/share/zsh/site-functions/_my-cli`
- **fish**: Drop in `~/.config/fish/completions/my-cli.fish`

Provide a `my-cli install-completions` subcommand that writes the correct file for the detected shell. Always print the path written and what the user must do to activate it (e.g., restart shell or run `source ~/.bashrc`).

### Man Page Generation

Man pages are the canonical reference documentation. Generate them from the CLI definition:

**Go (cobra)**: `cobra-man` generates man pages from Cobra commands.

**Node.js**: `marked-man` converts Markdown to man format. `ronn` (Ruby) converts richly formatted Markdown to man.

**Rust (clap)**: `clap_mangen` generates man pages from clap definitions.

Man page installation:
- System-wide: `/usr/local/share/man/man1/my-cli.1`
- User-local: `~/.local/share/man/man1/my-cli.1`
- Run `mandb` (Linux) or ensure `$MANPATH` includes the directory

Homebrew formulae automatically install man pages if placed in `share/man/man1/`. For npm packages, include a `man` field in `package.json`.

### Dotfile Conventions

When the CLI modifies shell startup files (`~/.bashrc`, `~/.zshrc`), follow these rules:

- Never overwrite startup files — append only
- Use clearly marked comment blocks:
  ```bash
  # >>> my-cli init >>>
  export PATH="$HOME/.my-cli/bin:$PATH"
  eval "$(my-cli shell-init)"
  # <<< my-cli init <<<
  ```
- The markers enable the tool to detect existing installation and idempotently update the block
- Always provide `my-cli uninstall` or `my-cli shell-remove` that removes exactly these markers
- Never add content outside the marked block

On first install, detect which shell config files exist and are writable: check `$SHELL`, then look for `~/.zshrc`, `~/.bashrc`, `~/.bash_profile` in that order.

### PATH Management

When the tool installs binaries or shims to a user-local directory:

```bash
# Typical user-local bin directory
~/.local/bin/          # XDG standard (Linux/macOS)
~/.my-cli/bin/         # Tool-specific (when multiple versions coexist)
```

Check if the directory is already on `$PATH` before suggesting the user add it. If not on `$PATH`, print the exact line to add and which file to add it to:

```
Add this to ~/.zshrc:
  export PATH="$HOME/.local/bin:$PATH"
```

Do not silently modify PATH for the current process and assume it persists — shell environment changes only persist through startup file modification or explicit user action.

### Shell Aliases

Provide a mechanism to generate useful shell aliases for common command combinations:

```bash
# my-cli generates aliases for common workflows
my-cli alias generate >> ~/.zshrc
```

Aliases should be documented and user-editable. Never require aliases for core functionality — they are convenience, not architecture.

## Deep Guidance

### Shell Detection

Detect the user's shell reliably:

```bash
# Most reliable: check $SHELL environment variable
SHELL_NAME=$(basename "$SHELL")

# Fallback: check running process
ps -p $PPID -o comm= | sed 's/^-//'
```

Map shell name to config file:
- `zsh` → `~/.zshrc`
- `bash` → `~/.bashrc` (Linux) or `~/.bash_profile` (macOS interactive login shells)
- `fish` → `~/.config/fish/config.fish`

When the shell cannot be detected, print instructions for all three common shells and let the user pick. Never guess and silently write to the wrong file.

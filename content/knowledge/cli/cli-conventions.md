---
name: cli-conventions
description: Flag naming, subcommand patterns, help text standards, --version behavior, and NO_COLOR support for CLI tools
topics: [cli, conventions, flags, subcommands, help-text, no-color, version]
---

CLI conventions exist because shell users build mental models across dozens of tools. When your tool follows the same conventions as `git`, `docker`, and `kubectl`, users already know how to use it before reading the documentation. Deviating from convention has a real cost: every exception must be explicitly learned.

## Summary

### Flag Naming

Flag names communicate intent. Use the established vocabulary:

- `--verbose` / `-v`: Increase output detail. Stackable in some tools (`-vvv`)
- `--quiet` / `-q`: Suppress non-error output
- `--dry-run`: Show what would happen without doing it
- `--force` / `-f`: Skip confirmation prompts, overwrite without asking
- `--output` / `-o`: Specify output file or format
- `--config` / `-c`: Path to config file
- `--yes` / `-y`: Auto-confirm all prompts (useful in CI)
- `--no-<flag>`: Boolean negation. If `--color` is default-on, `--no-color` disables it

Avoid inventing synonyms for established flags. If the tool ecosystem uses `--output`, do not use `--out`, `--dest`, or `--target` for the same concept.

### Subcommand Patterns

For tools with multiple operations, use the `<tool> <verb> [args]` pattern:

```
mytool init
mytool build --watch
mytool deploy --env production
mytool config set key value
```

Noun-verb ordering (`mytool config set`) matches how humans describe actions: "I want to set a config value." Avoid verb-noun (`mytool set-config`) — it does not compose well when subcommands are nested.

**Aliases**: Provide short aliases for common subcommands (`ls` → `list`, `rm` → `remove`, `ps` → `status`). Document aliases in help text.

**Consistent behavior**: All subcommands should support `--help`. The top-level `--help` should list all subcommands with one-line descriptions.

### Help Text Standards

Help text is the primary documentation for most users. Structure it:

```
USAGE
  mytool <subcommand> [flags] [args]

SUBCOMMANDS
  init     Initialize a new project
  build    Build the project
  deploy   Deploy to a target environment

FLAGS
  -v, --verbose   Show detailed output
  -q, --quiet     Suppress non-error output
      --help      Show this help text
      --version   Print version and exit

EXAMPLES
  mytool init my-project
  mytool build --watch
  mytool deploy --env staging --dry-run

Run 'mytool <subcommand> --help' for subcommand-specific flags.
```

Rules:
- Lead with USAGE, then FLAGS, then EXAMPLES — in that order
- Always include at least two concrete examples
- One-line descriptions must fit in a terminal; keep them under 60 characters
- Print help to stdout, not stderr (allows `mytool --help | less`)

### --version Behavior

Version output should be machine-parseable:

```
mytool 2.4.1
```

Some tools include build metadata:

```
mytool 2.4.1 (commit abc1234, built 2024-01-15)
```

Always exit 0 after printing version. Never print to stderr. The version string should be parseable by scripts using `mytool --version | awk '{print $2}'`.

### NO_COLOR and Color Output

Color output must be defeatable. Follow the `NO_COLOR` standard (no-color.org):

- If `NO_COLOR` environment variable is set (any value), disable all color output
- If `--no-color` flag is passed, disable color output
- If stdout is not a TTY (`!process.stdout.isTTY`), disable color output automatically
- `--color` / `FORCE_COLOR` can re-enable color for non-TTY output when explicitly requested (useful for CI that does support color)

This order of precedence: `--no-color` flag > `NO_COLOR` env > TTY detection > default (color on TTY).

## Deep Guidance

### Configuration Precedence Convention

When flags, environment variables, and config files all influence behavior, follow this precedence (highest to lowest):

1. CLI flags (most explicit)
2. Environment variables
3. Project-local config file (`.mytoolrc`, `mytool.config.json`)
4. User config file (`~/.config/mytool/config.json`)
5. Built-in defaults

Document this precedence in `--help` output or the man page. Users need to know where a value is coming from when debugging unexpected behavior.

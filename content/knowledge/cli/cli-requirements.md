---
name: cli-requirements
description: CLI UX principles, POSIX conventions, exit codes, signal handling, and progressive disclosure for command-line tools
topics: [cli, ux, posix, exit-codes, signal-handling, progressive-disclosure]
---

CLI tools occupy a unique design space: they are used by humans typing commands, embedded in shell scripts, and piped together in pipelines. A tool that conflates these contexts fails at all of them. The guiding principle is: do one thing well, fail loudly with actionable errors, and never surprise the pipeline.

## Summary

### Do One Thing Well

Unix philosophy is not aspirational — it is a load-bearing constraint. A CLI that tries to be a GUI, an interactive REPL, and a batch processor will be worse than a dedicated tool at each. Define the single responsibility before writing a line of code: what is the one transformation or action this tool performs?

Corollaries:
- Subcommands are fine; each subcommand should still do one thing
- Options should modify behavior, not switch into a different tool
- If two features feel unrelated, they probably belong in two tools connected by a pipe

### POSIX Conventions

Following POSIX conventions is not optional for tools that expect to live in shell scripts. Deviating breaks the mental model of every experienced shell user:

- Short flags use a single dash and one letter: `-v`, `-q`, `-n`
- Long flags use double dash: `--verbose`, `--quiet`, `--dry-run`
- Short flags can be combined: `-vq` is equivalent to `-v -q`
- Flags precede positional arguments; `--` terminates flag parsing
- Options that take values: `-o output.txt` or `--output=output.txt`
- Mutually exclusive flags should be documented, not silently overridden

### Exit Codes

Exit codes are the API surface of a CLI. Scripts depend on them; violating the convention silently breaks downstream automation:

- **0** — success, operation completed as expected
- **1** — general error (operation failed for a known reason)
- **2** — usage error (bad arguments, missing required flag, unknown subcommand)
- **126** — command found but not executable
- **127** — command not found
- **130** — terminated by Ctrl-C (128 + SIGINT signal 2)

Always exit with 1 for domain errors, 2 for argument errors. Never exit 0 when something went wrong. Scripts using `set -e` will silently swallow partial failures if a tool exits 0 on error.

### Signal Handling

Respect signals — scripts set `trap` handlers and expect clean shutdown:

- **SIGINT** (Ctrl-C): Interrupt. Clean up temp files, restore terminal state (if using raw mode), then exit 130
- **SIGTERM**: Graceful shutdown request. Same cleanup as SIGINT; exit 143 (128 + 15)
- **SIGPIPE**: Write to a closed pipe (e.g., `mytool | head -5` closes stdin after 5 lines). Handle by exiting cleanly rather than printing a broken pipe error

Register signal handlers at startup. In Node.js: `process.on('SIGINT', cleanup)`. In Rust: the `ctrlc` crate. In Python: `signal.signal(signal.SIGINT, handler)`.

### Progressive Disclosure

Help output should scale with user familiarity:

- `--help` shows the most common options and a one-line description of each
- `--help --verbose` or `help <subcommand>` shows full option documentation
- Man pages contain full reference material including examples and edge cases
- Error messages should name the bad input and suggest the fix: `Unknown flag --colour. Did you mean --color?`

Never dump 200 lines of option documentation in response to a bad argument. The user who mistyped a flag wants a correction, not a manual.

## Deep Guidance

### Input Validation Order

Validate in this order to give the most useful errors earliest:

1. Flag syntax (unknown flags, missing required values)
2. Required argument presence
3. Type/format validation (is this a valid integer? a valid path?)
4. Semantic validation (does the file exist? does the user have permission?)
5. External resource validation (can we reach the API? is the DB up?)

Exit 2 for steps 1–3 (usage errors). Exit 1 for steps 4–5 (runtime errors).

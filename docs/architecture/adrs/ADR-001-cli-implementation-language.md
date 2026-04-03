# ADR-001: CLI Implementation Language — Node.js

**Status**: accepted
**Date**: 2026-03-13
**Deciders**: v2 spec (Resolved Design Questions)
**Domain(s)**: 09
**Phase**: 2 — Architecture Decision Records

---

## Context

Scaffold v1 is implemented entirely in bash. While this worked for a pipeline of structured prompts executed manually, v2 introduces requirements that strain bash's capabilities: an interactive init wizard with adaptive question flow, extensive JSON parsing (state.json, config.yml, decisions.jsonl), cross-platform support (macOS, Linux, WSL), npm distribution for zero-install usage via npx, and a CLI framework with subcommands, middleware, and structured output modes (interactive, JSON, auto).

The implementation language choice affects every domain in the v2 architecture — from the CLI shell that orchestrates all commands (domain 09) to the init wizard (domain 14), config validation (domain 06), and platform adapters (domain 05). The choice must support the three output modes defined in domain 09 (interactive with color/spinners, `--format json` for machine consumption, `--auto` for agent pipelines), the strategy-pattern-based OutputContext architecture, and the command dispatch system.

## Decision

Use **Node.js** for the CLI shell, init wizard, build system, and platform adapters. Use **yargs** as the CLI framework for argument parsing and command dispatch.

Specifically:
- All CLI commands are implemented as Node.js modules registered with yargs
- The init wizard uses `@inquirer/prompts` for interactive terminal prompts
- JSON/YAML parsing uses native `JSON.parse` and `js-yaml`
- yargs provides subcommand support, middleware hooks, built-in help generation, and shell completion script generation
- Bash scripts may still be used for git/shell-heavy utilities where Node would add unnecessary complexity, but these are called by Node, not the other way around

**yargs** was chosen as the CLI framework over alternatives:
- **commander**: Less opinionated subcommand support; yargs' declarative command definition with typed arguments is a better fit for scaffold's command hierarchy
- **oclif**: Full plugin framework is unnecessary overhead — scaffold doesn't need runtime plugin loading at the CLI level
- **Custom argument parsing**: Unwarranted effort when yargs provides battle-tested parsing, help generation, and completion

## Rationale

- **npm distribution synergy**: Node.js is the natural runtime for npm-distributed packages. Since npm/npx is the primary distribution channel (ADR-002), using Node eliminates the need for a separate runtime or compilation step.
- **Codex already requires Node**: Codex CLI requires Node.js 22+. Users targeting Codex already have Node installed, making it a zero-cost dependency for the primary user base.
- **Superior interactive prompt libraries**: `@inquirer/prompts` provides select menus, confirmations, text inputs, and adaptive question flows that are essential for the init wizard (domain 14). Bash equivalents (read, select) are primitive and inconsistent across platforms.
- **Built-in JSON parsing**: v2's architecture relies heavily on structured data — `state.json` for pipeline state, `config.yml` for project configuration, `decisions.jsonl` for decision logging, and manifest files for methodology definitions. Node's native JSON support and mature YAML libraries make this straightforward. Bash requires `jq` as an external dependency and produces fragile string-manipulation code.
- **Testability**: Node test frameworks (jest, vitest) provide mocking, snapshot testing, coverage reporting, and watch mode. Bats (v1's test framework) lacks mocking, has limited assertion libraries, and cannot test complex data transformations.
- **Three output modes**: The OutputContext strategy pattern (domain 09, Section 5) requires programmatic control over output formatting. Node's object-oriented capabilities make implementing InteractiveOutput, JsonOutput, and AutoOutput as strategy implementations natural. Bash would require ad-hoc formatting logic scattered across scripts.

## Alternatives Considered

### Continue with Bash

- **Description**: Keep the all-bash convention from v1. Use `jq` for JSON, `dialog`/`whiptail` for interactive prompts, and shell scripts for all CLI logic.
- **Pros**: No migration cost from v1. Zero external runtime dependencies (bash ships with all target OSes). Simple deployment.
- **Cons**: macOS ships bash 3.2 (2007) due to GPLv3 licensing — lacks associative arrays, `readarray`, and other features needed for complex data handling. JSON handling via `jq` is fragile and verbose for nested structures. No viable interactive prompt library for adaptive wizard flows. Testing with bats lacks mocking and coverage. Platform inconsistencies between GNU and BSD utilities (sed, grep, date) cause subtle bugs. The three output modes (domain 09) would require duplicating formatting logic across every command script.

### Python

- **Description**: Implement the CLI in Python using Click or Typer for the CLI framework, Rich for terminal output, and standard library JSON/YAML support.
- **Pros**: Excellent scripting language with rich ecosystem. Good interactive prompt libraries (questionary, InquirerPy). Strong testing ecosystem (pytest).
- **Cons**: Python is not required by any target AI platform (neither Claude Code nor Codex mandate it). Virtual environment complexity adds friction for end users (`pip install` vs `npx`). Python version management (pyenv, system Python conflicts) is a known pain point. No npx-equivalent for zero-install usage.

### Go or Rust

- **Description**: Compile the CLI to a single binary. Distribute via Homebrew, GitHub releases, or cargo.
- **Pros**: Single binary distribution with no runtime dependency. Fast startup time. Strong type systems catch errors at compile time.
- **Cons**: Heavier toolchain for development. Codex users already have Node installed, making the "no runtime dependency" advantage moot for the primary user base. Harder to prototype and iterate during v2 development. Interactive prompt libraries exist but are less mature than Node's `@inquirer/prompts`. Loses npm ecosystem synergy (npx zero-install, npm scripts).

## Consequences

### Positive
- Better testability — Node test frameworks provide mocking, snapshots, coverage, and watch mode
- Richer CLI UX — interactive prompts, spinners, color output, and structured JSON output via OutputContext strategy pattern
- JSON-native — no external dependencies for parsing the structured data files central to v2's architecture
- yargs provides shell completion scripts out of the box (`scaffold --get-yargs-completions`)
- Consistent cross-platform behavior — no GNU vs BSD utility divergence

### Negative
- Breaks the all-bash convention established in v1 — CLAUDE.md, coding-standards, and test infrastructure must be updated for the v2 codebase
- Development team needs Node.js familiarity (TypeScript specifically, per domain 09)
- Bash scripts may still exist for git/shell-heavy utilities, creating a mixed-language codebase
- Node.js startup time (~100ms) is slower than bash for trivial commands, though well within the 500ms assembly performance target for `scaffold run` (PRD §18)

### Neutral
- Test framework shifts from bats-core to a Node-based runner (jest or vitest) — different but not inherently better or worse for the test patterns needed
- Minimum Node.js version must be documented and enforced (18+ per spec, though Codex requires 22+)

## Reversibility

Effectively irreversible once implementation begins. Changing the CLI language requires a complete rewrite of every module. The choice of Node.js is locked in by the first line of production code.

## Constraints and Compliance

- All CLI commands MUST be implemented as Node.js modules — no bash scripts as top-level command entry points
- Bash scripts MAY exist for git/shell-heavy utilities, but they MUST be called by Node command handlers, not invoked directly by users
- The test framework MUST shift from bats to a Node-based test runner (jest or vitest)
- Minimum Node.js version MUST be documented in package.json `engines` field (Node 18+ per spec)
- yargs MUST be used for argument parsing and command dispatch — do not introduce alternative CLI frameworks
- See domain 09, Section 2 (Entity Model) for the CliApplication, CommandDefinition, and ParsedArgs interfaces that define the command architecture

## Related Decisions

- [ADR-002](ADR-002-distribution-strategy.md) — npm as primary distribution channel (depends on Node.js choice)
- [ADR-003](ADR-003-standalone-cli-source-of-truth.md) — CLI as source of truth for all business logic
- Domain 09 ([09-cli-architecture.md](../domain-models/09-cli-architecture.md)) — Full CLI architecture specification
- Domain 09, Section 9, MQ1 — yargs selection rationale and command dispatch flow
- Domain 14 ([14-init-wizard.md](../domain-models/14-init-wizard.md)) — Init wizard requiring `@inquirer/prompts`

# ADR-025: CLI Output Contract — Modes, JSON Envelope, Exit Codes

**Status**: accepted
**Date**: 2026-03-13
**Deciders**: v2 spec, domain modeling phase 1
**Domain(s)**: 09
**Phase**: 2 — Architecture Decision Records

---

## Context

The scaffold CLI must serve three distinct audiences with different output requirements:

1. **Interactive humans**: Want rich terminal output with colors, progress indicators, and interactive prompts for decisions.
2. **Automation scripts (CI/CD)**: Want structured, parseable output with predictable exit codes for conditional logic.
3. **AI agents**: Want non-interactive execution with automatic decision resolution and structured output they can parse.

A single output mode cannot serve all three audiences. Interactive prompts block CI pipelines. Unstructured text is unparseable by scripts. Structured JSON is unreadable by humans. The CLI needs a principled output contract that addresses all three use cases.

Additionally, error categorization matters: a validation error, a missing dependency, and a corrupted state file are all "failures" but require different responses from automation. Unix's traditional 0/1 exit code convention cannot distinguish them.

Domain 09 (CLI Architecture) explores the output design space and recommends a Strategy pattern where an `OutputContext` is injected into commands, abstracting the output mode from command logic.

## Decision

Three interrelated decisions define the CLI output contract:

1. **Three output modes**: Interactive (default, human-readable with rich terminal features), `--format json` (structured JSON envelope), and `--auto` (non-interactive with automatic decisions). These can be combined: `--auto --format json` produces structured output with automatic decisions.

2. **Standard JSON envelope**: All `--format json` output uses a consistent envelope schema: `{ success: boolean, command: string, data: object, errors: array, warnings: array, exit_code: number }`. Human-readable output is directed to stderr so that stdout contains only the JSON envelope.

3. **Structured exit codes**: Exit codes categorize failures for automation: 0 = success, 1 = validation error (bad config, invalid frontmatter), 2 = missing dependency (required prompt not completed), 3 = state corruption (unparseable state.json, stale lock), 4 = user cancellation (Ctrl+C, declined prompt), 5 = build error (adapter failure, injection error).

## Rationale

**Three modes over one**: Each audience has fundamentally different needs. Interactive humans want `@inquirer/prompts`-powered selection menus, colored status output, and progress bars. Automation wants a single JSON blob on stdout that can be piped to `jq`. AI agents want non-interactive execution where decisions are resolved automatically (e.g., "which prompt to run next" defaults to the first eligible). A single mode that tries to serve all three produces a poor experience for everyone.

**JSON envelope over ad-hoc JSON**: Without a standard envelope, every command produces differently-shaped JSON, forcing consumers to handle per-command schemas. The envelope provides a predictable outer structure — consumers always know where to find success/failure status, errors, and warnings. The `data` field varies per command, but the envelope is constant. This is a common pattern in API design (GraphQL responses, JSON:API, etc.) and for good reason.

**Structured exit codes over binary 0/1**: CI scripts frequently need to branch on failure type. A validation error (exit 1) might trigger a "fix config" notification. A state corruption (exit 3) might trigger a "manual intervention required" alert. A user cancellation (exit 4) might be silently ignored. With only 0/1, the script must parse stderr or JSON output to categorize the failure — structured exit codes make this unnecessary.

**--auto does NOT imply --force**: This is a critical safety decision. `--auto` means "don't ask me interactive questions" — it does not mean "override all safety checks." If a lock is held and `--auto` is set, the correct behavior is to fail (exit 3) rather than silently overriding the lock, because the automation cannot know whether the lock holder is a legitimate concurrent process. Destructive auto operations require explicit `--auto --confirm-reset` to proceed.

**Fuzzy matching in error output**: When a user provides an invalid config value that is close to a valid one (Levenshtein distance of 2 or less), the error message includes "did you mean X?" suggestions. In JSON mode, these suggestions are included in the error object. This small UX touch significantly reduces the feedback loop for configuration errors, especially for AI agents that can automatically try the suggested correction.

## Alternatives Considered

### Structured by Default (kubectl/docker Pattern)

- **Description**: All output is structured (JSON) by default. A `--human` flag adds formatting, colors, and interactive elements. This is the inverse of the chosen approach and is used by Kubernetes and Docker CLIs.
- **Pros**: Agents (the primary consumer) get structured output without needing to know about `--format json`. Simpler CI integration.
- **Cons**: Human users must always pass `--human` for readable output. First-time users get a wall of JSON. Violates the "principle of least surprise" for a CLI tool.

### Two Modes (Interactive + JSON, No Auto)

- **Description**: Only interactive and JSON modes. Automation uses JSON mode and handles decisions by pre-configuring answers.
- **Pros**: Simpler — one fewer mode to implement and test.
- **Cons**: No clean automation story. Without `--auto`, CI scripts using `--format json` would still encounter interactive prompts serialized into the JSON output, requiring pre-answers or stdin piping. AI agents would need to simulate interactive responses. `--auto` provides a clean "run without asking" mode that both CI and agents need.

### Verbose/Quiet Flags Instead of Modes

- **Description**: Use `--verbose` and `--quiet` flags to control output level rather than distinct modes.
- **Pros**: Familiar pattern from Unix tools. Simple graduated scale.
- **Cons**: Verbose/quiet control volume, not format. A quiet JSON mode and a quiet interactive mode are still fundamentally different. These flags don't address the structured output need (parseable by scripts) or the non-interactive need (automatic decisions). They could complement the three modes but don't replace them.

### Unix Convention Exit Codes (0 Success, 1 Error)

- **Description**: Use only 0 (success) and 1 (error) as exit codes. Error details are in stderr or JSON output only.
- **Pros**: Simple. Universally understood. No documentation needed for exit code meanings.
- **Cons**: CI scripts cannot branch on failure type without parsing output. A shell script that needs to distinguish "bad config" from "state corruption" must parse JSON or regex stderr — fragile and error-prone. Five exit codes provide meaningful categorization at minimal complexity cost.

### Per-Command Exit Codes

- **Description**: Each command defines its own exit codes. `scaffold build` might use 1-5, while `scaffold status` might use 1-3.
- **Pros**: Maximum granularity per command. Exit codes can be tailored to each command's failure modes.
- **Cons**: Unpredictable — consumers must consult per-command documentation to interpret exit codes. A unified set of 6 codes (0-5) covers all commands consistently and is easier to document, learn, and program against.

### Error Output Only (Always Exit 0)

- **Description**: Always exit 0. Encode success/failure in the output (JSON envelope's `success` field or a special stderr marker).
- **Pros**: No exit code interpretation needed. Output is the single source of truth.
- **Cons**: Breaks the Unix convention that non-zero exit means failure. CI systems, shell scripts, and `set -e` all depend on exit codes. A tool that always exits 0 cannot participate in standard shell pipelines (`scaffold build && scaffold resume` would always run resume, even after a build failure).

## Consequences

### Positive
- Interactive humans get rich terminal output with colors, progress bars, and decision prompts
- Automation scripts get predictable JSON on stdout and meaningful exit codes for conditional logic
- AI agents get non-interactive execution with automatic decision resolution
- Error categorization via exit codes enables fine-grained CI/CD response without output parsing
- Fuzzy matching suggestions reduce the config-error feedback loop for all audiences

### Negative
- Three output modes require three code paths for every user-facing message in every command — this is the single largest implementation cost of this decision
- The OutputContext Strategy pattern adds abstraction that every command must be aware of
- Five non-zero exit codes require documentation and developer awareness — consumers must learn the code meanings (though they can always fall back to 0 = success, non-zero = failure)
- `--auto --confirm-reset` is a verbose flag combination for destructive operations, which may frustrate users who expect `--auto` to mean "fully automatic"

### Neutral
- The JSON envelope schema is versioned implicitly by the `scaffold-version` field — breaking changes to the envelope would accompany a major version bump
- Interactive prompts use `@inquirer/prompts` (or equivalent) — the specific library is an implementation detail, not part of the contract
- `--format json` directs human-readable output to stderr and the JSON envelope to stdout — this is standard practice for CLI tools that support structured output but may surprise users who redirect stderr

## Constraints and Compliance

- `--format json` MUST use the standard envelope schema: `{ success: boolean, command: string, data: object, errors: array, warnings: array, exit_code: number }`
- All modes MUST direct interactive/diagnostic output to stderr and structured/primary output to stdout
- `--auto` MUST suppress all interactive prompts, resolving decisions automatically (first eligible prompt, default config values)
- `--auto` MUST NOT imply `--force` — a held lock with `--auto` MUST produce exit code 3 (state corruption/lock contention)
- `--auto --confirm-reset` MUST be required for destructive operations (e.g., `scaffold reset`) in auto mode
- Exit codes MUST follow the defined contract: 0 = success, 1 = validation error, 2 = missing dependency, 3 = state corruption, 4 = user cancellation, 5 = build error
- Fuzzy matching suggestions (Levenshtein distance of 2 or less) MUST be included in JSON error objects when applicable
- Commands MUST use the OutputContext Strategy pattern (or equivalent abstraction) to decouple output formatting from command logic (domain 09 recommendation)

## Related Decisions

- [ADR-013](ADR-013-decision-log-jsonl-format.md) — Decision log references output modes for recording feedback display
- [ADR-014](ADR-014-config-schema-versioning.md) — Config validation produces errors/warnings that feed into the output contract; fuzzy matching originates from config validation
- [ADR-019](ADR-019-advisory-locking.md) — Locking interacts with --force and --auto flags; lock contention is exit code 3
- Domain 09 ([09-cli-architecture.md](../domain-models/09-cli-architecture.md)) — Full CLI architecture including OutputContext Strategy pattern, command lifecycle, and flag definitions

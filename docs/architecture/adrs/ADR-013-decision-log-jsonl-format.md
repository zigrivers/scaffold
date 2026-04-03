# ADR-013: Decision Log — JSONL Append-Only Format

**Status**: accepted
**Date**: 2026-03-13
**Deciders**: v2 spec, domain modeling phase 1
**Domain(s)**: 11
**Phase**: 2 — Architecture Decision Records

---

## Context

Pipeline decisions — technology choices, architecture patterns, process conventions — need to be logged so that downstream prompts can reference prior reasoning without re-reading all predecessor artifacts. The decision log must support three challenging requirements simultaneously: concurrent multi-agent appends (agents in separate worktrees completing different prompts), cross-session continuity (new sessions must see decisions from previous sessions), and crash recovery (a crashed session may leave incomplete entries).

Domain 11 (Decision Log Lifecycle) explores the full lifecycle: write semantics, ID assignment, the "latest per prompt" query for re-run scenarios, the `NEEDS_USER_REVIEW` tag for autonomous Codex decisions, and the `prompt_completed` flag that distinguishes confirmed decisions from provisional ones written before a prompt finished.

The format choice directly affects git merge behavior. The pipeline may have multiple agents running concurrently, each appending decisions. The format must allow these appends to merge without manual conflict resolution.

## Decision

Use **JSONL format** (one JSON object per line, no wrapping array) for `.scaffold/decisions.jsonl`. The **CLI** (not agents) writes entries, ensuring consistent formatting, correct `prompt_completed` flags, and sequential ID assignment. The file is **committed to git**.

`decisions.jsonl` uses simple file append (not atomic write-rename) because JSONL is append-only and a partial last line is detectable and recoverable — on read, the CLI checks whether the last line is valid JSON, and if not, truncates it as a crash artifact.

Key design points:
- **JSONL format**: Each line is a self-contained JSON object. No opening/closing brackets, no commas between entries. Appends are independent line additions.
- **CLI-written**: The scaffold CLI assigns decision IDs (`D-NNN` format, monotonically increasing), sets `prompt_completed` based on actual completion status, and writes the JSONL line. Agents provide the decision text and category; the CLI handles serialization.
- **Decision IDs**: `D-NNN` format (e.g., `D-001`, `D-042`). Sequential, zero-padded to 3 digits. Assigned by reading the current max ID and incrementing. Sequential IDs (not UUIDs) are chosen for human readability in git diffs and log review — `D-042` is immediately meaningful in a commit message or `git log` search, while a UUID would not be.
- **1-3 decisions per prompt**: Each prompt execution produces 1-3 decision entries. The CLI warns if an agent attempts to record more than 3 (exception: `scaffold adopt` may exceed this when pre-populating from detected existing choices).
- **Categories**: `technology`, `architecture`, `process`, `convention`, `infrastructure` — used for filtering and downstream consumption.
- **NEEDS_USER_REVIEW tag**: Applied by Codex agents to high-stakes autonomous decisions (database choice, auth approach, infrastructure). Includes `review_status` field (`pending`, `approved`, `rejected`, `revised`).
- **`scaffold reset` behavior**: Deletes `decisions.jsonl` entirely. Git history preserves previous decisions.
- **Provisional entries**: Entries written with `prompt_completed: false` serve as crash recovery data — the agent's reasoning is captured even if the session dies before completion.

## Rationale

**JSONL over JSON arrays**: JSON arrays conflict on every append because the closing bracket (`]`) moves. When two agents append decisions concurrently in separate worktrees, both modify the last line (adding a comma and a new entry before `]`). JSONL appends are independent line additions — git auto-merges them without conflicts because each agent adds a new line at the end of the file without touching existing lines.

**CLI-written over agent-written**: Agents are AI models with filesystem access — they can write arbitrary content. If agents wrote directly to `decisions.jsonl`, they could produce malformed JSON, duplicate IDs, inconsistent `prompt_completed` values, or entries that don't match the schema. The CLI acts as a gatekeeper: it validates the decision text, assigns the next sequential ID, sets `prompt_completed` based on actual pipeline state, and writes the correctly formatted JSONL line. This separation of concerns keeps the log reliable.

**Committed to git**: Decisions provide cross-session context continuity. When `scaffold resume` bootstraps a new session, it reads `decisions.jsonl` to include recent decisions in the agent's context. If decisions were gitignored, new sessions would lack this context, and team members could not see each other's reasoning.

**ID conflict resolution by file position**: When concurrent agents both assign the same ID (because they read the same max ID before either writes), the conflict is resolved at merge time: both entries survive (JSONL lines merge cleanly), and the entry appearing later in the file is authoritative for that ID. This is a pragmatic resolution that avoids distributed locking for ID assignment.

## Alternatives Considered

### JSON array

- **Description**: Store decisions as a JSON array in `.scaffold/decisions.json`: `[{ id: "D-001", ... }, { id: "D-002", ... }]`.
- **Pros**: Standard JSON format. Can be parsed with a single `JSON.parse()` call. Self-contained.
- **Cons**: Merge conflicts on every concurrent append — the closing bracket moves, and both branches add a comma after the previous last entry. Must parse the entire file to add a new entry (no true append). For a pipeline with 30+ prompts producing 1-3 decisions each, this means 30-90 entries to parse on every write.

### Markdown file

- **Description**: Store decisions as a markdown file (e.g., `.scaffold/decisions.md`) with headings per prompt and bullet points for decisions.
- **Pros**: Human-readable in any text editor. Familiar format for developers.
- **Cons**: Merge conflicts when concurrent agents write to the same section. No structured queries (filtering by category, finding latest per prompt) without parsing markdown. No schema validation.

### SQLite database

- **Description**: Store decisions in a SQLite database (`.scaffold/decisions.db`) with structured tables and queries.
- **Pros**: Powerful queries (filter by category, join with prompts, aggregate). ACID transactions for concurrent writes. Schema enforcement.
- **Cons**: Binary file — no meaningful `git diff`, no git merge capability. Requires SQLite as a dependency. Overkill for 30-90 decision entries. Breaks the "text files in git" design philosophy that makes scaffold's state inspectable.

### Agent-written (not CLI-gated)

- **Description**: Let agents write directly to `decisions.jsonl` via filesystem operations, without CLI mediation.
- **Pros**: Simpler architecture — agents just append a line. No CLI command needed for decision recording.
- **Cons**: Race conditions on ID assignment (two agents read the same max ID). Inconsistent formatting across different AI models. Wrong `prompt_completed` values (agent doesn't know whether the CLI will mark the prompt as completed). No validation of decision text length or category values. The CLI is the only component that knows the true pipeline state.

## Consequences

### Positive
- Concurrent decision appends from multiple agents merge cleanly in git without manual conflict resolution
- New sessions get full decision context via `scaffold resume` bootstrap summary
- CLI-gated writes ensure consistent formatting, valid IDs, and correct `prompt_completed` flags
- NEEDS_USER_REVIEW tag enables safe autonomous Codex execution with human oversight
- Append-only semantics mean decisions are never lost — even superseded decisions remain in the file for auditing

### Negative
- JSONL is not directly parseable as standard JSON — consumers must split by newlines and parse each line individually
- **Duplicate ID fragility**: When multiple agents append concurrently, sequential ID assignment can produce duplicates. All consumers of the decision log must implement "last entry wins" consistently — a consumer using first-match instead of last-match will silently read stale decisions. This is a correctness invariant that cannot be enforced at write time.
- Append-only means the file grows monotonically — a project that re-runs prompts many times accumulates superseded entries (mitigated by `scaffold reset` which clears the file)
- CLI-gated writes add a round-trip: the agent must communicate decisions to the CLI rather than writing directly

### Neutral
- The 1-3 decisions per prompt guideline is enforced as a warning, not an error — agents can exceed it, but the CLI will flag it
- `scaffold reset` deleting the entire file is destructive but consistent with reset's purpose of returning to a clean state

## Constraints and Compliance

- The decision log file MUST be JSONL format (one JSON object per line, no wrapping array) at the path `.scaffold/decisions.jsonl`
- The CLI MUST assign decision IDs and write entries — agents MUST NOT write directly to `decisions.jsonl`
- The file MUST be committed to git — it MUST NOT appear in `.gitignore`
- Each entry MUST contain: `id`, `prompt`, `decision`, `at`, `completed_by`, `prompt_completed`
- Decision IDs MUST follow the `D-NNN` format (zero-padded to 3 digits, monotonically increasing)
- Autonomous decisions (Codex agents) MUST be tagged `NEEDS_USER_REVIEW` when they involve high-stakes choices
- Decision ID collisions (from concurrent agents) are detected at `scaffold validate` time, not at write time. Duplicate IDs produce a warning, not an error — the file remains valid with the "last entry wins" resolution rule.
- ID conflicts from concurrent appends MUST be resolved by file position (last entry with a given ID wins)
- See domain 11, Section 3 for the complete `DecisionEntry`, `DecisionCategory`, `DecisionTag`, and `ReviewStatus` type definitions

## Related Decisions

- [ADR-012](ADR-012-state-file-design.md) — state.json uses similar merge-safe principles (map-keyed structure)
- [ADR-018](ADR-018-completion-detection-crash-recovery.md) — Provisional decisions interact with crash recovery (prompt_completed flag tracks completion state)
- [ADR-025](ADR-025-cli-output-contract.md) — CLI output modes affect how decision recording feedback is displayed to users/agents
- Domain 11 ([11-decision-log.md](../domain-models/11-decision-log.md)) — Full decision log lifecycle specification including entity model, write semantics, crash recovery, and the "latest per prompt" query algorithm

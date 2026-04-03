# ADR-036: --auto Does Not Imply --force

**Status**: accepted
**Date**: 2026-03-13
**Deciders**: v2 spec, domain modeling phase 1
**Domain(s)**: 09, 13
**Phase**: 2 — Architecture Decision Records

---

## Context

Scaffold v2 supports two flags that modify CLI behavior in important ways: `--auto` (suppresses interactive prompts by choosing safe defaults) and `--force` (overrides safety mechanisms such as advisory locks). These flags serve different user needs — `--auto` enables unattended execution (CI pipelines, scripted workflows, batch operations), while `--force` provides an escape hatch when safety mechanisms are blocking progress (stale locks, conflicting state).

A common design pattern in CLI tools is to have `--auto` or `--yes` imply force behavior — the reasoning being "if there's no human to ask, just proceed." However, scaffold's `--auto` mode is specifically designed for CI pipelines where safety is paramount. A CI job that silently overrides a developer's in-progress lock, resets state, or overwrites configuration could cause data loss in a shared project.

Domain 09 (CLI Architecture) defines the flag taxonomy and command structure. Domain 13 (Pipeline Execution Locking) defines how locks interact with `--force` and `--auto`.

## Decision

The `--auto` flag suppresses interactive prompts by choosing safe defaults. It never implies `--force`. Specifically:

- **Lock override**: If a lock is held and `--auto` is set (without `--force`), the command fails with exit code 3 (lock contention). The user or CI pipeline must explicitly pass `--auto --force` to override the lock.
- **State reset**: `scaffold reset` with `--auto` requires `--confirm-reset` to proceed. Without it, the command fails with an error explaining that reset is destructive and requires explicit confirmation.
- **Config overwrite**: `scaffold init` with `--auto` on a project that already has `config.yml` requires `--confirm-reset` to overwrite. Without it, the command fails.
- **Skip confirmation**: `scaffold skip` with `--auto` skips the interactive "are you sure?" confirmation and proceeds — this is considered a safe default because `skip` is reversible (the prompt can be un-skipped and re-run).

The principle is: `--auto` chooses the safe default for each interactive prompt. If the safe default is "do not proceed" (because the operation is destructive), then `--auto` alone does not proceed. A second explicit flag is required.

## Rationale

**`--auto` is used in CI pipelines where safety is paramount**: The primary use case for `--auto` is CI/CD — running `scaffold build` or `scaffold validate` in a pipeline without human interaction. In CI, multiple jobs may run concurrently on the same repository. If `--auto` implied `--force`, a CI job could silently override a developer's active session lock, or silently reset pipeline state that another CI job is depending on. The consequences are subtle and hard to debug — the developer's session would fail with a confusing error, or the other CI job would see unexpected state changes.

**Automation should be safe by default, destructive by explicit opt-in**: This follows the principle of least surprise and the Unix philosophy of making destructive operations explicit. `rm` requires `-f` for force; `git push` requires `--force` for force push. These tools do not conflate "run without prompts" with "override all safety checks." Scaffold follows the same pattern: `--auto` means "don't ask me questions" and `--force` means "I know what I'm doing, proceed anyway."

**The flag combination is explicit and auditable**: When a CI pipeline uses `--auto --force`, the force flag is visible in the pipeline configuration, making it clear that the pipeline is intentionally overriding safety mechanisms. A code reviewer can see `--force` in the CI config and ask "is this intentional?" If `--auto` implied `--force`, the destructive behavior would be hidden inside the semantics of a seemingly benign flag.

**Different operations have different safe defaults**: `scaffold skip` with `--auto` can safely proceed (skipping is reversible). `scaffold reset` with `--auto` cannot safely proceed (reset is destructive and irreversible). By defining safe defaults per operation rather than a blanket `--force`, scaffold gives `--auto` predictable behavior without conflating different risk levels.

## Alternatives Considered

### --auto Implies --force for All Operations

- **Description**: When `--auto` is set, all interactive prompts are bypassed, including safety confirmations. Locks are overridden, resets proceed without confirmation, and overwrites happen silently.
- **Pros**: Simplest model — `--auto` means "just do it." CI pipelines only need one flag. No need to understand the distinction between `--auto` and `--force`.
- **Cons**: Dangerous in CI. A CI job running `scaffold resume --auto` could override a developer's active lock without warning. `scaffold reset --auto` could destroy pipeline state that took hours to build. The flag name `--auto` suggests "automation" not "override everything." Users who add `--auto` to their CI pipeline expecting safe unattended execution would be surprised by the destructive behavior.

### Per-Operation Auto Behavior Flags

- **Description**: Instead of `--auto` and `--force`, define per-operation flags: `--auto-skip-confirmation`, `--auto-override-lock`, `--auto-confirm-reset`, etc. Each flag controls exactly one behavior.
- **Pros**: Maximum granularity — each behavior is independently controlled. No ambiguity about what each flag does.
- **Cons**: Flag explosion — users must learn and specify multiple flags for common scenarios. CI pipeline configurations become verbose. The mental model is fragmented — instead of two orthogonal flags (`--auto` for prompts, `--force` for safety), users must remember a matrix of per-operation flags. The combinatorial complexity is not justified by the use cases.

### --auto with --strict (Inverted Default)

- **Description**: `--auto` implies `--force` by default, but `--auto --strict` enables the safe-default behavior. The safe behavior is the exception, not the default.
- **Pros**: Simpler for quick scripting — `--auto` does everything. Safety-conscious CI pipelines can add `--strict`.
- **Cons**: The dangerous behavior is the default — new users adding `--auto` to their scripts get force behavior without realizing it. This violates the principle of least surprise and makes the unsafe path the path of least resistance. Safety should be the default, not an opt-in.

## Consequences

### Positive
- CI pipelines using `--auto` are safe by default — they will fail loudly on lock contention or destructive operations rather than silently proceeding
- The distinction between `--auto` and `--force` is clear and auditable — code reviewers can identify when destructive overrides are being used
- Reversible operations (like `skip`) work smoothly with `--auto` alone, while destructive operations require explicit confirmation flags
- The flag model is consistent with Unix conventions (`rm -f`, `git push --force`) where force is always explicit

### Negative
- CI pipelines that need destructive behavior must use multiple flags (`--auto --force` or `--auto --confirm-reset`), which is more verbose than a single `--auto`
- Users may be confused when `--auto` alone fails on lock contention — the error message must clearly explain that `--force` is needed and why it is separate from `--auto`
- The per-operation safe defaults (skip proceeds, reset does not) require documentation to enumerate — users cannot predict the safe default for every operation without consulting docs

### Neutral
- The `--force` flag is not specific to `--auto` mode — it can be used without `--auto` in interactive sessions where the user wants to override a lock without suppressing other prompts
- `--confirm-reset` is a separate flag from `--force` — it confirms destructive reset operations specifically, while `--force` overrides lock contention. These are orthogonal concerns that can be combined independently

## Constraints and Compliance

- `--auto` MUST suppress interactive prompts by choosing safe defaults — it MUST NOT imply `--force`
- When `--auto` is set and a lock is held, the command MUST fail with exit code 3 (lock contention) unless `--force` is also set
- `scaffold reset --auto` MUST fail unless `--confirm-reset` is also set
- `scaffold init --auto` on an existing project MUST fail unless `--confirm-reset` is also set
- `scaffold skip --auto` MUST proceed without confirmation (skipping is reversible)
- Error messages when `--auto` fails due to missing force/confirmation flags MUST explain which additional flag is needed and why
- `--force` MUST be usable independently of `--auto` — it MUST work in both interactive and non-interactive contexts
- The combination `--auto --force` MUST override lock contention but MUST NOT override reset/overwrite protections (those require `--confirm-reset`)
- All flag interactions MUST be documented in `scaffold <command> --help` output

## Related Decisions

- [ADR-019](ADR-019-advisory-locking.md) — Advisory locking defines the lock contention behavior that `--force` overrides
- [ADR-025](ADR-025-cli-output-contract.md) — CLI output contract defines exit codes, including code 3 for lock contention under `--auto`
- Domain 09 ([09-cli-architecture.md](../domain-models/09-cli-architecture.md)) — CLI architecture defines the flag taxonomy and command structure
- Domain 13 ([13-pipeline-locking.md](../domain-models/13-pipeline-locking.md)) — Lock lifecycle and interaction with `--auto` and `--force` flags

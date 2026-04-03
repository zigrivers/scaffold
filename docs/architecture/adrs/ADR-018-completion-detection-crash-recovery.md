# ADR-018: Completion Detection and Crash Recovery

**Status**: accepted
**Date**: 2026-03-13
**Deciders**: v2 spec, domain modeling phase 1
**Domain(s)**: 03, 08
**Phase**: 2 — Architecture Decision Records

---

## Context

The scaffold pipeline must determine when a prompt is "complete" and handle crashes that interrupt execution mid-prompt. These two problems are deeply interrelated: the mechanism for detecting completion directly determines what crash recovery can accomplish.

Completion could be checked via artifacts on disk (files listed in frontmatter `produces`), state.json records, or both. Each source of truth has failure modes: artifacts may exist but state.json was never updated (crash after file creation but before state write), or state.json may record completion but artifacts may have been deleted or never fully written.

Crashes can leave `state.json` in an inconsistent state — specifically, the `in_progress` field may remain set after a session terminates unexpectedly. The system needs a deterministic recovery path that avoids both data loss (re-running a prompt that already succeeded) and silent corruption (accepting incomplete artifacts as complete).

Domain 03 (Pipeline State Machine) explores these trade-offs extensively, defining the dual detection mechanism and the `InProgressRecord` schema that enables crash detection.

## Decision

Two interrelated decisions govern completion detection and crash recovery:

1. **Dual completion detection**: Artifact-based detection is the primary signal; state.json is the secondary signal. If all files listed in a prompt's frontmatter `produces` field exist on disk, the prompt is considered complete — even if state.json was never updated. When the two sources disagree, artifacts take precedence and state.json is updated to match. Completion detection checks file existence only — content and structural validation of produced artifacts is deferred to `scaffold validate` and Completion Criteria (ADR-029).

2. **Crash recovery via in_progress detection**: The `in_progress` field in state.json is set to a non-null `InProgressRecord` before prompt execution begins and cleared after completion. On resume, if `in_progress` is non-null, the system runs completion detection on the interrupted prompt. If all artifacts exist, the prompt is marked complete. If artifacts are missing or partial, the user is offered a choice to re-run the prompt or accept the current state.

Note that Completion Criteria defined in ADR-029 (Prompt Structure Convention) provide a finer-grained validation layer on top of this dual detection system. The dual detection mechanism described here answers "has this prompt run?" — checking artifact existence and state records. Completion Criteria (ADR-029) answer a different question: "does the produced artifact meet its structural requirements?" — checking for required sections, correct format, and other machine-checkable assertions via `scaffold validate`. The two mechanisms are complementary: dual detection gates pipeline progression, while Completion Criteria gate artifact quality.

## Rationale

**Artifacts as primary signal**: Artifacts are the tangible output of a prompt — they are the reason the prompt exists. If the files are present and correct, the prompt achieved its purpose regardless of what a metadata file says. State.json can lie after a crash (the write to state.json may have been the operation that was interrupted), but artifacts on disk are a concrete record of what actually happened. This aligns with domain 03's central design principle: "favor artifact presence as the primary signal while using state records for metadata" (Section 1).

**Dual detection over single-source**: Pure artifact-only detection loses metadata (who completed the prompt, when, skip reasons). Pure state-only detection is fragile — a crash between prompt completion and state write creates a false negative that would cause the user to re-run an already-completed prompt. The dual approach captures both the concrete outcome (artifacts) and the metadata (state), with a clear precedence rule when they disagree.

**InProgressRecord for crash detection**: A simple boolean "is something running?" flag would not provide enough information to recover. The `InProgressRecord` captures the prompt slug, start timestamp, partial artifacts list, and actor identity — all of which are needed to make an informed recovery decision. The started timestamp enables stale detection (e.g., an `in_progress` record from 3 days ago is almost certainly a crash, not an active session).

**User choice on partial recovery**: Rather than silently re-running or silently accepting partial results, the system asks the user. This respects the principle that crash recovery should never silently lose or corrupt work.

## Alternatives Considered

### Artifact-Only Detection (No State)

- **Description**: Determine completion solely by checking whether all `produces` files exist on disk. No state.json tracking of prompt status.
- **Pros**: Simplest implementation. No state file to corrupt. Filesystem is the single source of truth.
- **Cons**: Loses all metadata — no record of who completed a prompt, when it was completed, or why it was skipped. Cannot distinguish "never started" from "started and produced no artifacts." Dashboard and status commands would have no data to display beyond binary present/absent.

### State-Only Detection (No Artifact Check)

- **Description**: Trust state.json exclusively. If state says completed, it is completed regardless of what is on disk.
- **Pros**: Fast — single JSON read, no filesystem traversal. Clean separation of concerns (state file is the authority).
- **Cons**: State can lie after a crash. If the crash occurs after artifact creation but before the state write, the system would erroneously report the prompt as pending and re-run it. Worse, if artifacts are deleted after state records completion, the pipeline would consider itself done but downstream prompts would fail due to missing dependencies.

### Explicit "Mark Complete" Command

- **Description**: Require the user to explicitly run `scaffold complete <prompt>` after each prompt finishes.
- **Pros**: Full user control. No ambiguity about intent.
- **Cons**: Significant friction — adds a manual step to every prompt execution. Easy to forget, especially in `--auto` mode. Contradicts the v2 goal of reducing pipeline ceremony.

### No Crash Recovery (Re-Run from Scratch)

- **Description**: If a crash is detected, discard all progress on the interrupted prompt and re-run it from the beginning.
- **Pros**: Simplest recovery logic. Guaranteed clean state.
- **Cons**: Loses potentially significant work. Some prompts produce multiple artifacts and may have completed most of them before the crash. Re-running from scratch wastes time and may produce different results if the AI agent generates different content.

### WAL/Transaction Log

- **Description**: Implement a write-ahead log that records every state transition before it happens, enabling replay-based recovery.
- **Pros**: Guaranteed consistency. Fine-grained recovery to any point.
- **Cons**: Massive overkill for a pipeline that executes 20-30 prompts. Adds significant implementation complexity and filesystem operations. The dual detection approach achieves sufficient crash safety with far less machinery.

### Checkpoint Files

- **Description**: Write per-artifact checkpoint files as each `produces` file is created, enabling recovery to the exact point of interruption.
- **Pros**: Fine-grained recovery. Can resume mid-prompt rather than re-running the whole prompt.
- **Cons**: Filesystem bloat (checkpoint file per artifact per prompt). Complexity in managing checkpoint lifecycle. The prompt is the atomic unit of execution in the pipeline — sub-prompt recovery adds complexity without meaningful benefit since most prompts produce 1-3 files.

## Consequences

### Positive
- Crashes cannot cause the pipeline to lose completed work — artifact presence is always respected
- State.json inconsistencies are self-healing — any disagreement with artifacts is resolved automatically on the next resume
- The `InProgressRecord` provides enough context for both automated recovery and user-informed decisions
- Brownfield initialization leverages the same artifact scan mechanism to detect pre-existing project documents (domain 03, Section 5)

### Negative
- Dual detection adds complexity — every status check must consult both sources and reconcile disagreements
- Artifact-based detection depends on the accuracy of frontmatter `produces` declarations. A prompt with incorrect `produces` will have incorrect completion detection.
- Partial artifacts (e.g., a file that exists but is truncated from a crash mid-write) are indistinguishable from complete artifacts via existence checks alone. Content validation is out of scope for this mechanism.

### Neutral
- The `in_progress` field remains a single nullable record (not per-prompt), consistent with the sequential execution model (ADR-021). If parallel execution were ever added, this would need to become a list.
- Recovery decisions in `--auto` mode default to re-run (safest option), while interactive mode prompts the user.

## Constraints and Compliance

- Artifact existence checks MUST always run before trusting state.json — implementers MUST NOT skip the filesystem check as an optimization
- The `in_progress` field MUST be set to a non-null `InProgressRecord` before prompt execution begins and cleared to null after the prompt completes or is skipped
- Crash recovery MUST offer the user a choice between re-running the interrupted prompt and accepting current artifacts, in interactive mode
- `scaffold resume` MUST check for a stale `in_progress` record on startup and run completion detection before proceeding
- The `InProgressRecord` MUST contain at minimum: prompt slug, started timestamp (ISO 8601), partial_artifacts list, and actor identity
- Brownfield initialization MUST use the same artifact scan mechanism to pre-populate state.json with `completed` entries for prompts whose `produces` files already exist (domain 03, Section 5)
- Zero-byte files count as "artifact present" for completion detection purposes (file existence is the check, not file size). However, `scaffold validate` SHOULD emit a warning for zero-byte artifacts as they likely indicate incomplete generation.
- When artifacts and state disagree, state MUST be updated to match artifact reality — never the reverse

## Related Decisions

- [ADR-012](ADR-012-state-file-design.md) — State file design (map-keyed, committed, atomic writes) that this decision builds upon
- [ADR-015](ADR-015-prompt-frontmatter-schema.md) — Frontmatter schema defining the `produces` field used for artifact detection
- [ADR-017](ADR-017-tracking-comments-artifact-provenance.md) — Tracking comments that may serve as additional completion signals
- [ADR-019](ADR-019-advisory-locking.md) — Advisory locking that coordinates with crash recovery (lock + in_progress lifecycle)
- [ADR-021](ADR-021-sequential-prompt-execution.md) — Sequential execution means in_progress is a single record, not a list
- [ADR-029](ADR-029-prompt-structure-convention.md) — Completion Criteria provide finer-grained structural validation on top of dual completion detection
- Domain 03 ([03-pipeline-state-machine.md](../domain-models/03-pipeline-state-machine.md)) — Full specification of dual detection, crash recovery flow, and InProgressRecord schema

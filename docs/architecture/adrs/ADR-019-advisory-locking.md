# ADR-019: Advisory Locking — PID-Based, Local-Only, Gitignored

**Status**: accepted
**Date**: 2026-03-13
**Deciders**: v2 spec, domain modeling phase 1
**Domain(s)**: 13
**Phase**: 2 — Architecture Decision Records

---

## Context

Multiple `scaffold` processes can run concurrently on the same project — a developer might have multiple terminals open, or CI might run alongside a local session. Without coordination, concurrent write operations could corrupt `state.json` or produce conflicting artifact outputs.

The lock mechanism must balance safety (preventing concurrent writes) with usability (not blocking read-only operations, not requiring manual cleanup after crashes). It must also handle PID recycling — where the OS assigns a dead process's PID to a new, unrelated process — without falsely treating a stale lock as active.

Domain 13 (Pipeline Execution Locking) explores the full design space, defining the lock schema, acquisition semantics, stale detection algorithm, and the interaction with the `in_progress` field in state.json.

## Decision

Use `.scaffold/lock.json` as an advisory lock file — local-only (gitignored), PID-based with stale detection via process start time comparison. Write commands acquire the lock before modifying state; read-only commands do not acquire it. There is no explicit `scaffold unlock` command — stale detection handles crashed processes automatically.

`lock.json` and `state.json`'s `in_progress` field are intentionally independent mechanisms. The lock is for local machine coordination (preventing concurrent writes on the same machine). The `in_progress` field is for cross-machine crash detection (detecting an interrupted session from any machine via committed state). They may be inconsistent and that is by design — for example, a stale lock may exist while `in_progress` is null (process crashed after clearing in_progress but before releasing lock), or vice versa.

The lock file contains: `holder` (hostname), `prompt` (slug being executed), `started` (ISO 8601 timestamp), `pid` (process ID), `processStartedAt` (ISO 8601 timestamp of when the process was launched), and `command` (the scaffold subcommand that acquired the lock).

## Rationale

**Advisory over mandatory**: Scaffold is a developer tool, not a database. An advisory lock that warns and can be overridden with `--force` respects the user's autonomy while preventing accidental concurrent writes. A mandatory lock that cannot be overridden would block users when stale detection fails or in edge cases the system cannot anticipate.

**PID + process start time over PID alone**: PID-based liveness checking (`process.kill(pid, 0)` or equivalent) can produce false positives due to PID recycling — the OS may assign the same PID to a new process after the original dies. Comparing the lock's `processStartedAt` with the current process's start time (retrieved via `ps -o lstart` on macOS or `/proc/PID/stat` on Linux) detects recycling: if the times differ by more than 2 seconds, the PID belongs to a different process and the lock is stale. Domain 13, Section 3 defines this algorithm in detail.

**Local-only (gitignored) over committed**: A committed lock file would cause false contention across machines — a developer on machine A would see machine B's lock in the git history and refuse to proceed. Cross-machine coordination is handled by git's merge behavior on state.json and decisions.jsonl, which are designed to be merge-safe (domain 03, domain 11). The lock only needs to prevent concurrent writes on the same machine.

**No explicit unlock command**: An explicit `scaffold unlock` command would be used almost exclusively to clean up stale locks after crashes — the exact scenario that automatic stale detection handles. Removing the command eliminates a footgun (users running `unlock` while another process is legitimately running) and simplifies the CLI surface.

**Execution timeline**: The lock lifecycle wraps the in_progress lifecycle: acquire lock, set in_progress in state.json, execute prompt, clear in_progress, release lock. This ordering ensures that if a crash occurs after lock acquisition but before in_progress is set, the next process detects the stale lock and cleans it up. If a crash occurs after in_progress is set, crash recovery (ADR-018) handles the state inconsistency.

## Alternatives Considered

### Mandatory Locking (Fail if Locked)

- **Description**: If the lock file exists and the holder is alive, refuse to proceed — no `--force` override.
- **Pros**: Absolute safety against concurrent writes. No ambiguity about behavior.
- **Cons**: Too aggressive for an advisory developer tool. If stale detection has a false positive (live PID that isn't actually scaffold), the user is permanently locked out until the other process exits. No escape hatch.

### File-Based Lock Without PID (Presence Only)

- **Description**: Lock file exists = locked, lock file absent = unlocked. No PID or process information stored.
- **Pros**: Simpler implementation. No platform-specific PID introspection.
- **Cons**: After a crash, the lock file persists with no way to automatically determine that the holder is dead. Requires manual cleanup (`rm .scaffold/lock.json`) every time a session crashes, which is a poor user experience.

### Cross-Machine Locking (Via Git)

- **Description**: Commit the lock file to git so that all machines see it. Use a branch-based or tag-based protocol to coordinate cross-machine access.
- **Pros**: Prevents concurrent writes across machines.
- **Cons**: Massive complexity — requires network access for lock operations, introduces latency, and fails when offline. Git's merge behavior on state.json already handles cross-machine coordination safely. The scenarios where two developers run `scaffold run` on the same project simultaneously are rare and better handled by git merge semantics than by distributed locking.

### No Locking

- **Description**: Allow concurrent writes without coordination. Rely on atomic writes (ADR-012) to prevent corruption.
- **Pros**: Simplest possible implementation. No lock management code.
- **Cons**: Atomic writes prevent file corruption (truncated JSON) but do not prevent logical corruption (two processes reading state, each completing a different prompt, then both writing back — one completion is lost). The lock prevents this read-modify-write race condition.

## Consequences

### Positive
- Concurrent write operations on the same machine are prevented, avoiding read-modify-write race conditions on state.json
- Stale locks from crashed processes are detected and cleaned up automatically — no manual intervention required
- Read-only operations (`scaffold status`, `scaffold list`, `scaffold dashboard`) are never blocked by the lock
- The `--force` flag provides an escape hatch for edge cases where stale detection fails

### Negative
- Platform-specific process start time retrieval adds implementation complexity (different paths for macOS vs. Linux)
- The 2-second threshold for PID recycling detection is a heuristic — a process that crashes and whose PID is recycled within 2 seconds would not be detected as stale (extremely unlikely but theoretically possible)
- Gitignoring the lock file means `scaffold status` on another machine cannot show that a lock is held elsewhere — but this is intentional, as cross-machine locking is explicitly out of scope

### Neutral
- The `--force` flag on write commands overrides the lock but is NOT classified as a destructive operation (it does not destroy data, it overrides an advisory coordination mechanism)
- `--auto` mode does NOT imply `--force` — if a lock is held and `--auto` is set, the command fails with an error rather than silently overriding. This prevents automated scripts from accidentally racing with interactive sessions.

## Constraints and Compliance

- `lock.json` MUST be gitignored — it MUST NOT be committed to version control
- Write commands (`scaffold run`, `scaffold skip`, `scaffold reset`) MUST acquire the lock before making state changes
- Read-only commands (`scaffold status`, `scaffold list`, `scaffold dashboard`, `scaffold next`, `scaffold build`) MUST NOT acquire the lock. `scaffold build` is classified as read-only for locking purposes — it reads config and writes to output directories but does not modify pipeline state (`state.json`, `decisions.jsonl`).
- Lock acquisition MUST use the `wx` flag (`O_CREAT | O_EXCL`) for atomic creation — if the file already exists, check for staleness rather than overwriting
- Stale lock detection MUST check both PID liveness (`process.kill(pid, 0)`) AND process start time comparison
- PID recycling detection MUST compare the lock's `processStartedAt` with the current PID's actual start time, treating a difference greater than 2 seconds as evidence of a different process
- There MUST be no explicit `scaffold unlock` command
- `--force` MUST be available on write commands to override an active lock
- `--auto` MUST NOT imply `--force` — a held lock with `--auto` MUST produce an error (exit code 3)
- Graceful shutdown handlers (SIGTERM, SIGINT) MUST call `releaseLock()` before process exit
- The execution timeline MUST be: acquire lock, set in_progress, execute prompt, clear in_progress, release lock (domain 13, Section 7)

## Related Decisions

- [ADR-012](ADR-012-state-file-design.md) — State file design; lock protects concurrent access to state.json
- [ADR-018](ADR-018-completion-detection-crash-recovery.md) — Crash recovery interacts with lock lifecycle (in_progress set between lock acquire and release)
- [ADR-025](ADR-025-cli-output-contract.md) — CLI output contract defines --force and --auto flag behavior
- Domain 13 ([13-pipeline-locking.md](../domain-models/13-pipeline-locking.md)) — Full lock specification including schema, acquisition algorithm, stale detection, and platform-specific PID introspection

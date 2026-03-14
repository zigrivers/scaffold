# ADR-040: Error Handling Philosophy (Cross-Cutting)

**Status**: accepted
**Date**: 2026-03-13
**Deciders**: v2 spec, domain modeling phase 1
**Domain(s)**: All (01-14)
**Phase**: 2 — Architecture Decision Records

---

## Context

Scaffold v2 has multiple operational modes — build-time commands (`scaffold build`, `scaffold validate`) that process prompt files and configuration, and runtime commands (`scaffold resume`, `scaffold skip`, `scaffold reset`) that execute prompts and modify pipeline state. Each mode encounters different categories of errors: missing files, invalid schemas, circular dependencies, unresolved markers, stale artifacts, lock contention, and more.

Without a consistent error handling philosophy, each command and each domain would invent its own approach — some failing on the first error, some accumulating errors, some treating warnings as errors. This inconsistency would confuse users who cannot predict whether a command will fail fast or report multiple issues, and would complicate implementation as each domain makes ad-hoc error handling decisions.

This ADR establishes a cross-cutting error handling philosophy that applies to all 14 domains, providing consistent behavior that users can learn once and apply everywhere. It draws on decisions already made in individual ADRs (ADR-006 for injection errors, ADR-014 for config validation, ADR-019 for lock errors, ADR-025 for exit codes, ADR-033 for unknown field warnings) and unifies them into a coherent framework.

## Decision

Scaffold v2 follows an **accumulate and report** error handling philosophy at build time and a **fail-fast** philosophy at runtime:

### Build Time (`scaffold build`, `scaffold validate`)

All errors and warnings are accumulated during processing. After processing completes (or as much processing as possible is completed), errors and warnings are reported grouped by source file, with errors listed before warnings. The command then exits with the appropriate code:

- Exit code 0: No errors (warnings may be present)
- Exit code 1: One or more errors found
- Exit code 2: Usage error (invalid arguments, missing required flags)

Accumulation continues even after encountering an error — the goal is to report as many issues as possible in a single run so the user can fix multiple problems before re-running the command.

### Runtime (`scaffold resume`, `scaffold skip`, `scaffold reset`)

The command fails fast on the first structural error — missing config file, corrupt state.json, missing dependency file, lock contention. The error message includes the specific failure, the affected file or resource, and a suggested fix. Warnings (stale artifacts, skipped predecessors, unknown fields) are reported but do not block execution.

Runtime fail-fast is appropriate because runtime errors often cascade — if state.json is corrupt, every subsequent operation on state is undefined. Continuing after a structural error would produce confusing secondary errors that obscure the root cause.

### Error vs. Warning Threshold

The classification of issues as errors or warnings follows a clear principle:

**Errors** (structural integrity violations — the system cannot produce correct output):
- Missing required files (config.yml, state.json, prompt source files)
- Invalid schema (malformed YAML, missing required fields, wrong types)
- Circular dependencies in the prompt dependency graph
- Unresolved mixin or task verb markers after injection (without `--allow-unresolved-markers`)
- Lock contention (another process holds the lock, without `--force`)
- Corrupt state (invalid JSON, unknown status values, inconsistent completion data)

**Warnings** (advisory issues — the system can produce output, but the user should be aware):
- Unknown fields in config, frontmatter, or manifests (ADR-033)
- Stale downstream artifacts after a re-run (ADR-034)
- Incompatible mixin combinations that may produce suboptimal prompts
- Missing optional fields in frontmatter (defaults will be used)
- Skipped predecessor prompts (the current prompt will run, but its inputs may be incomplete)
- Deprecated fields or syntax that will be removed in a future version

### Escape Hatches

Every error category that has an escape hatch documents it in the relevant ADR:
- `--allow-unresolved-markers`: Downgrades unresolved marker errors to warnings during build (ADR-035)
- `--force`: Overrides lock contention errors (ADR-019)
- `--auto` with explicit second flags: Enables destructive operations in unattended mode (ADR-036)

Escape hatches always downgrade an error to a warning — they never silence the issue completely. The user is always informed, even when they have opted to proceed.

## Rationale

**Build-time accumulation saves user time**: Build-time commands process multiple files (prompts, mixins, manifests) and can encounter errors in any of them. If `scaffold build` fails on the first error, the user fixes one error, re-runs, discovers the next error, fixes it, re-runs again — this cycle is frustrating and time-consuming. Accumulating all errors and reporting them at once lets the user fix everything in a single editing session. This is the established pattern in compilers (GCC, Clang), linters (ESLint, ShellCheck), and type checkers (TypeScript), which all accumulate errors by default.

**Runtime fail-fast prevents cascading confusion**: Runtime commands modify state and execute prompts. If state.json is corrupt and the command continues, subsequent state reads produce garbage, leading to secondary errors that obscure the root cause. Failing fast on the first structural error gives the user a clear, actionable error message without the noise of cascading failures. This is the established pattern in runtime environments (Node.js throws on corrupt state, databases abort on integrity violations).

**Clear error/warning threshold prevents ambiguity**: Without a documented threshold, each domain would classify issues differently — one domain might treat a missing optional field as an error while another treats it as a warning. The consistent principle (structural integrity = error, advisory = warning) ensures that users can predict which issues will block them and which will merely inform them. The principle maps cleanly to exit codes: errors produce non-zero exit, warnings do not.

**Escape hatches preserve user agency without undermining safety**: Some errors are genuinely blocking in production but acceptable in development. A developer authoring a new mixin may want to build prompts with unresolved markers to test partial progress. The `--allow-unresolved-markers` flag enables this without changing the default behavior. Critically, escape hatches downgrade errors to warnings — they do not silence issues. The user always sees the advisory output, ensuring they know about the deferred problem.

**Grouping by source file aids debugging**: When `scaffold build` processes 25 prompts and finds errors in 3 of them, grouping errors by source file lets the user open each affected file and fix all its issues at once, rather than scanning an unsorted error list trying to figure out which file each error belongs to.

## Alternatives Considered

### Fail-Fast Everywhere

- **Description**: All commands, including build-time, fail on the first error encountered. The user fixes one error at a time and re-runs.
- **Pros**: Simplest implementation — no error accumulation, no grouping logic. Clear behavior — one error, one fix, one re-run. Error messages are always about the root cause, never about secondary issues.
- **Cons**: Frustrating for build-time operations that process many files. A user with errors in 5 files would need 5+ build-fix-build cycles. This is the behavior that compilers abandoned decades ago in favor of multi-error reporting. The fix-one-at-a-time cycle is especially costly when each `scaffold build` invocation takes noticeable time.

### Accumulate Everywhere

- **Description**: All commands, including runtime, accumulate errors and report them at the end. Runtime commands attempt to continue past errors, noting each failure and reporting all of them after the command completes.
- **Pros**: Consistent behavior across all commands. Users see all issues in a single run, regardless of the command type.
- **Cons**: Runtime error accumulation is dangerous — continuing past a corrupt state.json means subsequent state operations are undefined. The accumulated errors after a corrupt-state situation would include both the real problem (corrupt state) and numerous secondary errors (failed reads, inconsistent data) that are consequences of the real problem. The user must filter noise to find the root cause. Compilers can accumulate because compilation steps are mostly independent; runtime state operations are sequential and interdependent.

### Per-Command Configurable Error Mode

- **Description**: Each command supports `--error-mode=fail-fast|accumulate` to let the user choose the behavior. The default varies by command.
- **Pros**: Maximum flexibility — users who want fail-fast at build time can have it, and users who want accumulation at runtime can have it.
- **Cons**: Adds a flag to every command. The user must learn and choose the error mode for each invocation. The default still needs to be defined (which is the same decision this ADR makes). The per-command default is the important decision — the flag adds complexity for edge cases that rarely arise.

### Warnings as Errors Mode (--strict)

- **Description**: In addition to the default behavior, provide a `--strict` flag that promotes all warnings to errors. Useful for CI pipelines that want zero-warning builds.
- **Pros**: CI pipelines can enforce clean builds with no warnings. Catches advisory issues before they become problems.
- **Cons**: This is not mutually exclusive with the chosen approach — it could be added later as an enhancement. Deferring `--strict` from the initial implementation keeps the flag surface small. The unknown-fields-as-warnings behavior (ADR-033) was specifically designed to NOT be promoted to errors, as it would break forward compatibility. A blanket `--strict` flag would need exceptions, adding complexity.

## Consequences

### Positive
- Users can fix multiple build-time issues in a single editing session, reducing the fix-build-fix cycle time
- Runtime errors are clear and actionable — no cascading confusion from continuing past structural failures
- The error/warning threshold is predictable — users learn the principle once and can anticipate which issues block and which merely warn
- Escape hatches preserve user agency for development workflows without undermining safety defaults
- Error grouping by source file makes it easy to navigate from error output to the file that needs fixing

### Negative
- Build-time accumulation adds implementation complexity — the build pipeline must be designed to continue processing after errors, which requires careful error handling in each domain
- Some build-time errors may prevent processing of subsequent files (e.g., if `config.yml` is invalid, mixin resolution cannot proceed for any prompt) — the accumulation must handle these "blocking" errors gracefully by reporting what it can and noting what it could not process
- The error/warning classification must be maintained as new features are added — each new issue type must be explicitly classified as error or warning

### Neutral
- Exit codes follow the standard convention (0 = success, 1 = error, 2 = usage error, 3 = lock contention) — this is consistent with ADR-025 but does not introduce new exit codes for warnings
- The `--allow-unresolved-markers` and `--force` escape hatches are defined in their respective ADRs — this ADR documents the pattern but does not modify the individual escape hatch behavior
- `scaffold validate` and `scaffold build` use the same accumulation logic — `validate` reports issues without producing output files, `build` reports issues AND produces output files (unless errors prevent it)

## Constraints and Compliance

- Build-time commands (`scaffold build`, `scaffold validate`) MUST accumulate all errors and warnings, reporting them after processing completes
- Build-time error output MUST be grouped by source file, with errors listed before warnings for each file
- Runtime commands (`scaffold resume`, `scaffold skip`, `scaffold reset`) MUST fail fast on the first structural error
- Runtime commands MUST report warnings (stale artifacts, skipped predecessors) without blocking execution
- Structural integrity violations (missing files, invalid schemas, circular dependencies, unresolved markers, corrupt state, lock contention) MUST be classified as errors
- Advisory issues (unknown fields, stale references, incompatible mixin combinations, missing optional fields, deprecated syntax) MUST be classified as warnings
- Errors MUST produce a non-zero exit code; warnings alone MUST NOT produce a non-zero exit code
- Escape hatches (`--allow-unresolved-markers`, `--force`) MUST downgrade errors to warnings — they MUST NOT silence the issue completely
- Error messages MUST include: the issue description, the affected file or resource, and a suggested fix or next step
- Warning messages MUST follow the format defined in ADR-025 (CLI output contract)
- Each domain MUST classify its issues as errors or warnings according to the structural/advisory principle — ad-hoc classification is not permitted

## Related Decisions

- [ADR-006](ADR-006-mixin-injection-over-templating.md) — Injection errors (unresolved markers) follow the build-time accumulation pattern
- [ADR-014](ADR-014-config-schema-versioning.md) — Config validation errors follow the build-time accumulation pattern
- [ADR-019](ADR-019-advisory-locking.md) — Lock contention errors follow the runtime fail-fast pattern; `--force` is an escape hatch
- [ADR-025](ADR-025-cli-output-contract.md) — CLI output contract defines exit codes and output format for errors and warnings
- [ADR-033](ADR-033-forward-compatibility-unknown-fields.md) — Unknown fields classified as warnings per the advisory threshold
- [ADR-035](ADR-035-non-recursive-injection.md) — Unresolved marker errors with `--allow-unresolved-markers` escape hatch
- [ADR-036](ADR-036-auto-does-not-imply-force.md) — `--auto` interaction with error handling and escape hatches
- Domain 06 ([06-config-validation.md](../domain-models/06-config-validation.md)) — Config validation error accumulation
- Domain 09 ([09-cli-architecture.md](../domain-models/09-cli-architecture.md)) — CLI architecture defines error output formatting

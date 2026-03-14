# lock.json Schema

**Phase**: 4 — Data Schemas
**Depends on**: [domain-models/13-pipeline-locking.md](../domain-models/13-pipeline-locking.md), [adrs/ADR-019-advisory-locking.md](../adrs/ADR-019-advisory-locking.md), [architecture/system-architecture.md](../architecture/system-architecture.md) §5, §6
**Last updated**: 2026-03-13
**Status**: draft

---

## Section 1: Overview

`.scaffold/lock.json` is the advisory lock file that prevents concurrent write operations against the same scaffold project on the same machine. It is:

- **Gitignored** — listed in `.gitignore` and never committed to version control. Cross-machine coordination is handled by git merge semantics on `state.json` and `decisions.jsonl`, not by the lock file.
- **Local-only** — meaningful only to processes running on the machine where it was created. A lock on machine A has no effect on machine B, even if both share the same repository via git.
- **Advisory** — can be overridden with `--force` on any lockable command. The lock warns and blocks by convention; it does not use OS-level mandatory file locking.
- **Never committed** — if `lock.json` were committed, it would create false contention on every other machine that checks out the repository. The `scaffold init` command ensures `.scaffold/lock.json` is listed in `.gitignore`.

**Lifecycle**: The file is created atomically when a lockable command (e.g., `scaffold run`) acquires the lock, and deleted when that command completes. It is never modified in place — only created and deleted. If the holding process crashes, the file remains on disk until the next lockable invocation detects it as stale (via PID liveness checking) and removes it automatically.

**Scope**: One lock file per project (one per `.scaffold/` directory). The lock does not distinguish between prompts — any lockable command contends with any other lockable command on the same project.

---

## Section 2: Formal Schema Definition

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://scaffold.dev/schemas/lock.json",
  "title": "Scaffold Lock File",
  "description": "Advisory lock file preventing concurrent write operations on the same scaffold project on the same machine. Gitignored, local-only, created on acquisition and deleted on release. Never modified in place.",
  "type": "object",
  "required": [
    "holder",
    "prompt",
    "pid",
    "started",
    "processStartedAt",
    "command"
  ],
  "additionalProperties": false,
  "properties": {
    "holder": {
      "type": "string",
      "minLength": 1,
      "description": "Human-readable machine identifier, from os.hostname(). Used in error messages so the user can identify which machine holds the lock."
    },
    "prompt": {
      "type": "string",
      "minLength": 1,
      "description": "Slug of the prompt currently being executed (e.g., 'dev-env-setup'). For non-prompt lockable commands (init, reset), holds the command name instead (e.g., 'init', 'reset')."
    },
    "pid": {
      "type": "integer",
      "minimum": 1,
      "description": "OS process ID of the lock holder. Used for stale detection: if the PID is no longer alive, the lock is stale."
    },
    "started": {
      "type": "string",
      "format": "date-time",
      "description": "ISO 8601 timestamp of when the lock was acquired. Informational — used in status displays and error messages, not in stale detection logic."
    },
    "processStartedAt": {
      "type": "string",
      "format": "date-time",
      "description": "ISO 8601 timestamp of the locking process's OS creation time. Critical for PID recycling detection: if the current process at `pid` has a different start time (difference > 2 seconds), the PID was recycled and the lock is stale."
    },
    "command": {
      "type": "string",
      "enum": ["run", "skip", "init", "reset", "adopt"],
      "description": "The scaffold CLI subcommand that acquired the lock. Helps users understand what operation is in progress when they encounter a LOCK_HELD error."
    }
  }
}
```

**Schema version note**: There is no `version` or `schemaVersion` field. See [Section 5](#5-version-history-and-migration) for the rationale.

---

## Section 3: Field Reference

### `holder`

| Attribute | Value |
|-----------|-------|
| Type | `string` |
| Required | Yes |
| Source | `os.hostname()` at lock acquisition time |
| Constraints | Non-empty string. No length limit beyond OS hostname constraints (typically 1-253 characters). |
| Purpose | Human-readable identifier for error messages. When a user sees `LOCK_HELD`, the holder field tells them which machine holds the lock. On a single-user machine this is mostly informational; with multiple terminals it confirms "this is the same machine." |
| Example | `"ken-macbook"` |

### `prompt`

| Attribute | Value |
|-----------|-------|
| Type | `string` |
| Required | Yes |
| Source | The prompt slug passed to the lockable command, or the command name itself for non-prompt operations |
| Constraints | Non-empty string. For prompt executions, matches a key in `state.json`'s `prompts` map. For `init` and `reset`, holds the literal command name. |
| Purpose | Tells the user (and diagnostic tooling) which prompt is being executed. Appears in `LOCK_HELD` error messages: "running dev-env-setup". |
| Example | `"dev-env-setup"`, `"init"`, `"reset"` |

### `pid`

| Attribute | Value |
|-----------|-------|
| Type | `integer` |
| Required | Yes |
| Source | `process.pid` in Node.js |
| Constraints | Positive integer (minimum 1). Valid OS process ID. |
| Purpose | Primary mechanism for stale lock detection. The system checks whether this PID is still alive via `process.kill(pid, 0)` (signal 0 — checks existence without signaling). If the PID is dead, the lock is stale and can be automatically cleared. |
| Example | `12345` |

### `started`

| Attribute | Value |
|-----------|-------|
| Type | `string` (ISO 8601 date-time) |
| Required | Yes |
| Source | `new Date().toISOString()` at lock acquisition time |
| Constraints | Valid ISO 8601 date-time string with timezone designator (always UTC `Z` suffix). |
| Purpose | Informational timestamp for display purposes. Shows when the lock was acquired in `scaffold status` output and `LOCK_HELD` error messages. Not used in stale detection logic — PID liveness is the authoritative check. |
| Example | `"2026-03-13T11:00:00.000Z"` |

### `processStartedAt`

| Attribute | Value |
|-----------|-------|
| Type | `string` (ISO 8601 date-time) |
| Required | Yes |
| Source | Platform-specific process creation timestamp (macOS: `ps -o lstart=`; Linux: `/proc/PID/stat` field 22; Windows: `wmic`). Falls back to `new Date().toISOString()` if the platform-specific method fails. |
| Constraints | Valid ISO 8601 date-time string with timezone designator. |
| Purpose | PID recycling detection. When checking a lock, the system retrieves the actual start time of the process at `pid` and compares it to this recorded value. If the difference exceeds 2 seconds, the PID was recycled by the OS (assigned to a new, unrelated process) and the lock is stale. Without this field, a recycled PID would appear "alive" and permanently block the user. |
| Example | `"2026-03-13T10:58:32.000Z"` |

**Difference from `started`**: `started` is when the lock was acquired (a scaffold-level event). `processStartedAt` is when the OS created the process (an OS-level event). A process typically starts before it acquires the lock (it needs to load, parse arguments, resolve the project root, etc.), so `processStartedAt` is always earlier than or equal to `started`.

### `command`

| Attribute | Value |
|-----------|-------|
| Type | `string` (enumerated) |
| Required | Yes |
| Source | The CLI subcommand name that triggered lock acquisition |
| Constraints | One of: `"run"`, `"skip"`, `"init"`, `"reset"`, `"adopt"` |
| Purpose | Provides context in error messages. When a user sees `LOCK_HELD`, the command field tells them what operation is blocking: "Pipeline is in use by ken-macbook (resume: running dev-env-setup, PID 12345)." |
| Example | `"resume"` |

**Lockable commands** (require the lock):

| Command | Why |
|---------|-----|
| `run` | Assembles and executes a pipeline step, updates `state.json`, appends to `decisions.jsonl` |
| `skip` | Mutates `state.json` (marks a step as skipped) |
| `init` | Creates `.scaffold/` directory and initial state files |
| `reset` | Deletes `state.json`, `decisions.jsonl`, and other scaffold state files |
| `adopt` | Scans existing artifacts, creates config, updates `state.json` |

**Read-only commands** (do not acquire the lock): `status`, `list`, `next`, `validate`, `build`, `dashboard`, `info`, `decisions`, `version`, `update`. These can run freely while a lock is held.

---

## Section 4: Cross-Schema References

### lock.json -> state.json

| lock.json field | state.json location | Relationship |
|-----------------|---------------------|--------------|
| `prompt` | `prompts.{key}` | The `prompt` value in `lock.json` corresponds to a key in the `prompts` map in `state.json` (when the lock is held by a `resume` or `skip` command). For `init` and `reset`, the `prompt` field holds the command name and does not reference a `state.json` key. |

### lock.json -> .gitignore

`.scaffold/lock.json` must be listed in the project's `.gitignore`. The `scaffold init` command is responsible for ensuring this entry exists. If the lock file is accidentally committed, it creates false contention on other machines.

### lock.json -> state.json `in_progress`

`lock.json` and the `in_progress` field in `state.json` are related but intentionally independent mechanisms:

| Mechanism | Purpose | Scope | Persisted in git |
|-----------|---------|-------|-----------------|
| `lock.json` | Prevent concurrent local writes | Same machine only | No (gitignored) |
| `in_progress` | Detect interrupted sessions for crash recovery | All machines (committed) | Yes |

They wrap the same execution but at different granularities. The execution timeline is:

1. Acquire lock (`lock.json` created)
2. Set `in_progress` in `state.json`
3. Execute prompt
4. Clear `in_progress` in `state.json`
5. Release lock (`lock.json` deleted)

Neither mechanism infers the other's state. Lock acquisition does not check `in_progress`. Crash recovery does not check `lock.json`. All four combinations of presence/absence are valid (see [Section 9](#9-interaction-with-other-state-files) for the full consistency matrix).

### No version field reference

Unlike `state.json` and `config.yml`, `lock.json` has no `schemaVersion` field because the file is ephemeral. See [Section 5](#5-version-history-and-migration).

---

## Section 5: Version History and Migration

**There is no version field in `lock.json`.** This is intentional and differs from `state.json` and `config.yml`, which both carry `schemaVersion` fields for forward migration.

**Rationale**: `lock.json` is ephemeral — it exists only while a command is running and is deleted on completion. It is never persisted across scaffold version upgrades because:

1. **No long-lived instances**: The file is created and deleted within a single command invocation (seconds to minutes). A scaffold version upgrade does not happen mid-command.
2. **No migration path needed**: If a future scaffold version changes the lock schema, any existing `lock.json` from the old version is necessarily a stale lock from a crashed old-version process. The new version's stale detection will clear it (the PID will either be dead or recycled), and a fresh lock with the new schema will be created.
3. **Crash scenario**: If a user upgrades scaffold while an old-version process holds the lock (unlikely but possible), the new version reads the old lock file. Because all current fields are checked individually (PID liveness, `processStartedAt` comparison), unknown or missing fields would cause the stale detection to either (a) treat the lock as unverifiable (if `processStartedAt` is missing) and require `--force`, or (b) treat it normally if all fields are present. Adding a version field would add complexity for a scenario that stale detection already handles.
4. **Gitignored by design**: Because `lock.json` is never committed, there is no risk of a version mismatch between two users with different scaffold versions.

**If the schema changes in the future**: The Lock Manager should defensively parse `lock.json`, treating missing or unknown fields gracefully. A lock file with missing fields should be treated as `stale_unverifiable` (PID alive but identity cannot be confirmed), which prompts the user to use `--force` if needed. This is safer than silently accepting a malformed lock.

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-03-13 | Initial schema. Six fields: `holder`, `prompt`, `pid`, `started`, `processStartedAt`, `command`. No version field (ephemeral file). |

---

## Section 6: Serialization Details

### Format

Standard JSON. The file is written with 2-space indentation and a trailing newline:

```javascript
JSON.stringify(lockData, null, 2) + '\n'
```

### Encoding

UTF-8 without BOM. All string values are ASCII-safe in practice (hostnames, prompt slugs, ISO timestamps, command names).

### Line Endings

Files are written with LF (Unix-style) line endings. Readers must tolerate CRLF (Windows-style) line endings for cross-platform compatibility.

### File size

Less than 1 KB in all cases. With 6 fields and typical values, the file is approximately 200-300 bytes. No compression or streaming is needed.

### Atomic creation (write)

Lock files are created using Node.js `fs.writeFile` with the `{ flag: 'wx' }` option, which maps to the POSIX `O_CREAT | O_EXCL` flags. This means:

- If the file does not exist, it is created and written atomically.
- If the file already exists, the operation fails with `EEXIST` — the file is not modified.
- The OS guarantees that when two processes attempt `wx` creation simultaneously, exactly one succeeds and the other receives `EEXIST`.

This is the core race-condition prevention mechanism. No temp-file-plus-rename pattern is used (unlike `state.json`) because the creation-must-fail-if-exists semantic is the lock's defining behavior.

```javascript
// Acquisition: create-or-fail
await fs.writeFile(lockPath, JSON.stringify(lockData, null, 2) + '\n', { flag: 'wx' });
```

### Deletion (release)

Lock files are deleted via `fs.unlink()` on normal completion. The release algorithm verifies PID ownership before deletion (to avoid deleting another process's lock after a `--force` override).

```javascript
// Release: verify ownership, then delete
const existing = JSON.parse(await fs.readFile(lockPath, 'utf-8'));
if (existing.pid === process.pid) {
  await fs.unlink(lockPath);
}
```

### No in-place modification

The lock file is never updated after creation. Once written, it remains unchanged until deletion. If any field needed to change (hypothetically), the correct approach would be to release and re-acquire, not to modify in place. This constraint simplifies reasoning about race conditions: a reader always sees either the complete original content or `ENOENT` (file not found).

### File lifecycle summary

| Event | File operation | Node.js API | POSIX flags |
|-------|---------------|-------------|-------------|
| Lock acquisition | Create (fail if exists) | `fs.writeFile(path, data, { flag: 'wx' })` | `O_WRONLY \| O_CREAT \| O_EXCL` |
| Lock release (normal) | Delete | `fs.unlink(path)` | — |
| Stale lock cleanup | Delete then create | `fs.unlink(path)` then `fs.writeFile(path, data, { flag: 'wx' })` | — |
| Force override | Delete then create | `fs.unlink(path)` then `fs.writeFile(path, data, { flag: 'wx' })` | — |
| Crash | No operation | — | File remains on disk |

---

## Section 7: Validation Rules

Validation of `lock.json` occurs in two contexts: structural validation (is the JSON well-formed and schema-compliant?) and liveness validation (is the lock holder still running?). Both happen at lock acquisition time. Structural validation also runs during `scaffold validate`.

### Structural validation

These rules verify that the file content is valid JSON conforming to the schema.

| Rule ID | Description | Error code | Severity | Message Template |
|---------|-------------|------------|----------|-----------------|
| LOCK_VALID_JSON | File content must parse as valid JSON | `LOCK_CORRUPT` | error | `Lock file at {path} is not valid JSON: {parse_error}. Treating as corrupt and clearing.` |
| LOCK_IS_OBJECT | Parsed value must be a JSON object (not array, string, etc.) | `LOCK_CORRUPT` | error | `Lock file at {path} must be a JSON object, got {actual_type}. Treating as corrupt and clearing.` |
| LOCK_REQUIRED_FIELDS | All 6 required fields must be present: `holder`, `prompt`, `pid`, `started`, `processStartedAt`, `command` | `LOCK_CORRUPT` | error | `Lock file at {path} missing required field '{field}'. Treating as corrupt and clearing.` |
| LOCK_NO_EXTRA_FIELDS | No additional properties beyond the 6 defined fields | `LOCK_CORRUPT` | error | `Lock file at {path} has unexpected field '{field}'. Treating as corrupt and clearing.` |
| LOCK_HOLDER_STRING | `holder` must be a non-empty string | `LOCK_INVALID_FIELD` | error | `Lock file holder must be a non-empty string, got {actual_type}. Treating as corrupt and clearing.` |
| LOCK_PROMPT_STRING | `prompt` must be a non-empty string | `LOCK_INVALID_FIELD` | error | `Lock file prompt must be a non-empty string, got {actual_type}. Treating as corrupt and clearing.` |
| LOCK_PID_INTEGER | `pid` must be a positive integer (>= 1) | `LOCK_INVALID_FIELD` | error | `Lock file pid must be a positive integer, got '{value}'. Treating as corrupt and clearing.` |
| LOCK_STARTED_ISO | `started` must be a valid ISO 8601 date-time string | `LOCK_INVALID_FIELD` | error | `Lock file started '{value}' is not valid ISO 8601. Treating as corrupt and clearing.` |
| LOCK_PROCESS_STARTED_ISO | `processStartedAt` must be a valid ISO 8601 date-time string | `LOCK_INVALID_FIELD` | error | `Lock file processStartedAt '{value}' is not valid ISO 8601. Treating as corrupt and clearing.` |
| LOCK_COMMAND_ENUM | `command` must be one of: `"run"`, `"skip"`, `"init"`, `"reset"`, `"adopt"` | `LOCK_INVALID_FIELD` | error | `Lock file command '{value}' is not valid. Must be one of: run, skip, init, reset, adopt.` |
| LOCK_STARTED_AFTER_PROCESS | `started` must be >= `processStartedAt` | `LOCK_INVALID_FIELD` | warning | `Lock file started time ({started}) is before processStartedAt ({processStartedAt}). May indicate clock drift.` |

**Behavior on structural failure**: A lock file that fails structural validation is treated as corrupt. Corrupt lock files are deleted and a `LOCK_STALE_CLEARED` warning is emitted ("Removed corrupt lock file"). This is safe because a corrupt lock file cannot represent a valid holder.

### Liveness validation

These rules check whether the lock holder is still running. They execute only at lock acquisition time (when a lockable command encounters an existing lock file), not during `scaffold validate`.

| Rule ID | Description | Outcome | Error/Warning code |
|---------|-------------|---------|-------------------|
| LOCK_PID_ALIVE | `process.kill(pid, 0)` succeeds (PID exists) | Proceed to identity check | — |
| LOCK_PID_DEAD | `process.kill(pid, 0)` throws `ESRCH` (no such process) | Lock is stale; auto-clear | `LOCK_STALE_CLEARED` (warning) |
| LOCK_PID_EPERM | `process.kill(pid, 0)` throws `EPERM` (different user) | Lock is stale; auto-clear (different user cannot be scaffold) | `LOCK_STALE_CLEARED` (warning) |
| LOCK_PID_IDENTITY_MATCH | PID alive AND actual `processStartedAt` matches recorded value (within 2-second tolerance) | Lock is active; block unless `--force` | `LOCK_HELD` (error) |
| LOCK_PID_IDENTITY_MISMATCH | PID alive AND actual `processStartedAt` differs by > 2 seconds | PID recycled; lock is stale; auto-clear | `LOCK_PID_RECYCLED` (warning) |
| LOCK_PID_IDENTITY_UNKNOWN | PID alive AND actual `processStartedAt` could not be retrieved | Lock is potentially active; block unless `--force` | `LOCK_PID_UNVERIFIABLE` (warning) + `LOCK_HELD` (error) |

### Exit codes

| Exit code | Condition |
|-----------|-----------|
| 0 | Lock acquired (or no lock contention) |
| 3 | `LOCK_HELD` in `--auto` mode (lock is active, `--auto` does not imply `--force`) |
| 5 | Any lock error (`LOCK_HELD`, `LOCK_WRITE_FAILED`, `LOCK_RELEASE_FAILED`, `LOCK_ACQUISITION_RACE`) |

### Error code reference

| Code | Meaning | Recovery |
|------|---------|----------|
| `LOCK_HELD` | Another process actively holds the lock and `--force` was not supplied | Wait for the other process to finish, or use `--force` to override |
| `LOCK_WRITE_FAILED` | Could not write `lock.json` (permissions, disk full, read-only filesystem) | Check file system permissions on `.scaffold/` directory |
| `LOCK_RELEASE_FAILED` | Could not delete `lock.json` during release | Manually delete `.scaffold/lock.json` |
| `LOCK_ACQUISITION_RACE` | Two processes attempted atomic creation simultaneously; this process lost | Wait a moment and retry |
| `LOCK_CORRUPT` | Lock file exists but is not valid JSON or fails schema validation | Automatically cleared (treated as stale) |
| `LOCK_INVALID_FIELD` | A field is present but has an invalid value | Automatically cleared (treated as stale) |

---

## Section 8: Examples

### Minimal valid lock file

The smallest possible valid `lock.json`:

```json
{
  "holder": "a",
  "prompt": "x",
  "pid": 1,
  "started": "2026-01-01T00:00:00Z",
  "processStartedAt": "2026-01-01T00:00:00Z",
  "command": "run"
}
```

All six fields present, all pass type and constraint checks. In practice, holder and prompt values would be longer, but the schema requires only non-empty strings.

### Realistic lock file (resume command)

A typical `lock.json` during `scaffold run` of the `dev-env-setup` prompt:

```json
{
  "holder": "ken-macbook",
  "prompt": "dev-env-setup",
  "pid": 42173,
  "started": "2026-03-13T15:22:08.431Z",
  "processStartedAt": "2026-03-13T15:22:05.112Z",
  "command": "run"
}
```

Note that `processStartedAt` (15:22:05) is earlier than `started` (15:22:08) — the process was created ~3 seconds before it acquired the lock, reflecting CLI startup time (argument parsing, project root detection, config loading).

### Realistic lock file (init command)

During `scaffold init`, the `prompt` field holds the command name since `init` is not executing a specific prompt:

```json
{
  "holder": "sarah-laptop",
  "prompt": "init",
  "pid": 8901,
  "started": "2026-03-13T09:15:00.000Z",
  "processStartedAt": "2026-03-13T09:14:58.500Z",
  "command": "init"
}
```

### Stale lock file (dead process)

This lock file was left behind by a process that crashed (e.g., `kill -9 42173`):

```json
{
  "holder": "ken-macbook",
  "prompt": "tech-stack",
  "pid": 42173,
  "started": "2026-03-12T11:00:00.000Z",
  "processStartedAt": "2026-03-12T10:59:55.000Z",
  "command": "run"
}
```

When the next `scaffold run` encounters this file:

1. Reads the lock: PID 42173, `processStartedAt` is `2026-03-12T10:59:55.000Z`
2. Checks `process.kill(42173, 0)` -- throws `ESRCH` (no such process)
3. Concludes: PID is dead, lock is stale
4. Deletes the stale lock, emits `LOCK_STALE_CLEARED` warning
5. Creates a new lock with the current process's PID

### Stale lock file (recycled PID)

Same file on disk as above, but PID 42173 was recycled by the OS and now belongs to a Chrome renderer:

1. Reads the lock: PID 42173, `processStartedAt` is `2026-03-12T10:59:55.000Z`
2. Checks `process.kill(42173, 0)` -- succeeds (PID is alive)
3. Retrieves actual process start time via `ps -o lstart= -p 42173` -- returns `2026-03-13T14:22:17.000Z`
4. Compares: `|2026-03-13T14:22:17 - 2026-03-12T10:59:55|` = ~27 hours, far exceeds the 2-second tolerance
5. Concludes: PID recycled, lock is stale
6. Deletes the stale lock, emits `LOCK_PID_RECYCLED` warning
7. Creates a new lock with the current process's PID

### Invalid lock files (annotated)

**Missing required field:**

```json
{
  "holder": "ken-macbook",
  "prompt": "dev-env-setup",
  "pid": 42173,
  "started": "2026-03-13T15:22:08.431Z",
  "command": "run"
}
```

Invalid: `processStartedAt` is missing. Fails `LOCK_REQUIRED_FIELDS`. Treated as corrupt and auto-cleared.

**Wrong type for pid:**

```json
{
  "holder": "ken-macbook",
  "prompt": "dev-env-setup",
  "pid": "42173",
  "started": "2026-03-13T15:22:08.431Z",
  "processStartedAt": "2026-03-13T15:22:05.112Z",
  "command": "run"
}
```

Invalid: `pid` is a string, not an integer. Fails `LOCK_PID_INTEGER`. Treated as corrupt and auto-cleared.

**Invalid command value:**

```json
{
  "holder": "ken-macbook",
  "prompt": "dev-env-setup",
  "pid": 42173,
  "started": "2026-03-13T15:22:08.431Z",
  "processStartedAt": "2026-03-13T15:22:05.112Z",
  "command": "build"
}
```

Invalid: `"build"` is a read-only command and cannot acquire a lock. Fails `LOCK_COMMAND_ENUM`. Treated as corrupt and auto-cleared.

**Extra field:**

```json
{
  "holder": "ken-macbook",
  "prompt": "dev-env-setup",
  "pid": 42173,
  "started": "2026-03-13T15:22:08.431Z",
  "processStartedAt": "2026-03-13T15:22:05.112Z",
  "command": "run",
  "worktree": "agent-1"
}
```

Invalid: `worktree` is not a defined field. Fails `LOCK_NO_EXTRA_FIELDS`. Treated as corrupt and auto-cleared.

**Negative pid:**

```json
{
  "holder": "ken-macbook",
  "prompt": "dev-env-setup",
  "pid": -1,
  "started": "2026-03-13T15:22:08.431Z",
  "processStartedAt": "2026-03-13T15:22:05.112Z",
  "command": "run"
}
```

Invalid: `pid` must be >= 1. Fails `LOCK_PID_INTEGER`. Treated as corrupt and auto-cleared.

**Timestamps out of order:**

```json
{
  "holder": "ken-macbook",
  "prompt": "dev-env-setup",
  "pid": 42173,
  "started": "2026-03-13T15:22:05.000Z",
  "processStartedAt": "2026-03-13T15:22:08.000Z",
  "command": "run"
}
```

Suspect: `started` is earlier than `processStartedAt`, meaning the lock was supposedly acquired before the process was created. Fires `LOCK_STARTED_AFTER_PROCESS` as a warning (not an error). The lock is still evaluated for PID liveness; the warning aids debugging. This may happen if the platform-specific process start time retrieval falls back to `new Date().toISOString()` with minor clock drift.

**Not valid JSON:**

```
{holder: ken-macbook, pid: 42173
```

Invalid: Not parseable as JSON. Fails `LOCK_VALID_JSON`. Treated as corrupt and auto-cleared.

**Empty file (zero bytes):**

Treated as invalid JSON (`LOCK_VALID_JSON` failure). Auto-cleared. This can happen if the process crashed during the `wx` write before any bytes were flushed.

---

## Section 9: Interaction with Other State Files

### state.json

`lock.json` and `state.json` interact at two levels: the `prompt` field cross-reference and the `in_progress` field overlap.

**Prompt field cross-reference**: When a `resume` or `skip` command holds the lock, `lock.json`'s `prompt` field matches a key in `state.json`'s `prompts` map. This is an informational cross-reference, not a hard constraint — the lock system does not validate that the prompt exists in state.

**Execution timeline**: The lock wraps the `in_progress` lifecycle:

```
1. acquire lock        (lock.json created)
2. set in_progress     (state.json updated)
3. execute prompt      (agent runs outside scaffold)
4. clear in_progress   (state.json updated)
5. release lock        (lock.json deleted)
```

**Consistency matrix** — all four combinations are valid and expected:

| lock.json | in_progress | Meaning | Normal? |
|-----------|-------------|---------|---------|
| Absent | Null | Idle. No prompt running. | Yes (steady state) |
| Present (PID alive) | Non-null | Prompt actively executing. Both mechanisms agree. | Yes (during execution) |
| Present (PID alive) | Null | Transient: lock acquired but `in_progress` not yet set (between steps 1-2), or prompt completed but lock not yet released (between steps 4-5). | Yes (transient, sub-second) |
| Absent | Non-null | Process crashed after setting `in_progress`. Lock already cleaned up by stale detection or `--force` override. | Yes (post-crash). Triggers crash recovery on next `scaffold run`. |

**Independence**: Neither mechanism checks the other:
- Lock acquisition does not read `in_progress` from `state.json`
- Crash recovery (domain 03) does not read `lock.json`
- Each detects and resolves its own stale state independently

### decisions.jsonl

While the lock is held, only one process writes to `decisions.jsonl` on the local machine. The lock prevents interleaved appends that could corrupt a JSONL line boundary. Cross-machine concurrent appends are safe because each append is a complete line ending with `\n`.

The lock does not reference `decisions.jsonl` and `decisions.jsonl` does not reference the lock. The relationship is purely temporal — the lock's existence guarantees single-writer access to all scaffold state files during command execution.

### config.yml

`lock.json` does not reference or depend on `config.yml`. The lock is acquired before any config-driven logic runs and released after all config-driven logic completes. The lock's scope is the entire `.scaffold/` directory, not individual config-defined resources.

### .gitignore

`lock.json` must be listed in `.gitignore`:

```gitignore
.scaffold/lock.json
```

The `scaffold init` command ensures this entry exists. If the entry is missing and the lock file is accidentally committed, every machine that checks out the repository will see a lock from another machine's crashed process. The stale detection would eventually clear it (the PID from another machine will be dead or unrelated on this machine), but the commit history would contain noise.

### Build outputs (commands/*.md, prompts/*.md, etc.)

No direct interaction. Build outputs are generated by `scaffold build`, which is a read-only command and does not acquire the lock. The lock protects runtime state (`state.json`, `decisions.jsonl`), not build artifacts.

### Produced artifacts (docs/plan.md, docs/tech-stack.md, etc.)

No direct interaction. Produced artifacts are written by AI agents during `scaffold run`, which runs under the lock. The lock does not track or validate produced artifacts — that responsibility belongs to the State Manager's dual completion detection (domain 03, ADR-018).

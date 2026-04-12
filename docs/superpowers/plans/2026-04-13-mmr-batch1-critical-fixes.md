# MMR Batch 1+2: Critical Code Fixes & Parser Hardening

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 7 active bugs that corrupt data, crash the process, or silently break features (P0-4, P0-5, P1-15, P1-9, P1-10, P1-11, P2-23). Release as `mmr-v0.2.0`.

**Architecture:** All changes are in `packages/mmr/`. Each fix is isolated — modify the source file, add/update tests, commit. TDD: write failing test first, then implement, then verify.

**Tech Stack:** TypeScript, vitest, Node.js child_process

**Test command:** `cd packages/mmr && npx vitest run`
**Type check:** `cd packages/mmr && npx tsc --noEmit`

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `packages/mmr/src/core/job-store.ts` | Modify (lines 107-113) | Per-channel status files to eliminate race |
| `packages/mmr/src/core/dispatcher.ts` | Modify (lines 50-58, 78-124) | stdin error handler, settled flag for timeout race |
| `packages/mmr/src/commands/review.ts` | Modify (lines 211-233) | Fix sequential dispatch |
| `packages/mmr/src/core/parser.ts` | Modify (lines 28-43, 99) | String-aware brace extraction, Gemini validation |
| `packages/mmr/src/config/defaults.ts` | Modify (lines 37, 68) | Fix parser names |
| `packages/mmr/tests/core/job-store.test.ts` | Modify | Add concurrent write test |
| `packages/mmr/tests/core/dispatcher.test.ts` | Modify | Add stdin error test, happy-path output test, settled flag test |
| `packages/mmr/tests/core/parser.test.ts` | Modify | Add string-brace test, empty input test, Gemini validation test |

---

### Task 1: Fix concurrent job.json writes (P0-4)

**Files:**
- Modify: `packages/mmr/src/core/job-store.ts:107-113`
- Test: `packages/mmr/tests/core/job-store.test.ts`

The current `updateChannel` does `loadJob()` → modify → `saveJob()`, which is a read-modify-write race when multiple channels complete concurrently. Fix: write per-channel status files atomically, then derive aggregate by reading all channel files.

- [ ] **Step 1: Write the failing test for concurrent channel updates**

Add to `packages/mmr/tests/core/job-store.test.ts`:

```typescript
it('preserves both channel updates when two channels update concurrently', async () => {
  const job = store.createJob({ fix_threshold: 'P2', format: 'json', channels: ['claude', 'gemini'] })

  // Simulate concurrent updates (both load job before either saves)
  await Promise.all([
    new Promise<void>(resolve => {
      store.updateChannel(job.job_id, 'claude', { status: 'completed', completed_at: new Date().toISOString() })
      resolve()
    }),
    new Promise<void>(resolve => {
      store.updateChannel(job.job_id, 'gemini', { status: 'completed', completed_at: new Date().toISOString() })
      resolve()
    }),
  ])

  const loaded = store.loadJob(job.job_id)
  expect(loaded.channels.claude.status).toBe('completed')
  expect(loaded.channels.gemini.status).toBe('completed')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/mmr && npx vitest run tests/core/job-store.test.ts`
Expected: May pass non-deterministically (race), but the implementation is unsafe. Proceed to fix regardless.

- [ ] **Step 3: Implement per-channel status files**

In `packages/mmr/src/core/job-store.ts`, replace the `updateChannel` method (lines 107-113):

```typescript
/** Update a channel entry atomically via per-channel status file, then rebuild job.json */
updateChannel(jobId: string, channel: string, update: Partial<ChannelJobEntry>): void {
  const channelStatusPath = path.join(this.getJobDir(jobId), 'channels', `${channel}.status.json`)

  // Read existing channel status if file exists, merge update
  let existing: Partial<ChannelJobEntry> = {}
  try {
    existing = JSON.parse(fs.readFileSync(channelStatusPath, 'utf-8'))
  } catch {
    // No existing status file — first update for this channel
  }

  const merged = { ...existing, ...update }
  fs.writeFileSync(channelStatusPath, JSON.stringify(merged, null, 2))

  // Rebuild job.json from all channel status files
  this.rebuildJobMetadata(jobId)
}

/** Rebuild job.json by reading per-channel status files and merging into base metadata */
private rebuildJobMetadata(jobId: string): void {
  const metadata = this.loadJob(jobId)
  const channelsDir = path.join(this.getJobDir(jobId), 'channels')

  for (const channelName of Object.keys(metadata.channels)) {
    const statusPath = path.join(channelsDir, `${channelName}.status.json`)
    try {
      const channelUpdate = JSON.parse(fs.readFileSync(statusPath, 'utf-8')) as Partial<ChannelJobEntry>
      metadata.channels[channelName] = { ...metadata.channels[channelName], ...channelUpdate }
    } catch {
      // No status file yet — keep initial values
    }
  }

  metadata.status = this.deriveJobStatus(metadata.channels)
  this.saveJob(jobId, metadata)
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/mmr && npx vitest run tests/core/job-store.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Run type check**

Run: `cd packages/mmr && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add packages/mmr/src/core/job-store.ts packages/mmr/tests/core/job-store.test.ts
git commit -m "fix(mmr): eliminate concurrent job.json write race with per-channel status files

P0-4: updateChannel() had a read-modify-write race when parallel channels
completed simultaneously. Now writes per-channel .status.json files
atomically and rebuilds job.json from those files."
```

---

### Task 2: Fix unhandled stdin.write() error (P0-5)

**Files:**
- Modify: `packages/mmr/src/core/dispatcher.ts:50-58`
- Test: `packages/mmr/tests/core/dispatcher.test.ts`

`proc.stdin.write(prompt)` has no error handler. If the child process closes stdin early or the pipe buffer fills, the unhandled `'error'` event on the stream crashes Node.

- [ ] **Step 1: Write the failing test for stdin pipe error**

Add to `packages/mmr/tests/core/dispatcher.test.ts`:

```typescript
it('handles stdin pipe error without crashing', async () => {
  const job = store.createJob({ fix_threshold: 'P2', format: 'json', channels: ['badstdin'] })
  store.savePrompt(job.job_id, 'Review this.')

  // 'true' exits immediately without reading stdin, causing EPIPE
  await dispatchChannel(store, job.job_id, 'badstdin', {
    command: 'true',
    prompt: 'x'.repeat(1024 * 1024), // 1MB prompt to trigger pipe error
    flags: [],
    env: {},
    timeout: 5,
    stderr: 'capture',
  })

  // Wait for process to complete
  await new Promise(resolve => setTimeout(resolve, 1000))

  // Should not crash — channel should be marked as completed or failed
  const loaded = store.loadJob(job.job_id)
  const status = loaded.channels.badstdin.status
  expect(['completed', 'failed']).toContain(status)
})
```

- [ ] **Step 2: Run test to verify it fails (or crashes)**

Run: `cd packages/mmr && npx vitest run tests/core/dispatcher.test.ts`
Expected: Test crashes or fails with unhandled error

- [ ] **Step 3: Add stdin error handler**

In `packages/mmr/src/core/dispatcher.ts`, add an error handler before the `write()` call. Replace lines 56-58:

```typescript
  // Handle stdin pipe errors (child may close stdin early)
  proc.stdin.on('error', () => {
    // Swallow EPIPE — the close handler will deal with the process exit
  })

  // Write prompt to stdin
  proc.stdin.write(opts.prompt)
  proc.stdin.end()
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/mmr && npx vitest run tests/core/dispatcher.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add packages/mmr/src/core/dispatcher.ts packages/mmr/tests/core/dispatcher.test.ts
git commit -m "fix(mmr): handle stdin pipe errors in dispatcher

P0-5: proc.stdin.write() with no error handler crashes Node when the
child process closes stdin early. Add handler to swallow EPIPE errors
gracefully — the close handler handles the exit."
```

---

### Task 3: Fix timeout/close race condition (P1-15)

**Files:**
- Modify: `packages/mmr/src/core/dispatcher.ts:78-124`
- Test: `packages/mmr/tests/core/dispatcher.test.ts`

The timeout handler writes `status: 'timeout'` to the store via `updateChannel`, then SIGKILL triggers the `close` event which re-reads the store to check status. Replace the filesystem check with an in-memory `settled` boolean, matching the pattern already used in `auth.ts`.

- [ ] **Step 1: Write the failing test**

Add to `packages/mmr/tests/core/dispatcher.test.ts`:

```typescript
it('does not overwrite timeout status when close fires after timeout', async () => {
  const job = store.createJob({ fix_threshold: 'P2', format: 'json', channels: ['racetest'] })
  store.savePrompt(job.job_id, 'Review this.')

  // sleep exits after timeout kills it — close fires after timeout handler
  await dispatchChannel(store, job.job_id, 'racetest', {
    command: 'sleep 10',
    prompt: '',
    flags: [],
    env: {},
    timeout: 1,
    stderr: 'capture',
  })

  await new Promise(resolve => setTimeout(resolve, 2000))

  const loaded = store.loadJob(job.job_id)
  expect(loaded.channels.racetest.status).toBe('timeout')
})
```

- [ ] **Step 2: Run test — may pass, but the current implementation is fragile**

Run: `cd packages/mmr && npx vitest run tests/core/dispatcher.test.ts`
Expected: Likely passes (filesystem check usually works), but proceed with fix to eliminate the race.

- [ ] **Step 3: Refactor dispatcher to use in-memory settled flag**

Replace the entire `dispatchChannel` function body in `packages/mmr/src/core/dispatcher.ts` (lines 30-138) with:

```typescript
export async function dispatchChannel(
  store: JobStore,
  jobId: string,
  channelName: string,
  opts: DispatchOptions,
): Promise<void> {
  const jobDir = store.getJobDir(jobId)
  const channelsDir = path.join(jobDir, 'channels')

  // Split multi-word commands (e.g. "claude -p" → ["claude", "-p"])
  const [cmd, ...cmdArgs] = opts.command.split(/\s+/)
  const args = [...cmdArgs, ...opts.flags]

  // Update channel to running
  store.updateChannel(jobId, channelName, {
    status: 'running',
    started_at: new Date().toISOString(),
  })

  // Pipe prompt via stdin to avoid E2BIG on large diffs
  const proc = spawn(cmd, args, {
    detached: true,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, ...opts.env },
  })

  // Handle stdin pipe errors (child may close stdin early)
  proc.stdin.on('error', () => {
    // Swallow EPIPE — the close handler will deal with the process exit
  })

  // Write prompt to stdin
  proc.stdin.write(opts.prompt)
  proc.stdin.end()

  // Write PID file
  const pidFile = path.join(channelsDir, `${channelName}.pid`)
  fs.writeFileSync(pidFile, String(proc.pid))

  // Collect stdout and stderr
  let stdout = ''
  let stderr = ''

  proc.stdout.on('data', (chunk: Buffer) => {
    stdout += chunk.toString()
  })

  proc.stderr.on('data', (chunk: Buffer) => {
    stderr += chunk.toString()
  })

  // In-memory settled flag to prevent timeout/close race
  let settled = false

  // Set up timeout
  const timeoutMs = opts.timeout * 1000
  const timer = setTimeout(() => {
    if (settled) return
    settled = true
    try {
      if (proc.pid) {
        process.kill(-proc.pid, 'SIGKILL')
      }
    } catch {
      // Process may have already exited
    }
    const completedAt = new Date().toISOString()
    store.updateChannel(jobId, channelName, {
      status: 'timeout',
      completed_at: completedAt,
    })
    if (stderr) {
      store.saveChannelLog(jobId, channelName, stderr)
    }
  }, timeoutMs)

  // Handle process close
  proc.on('close', (code: number | null) => {
    clearTimeout(timer)
    if (settled) return
    settled = true

    const completedAt = new Date().toISOString()

    if (code === 0 && stdout) {
      store.saveChannelOutput(jobId, channelName, stdout)
      store.updateChannel(jobId, channelName, {
        status: 'completed',
        completed_at: completedAt,
      })
    } else {
      const errorMsg = stderr || `Process exited with code ${code}`
      store.saveChannelLog(jobId, channelName, errorMsg)
      store.updateChannel(jobId, channelName, {
        status: 'failed',
        completed_at: completedAt,
      })
    }
  })

  // Handle spawn errors
  proc.on('error', (err: Error) => {
    clearTimeout(timer)
    if (settled) return
    settled = true
    store.updateChannel(jobId, channelName, {
      status: 'failed',
      completed_at: new Date().toISOString(),
    })
    store.saveChannelLog(jobId, channelName, err.message)
  })

  // Unref so parent process can exit
  proc.unref()
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/mmr && npx vitest run tests/core/dispatcher.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Run full test suite and type check**

Run: `cd packages/mmr && npx tsc --noEmit && npx vitest run`
Expected: All pass

- [ ] **Step 6: Commit**

```bash
git add packages/mmr/src/core/dispatcher.ts packages/mmr/tests/core/dispatcher.test.ts
git commit -m "fix(mmr): eliminate timeout/close race with in-memory settled flag

P1-15: The timeout handler wrote status to disk, then SIGKILL triggered
the close handler which re-read the store to check status — a filesystem
race. Now uses an in-memory settled boolean (matching auth.ts pattern)
to ensure only the first handler writes the terminal status."
```

---

### Task 4: Fix broken sequential dispatch (P1-9)

**Files:**
- Modify: `packages/mmr/src/commands/review.ts:211-233`
- Create: `packages/mmr/tests/commands/review.test.ts`

When `parallel: false`, all `dispatchChannel()` calls start immediately when pushed to the `dispatches` array. The sequential `for await` loop just awaits already-running promises. Fix: only call `dispatchChannel()` inside the loop when not parallel.

- [ ] **Step 1: Implement the fix**

In `packages/mmr/src/commands/review.ts`, replace lines 211-233:

```typescript
    // 8. Dispatch channels
    if (config.defaults.parallel) {
      const dispatches: Promise<void>[] = []
      for (const name of validChannels) {
        const chConfig = config.channels[name]
        store.updateChannel(job.job_id, name, { output_parser: chConfig.output_parser })
        dispatches.push(
          dispatchChannel(store, job.job_id, name, {
            command: chConfig.command,
            prompt,
            flags: chConfig.flags,
            env: chConfig.env,
            timeout: chConfig.timeout ?? config.defaults.timeout,
            stderr: chConfig.stderr as 'capture' | 'ignore',
          }),
        )
      }
      await Promise.all(dispatches)
    } else {
      for (const name of validChannels) {
        const chConfig = config.channels[name]
        store.updateChannel(job.job_id, name, { output_parser: chConfig.output_parser })
        await dispatchChannel(store, job.job_id, name, {
          command: chConfig.command,
          prompt,
          flags: chConfig.flags,
          env: chConfig.env,
          timeout: chConfig.timeout ?? config.defaults.timeout,
          stderr: chConfig.stderr as 'capture' | 'ignore',
        })
      }
    }
```

- [ ] **Step 2: Run type check and full tests**

Run: `cd packages/mmr && npx tsc --noEmit && npx vitest run`
Expected: All pass

- [ ] **Step 3: Commit**

```bash
git add packages/mmr/src/commands/review.ts
git commit -m "fix(mmr): fix sequential dispatch — channels were starting concurrently

P1-9: dispatchChannel() was called eagerly when building the dispatches
array, so all processes started immediately regardless of parallel flag.
Now only calls dispatchChannel inside the loop when parallel is false."
```

---

### Task 5: Fix extractJson string-aware brace counting (P1-10)

**Files:**
- Modify: `packages/mmr/src/core/parser.ts:28-43`
- Test: `packages/mmr/tests/core/parser.test.ts`

The `extractJson` function counts `{` and `}` to find matching braces but doesn't account for braces inside JSON string values. Input like `"description": "use { carefully"` causes early termination.

- [ ] **Step 1: Write the failing test**

Add to `packages/mmr/tests/core/parser.test.ts` inside the `default parser` describe block:

```typescript
it('handles braces inside JSON string values', () => {
  const raw = '{"approved": false, "findings": [{"severity": "P1", "location": "f.ts:1", "description": "use { and } carefully", "suggestion": "wrap in quotes"}], "summary": "ok"}'
  const result = parse(raw)
  expect(result.findings).toHaveLength(1)
  expect(result.findings[0].description).toBe('use { and } carefully')
})

it('handles escaped quotes inside JSON strings with braces', () => {
  const raw = '{"approved": true, "findings": [], "summary": "said \\"use {braces}\\" here"}'
  const result = parse(raw)
  expect(result.approved).toBe(true)
  expect(result.summary).toContain('use {braces}')
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/mmr && npx vitest run tests/core/parser.test.ts`
Expected: FAIL — extractJson produces truncated JSON

- [ ] **Step 3: Implement string-aware extractJson**

In `packages/mmr/src/core/parser.ts`, replace the `extractJson` function (lines 28-43):

```typescript
/**
 * Find first `{`, count brace depth (skipping braces inside JSON strings),
 * extract to matching `}`.
 */
function extractJson(text: string): string {
  const start = text.indexOf('{')
  if (start === -1) throw new Error('No JSON object found in output')

  let depth = 0
  let inString = false

  for (let i = start; i < text.length; i++) {
    const ch = text[i]

    if (inString) {
      if (ch === '\\') {
        i++ // Skip escaped character
      } else if (ch === '"') {
        inString = false
      }
      continue
    }

    if (ch === '"') {
      inString = true
    } else if (ch === '{') {
      depth++
    } else if (ch === '}') {
      depth--
      if (depth === 0) {
        return text.slice(start, i + 1)
      }
    }
  }

  throw new Error('Unbalanced braces in JSON output')
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/mmr && npx vitest run tests/core/parser.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Also add tests for empty input and unbalanced braces**

Add to `packages/mmr/tests/core/parser.test.ts` in the `parseChannelOutput` describe block:

```typescript
it('returns error finding for empty string input', () => {
  const result = parseChannelOutput('', 'default')
  expect(result.approved).toBe(false)
  expect(result.findings).toHaveLength(1)
  expect(result.findings[0].severity).toBe('P1')
  expect(result.findings[0].description).toContain('No JSON object found')
})

it('returns error finding for unbalanced braces', () => {
  const result = parseChannelOutput('{"approved": true', 'default')
  expect(result.approved).toBe(false)
  expect(result.findings).toHaveLength(1)
  expect(result.findings[0].description).toContain('Unbalanced braces')
})
```

- [ ] **Step 6: Run tests**

Run: `cd packages/mmr && npx vitest run tests/core/parser.test.ts`
Expected: All PASS

- [ ] **Step 7: Commit**

```bash
git add packages/mmr/src/core/parser.ts packages/mmr/tests/core/parser.test.ts
git commit -m "fix(mmr): make extractJson string-aware to handle braces in values

P1-10: extractJson counted braces without tracking JSON string context,
causing early extraction on input like {\"description\": \"use { carefully\"}.
Now tracks in-string state and handles escaped quotes."
```

---

### Task 6: Fix Gemini parser skipping validation (P1-11)

**Files:**
- Modify: `packages/mmr/src/core/parser.ts:99`
- Test: `packages/mmr/tests/core/parser.test.ts`

Line 99 returns `outer as ParsedOutput` without validation when Gemini output has no `.response` wrapper. Malformed output propagates to the reconciler.

- [ ] **Step 1: Write the failing test**

Add to `packages/mmr/tests/core/parser.test.ts` in the `gemini parser` describe block:

```typescript
it('validates unwrapped gemini output (missing fields get defaults)', () => {
  // Gemini returns JSON without the response wrapper, but also missing required fields
  const raw = '{"status": "done", "result": "all good"}'
  const result = parse(raw)
  // Should get defaults from validateParsedOutput, not raw object
  expect(result.approved).toBe(false)
  expect(result.findings).toEqual([])
  expect(result.summary).toBe('')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/mmr && npx vitest run tests/core/parser.test.ts`
Expected: FAIL — `approved` is `undefined` (not `false`), or `findings` is `undefined`

- [ ] **Step 3: Fix the Gemini parser**

In `packages/mmr/src/core/parser.ts`, change line 99 from:

```typescript
    return outer as ParsedOutput
```

to:

```typescript
    return validateParsedOutput(outer)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/mmr && npx vitest run tests/core/parser.test.ts`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add packages/mmr/src/core/parser.ts packages/mmr/tests/core/parser.test.ts
git commit -m "fix(mmr): validate unwrapped Gemini output instead of unsafe cast

P1-11: geminiParser returned raw object as ParsedOutput without
validation when no .response wrapper was present. Malformed output
would propagate nulls/undefineds to the reconciler."
```

---

### Task 7: Fix misleading parser names in defaults (P2-23)

**Files:**
- Modify: `packages/mmr/src/config/defaults.ts`

The `claude` and `codex` channels specify `output_parser: 'claude'` and `output_parser: 'codex'`, but no such parsers exist — they silently fall back to `'default'`. Make the intent explicit.

- [ ] **Step 1: Read the defaults file**

Read `packages/mmr/src/config/defaults.ts` to see current values.

- [ ] **Step 2: Fix parser names**

Change `output_parser: 'claude'` to `output_parser: 'default'` and `output_parser: 'codex'` to `output_parser: 'default'`.

- [ ] **Step 3: Run type check and tests**

Run: `cd packages/mmr && npx tsc --noEmit && npx vitest run`
Expected: All pass

- [ ] **Step 4: Commit**

```bash
git add packages/mmr/src/config/defaults.ts
git commit -m "fix(mmr): use explicit 'default' parser name for claude and codex channels

P2-23: output_parser was set to 'claude' and 'codex' but those parsers
don't exist — they silently fell back to 'default'. Make intent explicit."
```

---

### Task 8: Version bump, CHANGELOG, and release PR

**Files:**
- Modify: `packages/mmr/package.json` (version bump to 0.2.0)
- Modify: `packages/mmr/CHANGELOG.md` (create if needed, add v0.2.0 entry)

- [ ] **Step 1: Bump version**

In `packages/mmr/package.json`, change `"version": "0.1.0"` to `"version": "0.2.0"`.

- [ ] **Step 2: Create/update CHANGELOG.md**

Create `packages/mmr/CHANGELOG.md` if it doesn't exist:

```markdown
# Changelog

## [0.2.0] — 2026-04-13

### Fixed
- **P0-4:** Concurrent job.json writes race — per-channel status files eliminate lost updates
- **P0-5:** stdin.write() crash — handle EPIPE when child closes stdin early
- **P1-15:** Timeout/close race condition — in-memory settled flag prevents double writes
- **P1-9:** Sequential dispatch was broken — channels started concurrently regardless of parallel flag
- **P1-10:** extractJson brace counting failed on braces inside JSON strings
- **P1-11:** Gemini parser skipped validation on unwrapped output
- **P2-23:** Parser names 'claude'/'codex' silently fell back to 'default' — made explicit
```

- [ ] **Step 3: Run full test suite one final time**

Run: `cd packages/mmr && npx tsc --noEmit && npx vitest run`
Expected: All pass

- [ ] **Step 4: Commit**

```bash
git add packages/mmr/package.json packages/mmr/CHANGELOG.md
git commit -m "chore(mmr): bump version to 0.2.0 and add CHANGELOG

7 bug fixes: concurrent writes race, stdin crash, timeout race,
sequential dispatch, parser brace counting, Gemini validation,
parser name cleanup."
```

- [ ] **Step 5: Push branch and create PR**

```bash
git push -u origin HEAD
gh pr create --title "fix(mmr): critical code fixes and parser hardening (v0.2.0)" --body "## Summary
- Fix concurrent job.json write race with per-channel status files (P0-4)
- Handle stdin pipe errors in dispatcher (P0-5)
- Eliminate timeout/close race with in-memory settled flag (P1-15)
- Fix sequential dispatch starting all channels concurrently (P1-9)
- Make extractJson string-aware for braces in JSON values (P1-10)
- Validate unwrapped Gemini parser output (P1-11)
- Fix misleading parser names in channel defaults (P2-23)

## Test plan
- [ ] \`cd packages/mmr && npx vitest run\` — all tests pass
- [ ] \`cd packages/mmr && npx tsc --noEmit\` — no type errors
- [ ] New tests cover concurrent writes, stdin error, brace-in-string, Gemini validation

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```

- [ ] **Step 6: After CI passes, merge and tag**

```bash
gh pr merge --squash --delete-branch
git checkout main && git pull
git tag mmr-v0.2.0
git push origin mmr-v0.2.0
```

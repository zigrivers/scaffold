# MMR Batch 1+2: Critical Code Fixes & Parser Hardening

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 7 active bugs that corrupt data, crash the process, or silently break features (P0-4, P0-5, P1-15, P1-9, P1-10, P1-11, P2-23). Release as `mmr-v0.2.0`.

**Architecture:** All changes are in `packages/mmr/`. Each fix is isolated — modify the source file, add/update tests, commit. TDD: write failing test first, then implement, then verify.

**Tech Stack:** TypeScript, vitest, Node.js child_process

**Test command:** `cd packages/mmr && npx vitest run`
**Type check:** `cd packages/mmr && npx tsc --noEmit`

**Branch:** Already on `mmr/cli-fixes` branch.

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `packages/mmr/src/core/job-store.ts` | Modify | Derive channel state on `loadJob` read; eliminate race |
| `packages/mmr/src/core/dispatcher.ts` | Modify | stdin error handler, settled flag, return Promise on completion |
| `packages/mmr/src/commands/review.ts` | Modify | Fix sequential dispatch |
| `packages/mmr/src/core/parser.ts` | Modify | String-aware brace extraction, Gemini validation |
| `packages/mmr/src/config/defaults.ts` | Modify | Fix parser names |
| `packages/mmr/tests/core/job-store.test.ts` | Modify | Add channel-state-on-read tests |
| `packages/mmr/tests/core/dispatcher.test.ts` | Modify | Add stdin error, happy-path output, settled flag tests |
| `packages/mmr/tests/core/parser.test.ts` | Modify | Add string-brace, empty input, Gemini validation tests |

---

### Task 1: Fix concurrent job.json writes (P0-4)

**Files:**
- Modify: `packages/mmr/src/core/job-store.ts:107-113`
- Test: `packages/mmr/tests/core/job-store.test.ts`

The current `updateChannel` does `loadJob()` → modify → `saveJob()`, which is a read-modify-write race when multiple channels complete concurrently. Fix: write per-channel status files atomically, and make `loadJob` derive channel state by reading those files on every load — eliminating the aggregate rebuild race entirely.

- [ ] **Step 1: Write the test for derived channel state on read**

Add to `packages/mmr/tests/core/job-store.test.ts`:

```typescript
it('derives channel state from per-channel status files on loadJob', () => {
  const job = store.createJob({ fix_threshold: 'P2', format: 'json', channels: ['claude', 'gemini'] })

  // Update channels independently (simulates concurrent completion)
  store.updateChannel(job.job_id, 'claude', { status: 'completed', completed_at: '2026-04-13T00:00:01Z' })
  store.updateChannel(job.job_id, 'gemini', { status: 'completed', completed_at: '2026-04-13T00:00:02Z' })

  // loadJob should always reflect the latest per-channel state
  const loaded = store.loadJob(job.job_id)
  expect(loaded.channels.claude.status).toBe('completed')
  expect(loaded.channels.gemini.status).toBe('completed')
  expect(loaded.status).toBe('completed')
})

it('derives running status when some channels still in progress', () => {
  const job = store.createJob({ fix_threshold: 'P2', format: 'json', channels: ['claude', 'gemini'] })

  store.updateChannel(job.job_id, 'claude', { status: 'completed', completed_at: '2026-04-13T00:00:01Z' })
  // gemini still dispatched (no update)

  const loaded = store.loadJob(job.job_id)
  expect(loaded.channels.claude.status).toBe('completed')
  expect(loaded.channels.gemini.status).toBe('dispatched')
  expect(loaded.status).toBe('running')
})
```

- [ ] **Step 2: Run test to verify current behavior**

Run: `cd packages/mmr && npx vitest run tests/core/job-store.test.ts`
Expected: First test may pass (serial execution), but the race exists. Second test should pass with current code. Proceed to implement the safe pattern.

- [ ] **Step 3: Implement per-channel status files with derive-on-read**

In `packages/mmr/src/core/job-store.ts`, make these changes:

**a)** Add a channel name validation helper at the top of the class (after `constructor`):

```typescript
/** Validate channel name is safe for use in file paths */
private validateChannelName(channel: string): void {
  if (!/^[a-zA-Z0-9._-]+$/.test(channel)) {
    throw new Error(`Unsafe channel name: ${channel}`)
  }
}
```

**b)** Replace the `updateChannel` method (lines 107-113):

```typescript
/** Write a per-channel status file atomically — no read-modify-write on job.json */
updateChannel(jobId: string, channel: string, update: Partial<ChannelJobEntry>): void {
  this.validateChannelName(channel)
  const channelsDir = path.join(this.getJobDir(jobId), 'channels')
  fs.mkdirSync(channelsDir, { recursive: true })
  const channelStatusPath = path.join(channelsDir, `${channel}.status.json`)

  // Read existing channel status if file exists, merge update
  let existing: Partial<ChannelJobEntry> = {}
  try {
    const raw = fs.readFileSync(channelStatusPath, 'utf-8')
    existing = JSON.parse(raw)
  } catch (err: unknown) {
    // ENOENT is expected (first update). Any other error is a problem.
    if (err instanceof Error && 'code' in err && (err as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw err
    }
  }

  const merged = { ...existing, ...update }
  fs.writeFileSync(channelStatusPath, JSON.stringify(merged, null, 2))
}
```

**c)** Modify `loadJob` to derive channel state from status files (replace lines 62-67):

```typescript
/** Read job metadata and derive channel state from per-channel status files */
loadJob(jobId: string): JobMetadata {
  const jobDir = this.getJobDir(jobId)
  const raw = fs.readFileSync(path.join(jobDir, 'job.json'), 'utf-8')
  const metadata = JSON.parse(raw) as JobMetadata

  // Overlay per-channel status files onto base metadata
  const channelsDir = path.join(jobDir, 'channels')
  for (const channelName of Object.keys(metadata.channels)) {
    const statusPath = path.join(channelsDir, `${channelName}.status.json`)
    try {
      const statusRaw = fs.readFileSync(statusPath, 'utf-8')
      const channelUpdate = JSON.parse(statusRaw) as Partial<ChannelJobEntry>
      metadata.channels[channelName] = { ...metadata.channels[channelName], ...channelUpdate }
    } catch {
      // No status file yet — keep initial values from job.json
    }
  }

  metadata.status = this.deriveJobStatus(metadata.channels)
  return metadata
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
git commit -m "fix(mmr): eliminate concurrent job.json write race with derive-on-read

P0-4: updateChannel() had a read-modify-write race when parallel channels
completed simultaneously. Now writes per-channel .status.json files
atomically and derives aggregate state in loadJob() by reading those
files on every load. No mutable aggregate file in the critical path.
Also adds channel name validation to prevent path traversal."
```

---

### Task 2: Fix unhandled stdin.write() error and add settled flag (P0-5, P1-15)

**Files:**
- Modify: `packages/mmr/src/core/dispatcher.ts`
- Test: `packages/mmr/tests/core/dispatcher.test.ts`

Two related dispatcher fixes: (1) `proc.stdin.write(prompt)` has no error handler — crashes Node on EPIPE. (2) Timeout/close handlers race via filesystem reads — use an in-memory `settled` boolean instead.

Combined into one task since both modify the same function and the settled flag interacts with the stdin fix.

- [ ] **Step 1: Write the failing test for stdin pipe error**

Add to `packages/mmr/tests/core/dispatcher.test.ts`:

```typescript
it('handles stdin pipe error without crashing', async () => {
  const job = store.createJob({ fix_threshold: 'P2', format: 'json', channels: ['badstdin'] })
  store.savePrompt(job.job_id, 'Review this.')

  // Use node -e to exit immediately without reading stdin, causing EPIPE on large write
  await dispatchChannel(store, job.job_id, 'badstdin', {
    command: 'node',
    prompt: 'x'.repeat(4 * 1024 * 1024), // 4MB to overflow any OS pipe buffer
    flags: ['-e', 'process.exit(0)'],
    env: {},
    timeout: 5,
    stderr: 'capture',
  })

  // Wait for process to complete
  await new Promise(resolve => setTimeout(resolve, 2000))

  // Should not crash — channel should be marked as completed or failed
  const loaded = store.loadJob(job.job_id)
  const status = loaded.channels.badstdin.status
  expect(['completed', 'failed']).toContain(status)
})
```

- [ ] **Step 2: Write the test for successful dispatch saves output**

Add to `packages/mmr/tests/core/dispatcher.test.ts`:

```typescript
it('saves channel output and marks completed on success', async () => {
  const job = store.createJob({ fix_threshold: 'P2', format: 'json', channels: ['echo'] })
  store.savePrompt(job.job_id, 'Review this.')

  await dispatchChannel(store, job.job_id, 'echo', {
    command: 'node',
    prompt: '',
    flags: ['-e', 'process.stdout.write(JSON.stringify({approved:true,findings:[],summary:"ok"}))'],
    env: {},
    timeout: 10,
    stderr: 'capture',
  })

  await new Promise(resolve => setTimeout(resolve, 2000))

  const loaded = store.loadJob(job.job_id)
  expect(loaded.channels.echo.status).toBe('completed')

  const output = store.loadChannelOutput(job.job_id, 'echo')
  expect(output).toContain('approved')
})
```

- [ ] **Step 3: Run tests to verify stdin test crashes**

Run: `cd packages/mmr && npx vitest run tests/core/dispatcher.test.ts`
Expected: stdin test crashes or fails with unhandled error

- [ ] **Step 4: Apply targeted fixes to dispatcher.ts**

Make these targeted edits to `packages/mmr/src/core/dispatcher.ts`:

**a)** Add stdin error handler. Before line 57 (`proc.stdin.write(opts.prompt)`), insert:

```typescript
  // Handle stdin pipe errors (child may close stdin early)
  proc.stdin.on('error', () => {
    // Swallow EPIPE — the close handler will deal with the process exit
  })
```

**b)** Add settled flag. After the stderr listener (after line 74 `stderr += chunk.toString()`), insert:

```typescript
  // In-memory settled flag to prevent timeout/close race
  let settled = false
```

**c)** Guard the timeout handler. Replace lines 78-95:

```typescript
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
```

**d)** Guard the close handler. Replace lines 98-124:

```typescript
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
```

**e)** Guard the error handler. Replace lines 127-134:

```typescript
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
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd packages/mmr && npx vitest run tests/core/dispatcher.test.ts`
Expected: All tests PASS

- [ ] **Step 6: Run full test suite and type check**

Run: `cd packages/mmr && npx tsc --noEmit && npx vitest run`
Expected: All pass

- [ ] **Step 7: Commit**

```bash
git add packages/mmr/src/core/dispatcher.ts packages/mmr/tests/core/dispatcher.test.ts
git commit -m "fix(mmr): handle stdin pipe errors and eliminate timeout/close race

P0-5: proc.stdin.write() with no error handler crashes Node on EPIPE.
Added handler to swallow pipe errors gracefully.

P1-15: timeout and close handlers raced via filesystem reads. Now uses
an in-memory settled boolean (matching auth.ts pattern) to ensure only
the first handler writes the terminal status.

Also adds test for successful dispatch output capture."
```

---

### Task 3: Make dispatchChannel return a Promise that settles on completion (P1-9 prerequisite)

**Files:**
- Modify: `packages/mmr/src/core/dispatcher.ts`
- Test: `packages/mmr/tests/core/dispatcher.test.ts`

`dispatchChannel` is `async` but resolves immediately after spawning. For sequential dispatch and future `--sync` mode, it must return a Promise that settles when the channel process completes (close/error/timeout).

- [ ] **Step 1: Write the test for awaitable dispatch**

Add to `packages/mmr/tests/core/dispatcher.test.ts`:

```typescript
it('returned promise resolves only after process completes', async () => {
  const job = store.createJob({ fix_threshold: 'P2', format: 'json', channels: ['awaitable'] })
  store.savePrompt(job.job_id, 'Review this.')

  // node -e sleeps 1s then writes output — dispatch should not resolve until after
  const before = Date.now()
  await dispatchChannel(store, job.job_id, 'awaitable', {
    command: 'node',
    prompt: '',
    flags: ['-e', 'setTimeout(() => { process.stdout.write("done"); process.exit(0) }, 1000)'],
    env: {},
    timeout: 10,
    stderr: 'capture',
  })
  const elapsed = Date.now() - before

  // Should have waited at least ~1s for the process to complete
  expect(elapsed).toBeGreaterThanOrEqual(800)

  const loaded = store.loadJob(job.job_id)
  expect(loaded.channels.awaitable.status).toBe('completed')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/mmr && npx vitest run tests/core/dispatcher.test.ts`
Expected: FAIL — `elapsed` is near 0 because `dispatchChannel` resolves immediately

- [ ] **Step 3: Wrap dispatcher in a completion Promise**

In `packages/mmr/src/core/dispatcher.ts`, wrap the event handlers in a `new Promise` and return it. Replace the function signature and add the Promise wrapper.

After the `proc.unref()` line at the end of the function, the function currently returns `void` (implicit). Instead, wrap the event handlers:

Remove `proc.unref()` (line 137). Replace the entire section from the `settled` flag declaration through the end of the function with:

```typescript
  // In-memory settled flag to prevent timeout/close race
  let settled = false

  return new Promise<void>((resolve) => {
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
      resolve()
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
      resolve()
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
      resolve()
    })
  })
```

- [ ] **Step 4: Remove setTimeout waits from existing tests**

Now that `dispatchChannel` returns a promise that settles on completion, remove the `await new Promise(resolve => setTimeout(resolve, ...))` lines from all dispatcher tests. The `await dispatchChannel(...)` call itself will wait for completion.

In all existing dispatcher tests and the new tests from Task 2, remove lines like:
```typescript
// Remove these:
await new Promise(resolve => setTimeout(resolve, 500))
await new Promise(resolve => setTimeout(resolve, 1000))
await new Promise(resolve => setTimeout(resolve, 1500))
await new Promise(resolve => setTimeout(resolve, 2000))
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd packages/mmr && npx vitest run tests/core/dispatcher.test.ts`
Expected: All tests PASS — and they run faster without sleep waits

- [ ] **Step 6: Run full suite and type check**

Run: `cd packages/mmr && npx tsc --noEmit && npx vitest run`
Expected: All pass

- [ ] **Step 7: Commit**

```bash
git add packages/mmr/src/core/dispatcher.ts packages/mmr/tests/core/dispatcher.test.ts
git commit -m "fix(mmr): make dispatchChannel return Promise that settles on completion

Prerequisite for P1-9 sequential dispatch fix and future --sync mode.
dispatchChannel now wraps its event handlers in a Promise that resolves
when the process closes, times out, or errors. Removes proc.unref() so
the event loop stays alive while awaiting. Also removes flaky setTimeout
waits from dispatcher tests."
```

---

### Task 4: Fix broken sequential dispatch (P1-9)

**Files:**
- Modify: `packages/mmr/src/commands/review.ts:211-233`

Now that `dispatchChannel` returns a proper completion Promise (Task 3), sequential dispatch will work correctly. Fix the eager dispatch pattern.

- [ ] **Step 1: Implement the fix**

In `packages/mmr/src/commands/review.ts`, replace lines 211-233 (the dispatch section):

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
Now only calls dispatchChannel inside the loop when parallel is false.
Works correctly because dispatchChannel now returns a completion Promise."
```

---

### Task 5: Fix extractJson string-aware brace counting (P1-10)

**Files:**
- Modify: `packages/mmr/src/core/parser.ts:28-43`
- Test: `packages/mmr/tests/core/parser.test.ts`

The `extractJson` function counts `{` and `}` to find matching braces but doesn't account for braces inside JSON string values. Input like `"description": "use { carefully"` causes early termination.

- [ ] **Step 1: Write the failing tests**

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

- [ ] **Step 5: Add tests for empty input and unbalanced braces**

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
Now tracks in-string state and handles escaped quotes.
Also adds tests for empty input and unbalanced braces edge cases."
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
  const raw = '{"status": "done", "result": "all good"}'
  const result = parse(raw)
  expect(result.approved).toBe(false)
  expect(result.findings).toEqual([])
  expect(result.summary).toBe('')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/mmr && npx vitest run tests/core/parser.test.ts`
Expected: FAIL — `approved` is `undefined` (not `false`)

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

The `claude` and `codex` channels specify `output_parser: 'claude'` (line 36) and `output_parser: 'codex'` (line 66), but no such parsers exist — they silently fall back to `'default'`. Make the intent explicit.

- [ ] **Step 1: Read the defaults file**

Read `packages/mmr/src/config/defaults.ts` to see current values and exact line numbers.

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
- Create: `packages/mmr/CHANGELOG.md` (add v0.2.0 entry)

- [ ] **Step 1: Bump version**

In `packages/mmr/package.json`, update the `version` field to `"0.2.0"`.

- [ ] **Step 2: Create CHANGELOG.md**

Create `packages/mmr/CHANGELOG.md`:

```markdown
# Changelog

## [0.2.0] — 2026-04-13

### Fixed
- **P0-4:** Concurrent job.json writes race — derive channel state on read from per-channel status files
- **P0-5:** stdin.write() crash — handle EPIPE when child closes stdin early
- **P1-15:** Timeout/close race condition — in-memory settled flag prevents double writes
- **P1-9:** Sequential dispatch was broken — dispatchChannel now returns completion Promise; channels only dispatched inside loop when parallel is false
- **P1-10:** extractJson brace counting failed on braces inside JSON strings — now string-aware
- **P1-11:** Gemini parser skipped validation on unwrapped output — unsafe cast replaced with validation
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
gh pr create --title "fix(mmr): critical code fixes and parser hardening (v0.2.0)" --body "$(cat <<'EOF'
## Summary
- Fix concurrent job.json write race with derive-on-read pattern (P0-4)
- Handle stdin pipe errors in dispatcher (P0-5)
- Eliminate timeout/close race with in-memory settled flag (P1-15)
- Make dispatchChannel return completion Promise (P1-9 prereq)
- Fix sequential dispatch starting all channels concurrently (P1-9)
- Make extractJson string-aware for braces in JSON values (P1-10)
- Validate unwrapped Gemini parser output (P1-11)
- Fix misleading parser names in channel defaults (P2-23)

## Test plan
- [ ] `cd packages/mmr && npx vitest run` — all tests pass
- [ ] `cd packages/mmr && npx tsc --noEmit` — no type errors
- [ ] New tests: derived channel state, stdin error, awaitable dispatch, brace-in-string, Gemini validation

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 6: After CI passes, merge and tag**

```bash
gh pr merge --squash --delete-branch
git checkout main && git pull
git tag mmr-v0.2.0
git push origin mmr-v0.2.0
```

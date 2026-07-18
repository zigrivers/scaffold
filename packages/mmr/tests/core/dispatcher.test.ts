import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { dispatchChannel, isChannelComplete } from '../../src/core/dispatcher.js'
import { JobStore } from '../../src/core/job-store.js'
import type { OutputParserConfig } from '../../src/config/schema.js'

describe('dispatchChannel', () => {
  let tmpDir: string
  let store: JobStore

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mmr-dispatch-'))
    store = new JobStore(tmpDir)
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true })
  })

  it('dispatches a channel process and writes PID file', async () => {
    const job = store.createJob({ fix_threshold: 'P2', format: 'json', channels: ['test'] })
    store.savePrompt(job.job_id, 'Review this.')

    // Use 'cat' which reads stdin and writes to stdout (prompt piped via stdin)
    await dispatchChannel(store, job.job_id, 'test', {
      command: 'cat',
      prompt: '{"approved": true, "findings": [], "summary": "ok"}',
      flags: [],
      env: {},
      timeout: 10,
      stderr: 'capture',
    })

    const pidFile = path.join(tmpDir, job.job_id, 'channels', 'test.pid')
    expect(fs.existsSync(pidFile)).toBe(true)
  })

  it('handles stdin pipe error without crashing', async () => {
    const job = store.createJob({ fix_threshold: 'P2', format: 'json', channels: ['badstdin'] })
    store.savePrompt(job.job_id, 'Review this.')

    // node -e exits immediately without reading stdin, causing EPIPE on large write
    await dispatchChannel(store, job.job_id, 'badstdin', {
      command: 'node',
      prompt: 'x'.repeat(4 * 1024 * 1024), // 4MB to overflow pipe buffer
      flags: ['-e', 'process.exit(0)'],
      env: {},
      timeout: 5,
      stderr: 'capture',
    })

    const loaded = store.loadJob(job.job_id)
    const status = loaded.channels.badstdin.status
    expect(['completed', 'failed']).toContain(status)
  })

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

    const loaded = store.loadJob(job.job_id)
    expect(loaded.channels.echo.status).toBe('completed')

    const output = store.loadChannelOutput(job.job_id, 'echo')
    expect(output).toContain('approved')
  })

  it('executes command and flags as separate spawn arguments', async () => {
    const job = store.createJob({ fix_threshold: 'P2', format: 'json', channels: ['splitargs'] })
    store.savePrompt(job.job_id, 'Review this.')

    await dispatchChannel(store, job.job_id, 'splitargs', {
      command: 'node',
      prompt: '',
      flags: ['-e', 'process.stdout.write(process.argv.includes("sentinel") ? "ok" : "missing")', 'sentinel'],
      env: {},
      timeout: 10,
      stderr: 'capture',
    })

    const loaded = store.loadJob(job.job_id)
    expect(loaded.channels.splitargs.status).toBe('completed')
    expect(store.loadChannelOutput(job.job_id, 'splitargs')).toContain('ok')
  })

  it('handles channel timeout', async () => {
    const job = store.createJob({ fix_threshold: 'P2', format: 'json', channels: ['slow'] })
    store.savePrompt(job.job_id, 'Review this.')

    // Use 'sleep 10' as the command (10 is a flag, not stdin)
    await dispatchChannel(store, job.job_id, 'slow', {
      command: 'sleep 10',
      prompt: '',
      flags: [],
      env: {},
      timeout: 1,
      stderr: 'capture',
    })

    const loaded = store.loadJob(job.job_id)
    expect(loaded.channels.slow.status).toBe('timeout')
  })

  it('handles passthrough stderr mode without data handler', async () => {
    const job = store.createJob({ fix_threshold: 'P2', format: 'json', channels: ['passthrough'] })
    store.savePrompt(job.job_id, 'Review this.')

    await dispatchChannel(store, job.job_id, 'passthrough', {
      command: 'node',
      prompt: '',
      flags: ['-e', 'process.stderr.write("warning"); process.stdout.write("ok"); process.exit(0)'],
      env: {},
      timeout: 10,
      stderr: 'passthrough',
    })

    const loaded = store.loadJob(job.job_id)
    expect(loaded.channels.passthrough.status).toBe('completed')
  })

  it('marks channel as failed when command does not exist', async () => {
    const job = store.createJob({ fix_threshold: 'P2', format: 'json', channels: ['nosuch'] })
    store.savePrompt(job.job_id, 'Review this.')

    await dispatchChannel(store, job.job_id, 'nosuch', {
      command: 'nonexistent-command-xyz-12345',
      prompt: 'test',
      flags: [],
      env: {},
      timeout: 5,
      stderr: 'capture',
    })

    const loaded = store.loadJob(job.job_id)
    expect(loaded.channels.nosuch.status).toBe('failed')
  })

  it('suppresses stderr in suppress mode', async () => {
    const job = store.createJob({ fix_threshold: 'P2', format: 'json', channels: ['suppress'] })
    store.savePrompt(job.job_id, 'Review this.')

    await dispatchChannel(store, job.job_id, 'suppress', {
      command: 'node',
      prompt: '',
      flags: ['-e', 'process.stderr.write("ignored"); process.stdout.write("ok"); process.exit(0)'],
      env: {},
      timeout: 10,
      stderr: 'suppress',
    })

    const loaded = store.loadJob(job.job_id)
    expect(loaded.channels.suppress.status).toBe('completed')
  })

  it('returned promise resolves only after process completes', async () => {
    const job = store.createJob({ fix_threshold: 'P2', format: 'json', channels: ['awaitable'] })
    store.savePrompt(job.job_id, 'Review this.')

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

    expect(elapsed).toBeGreaterThanOrEqual(800)

    const loaded = store.loadJob(job.job_id)
    expect(loaded.channels.awaitable.status).toBe('completed')
  })
})

describe('isChannelComplete', () => {
  it('returns true for completed status', () => {
    expect(isChannelComplete('completed')).toBe(true)
  })
  it('returns true for terminal statuses', () => {
    expect(isChannelComplete('timeout')).toBe(true)
    expect(isChannelComplete('failed')).toBe(true)
    expect(isChannelComplete('auth_failed')).toBe(true)
    expect(isChannelComplete('skipped')).toBe(true)
    expect(isChannelComplete('not_installed')).toBe(true)
  })
  it('returns false for in-progress statuses', () => {
    expect(isChannelComplete('dispatched')).toBe(false)
    expect(isChannelComplete('running')).toBe(false)
  })
})

describe('dispatchChannel retryOnIncomplete (grok Cancelled → one serial re-dispatch)', () => {
  // grok cancels reviews under same-account concurrent sessions (verified on
  // grok 0.2.103). By the time the first dispatch settles the burst has usually
  // passed, so ONE serial retry recovers real channel coverage instead of
  // falling through to the compensating pass. The probe only fires on an
  // envelope matching the parser's `incomplete` guard.
  let tmpDir: string
  let store: JobStore

  const grokLikeSpec: OutputParserConfig = {
    kind: 'unwrap-jsonpath',
    wrap: '$.text',
    incomplete: { status_path: '$.stopReason', values: ['Cancelled'], message: 'interrupted' },
    then: 'default-last',
  }

  // Fake CLI: first invocation reports Cancelled with an ack-only $.text;
  // every later invocation completes with real findings JSON. Invocation
  // count is tracked in the MARKER file.
  const FAKE_GROK = `
    const fs = require("fs");
    const m = process.env.MARKER;
    const n = fs.existsSync(m) ? Number(fs.readFileSync(m, "utf8")) + 1 : 1;
    fs.writeFileSync(m, String(n));
    if (n === 1) {
      process.stdout.write(JSON.stringify({ text: "I'll review the diff.", stopReason: "Cancelled" }));
    } else {
      process.stdout.write(JSON.stringify({
        text: JSON.stringify({ approved: true, findings: [], summary: "ok" }),
        stopReason: "EndTurn",
      }));
    }
  `.replace(/\n\s*/g, ' ')

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mmr-retry-'))
    store = new JobStore(tmpDir)
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true })
  })

  it('re-dispatches once when the first run ends Cancelled, keeping the completed second output', async () => {
    const job = store.createJob({ fix_threshold: 'P2', format: 'json', channels: ['grokish'] })
    store.savePrompt(job.job_id, 'Review this.')
    const marker = path.join(tmpDir, 'invocations')

    await dispatchChannel(store, job.job_id, 'grokish', {
      command: 'node',
      prompt: '',
      flags: ['-e', FAKE_GROK],
      env: { MARKER: marker },
      timeout: 10,
      stderr: 'capture',
      retryOnIncomplete: grokLikeSpec,
    })

    expect(fs.readFileSync(marker, 'utf8')).toBe('2')
    const loaded = store.loadJob(job.job_id)
    expect(loaded.channels.grokish.status).toBe('completed')
    const raw = JSON.parse(store.loadChannelOutput(job.job_id, 'grokish'))
    expect(raw).toContain('EndTurn')
  })

  it('does not retry when the first run completes normally', async () => {
    const job = store.createJob({ fix_threshold: 'P2', format: 'json', channels: ['grokish'] })
    store.savePrompt(job.job_id, 'Review this.')
    const marker = path.join(tmpDir, 'invocations')
    // Pre-set the counter to 1 so the fake's next (first actual) run completes.
    fs.writeFileSync(marker, '1')

    await dispatchChannel(store, job.job_id, 'grokish', {
      command: 'node',
      prompt: '',
      flags: ['-e', FAKE_GROK],
      env: { MARKER: marker },
      timeout: 10,
      stderr: 'capture',
      retryOnIncomplete: grokLikeSpec,
    })

    expect(fs.readFileSync(marker, 'utf8')).toBe('2') // exactly one invocation (1 → 2)
    const loaded = store.loadJob(job.job_id)
    expect(loaded.channels.grokish.status).toBe('completed')
  })

  it('retries at most once even when every run ends Cancelled', async () => {
    const ALWAYS_CANCELLED = `
      const fs = require("fs");
      const m = process.env.MARKER;
      const n = fs.existsSync(m) ? Number(fs.readFileSync(m, "utf8")) + 1 : 1;
      fs.writeFileSync(m, String(n));
      process.stdout.write(JSON.stringify({ text: "ack only", stopReason: "Cancelled" }));
    `.replace(/\n\s*/g, ' ')
    const job = store.createJob({ fix_threshold: 'P2', format: 'json', channels: ['grokish'] })
    store.savePrompt(job.job_id, 'Review this.')
    const marker = path.join(tmpDir, 'invocations')

    await dispatchChannel(store, job.job_id, 'grokish', {
      command: 'node',
      prompt: '',
      flags: ['-e', ALWAYS_CANCELLED],
      env: { MARKER: marker },
      timeout: 10,
      stderr: 'capture',
      retryOnIncomplete: grokLikeSpec,
    })

    expect(fs.readFileSync(marker, 'utf8')).toBe('2')
    // Output stays Cancelled; the parser's preemptive incomplete guard turns it
    // into the honest "did not complete" channel failure at results time.
    const raw = JSON.parse(store.loadChannelOutput(job.job_id, 'grokish'))
    expect(raw).toContain('Cancelled')
  })

  it('is a plain dispatch for parser specs without an incomplete guard', async () => {
    const job = store.createJob({ fix_threshold: 'P2', format: 'json', channels: ['plain'] })
    store.savePrompt(job.job_id, 'Review this.')
    const marker = path.join(tmpDir, 'invocations')

    await dispatchChannel(store, job.job_id, 'plain', {
      command: 'node',
      prompt: '',
      flags: ['-e', FAKE_GROK],
      env: { MARKER: marker },
      timeout: 10,
      stderr: 'capture',
      retryOnIncomplete: 'default',
    })

    expect(fs.readFileSync(marker, 'utf8')).toBe('1') // no probe, no retry
  })
})

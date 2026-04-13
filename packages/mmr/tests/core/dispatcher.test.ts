import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { dispatchChannel, isChannelComplete } from '../../src/core/dispatcher.js'
import { JobStore } from '../../src/core/job-store.js'

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
  })
  it('returns false for in-progress statuses', () => {
    expect(isChannelComplete('dispatched')).toBe(false)
    expect(isChannelComplete('running')).toBe(false)
  })
})

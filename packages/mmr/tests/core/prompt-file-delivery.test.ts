import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { dispatchChannel } from '../../src/core/dispatcher.js'
import { JobStore } from '../../src/core/job-store.js'

/**
 * prompt-file delivery: the dispatcher writes the prompt to a file in the
 * channel's job dir and passes its path via the {{prompt_file}} placeholder
 * (or appends it) instead of piping the prompt to stdin. This supports CLIs
 * like grok whose `-p`/`--prompt-file` flag requires the prompt as an arg.
 */
describe('dispatchChannel — prompt-file delivery', () => {
  let tmpDir: string
  let store: JobStore

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mmr-promptfile-'))
    store = new JobStore(tmpDir)
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true })
  })

  const VALID = '{"approved": true, "findings": [], "summary": "ok"}'

  it('writes the prompt to a file and substitutes the {{prompt_file}} placeholder', async () => {
    const job = store.createJob({ fix_threshold: 'P2', format: 'json', channels: ['pf'] })
    store.savePrompt(job.job_id, 'Review this.')

    // `cat {{prompt_file}}` reads the file path arg (NOT stdin) and echoes its contents.
    await dispatchChannel(store, job.job_id, 'pf', {
      command: 'cat',
      prompt: VALID,
      flags: ['{{prompt_file}}'],
      env: {},
      timeout: 10,
      stderr: 'capture',
      promptDelivery: 'prompt-file',
    })

    const promptFile = path.join(tmpDir, job.job_id, 'channels', 'pf.prompt.txt')
    expect(fs.existsSync(promptFile)).toBe(true)
    expect(fs.readFileSync(promptFile, 'utf8')).toBe(VALID)

    const loaded = store.loadJob(job.job_id)
    expect(loaded.channels.pf.status).toBe('completed')
    // cat echoed the file contents → output equals the prompt delivered by file.
    const output = store.loadChannelOutput(job.job_id, 'pf')
    expect(output).toContain('approved')
  })

  it('appends the prompt-file path as a trailing arg when no placeholder is present', async () => {
    const job = store.createJob({ fix_threshold: 'P2', format: 'json', channels: ['pf2'] })
    store.savePrompt(job.job_id, 'Review this.')

    await dispatchChannel(store, job.job_id, 'pf2', {
      command: 'cat',
      prompt: VALID,
      flags: [],
      env: {},
      timeout: 10,
      stderr: 'capture',
      promptDelivery: 'prompt-file',
    })

    const loaded = store.loadJob(job.job_id)
    expect(loaded.channels.pf2.status).toBe('completed')
    expect(store.loadChannelOutput(job.job_id, 'pf2')).toContain('approved')
  })

  it('does not rely on stdin in prompt-file mode (command that ignores stdin still gets the prompt)', async () => {
    const job = store.createJob({ fix_threshold: 'P2', format: 'json', channels: ['pf3'] })
    store.savePrompt(job.job_id, 'Review this.')

    // `cat <file>` never reads stdin; success proves the prompt arrived via the file arg.
    await dispatchChannel(store, job.job_id, 'pf3', {
      command: 'cat',
      prompt: VALID,
      flags: ['{{prompt_file}}'],
      env: {},
      timeout: 10,
      stderr: 'capture',
      promptDelivery: 'prompt-file',
    })

    expect(store.loadJob(job.job_id).channels.pf3.status).toBe('completed')
  })

  it('still pipes via stdin when promptDelivery is omitted (back-compat)', async () => {
    const job = store.createJob({ fix_threshold: 'P2', format: 'json', channels: ['stdinch'] })
    store.savePrompt(job.job_id, 'Review this.')

    // `cat` with no args reads stdin; proves the default path is unchanged.
    await dispatchChannel(store, job.job_id, 'stdinch', {
      command: 'cat',
      prompt: VALID,
      flags: [],
      env: {},
      timeout: 10,
      stderr: 'capture',
    })

    expect(store.loadJob(job.job_id).channels.stdinch.status).toBe('completed')
    expect(store.loadChannelOutput(job.job_id, 'stdinch')).toContain('approved')
  })
})

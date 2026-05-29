import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { JobStore } from '../../src/core/job-store.js'
import { dispatchHttpChannel } from '../../src/core/http-dispatcher.js'
import { parseChannelOutput } from '../../src/core/parser.js'
import type { HttpChannelParsed } from '../../src/config/schema.js'

function makeStore(): { store: JobStore; jobId: string; cleanup: () => void } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mmr-http-disp-'))
  const store = new JobStore(dir)
  const job = store.createJob({ fix_threshold: 'P2', format: 'json', channels: ['groq'] })
  store.updateChannel(job.job_id, 'groq', { status: 'dispatched' })
  return { store, jobId: job.job_id, cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) }
}

// Concrete http channel as it appears post-parse. `auth` is the optional common
// AuthConfig shape (not used by the dispatcher) so it is omitted here.
const baseChannel: HttpChannelParsed = {
  kind: 'http',
  endpoint: 'https://api.example.com/v1/chat/completions',
  model: 'gpt-4',
  endpoint_convention: 'openai-chat',
  api_key_env: 'EXAMPLE_KEY',
  api_key_header: 'Authorization',
  api_key_prefix: 'Bearer ',
  enabled: true,
  flags: [],
  env: {},
  prompt_wrapper: '{{prompt}}',
  output_parser: 'default',
  stderr: 'capture',
  abstract: false,
}

describe('dispatchHttpChannel', () => {
  beforeEach(() => {
    process.env.EXAMPLE_KEY = 'sk-secret-do-not-leak'
  })

  afterEach(() => {
    delete process.env.EXAMPLE_KEY
    vi.restoreAllMocks()
  })

  it('200 → unwraps the openai-chat envelope, saves the model content, marks completed', async () => {
    const { store, jobId, cleanup } = makeStore()
    try {
      // The model's direct output (what a subprocess channel writes as stdout).
      const modelContent = JSON.stringify({ findings: [], approved: true, summary: 'ok' })
      const responseBody = JSON.stringify({ choices: [{ message: { content: modelContent } }] })
      const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValue(
        new Response(responseBody, { status: 200, headers: { 'content-type': 'application/json' } }),
      )
      await dispatchHttpChannel(store, jobId, 'groq', { channel: baseChannel, prompt: 'review this', timeout: 30 })
      const job = store.loadJob(jobId)
      expect(job.channels.groq.status).toBe('completed')
      expect(fetchMock).toHaveBeenCalledTimes(1)
      // Confirm Authorization header sent with the secret prefix+value
      const callInit = fetchMock.mock.calls[0][1] as RequestInit
      const headers = callInit.headers as Record<string, string>
      expect(headers.Authorization).toBe('Bearer sk-secret-do-not-leak')
      // request body asks for JSON for the default parser
      expect(JSON.parse(callInit.body as string).response_format).toEqual({ type: 'json_object' })
      // Saved output is the UNWRAPPED content (not the envelope) and parses cleanly.
      const stored = JSON.parse(store.loadChannelOutput(jobId, 'groq')) as string
      expect(stored).toBe(modelContent)
      const parsed = parseChannelOutput(stored, 'default')
      expect(parsed.findings).toEqual([])
    } finally {
      cleanup()
    }
  })

  it('does NOT force response_format for a regex-findings (text-scanning) parser', async () => {
    const { store, jobId, cleanup } = makeStore()
    try {
      const channel: HttpChannelParsed = {
        ...baseChannel,
        output_parser: { kind: 'regex-findings', pattern: '(?<sev>P\\d)', flags: 'gm', default_severity: 'P2', fields: { location: 1, description: 1, severity: 1 } },
      }
      const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ choices: [{ message: { content: 'P2 foo bar' } }] }), { status: 200 }),
      )
      await dispatchHttpChannel(store, jobId, 'groq', { channel, prompt: 'x', timeout: 30 })
      const callInit = fetchMock.mock.calls[0][1] as RequestInit
      expect(JSON.parse(callInit.body as string).response_format).toBeUndefined()
    } finally {
      cleanup()
    }
  })

  it('surfaces a synthetic failure reason via the channel log (not the response body)', async () => {
    const { store, jobId, cleanup } = makeStore()
    try {
      vi.spyOn(global, 'fetch').mockResolvedValue(new Response('rate limited, retry later', { status: 429 }))
      await dispatchHttpChannel(store, jobId, 'groq', { channel: baseChannel, prompt: 'x', timeout: 30 })
      const log = store.loadChannelLog(jobId, 'groq')
      expect(log).toBe('HTTP 429')
    } finally {
      cleanup()
    }
  })

  it('401 → marks channel auth_failed', async () => {
    const { store, jobId, cleanup } = makeStore()
    try {
      vi.spyOn(global, 'fetch').mockResolvedValue(new Response('Unauthorized', { status: 401 }))
      await dispatchHttpChannel(store, jobId, 'groq', { channel: baseChannel, prompt: 'x', timeout: 30 })
      expect(store.loadJob(jobId).channels.groq.status).toBe('auth_failed')
    } finally {
      cleanup()
    }
  })

  it('429 → marks channel failed', async () => {
    const { store, jobId, cleanup } = makeStore()
    try {
      vi.spyOn(global, 'fetch').mockResolvedValue(new Response('rate limit', { status: 429 }))
      await dispatchHttpChannel(store, jobId, 'groq', { channel: baseChannel, prompt: 'x', timeout: 30 })
      expect(store.loadJob(jobId).channels.groq.status).toBe('failed')
    } finally {
      cleanup()
    }
  })

  it('5xx → marks channel failed', async () => {
    const { store, jobId, cleanup } = makeStore()
    try {
      vi.spyOn(global, 'fetch').mockResolvedValue(new Response('server error', { status: 503 }))
      await dispatchHttpChannel(store, jobId, 'groq', { channel: baseChannel, prompt: 'x', timeout: 30 })
      expect(store.loadJob(jobId).channels.groq.status).toBe('failed')
    } finally {
      cleanup()
    }
  })

  it('missing api key env → auth_failed without calling fetch', async () => {
    const { store, jobId, cleanup } = makeStore()
    try {
      delete process.env.EXAMPLE_KEY
      const fetchMock = vi.spyOn(global, 'fetch')
      await dispatchHttpChannel(store, jobId, 'groq', { channel: baseChannel, prompt: 'x', timeout: 30 })
      expect(store.loadJob(jobId).channels.groq.status).toBe('auth_failed')
      expect(fetchMock).not.toHaveBeenCalled()
    } finally {
      cleanup()
    }
  })

  it('AbortSignal timeout → marks channel timeout', async () => {
    const { store, jobId, cleanup } = makeStore()
    try {
      vi.spyOn(global, 'fetch').mockImplementation((_url, init?: RequestInit) => {
        return new Promise((_resolve, reject) => {
          const signal = init?.signal
          signal?.addEventListener('abort', () => {
            const err = new Error('aborted')
            err.name = 'AbortError'
            reject(err)
          })
        })
      })
      await dispatchHttpChannel(store, jobId, 'groq', { channel: baseChannel, prompt: 'x', timeout: 0.01 })
      expect(store.loadJob(jobId).channels.groq.status).toBe('timeout')
    } finally {
      cleanup()
    }
  })

  it('never logs the API key value, even on failure', async () => {
    const { store, jobId, cleanup } = makeStore()
    try {
      vi.spyOn(global, 'fetch').mockResolvedValue(new Response('forbidden sk-secret-do-not-leak', { status: 403 }))
      await dispatchHttpChannel(store, jobId, 'groq', { channel: baseChannel, prompt: 'x', timeout: 30 })
      // Scan the saved channel files for the secret.
      const dir = store.getJobDir(jobId)
      const channelsDir = path.join(dir, 'channels')
      const files = fs.existsSync(channelsDir) ? fs.readdirSync(channelsDir) : []
      for (const f of files) {
        const content = fs.readFileSync(path.join(channelsDir, f), 'utf-8')
        expect(content).not.toContain('sk-secret-do-not-leak')
      }
    } finally {
      cleanup()
    }
  })
})

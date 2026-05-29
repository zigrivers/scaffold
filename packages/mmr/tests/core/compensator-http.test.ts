import { describe, it, expect, vi, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { JobStore } from '../../src/core/job-store.js'
import { MmrConfigSchema } from '../../src/config/schema.js'
import type { MmrConfigParsed } from '../../src/config/schema.js'
import type { CompensatingChannel } from '../../src/core/compensator.js'

// Task 35: when the configured compensator channel is kind:http, compensating
// passes must route through the HTTP dispatcher, not the subprocess path. Both
// dispatchers are mocked (no real spawn / fetch) so we assert the routing.

afterEach(() => { vi.restoreAllMocks() })

interface Recorder { sub: string[]; http: string[] }

async function dispatchWithMocks(
  store: JobStore,
  jobId: string,
  comps: CompensatingChannel[],
  config: MmrConfigParsed,
): Promise<Recorder> {
  vi.resetModules()
  const rec: Recorder = { sub: [], http: [] }
  vi.doMock('../../src/core/dispatcher.js', () => ({
    dispatchChannel: vi.fn().mockImplementation(async (_s: never, _j: string, n: string) => { rec.sub.push(n) }),
  }))
  vi.doMock('../../src/core/http-dispatcher.js', () => ({
    dispatchHttpChannel: vi.fn().mockImplementation(async (_s: never, _j: string, n: string) => { rec.http.push(n) }),
  }))
  const { dispatchCompensatingPasses } = await import('../../src/core/compensator.js')
  try {
    await dispatchCompensatingPasses(store, jobId, 'review this', comps, config)
  } finally {
    vi.doUnmock('../../src/core/dispatcher.js')
    vi.doUnmock('../../src/core/http-dispatcher.js')
  }
  return rec
}

function tmpStore(): { store: JobStore; jobId: string; cleanup: () => void } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mmr-comp-'))
  const store = new JobStore(dir)
  const job = store.createJob({ fix_threshold: 'P2', format: 'json', channels: ['codex'] })
  return { store, jobId: job.job_id, cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) }
}

describe('compensator routing by kind', () => {
  it('routes through the HTTP dispatcher when the compensator channel is kind:http', async () => {
    const { store, jobId, cleanup } = tmpStore()
    try {
      const config = MmrConfigSchema.parse({
        version: 1,
        defaults: { compensator: { channel: 'httpcomp' } },
        channels: {
          httpcomp: { kind: 'http', endpoint: 'https://api.example.com/v1/chat/completions', model: 'gpt-4', endpoint_convention: 'openai-chat', api_key_env: 'COMP_KEY' },
        },
      })
      const comps: CompensatingChannel[] = [{ originalChannel: 'codex', compensatingName: 'compensating-codex' }]
      const rec = await dispatchWithMocks(store, jobId, comps, config)
      expect(rec.http).toEqual(['compensating-codex'])
      expect(rec.sub).toEqual([])
    } finally {
      cleanup()
    }
  })

  it('routes through the subprocess dispatcher for the default (no compensator configured)', async () => {
    const { store, jobId, cleanup } = tmpStore()
    try {
      const config = MmrConfigSchema.parse({ version: 1, channels: {} })
      const comps: CompensatingChannel[] = [{ originalChannel: 'codex', compensatingName: 'compensating-codex' }]
      const rec = await dispatchWithMocks(store, jobId, comps, config)
      expect(rec.sub).toEqual(['compensating-codex'])
      expect(rec.http).toEqual([])
    } finally {
      cleanup()
    }
  })

  it('routes through the subprocess dispatcher for a configured subprocess compensator', async () => {
    const { store, jobId, cleanup } = tmpStore()
    try {
      const config = MmrConfigSchema.parse({
        version: 1,
        defaults: { compensator: { channel: 'subcomp' } },
        channels: {
          subcomp: { command: 'sub-review', auth: { check: 'true', failure_exit_codes: [1], recovery: 'x' } },
        },
      })
      const comps: CompensatingChannel[] = [{ originalChannel: 'gemini', compensatingName: 'compensating-gemini' }]
      const rec = await dispatchWithMocks(store, jobId, comps, config)
      expect(rec.sub).toEqual(['compensating-gemini'])
      expect(rec.http).toEqual([])
    } finally {
      cleanup()
    }
  })
})

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { JobStore } from '../../src/core/job-store.js'
import { runResultsPipeline } from '../../src/core/results-pipeline.js'

describe('runResultsPipeline', () => {
  let tmpDir: string
  let store: JobStore

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mmr-pipeline-'))
    store = new JobStore(tmpDir)
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true })
  })

  it('produces pass verdict when all channels complete with no findings', () => {
    const job = store.createJob({ fix_threshold: 'P2', format: 'json', channels: ['claude'] })
    store.updateChannel(job.job_id, 'claude', {
      status: 'completed',
      started_at: '2026-04-13T00:00:00Z',
      completed_at: '2026-04-13T00:00:10Z',
    })
    store.saveChannelOutput(job.job_id, 'claude', '{"approved": true, "findings": [], "summary": "ok"}')

    const { results, exitCode } = runResultsPipeline(store, store.loadJob(job.job_id), 'json')
    expect(results.verdict).toBe('pass')
    expect(exitCode).toBe(0)
  })

  it('produces blocked verdict when findings exceed threshold', () => {
    const job = store.createJob({ fix_threshold: 'P2', format: 'json', channels: ['claude'] })
    store.updateChannel(job.job_id, 'claude', {
      status: 'completed',
      started_at: '2026-04-13T00:00:00Z',
      completed_at: '2026-04-13T00:00:10Z',
    })
    store.saveChannelOutput(job.job_id, 'claude',
      '{"approved": false, "findings": [{"severity": "P1", "location": "f.ts:1", "description": "bug", "suggestion": "fix"}], "summary": "found bug"}')

    const { results, exitCode } = runResultsPipeline(store, store.loadJob(job.job_id), 'json')
    expect(results.verdict).toBe('blocked')
    expect(exitCode).toBe(2)
  })

  it('produces degraded-pass when some channels failed', () => {
    const job = store.createJob({ fix_threshold: 'P2', format: 'json', channels: ['claude', 'gemini'] })
    store.updateChannel(job.job_id, 'claude', {
      status: 'completed',
      started_at: '2026-04-13T00:00:00Z',
      completed_at: '2026-04-13T00:00:10Z',
    })
    store.saveChannelOutput(job.job_id, 'claude', '{"approved": true, "findings": [], "summary": "ok"}')
    store.updateChannel(job.job_id, 'gemini', { status: 'failed' })

    const { results, exitCode } = runResultsPipeline(store, store.loadJob(job.job_id), 'json')
    expect(results.verdict).toBe('degraded-pass')
    expect(exitCode).toBe(0)
  })

  it('surfaces the captured stderr/log as the failed channel error detail', () => {
    // Repro: gemini default command was wrong → 0s elapsed, "Channel
    // failed". Stderr was captured to <channel>.log but never read back,
    // so consumers had no diagnostic. Now perChannel.error should include
    // the head of the saved log for any failed/timeout channel.
    const job = store.createJob({ fix_threshold: 'P2', format: 'json', channels: ['gemini'] })
    store.updateChannel(job.job_id, 'gemini', { status: 'failed' })
    store.saveChannelLog(job.job_id, 'gemini',
      'Not enough arguments following: p\nUsage: gemini [options] [command]')

    const { results } = runResultsPipeline(store, store.loadJob(job.job_id), 'json')
    expect(results.per_channel.gemini.status).toBe('failed')
    expect(results.per_channel.gemini.error).toContain('Channel failed')
    expect(results.per_channel.gemini.error).toContain('Not enough arguments following: p')
  })

  it('keeps the generic error when no log is present for a failed channel', () => {
    const job = store.createJob({ fix_threshold: 'P2', format: 'json', channels: ['gemini'] })
    store.updateChannel(job.job_id, 'gemini', { status: 'failed' })

    const { results } = runResultsPipeline(store, store.loadJob(job.job_id), 'json')
    expect(results.per_channel.gemini.error).toBe('Channel failed')
  })

  it('keeps the generic error when log contains only whitespace', () => {
    // The trim() guard in appendLogDetail must keep us from rendering
    // "Channel failed: " with an empty payload after the colon.
    const job = store.createJob({ fix_threshold: 'P2', format: 'json', channels: ['gemini'] })
    store.updateChannel(job.job_id, 'gemini', { status: 'failed' })
    store.saveChannelLog(job.job_id, 'gemini', '   \n\t  \n')

    const { results } = runResultsPipeline(store, store.loadJob(job.job_id), 'json')
    expect(results.per_channel.gemini.error).toBe('Channel failed')
  })

  it('truncates long log content with a single ellipsis marker', () => {
    const job = store.createJob({ fix_threshold: 'P2', format: 'json', channels: ['gemini'] })
    store.updateChannel(job.job_id, 'gemini', { status: 'failed' })
    const longLog = 'x'.repeat(10_000)
    store.saveChannelLog(job.job_id, 'gemini', longLog)

    const { results } = runResultsPipeline(store, store.loadJob(job.job_id), 'json')
    const errorMsg = results.per_channel.gemini.error ?? ''
    // Contract: 'Channel failed: ' prefix + at most 1000 payload chars + '…'.
    expect(errorMsg.endsWith('…')).toBe(true)
    const prefix = 'Channel failed: '
    expect(errorMsg.length).toBe(prefix.length + 1000 + 1)
  })

  it('produces needs-user-decision when no channels completed', () => {
    const job = store.createJob({ fix_threshold: 'P2', format: 'json', channels: ['claude', 'gemini'] })
    store.updateChannel(job.job_id, 'claude', { status: 'failed' })
    store.updateChannel(job.job_id, 'gemini', { status: 'timeout' })

    const { results, exitCode } = runResultsPipeline(store, store.loadJob(job.job_id), 'json')
    expect(results.verdict).toBe('needs-user-decision')
    expect(exitCode).toBe(3)
  })

  it('formats as text when requested', () => {
    const job = store.createJob({ fix_threshold: 'P2', format: 'json', channels: ['claude'] })
    store.updateChannel(job.job_id, 'claude', {
      status: 'completed',
      started_at: '2026-04-13T00:00:00Z',
      completed_at: '2026-04-13T00:00:10Z',
    })
    store.saveChannelOutput(job.job_id, 'claude', '{"approved": true, "findings": [], "summary": "ok"}')

    const { formatted } = runResultsPipeline(store, store.loadJob(job.job_id), 'text')
    expect(formatted).toContain('PASSED')
  })

  it('formats as markdown when requested', () => {
    const job = store.createJob({ fix_threshold: 'P2', format: 'json', channels: ['claude'] })
    store.updateChannel(job.job_id, 'claude', {
      status: 'completed',
      started_at: '2026-04-13T00:00:00Z',
      completed_at: '2026-04-13T00:00:10Z',
    })
    store.saveChannelOutput(job.job_id, 'claude', '{"approved": true, "findings": [], "summary": "ok"}')

    const { formatted } = runResultsPipeline(store, store.loadJob(job.job_id), 'markdown')
    expect(formatted).toContain('## Multi-Model Review')
    expect(formatted).toContain('PASSED')
  })

  it('includes raw output when includeRaw is true', () => {
    const job = store.createJob({ fix_threshold: 'P2', format: 'json', channels: ['claude'] })
    store.updateChannel(job.job_id, 'claude', {
      status: 'completed',
      started_at: '2026-04-13T00:00:00Z',
      completed_at: '2026-04-13T00:00:10Z',
    })
    const rawOutput = '{"approved": true, "findings": [], "summary": "ok"}'
    store.saveChannelOutput(job.job_id, 'claude', rawOutput)

    const { results } = runResultsPipeline(store, store.loadJob(job.job_id), 'json', true)
    expect(results.per_channel['claude'].raw_output).toContain('approved')
  })

  it('omits raw output by default', () => {
    const job = store.createJob({ fix_threshold: 'P2', format: 'json', channels: ['claude'] })
    store.updateChannel(job.job_id, 'claude', {
      status: 'completed',
      started_at: '2026-04-13T00:00:00Z',
      completed_at: '2026-04-13T00:00:10Z',
    })
    store.saveChannelOutput(job.job_id, 'claude', '{"approved": true, "findings": [], "summary": "ok"}')

    const { results } = runResultsPipeline(store, store.loadJob(job.job_id), 'json')
    expect(results.per_channel['claude'].raw_output).toBeUndefined()
  })

  it('calculates elapsed time from channel timestamps', () => {
    const job = store.createJob({ fix_threshold: 'P2', format: 'json', channels: ['claude'] })
    store.updateChannel(job.job_id, 'claude', {
      status: 'completed',
      started_at: '2026-04-13T00:00:00Z',
      completed_at: '2026-04-13T00:00:10Z',
    })
    store.saveChannelOutput(job.job_id, 'claude', '{"approved": true, "findings": [], "summary": "ok"}')

    const { results } = runResultsPipeline(store, store.loadJob(job.job_id), 'json')
    expect(results.per_channel['claude'].elapsed).toBe('10.0s')
    expect(results.metadata.total_elapsed).toBe('10.0s')
  })

  it('handles failed channels with error field', () => {
    const job = store.createJob({ fix_threshold: 'P2', format: 'json', channels: ['claude'] })
    store.updateChannel(job.job_id, 'claude', { status: 'failed' })

    const { results } = runResultsPipeline(store, store.loadJob(job.job_id), 'json')
    expect(results.per_channel['claude'].error).toBe('Channel failed')
    expect(results.per_channel['claude'].findings).toEqual([])
  })

  it('emits advisory_count for findings strictly below threshold', () => {
    const job = store.createJob({ fix_threshold: 'P2', format: 'json', channels: ['claude'] })
    store.updateChannel(job.job_id, 'claude', {
      status: 'completed',
      started_at: '2026-04-28T00:00:00Z',
      completed_at: '2026-04-28T00:00:10Z',
    })
    store.saveChannelOutput(
      job.job_id,
      'claude',
      JSON.stringify({
        approved: true,
        findings: [
          { severity: 'P3', location: 'a.ts:1', description: 'nit', suggestion: 'fix' },
          { severity: 'P3', location: 'b.ts:2', description: 'nit', suggestion: 'fix' },
        ],
        summary: 'two P3 nits',
      }),
    )

    const { results } = runResultsPipeline(store, store.loadJob(job.job_id), 'json')
    expect(results.verdict).toBe('pass')
    expect(results.advisory_count).toBe(2)
  })

  it('only counts findings strictly below threshold as advisory', () => {
    const job = store.createJob({ fix_threshold: 'P2', format: 'json', channels: ['claude'] })
    store.updateChannel(job.job_id, 'claude', {
      status: 'completed',
      started_at: '2026-04-28T00:00:00Z',
      completed_at: '2026-04-28T00:00:10Z',
    })
    store.saveChannelOutput(
      job.job_id,
      'claude',
      JSON.stringify({
        approved: false,
        findings: [
          { severity: 'P0', location: 'a.ts:1', description: 'crit', suggestion: 'fix' },
          { severity: 'P2', location: 'b.ts:2', description: 'sugg', suggestion: 'fix' },
          { severity: 'P3', location: 'c.ts:3', description: 'nit', suggestion: 'fix' },
        ],
        summary: 'mixed',
      }),
    )

    const { results } = runResultsPipeline(store, store.loadJob(job.job_id), 'json')
    expect(results.verdict).toBe('blocked')
    expect(results.advisory_count).toBe(1)
  })
})

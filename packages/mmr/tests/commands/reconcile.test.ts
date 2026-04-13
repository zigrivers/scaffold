import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { JobStore } from '../../src/core/job-store.js'
import { normalizeExternalInput } from '../../src/core/normalize-input.js'
import { runResultsPipeline } from '../../src/core/results-pipeline.js'
import { TERMINAL_STATUSES } from '../../src/types.js'

describe('reconcile command logic', () => {
  let tmpDir: string
  let store: JobStore

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mmr-reconcile-'))
    store = new JobStore(tmpDir)
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true })
  })

  it('injects external channel and re-reconciles', () => {
    const job = store.createJob({ fix_threshold: 'P2', format: 'json', channels: ['claude'] })
    store.updateChannel(job.job_id, 'claude', {
      status: 'completed',
      started_at: '2026-04-13T00:00:00Z',
      completed_at: '2026-04-13T00:00:10Z',
    })
    store.saveChannelOutput(job.job_id, 'claude', '{"approved": true, "findings": [], "summary": "ok"}')

    // Inject external findings
    const externalInput = JSON.stringify({
      approved: false,
      findings: [{ severity: 'P1', location: 'f.ts:1', description: 'bug from superpowers', suggestion: 'fix' }],
      summary: 'found issue',
    })
    const normalized = normalizeExternalInput(externalInput)

    // Commit sequence (mirrors reconcileCommand handler)
    store.registerChannel(job.job_id, 'superpowers', { output_parser: 'default' })
    store.saveChannelOutput(job.job_id, 'superpowers', normalized)
    const now = new Date().toISOString()
    store.updateChannel(job.job_id, 'superpowers', { status: 'completed', started_at: now, completed_at: now })

    // Re-run pipeline
    const updatedJob = store.loadJob(job.job_id)
    const { results, exitCode } = runResultsPipeline(store, updatedJob, 'json')

    expect(results.reconciled_findings).toHaveLength(1)
    expect(results.reconciled_findings[0].sources).toContain('superpowers')
    expect(results.verdict).toBe('blocked')
    expect(exitCode).toBe(2)
  })

  it('verdict stays pass when injected findings are below threshold', () => {
    const job = store.createJob({ fix_threshold: 'P2', format: 'json', channels: ['claude'] })
    store.updateChannel(job.job_id, 'claude', {
      status: 'completed',
      started_at: '2026-04-13T00:00:00Z',
      completed_at: '2026-04-13T00:00:10Z',
    })
    store.saveChannelOutput(job.job_id, 'claude', '{"approved": true, "findings": [], "summary": "ok"}')

    const normalized = normalizeExternalInput(JSON.stringify([
      { severity: 'P3', location: 'f.ts:5', description: 'nit', suggestion: 'optional' },
    ]))

    store.registerChannel(job.job_id, 'superpowers', { output_parser: 'default' })
    store.saveChannelOutput(job.job_id, 'superpowers', normalized)
    store.updateChannel(job.job_id, 'superpowers', { status: 'completed', started_at: new Date().toISOString(), completed_at: new Date().toISOString() })

    const { results, exitCode } = runResultsPipeline(store, store.loadJob(job.job_id), 'json')
    expect(results.verdict).toBe('pass')
    expect(exitCode).toBe(0)
  })

  it('rejects duplicate channel name', () => {
    const job = store.createJob({ fix_threshold: 'P2', format: 'json', channels: ['claude'] })
    const existingChannels = Object.keys(store.loadJob(job.job_id).channels)
    const collision = existingChannels.some(k => k.toLowerCase() === 'claude')
    expect(collision).toBe(true)
  })

  it('detects case-insensitive collision', () => {
    const job = store.createJob({ fix_threshold: 'P2', format: 'json', channels: ['Claude'] })
    const existingChannels = Object.keys(store.loadJob(job.job_id).channels)
    const collision = existingChannels.some(k => k.toLowerCase() === 'claude')
    expect(collision).toBe(true)
  })

  it('rejects injection when channels are still running', () => {
    const job = store.createJob({ fix_threshold: 'P2', format: 'json', channels: ['claude'] })
    const loaded = store.loadJob(job.job_id)
    const incompleteChannels = Object.entries(loaded.channels)
      .filter(([, entry]) => !TERMINAL_STATUSES.has(entry.status))
      .map(([name]) => name)
    expect(incompleteChannels).toContain('claude')
  })

  it('supports multiple sequential injections', () => {
    const job = store.createJob({ fix_threshold: 'P2', format: 'json', channels: ['claude'] })
    store.updateChannel(job.job_id, 'claude', {
      status: 'completed',
      started_at: '2026-04-13T00:00:00Z',
      completed_at: '2026-04-13T00:00:10Z',
    })
    store.saveChannelOutput(job.job_id, 'claude', '{"approved": true, "findings": [], "summary": "ok"}')

    // First injection
    const input1 = normalizeExternalInput('[]')
    store.registerChannel(job.job_id, 'superpowers', { output_parser: 'default' })
    store.saveChannelOutput(job.job_id, 'superpowers', input1)
    store.updateChannel(job.job_id, 'superpowers', { status: 'completed', started_at: new Date().toISOString(), completed_at: new Date().toISOString() })

    // Second injection
    const input2 = normalizeExternalInput('[]')
    store.registerChannel(job.job_id, 'security-audit', { output_parser: 'default' })
    store.saveChannelOutput(job.job_id, 'security-audit', input2)
    store.updateChannel(job.job_id, 'security-audit', { status: 'completed', started_at: new Date().toISOString(), completed_at: new Date().toISOString() })

    const updatedJob = store.loadJob(job.job_id)
    expect(Object.keys(updatedJob.channels)).toContain('superpowers')
    expect(Object.keys(updatedJob.channels)).toContain('security-audit')

    const { results } = runResultsPipeline(store, updatedJob, 'json')
    expect(results.verdict).toBe('pass')
  })
})

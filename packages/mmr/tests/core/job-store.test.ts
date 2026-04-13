import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { JobStore } from '../../src/core/job-store.js'

describe('JobStore', () => {
  let tmpDir: string
  let store: JobStore

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mmr-jobs-'))
    store = new JobStore(tmpDir)
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true })
  })

  it('creates a new job with unique ID', () => {
    const job = store.createJob({
      fix_threshold: 'P2',
      format: 'json',
      channels: ['claude', 'gemini'],
    })
    expect(job.job_id).toMatch(/^mmr-[a-f0-9]{12}$/)
    expect(job.status).toBe('dispatched')
    expect(fs.existsSync(path.join(tmpDir, job.job_id, 'job.json'))).toBe(true)
  })

  it('saves and loads prompt text', () => {
    const job = store.createJob({ fix_threshold: 'P2', format: 'json', channels: ['claude'] })
    store.savePrompt(job.job_id, 'Review this code...')
    const prompt = store.loadPrompt(job.job_id)
    expect(prompt).toBe('Review this code...')
  })

  it('saves and loads diff', () => {
    const job = store.createJob({ fix_threshold: 'P2', format: 'json', channels: ['claude'] })
    store.saveDiff(job.job_id, '--- a/file.ts\n+++ b/file.ts')
    const diff = store.loadDiff(job.job_id)
    expect(diff).toBe('--- a/file.ts\n+++ b/file.ts')
  })

  it('updates channel status', () => {
    const job = store.createJob({ fix_threshold: 'P2', format: 'json', channels: ['claude'] })
    store.updateChannel(job.job_id, 'claude', { status: 'completed', elapsed: '47s', findings_count: 2 })
    const loaded = store.loadJob(job.job_id)
    expect(loaded.channels.claude.status).toBe('completed')
    expect(loaded.channels.claude.elapsed).toBe('47s')
  })

  it('lists jobs ordered by creation time', () => {
    store.createJob({ fix_threshold: 'P2', format: 'json', channels: ['claude'] })
    store.createJob({ fix_threshold: 'P1', format: 'json', channels: ['gemini'] })
    const jobs = store.listJobs()
    expect(jobs).toHaveLength(2)
  })

  it('derives channel state from per-channel status files on loadJob', () => {
    const job = store.createJob({ fix_threshold: 'P2', format: 'json', channels: ['claude', 'gemini'] })

    store.updateChannel(job.job_id, 'claude', { status: 'completed', completed_at: '2026-04-13T00:00:01Z' })
    store.updateChannel(job.job_id, 'gemini', { status: 'completed', completed_at: '2026-04-13T00:00:02Z' })

    const loaded = store.loadJob(job.job_id)
    expect(loaded.channels.claude.status).toBe('completed')
    expect(loaded.channels.gemini.status).toBe('completed')
    expect(loaded.status).toBe('completed')
  })

  it('derives running status when some channels still in progress', () => {
    const job = store.createJob({ fix_threshold: 'P2', format: 'json', channels: ['claude', 'gemini'] })

    store.updateChannel(job.job_id, 'claude', { status: 'completed', completed_at: '2026-04-13T00:00:01Z' })

    const loaded = store.loadJob(job.job_id)
    expect(loaded.channels.claude.status).toBe('completed')
    expect(loaded.channels.gemini.status).toBe('dispatched')
    expect(loaded.status).toBe('running')
  })

  it('rejects unsafe channel names', () => {
    const job = store.createJob({ fix_threshold: 'P2', format: 'json', channels: ['claude'] })
    expect(() => store.updateChannel(job.job_id, '../../../etc', { status: 'completed' })).toThrow('Unsafe channel name')
    expect(() => store.saveChannelOutput(job.job_id, 'foo bar', 'output')).toThrow('Unsafe channel name')
    expect(() => store.saveChannelLog(job.job_id, 'has/slash', 'log')).toThrow('Unsafe channel name')
  })

  it('rejects unsafe channel names at job creation', () => {
    expect(() => store.createJob({ fix_threshold: 'P2', format: 'json', channels: ['../evil'] })).toThrow('Unsafe channel name')
  })

  it('registers a new channel in job.json visible to loadJob', () => {
    const job = store.createJob({ fix_threshold: 'P2', format: 'json', channels: ['claude'] })
    store.registerChannel(job.job_id, 'compensating-codex', { status: 'dispatched', auth: 'ok' })

    const loaded = store.loadJob(job.job_id)
    expect(loaded.channels['compensating-codex']).toBeDefined()
    expect(loaded.channels['compensating-codex'].status).toBe('dispatched')
  })

  it('prunes jobs older than retention days', () => {
    const job = store.createJob({ fix_threshold: 'P2', format: 'json', channels: ['claude'] })
    const jobDir = path.join(tmpDir, job.job_id)
    const jobJson = JSON.parse(fs.readFileSync(path.join(jobDir, 'job.json'), 'utf-8'))
    const oldDate = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString()
    jobJson.created_at = oldDate
    fs.writeFileSync(path.join(jobDir, 'job.json'), JSON.stringify(jobJson))
    const pruned = store.pruneJobs(7)
    expect(pruned).toBe(1)
    expect(fs.existsSync(jobDir)).toBe(false)
  })
})

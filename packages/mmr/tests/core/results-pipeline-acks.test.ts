import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { runResultsPipeline } from '../../src/core/results-pipeline.js'
import { JobStore } from '../../src/core/job-store.js'
import { AckStore } from '../../src/core/ack-store.js'
import { computeFindingKey, descriptionShingle, normalizeDescriptionForKey, normalizeLocationForKey } from '../../src/core/stable-id.js'
import type { Finding } from '../../src/types.js'

let tmpJobs: string
let tmpProj: string
let tmpHome: string

beforeEach(() => {
  tmpJobs = fs.mkdtempSync(path.join(os.tmpdir(), 'mmr-acks-jobs-'))
  tmpProj = fs.mkdtempSync(path.join(os.tmpdir(), 'mmr-acks-proj-'))
  tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'mmr-acks-home-'))
})

afterEach(() => {
  for (const d of [tmpJobs, tmpProj, tmpHome]) fs.rmSync(d, { recursive: true, force: true })
})

describe('runResultsPipeline — ack integration (T2-D)', () => {
  it('marks reconciled findings acknowledged: true when an exact-key ack exists', () => {
    const finding: Finding = {
      severity: 'P1',
      location: 'src/foo.ts:10',
      description: 'intentional bug',
      suggestion: 'leave it',
    }
    const key = computeFindingKey(finding)
    const ackStore = new AckStore({ projectRoot: tmpProj, userRoot: path.join(tmpHome, '.mmr') })
    ackStore.add({
      finding_key: key,
      normalized_location: normalizeLocationForKey(finding.location),
      description_shingle: descriptionShingle(normalizeDescriptionForKey(finding.description)),
      reason: 'intentional',
      created_at: new Date().toISOString(),
    }, 'project')

    const store = new JobStore(tmpJobs)
    const job = store.createJob({ fix_threshold: 'P2', format: 'json', channels: ['claude'] })
    store.updateChannel(job.job_id, 'claude', {
      status: 'completed',
      started_at: '2026-05-22T00:00:00Z',
      completed_at: '2026-05-22T00:00:01Z',
      output_parser: 'default',
    })
    store.saveChannelOutput(job.job_id, 'claude', JSON.stringify({
      findings: [finding],
    }))

    const loaded = store.loadJob(job.job_id)
    const { results } = runResultsPipeline(store, loaded, 'json', false, { ackStore })
    expect(results.reconciled_findings[0].acknowledged).toBe(true)
    expect(results.reconciled_findings[0].ack_reason).toBe('intentional')
    expect(results.reconciled_findings[0].ack_match).toBe('exact')
    // Gate must pass — the only finding is acked.
    expect(results.verdict).toBe('pass')
    // Acked findings still count as advisory.
    expect(results.advisory_count).toBe(1)
  })

  it('does NOT mark a finding acknowledged when no matching ack exists', () => {
    const finding: Finding = {
      severity: 'P1',
      location: 'src/foo.ts:10',
      description: 'real bug',
      suggestion: 'fix it',
    }
    const ackStore = new AckStore({ projectRoot: tmpProj, userRoot: path.join(tmpHome, '.mmr') })

    const store = new JobStore(tmpJobs)
    const job = store.createJob({ fix_threshold: 'P2', format: 'json', channels: ['claude'] })
    store.updateChannel(job.job_id, 'claude', {
      status: 'completed',
      started_at: '2026-05-22T00:00:00Z',
      completed_at: '2026-05-22T00:00:01Z',
      output_parser: 'default',
    })
    store.saveChannelOutput(job.job_id, 'claude', JSON.stringify({ findings: [finding] }))

    const loaded = store.loadJob(job.job_id)
    const { results } = runResultsPipeline(store, loaded, 'json', false, { ackStore })
    expect(results.reconciled_findings[0].acknowledged).toBeUndefined()
    expect(results.verdict).toBe('blocked')
  })

  it('re-surfaces trust context persisted on the job (so results/reconcile reproduce it)', () => {
    const finding: Finding = { severity: 'P3', location: 'src/x.ts:1', description: 'note', suggestion: 'n/a' }
    const store = new JobStore(tmpJobs)
    const job = store.createJob({
      fix_threshold: 'P2',
      format: 'json',
      channels: ['claude'],
      trust_mode: 'base-ref',
      proposed_acks: ['.mmr/acks/aaa.json'],
      proposed_config_change: true,
    })
    store.updateChannel(job.job_id, 'claude', {
      status: 'completed',
      started_at: '2026-05-22T00:00:00Z',
      completed_at: '2026-05-22T00:00:01Z',
      output_parser: 'default',
    })
    store.saveChannelOutput(job.job_id, 'claude', JSON.stringify({ findings: [finding] }))

    // No diff/trust-classification here (as in `mmr results`/`reconcile`): the
    // pipeline must stamp the trust context from the persisted job.
    const { results } = runResultsPipeline(store, store.loadJob(job.job_id), 'json', false)
    expect(results.trust_mode).toBe('base-ref')
    expect(results.proposed_acks).toEqual(['.mmr/acks/aaa.json'])
    expect(results.proposed_config_change).toBe(true)
  })

  it('fails safe when the ack store throws (poisoned acks tree) — no suppression, no crash', () => {
    const finding: Finding = {
      severity: 'P1',
      location: 'src/foo.ts:10',
      description: 'real bug',
      suggestion: 'fix it',
    }
    // Poison the project acks tree: make .mmr a symlink escaping the root so
    // AckStore.dirForScope throws on lookup.
    const evil = fs.mkdtempSync(path.join(os.tmpdir(), 'mmr-acks-evil-'))
    fs.symlinkSync(evil, path.join(tmpProj, '.mmr'))
    const ackStore = new AckStore({ projectRoot: tmpProj, userRoot: path.join(tmpHome, '.mmr') })

    const store = new JobStore(tmpJobs)
    const job = store.createJob({ fix_threshold: 'P2', format: 'json', channels: ['claude'] })
    store.updateChannel(job.job_id, 'claude', {
      status: 'completed',
      started_at: '2026-05-22T00:00:00Z',
      completed_at: '2026-05-22T00:00:01Z',
      output_parser: 'default',
    })
    store.saveChannelOutput(job.job_id, 'claude', JSON.stringify({ findings: [finding] }))

    const loaded = store.loadJob(job.job_id)
    // Must not throw; the unreadable ack store yields no suppression.
    const { results } = runResultsPipeline(store, loaded, 'json', false, { ackStore })
    expect(results.reconciled_findings[0].acknowledged).toBeUndefined()
    expect(results.verdict).toBe('blocked')
    fs.rmSync(evil, { recursive: true, force: true })
  })
})

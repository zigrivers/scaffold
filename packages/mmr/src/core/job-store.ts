import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import type { JobMetadata, ChannelJobEntry, Severity, OutputFormat } from '../types.js'
import type { ReconciledResults } from '../types.js'

export interface CreateJobOpts {
  fix_threshold: Severity
  format: OutputFormat
  channels: string[]
}

export class JobStore {
  private readonly jobsDir: string

  constructor(jobsDir: string) {
    this.jobsDir = jobsDir
    fs.mkdirSync(jobsDir, { recursive: true })
  }

  /** Validate that a channel name contains only safe characters */
  private validateChannelName(channel: string): void {
    if (!/^[a-zA-Z0-9._-]+$/.test(channel)) {
      throw new Error(`Unsafe channel name: ${channel}`)
    }
  }

  /** Validate channel name and return path for a channel file */
  private channelFilePath(jobId: string, channel: string, filename: string): string {
    this.validateChannelName(channel)
    return path.join(this.getJobDir(jobId), 'channels', filename)
  }

  /** Generate a unique job ID: mmr-{6 hex chars} */
  private generateId(): string {
    const hex = crypto.randomBytes(3).toString('hex')
    return `mmr-${hex}`
  }

  /** Full path to a job directory */
  getJobDir(jobId: string): string {
    return path.join(this.jobsDir, jobId)
  }

  /** Create a new job with its directory structure and initial metadata */
  createJob(opts: CreateJobOpts): JobMetadata {
    const jobId = this.generateId()
    const jobDir = this.getJobDir(jobId)
    fs.mkdirSync(path.join(jobDir, 'channels'), { recursive: true })

    const channels: Record<string, ChannelJobEntry> = {}
    for (const ch of opts.channels) {
      this.validateChannelName(ch)
      channels[ch] = { status: 'dispatched', auth: 'ok' }
    }

    const metadata: JobMetadata = {
      job_id: jobId,
      status: 'dispatched',
      fix_threshold: opts.fix_threshold,
      format: opts.format,
      created_at: new Date().toISOString(),
      channels,
    }

    this.saveJob(jobId, metadata)
    return metadata
  }

  /** Write job metadata to job.json */
  saveJob(jobId: string, metadata: JobMetadata): void {
    const jobDir = this.getJobDir(jobId)
    fs.writeFileSync(path.join(jobDir, 'job.json'), JSON.stringify(metadata, null, 2))
  }

  /** Read job metadata from job.json, deriving channel state from per-channel status files */
  loadJob(jobId: string): JobMetadata {
    const jobDir = this.getJobDir(jobId)
    const raw = fs.readFileSync(path.join(jobDir, 'job.json'), 'utf-8')
    const metadata = JSON.parse(raw) as JobMetadata

    for (const channelName of Object.keys(metadata.channels)) {
      const statusPath = this.channelFilePath(jobId, channelName, `${channelName}.status.json`)
      try {
        const statusRaw = fs.readFileSync(statusPath, 'utf-8')
        const channelUpdate = JSON.parse(statusRaw) as Partial<ChannelJobEntry>
        metadata.channels[channelName] = { ...metadata.channels[channelName], ...channelUpdate }
      } catch (err: unknown) {
        // ENOENT (no status file) and SyntaxError (corrupted) fall through to initial values
        if (err instanceof Error) {
          const code = (err as NodeJS.ErrnoException).code
          if (code !== 'ENOENT' && code !== undefined) throw err
          if (code === undefined && err.name !== 'SyntaxError') throw err
        }
      }
    }

    metadata.status = this.deriveJobStatus(metadata.channels)
    return metadata
  }

  /** Save the assembled prompt text */
  savePrompt(jobId: string, prompt: string): void {
    fs.writeFileSync(path.join(this.getJobDir(jobId), 'prompt.txt'), prompt)
  }

  /** Load the assembled prompt text */
  loadPrompt(jobId: string): string {
    return fs.readFileSync(path.join(this.getJobDir(jobId), 'prompt.txt'), 'utf-8')
  }

  /** Save the diff content */
  saveDiff(jobId: string, diff: string): void {
    fs.writeFileSync(path.join(this.getJobDir(jobId), 'diff.patch'), diff)
  }

  /** Load the diff content */
  loadDiff(jobId: string): string {
    return fs.readFileSync(path.join(this.getJobDir(jobId), 'diff.patch'), 'utf-8')
  }

  /** Save parsed channel output as JSON */
  saveChannelOutput(jobId: string, channel: string, output: unknown): void {
    const filePath = this.channelFilePath(jobId, channel, `${channel}.json`)
    fs.writeFileSync(filePath, JSON.stringify(output, null, 2))
  }

  /** Load raw channel output string */
  loadChannelOutput(jobId: string, channel: string): string {
    const filePath = this.channelFilePath(jobId, channel, `${channel}.json`)
    return fs.readFileSync(filePath, 'utf-8')
  }

  /** Save raw channel log output */
  saveChannelLog(jobId: string, channel: string, log: string): void {
    const filePath = this.channelFilePath(jobId, channel, `${channel}.log`)
    fs.writeFileSync(filePath, log)
  }

  /** Update a channel entry by writing a per-channel status file atomically */
  updateChannel(jobId: string, channel: string, update: Partial<ChannelJobEntry>): void {
    const channelsDir = path.join(this.getJobDir(jobId), 'channels')
    fs.mkdirSync(channelsDir, { recursive: true })
    const channelStatusPath = this.channelFilePath(jobId, channel, `${channel}.status.json`)

    let existing: Partial<ChannelJobEntry> = {}
    try {
      const raw = fs.readFileSync(channelStatusPath, 'utf-8')
      existing = JSON.parse(raw)
    } catch (err: unknown) {
      if (err instanceof Error) {
        const code = (err as NodeJS.ErrnoException).code
        if (code !== 'ENOENT' && code !== undefined) throw err
        if (code === undefined && err.name !== 'SyntaxError') throw err
      }
    }

    const merged = { ...existing, ...update }
    const tmpPath = channelStatusPath + '.tmp'
    fs.writeFileSync(tmpPath, JSON.stringify(merged, null, 2))
    fs.renameSync(tmpPath, channelStatusPath)
  }

  /** Save reconciled results */
  saveResults(jobId: string, results: ReconciledResults): void {
    fs.writeFileSync(
      path.join(this.getJobDir(jobId), 'results.json'),
      JSON.stringify(results, null, 2),
    )
  }

  /** List all jobs sorted by creation time (newest first) */
  listJobs(): JobMetadata[] {
    if (!fs.existsSync(this.jobsDir)) return []

    const entries = fs.readdirSync(this.jobsDir, { withFileTypes: true })
    const jobs: JobMetadata[] = []

    for (const entry of entries) {
      if (!entry.isDirectory() || !entry.name.startsWith('mmr-')) continue
      const jobJsonPath = path.join(this.jobsDir, entry.name, 'job.json')
      if (!fs.existsSync(jobJsonPath)) continue
      try {
        jobs.push(this.loadJob(entry.name))
      } catch {
        // Skip malformed job directories
      }
    }

    jobs.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    return jobs
  }

  /** Delete jobs older than retentionDays, return count of pruned jobs */
  pruneJobs(retentionDays: number): number {
    const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000
    const jobs = this.listJobs()
    let pruned = 0

    for (const job of jobs) {
      if (new Date(job.created_at).getTime() < cutoff) {
        const jobDir = this.getJobDir(job.job_id)
        fs.rmSync(jobDir, { recursive: true })
        pruned++
      }
    }

    return pruned
  }

  /** Derive overall job status from channel statuses */
  private deriveJobStatus(channels: Record<string, ChannelJobEntry>): JobMetadata['status'] {
    const statuses = Object.values(channels).map((ch) => ch.status)
    const allTerminal = statuses.every((s) =>
      ['completed', 'failed', 'timeout', 'auth_failed', 'skipped'].includes(s),
    )
    if (allTerminal) return 'completed'
    const anyRunning = statuses.some((s) => s === 'running' || s === 'completed')
    if (anyRunning) return 'running'
    return 'dispatched'
  }
}

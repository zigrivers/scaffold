import fs from 'node:fs'
import type { ReworkSession, ReworkConfig, ReworkStep } from '../types/index.js'
import { atomicWriteFile, fileExists } from '../utils/fs.js'
import { StatePathResolver } from './state-path-resolver.js'

export class ReworkManager {
  private reworkPath: string

  constructor(projectRoot: string, service?: string) {
    const resolver = new StatePathResolver(projectRoot, service)
    this.reworkPath = resolver.reworkPath
  }

  hasSession(): boolean {
    return fileExists(this.reworkPath)
  }

  loadSession(): ReworkSession {
    if (!fileExists(this.reworkPath)) {
      throw Object.assign(new Error('No active rework session'), {
        code: 'REWORK_SESSION_MISSING',
        exitCode: 1,
        recovery: 'Run "scaffold rework" to create a new rework session',
      })
    }

    let raw: string
    try {
      raw = fs.readFileSync(this.reworkPath, 'utf8')
    } catch (err) {
      throw Object.assign(new Error(`Failed to read rework.json: ${(err as Error).message}`), {
        code: 'REWORK_PARSE_ERROR',
        exitCode: 3,
      })
    }

    try {
      return JSON.parse(raw) as ReworkSession
    } catch (err) {
      throw Object.assign(new Error(`Failed to parse rework.json: ${(err as Error).message}`), {
        code: 'REWORK_PARSE_ERROR',
        exitCode: 3,
      })
    }
  }

  createSession(config: ReworkConfig, steps: ReworkStep[]): ReworkSession {
    if (this.hasSession()) {
      throw Object.assign(new Error('A rework session already exists'), {
        code: 'REWORK_SESSION_EXISTS',
        exitCode: 1,
        recovery: 'Use --resume to continue or --clear to remove the existing session',
      })
    }

    const session: ReworkSession = {
      schema_version: 1,
      created: new Date().toISOString(),
      config,
      steps,
      current_step: null,
      stats: {
        total: steps.length,
        completed: 0,
        skipped: 0,
        failed: 0,
      },
    }

    this.saveSession(session)
    return session
  }

  advanceStep(stepName: string): void {
    const session = this.loadSession()
    const step = session.steps.find(s => s.name === stepName)
    if (!step) {
      throw Object.assign(new Error(`Step "${stepName}" not found in rework session`), {
        code: 'REWORK_STEP_NOT_FOUND',
        exitCode: 2,
      })
    }

    step.status = 'completed'
    step.completed_at = new Date().toISOString()
    session.stats.completed++
    if (session.current_step === stepName) {
      session.current_step = null
    }
    this.saveSession(session)
  }

  failStep(stepName: string, error: string): void {
    const session = this.loadSession()
    const step = session.steps.find(s => s.name === stepName)
    if (!step) {
      throw Object.assign(new Error(`Step "${stepName}" not found in rework session`), {
        code: 'REWORK_STEP_NOT_FOUND',
        exitCode: 2,
      })
    }

    step.status = 'failed'
    step.error = error
    session.stats.failed++
    if (session.current_step === stepName) {
      session.current_step = null
    }
    this.saveSession(session)
  }

  startStep(stepName: string): void {
    const session = this.loadSession()
    const step = session.steps.find(s => s.name === stepName)
    if (!step) {
      throw Object.assign(new Error(`Step "${stepName}" not found in rework session`), {
        code: 'REWORK_STEP_NOT_FOUND',
        exitCode: 2,
      })
    }

    step.status = 'in_progress'
    session.current_step = stepName
    this.saveSession(session)
  }

  nextStep(): ReworkStep | null {
    const session = this.loadSession()
    return session.steps.find(s => s.status === 'pending') ?? null
  }

  clearSession(): void {
    if (fileExists(this.reworkPath)) {
      fs.unlinkSync(this.reworkPath)
    }
  }

  private saveSession(session: ReworkSession): void {
    atomicWriteFile(this.reworkPath, JSON.stringify(session, null, 2))
  }
}

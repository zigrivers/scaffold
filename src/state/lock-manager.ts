// src/state/lock-manager.ts

import type { LockFile, LockableCommand } from '../types/index.js'
import type { ScaffoldError, ScaffoldWarning } from '../types/index.js'
import { ensureDir } from '../utils/fs.js'
import { lockHeld, lockWriteFailed, lockStaleCleared } from '../utils/errors.js'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { execSync } from 'node:child_process'

function lockPath(projectRoot: string): string {
  return path.join(projectRoot, '.scaffold', 'lock.json')
}

function lockAcquisitionRace(filePath: string): ScaffoldError {
  return {
    code: 'LOCK_ACQUISITION_RACE',
    message: 'Lock acquisition race detected — another process acquired the lock concurrently',
    exitCode: 5,
    context: { file: filePath },
  }
}

function getProcessStartTime(pid: number): Date | null {
  try {
    const output = execSync(`ps -o lstart= -p ${pid}`, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    const trimmed = output.trim()
    if (!trimmed) return null
    const date = new Date(trimmed)
    return isNaN(date.getTime()) ? null : date
  } catch {
    return null
  }
}

/** Check whether a lock is stale (holder process no longer running). */
export function isStale(lock: LockFile): boolean {
  try {
    process.kill(lock.pid, 0) // signal 0 = check liveness only
    // PID is alive — check if it's been recycled
    const actualStartTime = getProcessStartTime(lock.pid)
    if (actualStartTime === null) return true // can't read start time = assume stale
    // Compare: if actual start differs by >2s from recorded, PID was recycled
    const recorded = new Date(lock.processStartedAt).getTime()
    const actual = actualStartTime.getTime()
    return Math.abs(actual - recorded) > 2000
  } catch {
    // ESRCH = no such process = stale
    return true
  }
}

/** Read lock file if exists; return null if absent or corrupt. */
export function checkLock(projectRoot: string): LockFile | null {
  const filePath = lockPath(projectRoot)
  if (!fs.existsSync(filePath)) return null
  try {
    const raw = fs.readFileSync(filePath, 'utf8')
    return JSON.parse(raw) as LockFile
  } catch {
    // Auto-delete corrupt lock file
    try { fs.unlinkSync(filePath) } catch { /* ignore */ }
    return null
  }
}

/**
 * Attempt to acquire .scaffold/lock.json advisory lock.
 * Returns acquired: false with warning on contention, or error on other failure.
 */
export function acquireLock(
  projectRoot: string,
  command: LockableCommand,
  step?: string,
): { acquired: boolean; warning?: ScaffoldWarning; error?: ScaffoldError } {
  ensureDir(path.join(projectRoot, '.scaffold'))

  const filePath = lockPath(projectRoot)
  let staleClearedWarning: ScaffoldWarning | undefined

  // Check for existing lock
  const existing = checkLock(projectRoot)
  if (existing !== null) {
    if (isStale(existing)) {
      // Auto-clear stale lock
      try { fs.unlinkSync(filePath) } catch { /* ignore if already gone */ }
      staleClearedWarning = lockStaleCleared(existing.holder, existing.pid)
    } else {
      // Active lock held by another process
      return { acquired: false, error: lockHeld(existing.holder, existing.pid, existing.command) }
    }
  }

  // Build lock data
  const lockData: LockFile = {
    holder: os.hostname(),
    prompt: step,
    pid: process.pid,
    started: new Date().toISOString(),
    processStartedAt: getProcessStartTime(process.pid)?.toISOString() ?? new Date().toISOString(),
    command,
  }

  // Atomically create lock file using exclusive open (O_CREAT | O_EXCL)
  try {
    const fd = fs.openSync(filePath, 'wx')
    fs.writeSync(fd, JSON.stringify(lockData, null, 2))
    fs.closeSync(fd)
    return { acquired: true, warning: staleClearedWarning }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'EEXIST') {
      return { acquired: false, error: lockAcquisitionRace(filePath) }
    }
    return { acquired: false, error: lockWriteFailed(filePath, (err as Error).message) }
  }
}

/** Release lock by deleting .scaffold/lock.json (only if current process holds it). */
export function releaseLock(projectRoot: string): void {
  const lock = checkLock(projectRoot)
  if (lock === null) return // no lock — no-op

  if (lock.pid === process.pid) {
    try { fs.unlinkSync(lockPath(projectRoot)) } catch { /* ignore if already gone */ }
  } else {
    // Different PID owns this lock — do not delete
    console.warn(
      `[scaffold] Warning: attempted to release lock owned by PID ${lock.pid} (current PID: ${process.pid})`,
    )
  }
}

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { describe, it, expect, afterEach, vi } from 'vitest'
import { appendDecision, readDecisions } from './decision-logger.js'

const tmpDirs: string[] = []

function makeTempDir(): string {
  const dir = path.join(os.tmpdir(), `scaffold-dl-test-${crypto.randomUUID()}`)
  fs.mkdirSync(dir, { recursive: true })
  tmpDirs.push(dir)
  return dir
}

afterEach(() => {
  for (const d of tmpDirs) {
    try { fs.rmSync(d, { recursive: true, force: true }) } catch { /* ignore */ }
  }
  tmpDirs.length = 0
  vi.restoreAllMocks()
})

const baseEntry = {
  prompt: 'create-prd',
  decision: 'Use PostgreSQL',
  at: '2024-01-01T00:00:00Z',
  completed_by: 'user',
  step_completed: true,
}

describe('appendDecision', () => {
  it('appends one JSONL line to decisions.jsonl', () => {
    const dir = makeTempDir()
    appendDecision(dir, baseEntry)

    const decisionsPath = path.join(dir, '.scaffold', 'decisions.jsonl')
    expect(fs.existsSync(decisionsPath)).toBe(true)
    const content = fs.readFileSync(decisionsPath, 'utf8')
    expect(content.trim()).not.toBe('')
  })

  it('each line is valid JSON parseable independently', () => {
    const dir = makeTempDir()
    appendDecision(dir, baseEntry)
    appendDecision(dir, { ...baseEntry, prompt: 'system-architecture', decision: 'Microservices' })

    const decisionsPath = path.join(dir, '.scaffold', 'decisions.jsonl')
    const lines = fs.readFileSync(decisionsPath, 'utf8').split('\n').filter(l => l.trim() !== '')
    expect(lines).toHaveLength(2)
    for (const line of lines) {
      expect(() => JSON.parse(line)).not.toThrow()
    }
  })

  it('ID format is D-NNN (monotonically increasing)', () => {
    const dir = makeTempDir()
    appendDecision(dir, baseEntry)
    appendDecision(dir, { ...baseEntry, decision: 'Second' })
    appendDecision(dir, { ...baseEntry, decision: 'Third' })

    const entries = readDecisions(dir)
    expect(entries[0].id).toBe('D-001')
    expect(entries[1].id).toBe('D-002')
    expect(entries[2].id).toBe('D-003')
  })

  it('returns the assigned ID string', () => {
    const dir = makeTempDir()
    const id1 = appendDecision(dir, baseEntry)
    expect(id1).toBe('D-001')
    const id2 = appendDecision(dir, { ...baseEntry, decision: 'Another' })
    expect(id2).toBe('D-002')
  })

  it('creates decisions.jsonl if it does not exist', () => {
    const dir = makeTempDir()
    const decisionsPath = path.join(dir, '.scaffold', 'decisions.jsonl')
    expect(fs.existsSync(decisionsPath)).toBe(false)

    appendDecision(dir, baseEntry)
    expect(fs.existsSync(decisionsPath)).toBe(true)
  })

  it('second entry gets D-002, third gets D-003', () => {
    const dir = makeTempDir()
    const id1 = appendDecision(dir, baseEntry)
    const id2 = appendDecision(dir, { ...baseEntry, decision: 'Second' })
    const id3 = appendDecision(dir, { ...baseEntry, decision: 'Third' })

    expect(id1).toBe('D-001')
    expect(id2).toBe('D-002')
    expect(id3).toBe('D-003')
  })

  it('serializes optional fields (category, tags, review_status, depth) when provided', () => {
    const dir = makeTempDir()
    appendDecision(dir, {
      ...baseEntry,
      category: 'database',
      tags: ['infra', 'storage'],
      review_status: 'pending',
      depth: 3,
    })

    const entries = readDecisions(dir)
    expect(entries[0].category).toBe('database')
    expect(entries[0].tags).toEqual(['infra', 'storage'])
    expect(entries[0].review_status).toBe('pending')
    expect(entries[0].depth).toBe(3)
  })
})

describe('readDecisions', () => {
  it('returns all entries parsed from JSONL', () => {
    const dir = makeTempDir()
    appendDecision(dir, baseEntry)
    appendDecision(dir, { ...baseEntry, prompt: 'system-architecture', decision: 'Microservices' })

    const entries = readDecisions(dir)
    expect(entries).toHaveLength(2)
    expect(entries[0].decision).toBe('Use PostgreSQL')
    expect(entries[1].decision).toBe('Microservices')
  })

  it('filters by step slug', () => {
    const dir = makeTempDir()
    appendDecision(dir, { ...baseEntry, prompt: 'create-prd', decision: 'PRD decision' })
    appendDecision(dir, { ...baseEntry, prompt: 'system-architecture', decision: 'Arch decision' })
    appendDecision(dir, { ...baseEntry, prompt: 'create-prd', decision: 'Another PRD decision' })

    const entries = readDecisions(dir, { step: 'create-prd' })
    expect(entries).toHaveLength(2)
    expect(entries.every(e => e.prompt === 'create-prd')).toBe(true)
  })

  it('returns last N entries', () => {
    const dir = makeTempDir()
    appendDecision(dir, { ...baseEntry, decision: 'First' })
    appendDecision(dir, { ...baseEntry, decision: 'Second' })
    appendDecision(dir, { ...baseEntry, decision: 'Third' })

    const entries = readDecisions(dir, { last: 2 })
    expect(entries).toHaveLength(2)
    expect(entries[0].decision).toBe('Second')
    expect(entries[1].decision).toBe('Third')
  })

  it('returns empty array when file does not exist', () => {
    const dir = makeTempDir()
    const entries = readDecisions(dir)
    expect(entries).toEqual([])
  })

  it('tolerates blank lines in JSONL file', () => {
    const dir = makeTempDir()
    const scaffoldDir = path.join(dir, '.scaffold')
    fs.mkdirSync(scaffoldDir, { recursive: true })
    const decisionsPath = path.join(scaffoldDir, 'decisions.jsonl')
    const e1 = {
      id: 'D-001', prompt: 'create-prd', decision: 'Use PostgreSQL',
      at: '2024-01-01T00:00:00Z', completed_by: 'user', step_completed: true,
    }
    const e2 = {
      id: 'D-002', prompt: 'create-prd', decision: 'Second',
      at: '2024-01-02T00:00:00Z', completed_by: 'user', step_completed: false,
    }
    const line1 = JSON.stringify(e1)
    const line2 = JSON.stringify(e2)
    fs.writeFileSync(decisionsPath, `${line1}\n\n${line2}\n`, 'utf8')

    const entries = readDecisions(dir)
    expect(entries).toHaveLength(2)
  })

  it('handles corrupt lines gracefully (skips them)', () => {
    const dir = makeTempDir()
    const scaffoldDir = path.join(dir, '.scaffold')
    fs.mkdirSync(scaffoldDir, { recursive: true })
    const decisionsPath = path.join(scaffoldDir, 'decisions.jsonl')
    const e1 = {
      id: 'D-001', prompt: 'create-prd', decision: 'Good',
      at: '2024-01-01T00:00:00Z', completed_by: 'user', step_completed: true,
    }
    const goodLine = JSON.stringify(e1)
    fs.writeFileSync(decisionsPath, `${goodLine}\nnot-valid-json\n`, 'utf8')

    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const entries = readDecisions(dir)
    expect(entries).toHaveLength(1)
    expect(entries[0].decision).toBe('Good')
    consoleSpy.mockRestore()
  })

  it('combines step filter and last N', () => {
    const dir = makeTempDir()
    appendDecision(dir, { ...baseEntry, prompt: 'create-prd', decision: 'PRD 1' })
    appendDecision(dir, { ...baseEntry, prompt: 'system-architecture', decision: 'Arch 1' })
    appendDecision(dir, { ...baseEntry, prompt: 'create-prd', decision: 'PRD 2' })
    appendDecision(dir, { ...baseEntry, prompt: 'create-prd', decision: 'PRD 3' })

    const entries = readDecisions(dir, { step: 'create-prd', last: 2 })
    expect(entries).toHaveLength(2)
    expect(entries[0].decision).toBe('PRD 2')
    expect(entries[1].decision).toBe('PRD 3')
  })
})

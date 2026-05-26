import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { describe, it, expect, afterEach } from 'vitest'
import { scanLessonsForGaps, normalizeTopic } from './lens-i-lessons-scanner.js'

const tmpFiles: string[] = []

function writeTmp(content: string): string {
  const p = path.join(os.tmpdir(), `lessons-test-${crypto.randomUUID()}.md`)
  fs.writeFileSync(p, content, 'utf8')
  tmpFiles.push(p)
  return p
}

afterEach(() => {
  while (tmpFiles.length > 0) {
    const f = tmpFiles.pop()!
    try { fs.unlinkSync(f) } catch { /* ignore */ }
  }
})

describe('scanLessonsForGaps', () => {
  it('returns [] when the file does not exist', () => {
    const nonexistent = path.join(os.tmpdir(), `does-not-exist-${crypto.randomUUID()}.md`)
    expect(scanLessonsForGaps(nonexistent)).toEqual([])
  })

  it('returns [] when the file is empty', () => {
    const p = writeTmp('')
    expect(scanLessonsForGaps(p)).toEqual([])
  })

  it('extracts an explicit <!-- gap-topic: slug --> marker verbatim', () => {
    const p = writeTmp('## Lesson\n\n<!-- gap-topic: agent-eval-harnesses -->\n\nbody\n')
    const signals = scanLessonsForGaps(p)
    expect(signals).toHaveLength(1)
    expect(signals[0].topic).toBe('agent-eval-harnesses')
    expect(signals[0].source).toBe('lessons')
    expect(signals[0].project_id).toBe('lessons')
  })

  it('extracts a "would have helped" heuristic match', () => {
    const p = writeTmp('## Lesson\n\nWould have helped to have a guide on "agent eval harnesses".\n')
    const signals = scanLessonsForGaps(p)
    expect(signals).toHaveLength(1)
    expect(signals[0].topic).toBe('agent-eval-harnesses')
  })

  it('extracts a "no knowledge entry for" heuristic match', () => {
    const p = writeTmp('No knowledge entry for "retry-with-jitter".\n')
    const signals = scanLessonsForGaps(p)
    expect(signals).toHaveLength(1)
    expect(signals[0].topic).toBe('retry-with-jitter')
  })

  it('extracts a "missing knowledge:" heuristic match', () => {
    const p = writeTmp('Missing knowledge: `circuit-breaker-patterns`.\n')
    const signals = scanLessonsForGaps(p)
    expect(signals).toHaveLength(1)
    expect(signals[0].topic).toBe('circuit-breaker-patterns')
  })

  it('matches sentences ending in ! or ?', () => {
    const p = writeTmp([
      'Would have helped to have a guide on agent eval harnesses!',
      'No knowledge entry for retry-with-jitter?',
    ].join('\n'))
    const signals = scanLessonsForGaps(p)
    const topics = signals.map(s => s.topic).sort()
    expect(topics).toContain('agent-eval-harnesses')
    expect(topics).toContain('retry-with-jitter')
  })

  it('strips apostrophes via normalizeTopic (smart and ASCII)', () => {
    const p = writeTmp([
      'Would have helped to have a guide on "agent’s eval harnesses".',
      'No knowledge entry for "agent\'s eval harnesses".',
    ].join('\n'))
    const signals = scanLessonsForGaps(p)
    for (const s of signals) {
      expect(s.topic).toBe('agents-eval-harnesses')
    }
  })

  it('normalizes punctuation to validator-compatible kebab slug (direct normalizeTopic test)', () => {
    // Direct test of normalizeTopic — covers cases that are independent
    // of the heuristic capture path.
    expect(normalizeTopic('react-19.0')).toBe('react-19-0')
    expect(normalizeTopic('agent eval?')).toBe('agent-eval')
    expect(normalizeTopic('Foo_Bar')).toBe('foo-bar')
  })

  it('captures version-numbered topics through the heuristic path without truncating', () => {
    // The closing class uses [.!?](?=\s|$) so an internal dot followed
    // by a digit (like "react-19.0") survives the capture; only the
    // sentence-terminating dot ends the match.
    const p = writeTmp('No knowledge entry for "react-19.0".\n')
    const signals = scanLessonsForGaps(p)
    expect(signals).toHaveLength(1)
    expect(signals[0].topic).toBe('react-19-0')
  })

  it('produces multiple signals when the same topic appears on different lines', () => {
    const p = writeTmp([
      '<!-- gap-topic: foo-bar -->',
      'No knowledge entry for "foo-bar".',
    ].join('\n'))
    const signals = scanLessonsForGaps(p)
    expect(signals).toHaveLength(2)
    expect(signals.every(s => s.topic === 'foo-bar')).toBe(true)
  })

  it('does NOT extract topic mentions from inside a fenced code block', () => {
    const p = writeTmp([
      '## Lesson',
      '',
      'Real prose: would have helped to have a guide on "real-topic".',
      '',
      '```bash',
      '# this is a code example, NOT a real lesson',
      '# no knowledge entry for "fake-topic-in-code"',
      '```',
      '',
      'More prose.',
    ].join('\n'))
    const signals = scanLessonsForGaps(p)
    const topics = signals.map(s => s.topic)
    expect(topics).toContain('real-topic')
    expect(topics).not.toContain('fake-topic-in-code')
  })

  it('handles multiple fenced blocks (toggle in/out works)', () => {
    const p = writeTmp([
      'No knowledge entry for "first-topic".',
      '```',
      'No knowledge entry for "ignored-1"',
      '```',
      'No knowledge entry for "second-topic".',
      '```bash',
      'No knowledge entry for "ignored-2"',
      '```',
      'No knowledge entry for "third-topic".',
    ].join('\n'))
    const signals = scanLessonsForGaps(p)
    const topics = signals.map(s => s.topic).sort()
    expect(topics).toEqual(['first-topic', 'second-topic', 'third-topic'])
  })

  it('caps agent_excerpt to 200 chars', () => {
    const longSuffix = 'x'.repeat(300)
    const p = writeTmp(`No knowledge entry for "long-topic". ${longSuffix}.\n`)
    const signals = scanLessonsForGaps(p)
    expect(signals[0].agent_excerpt!.length).toBeLessThanOrEqual(200)
  })

  it('handles Windows CRLF line endings without crashing', () => {
    const p = writeTmp('<!-- gap-topic: crlf-topic -->\r\nbody\r\n')
    const signals = scanLessonsForGaps(p)
    expect(signals[0].topic).toBe('crlf-topic')
  })

  it('drops topics exceeding the 80-char validator limit (heuristic)', () => {
    // A runaway capture would violate the canonical
    // KnowledgeGapSignalPayload contract; the scanner enforces the
    // ≤80-char kebab-slug rule locally before emitting.
    const longish = 'a'.repeat(90)
    const p = writeTmp(`No knowledge entry for "${longish}".\n`)
    const signals = scanLessonsForGaps(p)
    expect(signals).toEqual([])
  })

  it('drops explicit markers whose slug exceeds 80 chars', () => {
    const longSlug = 'a'.repeat(81)
    const p = writeTmp(`<!-- gap-topic: ${longSlug} -->\n`)
    const signals = scanLessonsForGaps(p)
    expect(signals).toEqual([])
  })
})

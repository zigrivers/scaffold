import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import yaml from 'js-yaml'
import type { Decision } from '../types.js'

interface RawDecision {
  key: string
  summary: string
  affects?: string[]
  superseded_by?: string
  recorded_at?: string
}

function toDecision(raw: RawDecision, sourceAnchor: string): Decision {
  return {
    id: `decision:${raw.key}`,
    key: raw.key,
    summary: raw.summary,
    affects: raw.affects ?? [],
    superseded_by: raw.superseded_by ? `decision:${raw.superseded_by}` : undefined,
    source_anchor: sourceAnchor,
    recorded_at: raw.recorded_at ?? new Date(0).toISOString(),
  }
}

function parseFrontmatter(text: string): RawDecision | null {
  const m = text.match(/^---\n([\s\S]*?)\n---/)
  if (!m) return null
  try {
    const parsed = yaml.load(m[1]) as RawDecision
    if (!parsed || typeof parsed.key !== 'string' || typeof parsed.summary !== 'string') return null
    return parsed
  } catch {
    return null
  }
}

export async function parseDecisions(cwd: string): Promise<Decision[]> {
  const out: Decision[] = []

  const jsonlPath = join(cwd, 'decisions.jsonl')
  if (existsSync(jsonlPath)) {
    for (const line of readFileSync(jsonlPath, 'utf8').split('\n')) {
      if (!line.trim()) continue
      try {
        const raw = JSON.parse(line) as RawDecision
        if (typeof raw.key === 'string' && typeof raw.summary === 'string') {
          out.push(toDecision(raw, 'decisions.jsonl'))
        }
      } catch {
        // skip malformed lines
      }
    }
  }

  const decisionsDir = join(cwd, 'docs', 'decisions')
  if (existsSync(decisionsDir)) {
    for (const file of readdirSync(decisionsDir)) {
      if (!file.endsWith('.md')) continue
      const text = readFileSync(join(decisionsDir, file), 'utf8')
      const fm = parseFrontmatter(text)
      if (fm) out.push(toDecision(fm, `docs/decisions/${file}`))
    }
  }

  return out
}

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { minimatch } from 'minimatch'
import type { Finding, Rule, Severity } from '../engine/types.js'
import type { LensFn } from '../engine/checks/runner.js'
import { loadObservabilityConfig } from '../engine/checks/observability-config.js'

const lensId = 'C-standards'
const DEFAULT_ESCALATION_THRESHOLD = 5

function makeFindingId(parts: string[]): string {
  return createHash('sha256').update(parts.join('::')).digest('hex').slice(0, 16)
}

interface RuleViolation { rule: Rule; file: string; lineStart: number; lineEnd: number }

function findPatternViolations(rule: Rule, file: string, content: string): RuleViolation[] {
  const out: RuleViolation[] = []
  if (rule.pattern) {
    let re: RegExp
    try { re = new RegExp(rule.pattern, 'g') } catch { return out }
    const lines = content.split('\n')
    for (let i = 0; i < lines.length; i++) {
      if (re.test(lines[i])) {
        out.push({ rule, file, lineStart: i + 1, lineEnd: i + 1 })
        re.lastIndex = 0
      }
    }
  }
  if (rule.forbidden) {
    const lines = content.split('\n')
    for (const sym of rule.forbidden) {
      const escaped = sym.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+')
      const symRe = new RegExp(`\\b${escaped}\\b`)
      for (let i = 0; i < lines.length; i++) {
        if (symRe.test(lines[i])) out.push({ rule, file, lineStart: i + 1, lineEnd: i + 1 })
      }
    }
  }
  return out
}

function severityFor(rule: Rule, totalCount: number, escalationThreshold: number, override?: Severity): Severity {
  if (override) return override
  const VALID: Severity[] = ['P0', 'P1', 'P2', 'P3']
  if (rule.severity && (VALID as string[]).includes(rule.severity)) return rule.severity as Severity
  if (totalCount > escalationThreshold) return 'P1'
  return 'P2'
}

export const lensCStandards: LensFn = async (graph) => {
  const findings: Finding[] = []
  const now = new Date().toISOString()
  const cwd = graph.cwd
  const config = loadObservabilityConfig(cwd)
  const overrides = config.lenses['C-standards']?.rule_overrides ?? {}
  const escalationThreshold = config.lenses['C-standards']?.escalation_threshold ?? DEFAULT_ESCALATION_THRESHOLD

  const fileContents = new Map<string, string>()
  for (const f of graph.files) {
    try { fileContents.set(f.path, readFileSync(join(cwd, f.path), 'utf8')) } catch { /* skip unreadable */ }
  }

  const violationsByRule = new Map<string, RuleViolation[]>()
  for (const rule of graph.rules) {
    const matches = (file: string) => !rule.match || minimatch(file, rule.match)
    for (const f of graph.files) {
      if (!matches(f.path)) continue
      const content = fileContents.get(f.path)
      if (content === undefined) continue
      const vs = findPatternViolations(rule, f.path, content)
      if (vs.length === 0) continue
      const list = violationsByRule.get(rule.id) ?? []
      list.push(...vs)
      violationsByRule.set(rule.id, list)
    }
  }

  for (const [ruleId, vs] of violationsByRule) {
    const rule = graph.rules.find((r) => r.id === ruleId)
    if (!rule) continue
    const ruleKey = rule.id.replace(/^rule:/, '')
    const override = overrides[ruleKey] as Severity | undefined
    const severity = severityFor(rule, vs.length, escalationThreshold, override)
    for (const v of vs) {
      findings.push({
        id: makeFindingId([lensId, ruleId, v.file, String(v.lineStart)]),
        lens_id: lensId, severity,
        title: `${rule.description ?? ruleId} (${v.file}:${v.lineStart})`,
        description: `Rule ${ruleId} violated at ${v.file}:${v.lineStart}.`,
        source_doc: 'docs/coding-standards.md',
        evidence: { kind: 'rule_violation', rule_id: ruleId, file: `file:${v.file}`, lines: [v.lineStart, v.lineEnd] },
        confidence: 'high', first_seen: now, last_seen: now, status: 'open',
        fix_hint: { kind: 'edit_doc', target: v.file, prompt: `Address rule ${ruleId} at ${v.file}:${v.lineStart}.` },
      })
    }
  }

  return findings
}

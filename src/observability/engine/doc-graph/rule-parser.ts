import type { Rule } from '../types.js'
import { parseMarkdown, headingsAtDepth, sectionRawText, slugify } from './parse-markdown.js'

const VALID_SEVERITY = ['P0', 'P1', 'P2', 'P3'] as const
const VALID_ENFORCE = ['linter', 'engine', 'llm'] as const

function parseRuleSection(body: string): Partial<Omit<Rule, 'id' | 'source_anchor'>> {
  const out: Partial<Omit<Rule, 'id' | 'source_anchor'>> = {}
  const descMatch = body.match(/^Description:\s*(.+?)(?=\n|$)/im)
  if (descMatch) out.description = descMatch[1].trim()

  const fieldRe = /^\s*([a-z][\w-]*)\s*:\s*(.+?)\s*$/gim
  let m: RegExpExecArray | null
  while ((m = fieldRe.exec(body)) !== null) {
    const key = m[1].replace(/-/g, '_').toLowerCase()
    const raw = m[2].trim()
    switch (key) {
    case 'pattern': out.pattern = raw; break
    case 'forbidden': out.forbidden = raw.split(',').map((s) => s.trim()).filter(Boolean); break
    case 'match': out.match = raw; break
    case 'language': out.language = raw; break
    case 'severity':
      if ((VALID_SEVERITY as readonly string[]).includes(raw)) out.severity = raw as Rule['severity']
      break
    case 'enforce_via':
      if ((VALID_ENFORCE as readonly string[]).includes(raw)) out.enforce_via = raw as Rule['enforce_via']
      break
    }
  }
  return out
}

export function parseRules(md: string, sourcePath: string): Rule[] {
  const root = parseMarkdown(md)
  const rules: Rule[] = []

  for (const depth of [2, 3] as const) {
    for (const head of headingsAtDepth(root, depth)) {
      const m = head.textContent.match(/^Rule:\s*(.+?)\s*$/i)
      if (!m) continue
      const id = `rule:${slugify(m[1])}`
      const body = sectionRawText(root, head)
      const parsed = parseRuleSection(body)
      rules.push({
        id,
        description: parsed.description ?? m[1],
        pattern: parsed.pattern,
        forbidden: parsed.forbidden,
        match: parsed.match,
        language: parsed.language,
        severity: parsed.severity,
        enforce_via: parsed.enforce_via,
        source_anchor: `${sourcePath}#${slugify(m[1])}`,
      })
    }
  }
  return rules
}

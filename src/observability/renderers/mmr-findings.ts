import type { EngineOutput, Finding } from '../engine/types.js'
import { redactRendered } from '../engine/redact.js'

export interface MmrFindingShape {
  severity: 'P0' | 'P1' | 'P2' | 'P3'
  location: string
  description: string
  suggestion: string
  category: string
}

function findingToMmr(f: Finding): MmrFindingShape {
  const shortId = f.id.slice(0, 8)
  const location = `${f.source_doc || '(no-source-doc)'}::${f.lens_id}::${shortId}`
  const description = `[doc-conformance/${f.lens_id}] ${f.title}${f.description ? ` — ${f.description}` : ''}`
  const suggestion = f.fix_hint?.prompt ?? f.fix_hint?.target ?? ''
  return {
    severity: f.severity,
    location,
    description,
    suggestion,
    category: 'doc-conformance',
  }
}

export function renderMmrFindings(out: EngineOutput): string {
  const findings = out.findings
    .filter((f) => f.status !== 'skipped')
    .map(findingToMmr)
  return redactRendered(JSON.stringify(findings))
}

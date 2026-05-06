import { createHash } from 'node:crypto'
import { minimatch } from 'minimatch'
import type { Finding, Event } from '../engine/types.js'
import type { LensFn } from '../engine/checks/runner.js'
import { loadObservabilityConfig } from '../engine/checks/observability-config.js'

const lensId = 'D-stack'

function makeFindingId(parts: string[]): string {
  return createHash('sha256').update(parts.join('::')).digest('hex').slice(0, 16)
}

const DEFAULT_PATH_TO_LAYER: Array<{ glob: string; layer: string }> = [
  { glob: 'src/api/**',        layer: 'backend'  },
  { glob: 'src/server/**',     layer: 'backend'  },
  { glob: 'src/components/**', layer: 'frontend' },
  { glob: 'src/pages/**',      layer: 'frontend' },
  { glob: 'src/styles/**',     layer: 'frontend' },
  { glob: 'src/db/**',         layer: 'data'     },
  { glob: 'src/migrations/**', layer: 'data'     },
]

function fileLayer(path: string, pathToLayer: Array<{ glob: string; layer: string }>): string | null {
  for (const { glob, layer } of pathToLayer) {
    if (minimatch(path, glob)) return layer
  }
  return null
}

function decisionsCoverPath(events: Event[], filePath: string, specifier: string): boolean {
  for (const e of events) {
    if (e.type !== 'decision_recorded') continue
    const raw = (e.payload as { affects?: unknown }).affects
    const affects = Array.isArray(raw) ? raw.filter((g): g is string => typeof g === 'string') : []
    if (!affects.some((g) => minimatch(filePath, g))) continue
    // If decision names specific packages, require the specifier to appear there.
    const pkgs = (e.payload as { packages?: unknown }).packages
    if (Array.isArray(pkgs)) {
      if ((pkgs as unknown[]).some((p) => p === specifier)) return true
      continue
    }
    return true
  }
  return false
}

export const lensDStack: LensFn = async (graph, ledger) => {
  const findings: Finding[] = []
  const now = new Date().toISOString()
  const config = loadObservabilityConfig(graph.cwd)
  const pathToLayer = config.lenses['D-stack']?.path_to_layer ?? DEFAULT_PATH_TO_LAYER

  // (a) unsanctioned dependency without a recorded decision
  for (const edge of graph.edges) {
    if (edge.kind !== 'file_to_component_use') continue
    const to = (edge as { kind: string; from: string; to: string }).to
    if (!to.startsWith('unsanctioned')) continue
    const from = (edge as { kind: string; from: string; to: string }).from
    const specifier = to.includes(':') ? to.split(':').slice(1).join(':') : ''
    const filePath = from.replace(/^file:/, '')
    if (decisionsCoverPath(ledger.events, filePath, specifier)) continue
    findings.push({
      id: makeFindingId([lensId, 'unsanctioned', from]),
      lens_id: lensId, severity: 'P0',
      title: `unsanctioned dependency: ${filePath}`,
      description: `${filePath} imports an unsanctioned package. Record a decision or remove the import.`,
      source_doc: 'docs/tech-stack.md',
      evidence: { kind: 'rule_violation', rule_id: 'tech-stack-unsanctioned', file: from },
      confidence: 'high', first_seen: now, last_seen: now, status: 'open',
      fix_hint: { kind: 'record_decision', target: 'decisions.jsonl', prompt: `Record a decision for the unsanctioned dependency in ${filePath}.` },
    })
  }

  // (b) sanctioned component used outside its declared layer (path-heuristic)
  for (const edge of graph.edges) {
    if (edge.kind !== 'file_to_component_use') continue
    const to = (edge as { kind: string; from: string; to: string }).to
    if (!to.startsWith('component:')) continue
    const from = (edge as { kind: string; from: string; to: string }).from
    const filePath = from.replace(/^file:/, '')
    const component = graph.components.find((c) => c.id === to)
    if (!component?.layer) continue
    const inferredLayer = fileLayer(filePath, pathToLayer)
    if (!inferredLayer || inferredLayer === component.layer) continue
    findings.push({
      id: makeFindingId([lensId, 'layer', from, to]),
      lens_id: lensId, severity: 'P1',
      title: `component used outside its layer: ${component.id} in ${filePath}`,
      description: `${component.id} is declared in layer "${component.layer}" but is used from ${filePath} (inferred layer "${inferredLayer}").`,
      source_doc: 'docs/tech-stack.md',
      evidence: { kind: 'rule_violation', rule_id: 'tech-stack-layer', file: from },
      confidence: 'medium', first_seen: now, last_seen: now, status: 'open',
    })
  }

  return findings
}

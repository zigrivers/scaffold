import type { Event, Finding, AvailabilityMap, AdapterId, DocGraph } from '../types.js'
import type { LensManifest } from './registry.js'
import type { KnowledgeRootAttempt } from '../../knowledge-index.js'

export interface LensContext {
  profile: 'fast' | 'full'
  cwd: string
  /** Validated absolute path to a content/knowledge/ directory whose
   *  entry slugs are used to suppress Lens I findings. Undefined when
   *  no path was resolved (or when a caller bypassed runAudit). Lens I
   *  treats undefined/null as "no suppression". */
  knowledgeRoot?: string | null
  /** Pre-loaded index Set, populated by resolveKnowledgeRoot during
   *  validation. Lens I reads this directly — does NOT call
   *  loadKnowledgeIndex itself. */
  knowledgeIndex?: Set<string> | null
  /** Audit trail of which knowledge-root tiers were tried. Lens I
   *  uses this to compose a precise warn-once message when
   *  knowledgeRoot is null. Defaults to empty when undefined. */
  knowledgeRootAttempts?: KnowledgeRootAttempt[]
  /** Per-audit-run Set passed to emitOnceForAudit for deduplicating
   *  warnings. Fresh Set per runAudit invocation. */
  warnedKeys?: Set<string>
}

export type LensFn = (
  graph: DocGraph,
  ledger: { events: Event[] },
  availability: AvailabilityMap,
  upstreamFindings: Finding[],
  enabledIds: Set<string>,
  context?: LensContext,
) => Promise<Finding[]>

export interface RunChecksInput {
  registry: LensManifest[]
  lenses: Record<string, LensFn>
  graph: DocGraph
  ledger: { events: Event[] }
  availability: AvailabilityMap
  profile: 'fast' | 'full'
  cwd?: string
  enabledIds?: Set<string>
  /** Optional pre-computed knowledge-root resolution. When provided
   *  the runner threads root/index/attempts into every LensContext.
   *  runAudit populates this; tests that bypass runAudit can leave
   *  it undefined (the lens treats that as "no suppression"). */
  knowledgeRootResolution?: {
    root: string | null
    index: Set<string> | null
    attempts: KnowledgeRootAttempt[]
  }
  /** Optional caller-provided warn-once Set. runAudit creates a fresh
   *  one per invocation; tests bypassing runAudit may leave it
   *  undefined (runChecks then creates an empty Set per call). */
  warnedKeys?: Set<string>
}

function topoSort(registry: LensManifest[]): LensManifest[] {
  const byId = new Map(registry.map((m) => [m.id, m]))
  const out: LensManifest[] = []
  const visited = new Set<string>()
  const visiting = new Set<string>()

  function visit(id: string, path: string[]): void {
    if (visited.has(id)) return
    if (visiting.has(id)) {
      throw new Error(`lens dependency cycle: ${[...path, id].join(' -> ')}`)
    }
    const m = byId.get(id)
    if (!m) return
    visiting.add(id)
    for (const dep of m.depends_on ?? []) visit(dep, [...path, id])
    visiting.delete(id)
    visited.add(id)
    out.push(m)
  }

  for (const m of registry) visit(m.id, [])
  return out
}

function adapterStatus(availability: AvailabilityMap, id: AdapterId): 'available' | 'degraded' | 'unavailable' {
  return (availability[id] as { status: 'available' | 'degraded' | 'unavailable' }).status
}

function lensSkippedFinding(manifest: LensManifest, missing: AdapterId[]): Finding {
  const id = `lens_skipped:${manifest.id}`
  return {
    id, lens_id: manifest.id, severity: 'P3',
    title: `${manifest.name}: skipped (missing adapters)`,
    description: `Required adapters unavailable: ${missing.join(', ')}`,
    source_doc: '',
    evidence: { kind: 'lens_skipped', reason: 'adapter_unavailable', needed: missing },
    confidence: 'high',
    first_seen: new Date().toISOString(),
    last_seen: new Date().toISOString(),
    status: 'skipped',
  }
}

export async function runChecks(input: RunChecksInput): Promise<Finding[]> {
  const sorted = topoSort(input.registry)
  const enabledIds = input.enabledIds ?? new Set(
    input.registry.filter((m) => m.profiles.includes(input.profile)).map((m) => m.id),
  )
  const context: LensContext = {
    profile: input.profile,
    cwd: input.cwd ?? process.cwd(),
    knowledgeRoot: input.knowledgeRootResolution?.root,
    knowledgeIndex: input.knowledgeRootResolution?.index,
    knowledgeRootAttempts: input.knowledgeRootResolution?.attempts ?? [],
    warnedKeys: input.warnedKeys ?? new Set<string>(),
  }
  const allFindings: Finding[] = []

  for (const manifest of sorted) {
    if (!enabledIds.has(manifest.id)) continue
    const missing = manifest.required.filter((a) => adapterStatus(input.availability, a) === 'unavailable')
    if (missing.length > 0) {
      allFindings.push(lensSkippedFinding(manifest, missing))
      continue
    }
    const lensFn = input.lenses[manifest.id]
    if (!lensFn) continue
    const upstream = (manifest.depends_on ?? [])
      .flatMap((dep) => allFindings.filter((f) => f.lens_id === dep))
    const findings = await lensFn(input.graph, input.ledger, input.availability, upstream, enabledIds, context)
    allFindings.push(...findings)
  }
  return allFindings
}

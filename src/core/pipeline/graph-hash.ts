import crypto from 'node:crypto'
import type { DependencyGraph } from '../../types/index.js'

/**
 * Stable SHA-256 hash of the pipeline graph for cache invalidation.
 *
 * Inputs included (all affect `computeEligible` output or ordering):
 * - slug presence
 * - `enabled` flag
 * - `order` (computeEligible sorts by order)
 * - dependencies list
 * - global-ness (affects scope filtering)
 * - scope ('global' vs 'service'; `null` normalized to 'global')
 *
 * Inputs deliberately excluded (cosmetic / orthogonal):
 * - phase (affects display grouping, not eligibility)
 * - cross-reads (orthogonal to eligibility)
 */
export function computePipelineHash(
  graph: DependencyGraph,
  globalSteps: Set<string>,
  scope: 'global' | 'service' | null,
): string {
  const lines: string[] = []
  // Round-2 P2 fix: normalize null → 'global' so non-service callers that
  // pass undefined/null hash the same as explicit 'global'.
  const normalizedScope = scope === 'service' ? 'service' : 'global'
  lines.push(`scope:${normalizedScope}`)
  // Canonical ordering by slug for stability across map insertion order.
  const slugs = [...graph.nodes.keys()].sort()
  for (const slug of slugs) {
    const node = graph.nodes.get(slug)!
    const deps = [...node.dependencies].sort().join(',')
    const order = node.order ?? 'null'
    const isGlobal = globalSteps.has(slug) ? '1' : '0'
    const enabled = node.enabled ? '1' : '0'
    lines.push(`${slug}|${enabled}|${isGlobal}|${order}|${deps}`)
  }
  return crypto.createHash('sha256').update(lines.join('\n')).digest('hex')
}

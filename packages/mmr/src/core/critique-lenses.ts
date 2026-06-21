/**
 * Persona lenses (D5). When --lenses is set each channel adopts a distinct
 * perspective. This deliberately breaks prompt-identity, so the output relabels
 * "consensus" as "perspectives" (the agreement signal no longer means
 * "independent minds converged" — it could just be assigned-role overlap).
 */
export const BUILTIN_LENSES: Record<string, string> = {
  skeptic:
    'Adopt the lens of a skeptic: assume the approach is flawed until proven otherwise. ' +
    'Hunt for hidden risks, failure modes, and unstated assumptions.',
  simplifier:
    'Adopt the lens of a simplifier: look for the simplest design that solves the real problem. ' +
    'Flag accidental complexity and over-engineering.',
  'user-advocate':
    'Adopt the lens of a user advocate: judge the design by the end-user/operator experience — ' +
    'clarity, failure visibility, and edge cases that hurt real users.',
  pragmatist:
    'Adopt the lens of a shipping pragmatist: weigh effort vs. value, what can ship now vs. later, ' +
    'and operational/maintenance cost.',
  security:
    'Adopt the lens of a security reviewer: look for trust boundaries, data exposure, ' +
    'authz/authn gaps, and abuse cases in the design.',
  scale:
    'Adopt the lens of a scale/performance reviewer: probe how the design behaves at 10x–100x load, ' +
    'data growth, and concurrency.',
}

/** Resolve a lens name to its instruction preamble (built-in or a generic one). */
export function lensPreamble(name: string): string {
  const key = name.trim().toLowerCase()
  if (BUILTIN_LENSES[key]) return BUILTIN_LENSES[key]
  return `Adopt the lens of a "${name.trim()}": critique the design primarily from that perspective.`
}

/** Assign one lens per channel, cycling the provided list. */
export function assignLenses(lenses: string[], channelCount: number): string[] {
  if (lenses.length === 0 || channelCount === 0) return []
  return Array.from({ length: channelCount }, (_, i) => lenses[i % lenses.length])
}

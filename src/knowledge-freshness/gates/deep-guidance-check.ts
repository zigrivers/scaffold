/**
 * Deep-Guidance-preserved gate (spec §A.5).
 *
 * The assembly engine matches `^## Deep Guidance\s*$` to extract per-entry
 * deep guidance for injection into pipeline prompts. If a refresh PR replaces
 * the heading with `## Guidance` or `### Deep Guidance` the engine silently
 * skips the section. This gate refuses to merge any PR that drops the exact
 * heading from a changed entry.
 *
 * The check is positive (must contain the literal heading), not regex-fuzzy
 * — we explicitly want to fail variants like `# Deep Guidance`,
 * `## deep guidance`, or trailing punctuation.
 */

const DEEP_GUIDANCE_RE = /^## Deep Guidance\s*$/m

export interface DeepGuidanceFinding {
  file: string
  ok: boolean
  reason?: string
}

export function checkDeepGuidance(inputs: Array<{ file: string; content: string }>): DeepGuidanceFinding[] {
  return inputs.map(({ file, content }) => {
    if (DEEP_GUIDANCE_RE.test(content)) {
      return { file, ok: true }
    }
    return {
      file,
      ok: false,
      reason: 'missing literal `## Deep Guidance` heading (assembly engine depends on this exact form)',
    }
  })
}

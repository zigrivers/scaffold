export interface LintResult { errors: string[]; warnings: string[] }

const EMBED_OPEN = /^:::embed\{[^}]*\}\s*$/
const EMBED_CLOSE = /^:::\s*$/
const TEXT_EQUIV = /text[\s-]?equivalent/i

export function lintGuide(markdown: string): LintResult {
  const errors: string[] = []
  const warnings: string[] = []
  const lines = markdown.split(/\r?\n/)
  let embedCount = 0
  for (let i = 0; i < lines.length; i++) {
    if (!EMBED_OPEN.test(lines[i])) continue
    embedCount++
    let body = ''
    let j = i + 1
    for (; j < lines.length && !EMBED_CLOSE.test(lines[j]); j++) body += lines[j] + '\n'
    if (!TEXT_EQUIV.test(body)) {
      errors.push(`:::embed at line ${i + 1} is missing a text-equivalent (required for agent-readability)`)
    }
    i = j
  }
  if (embedCount > 3) {
    warnings.push(`guide uses ${embedCount} escape-hatch embeds (>3) — prefer first-class directives`)
  }
  return { errors, warnings }
}

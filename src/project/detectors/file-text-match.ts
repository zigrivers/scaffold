// src/project/detectors/file-text-match.ts
// Strips comments and template literal content from JS/TS source
// before doing substring or regex matches, to reduce false positives.

export function stripJsTsComments(content: string): string {
  // Step 1: strip /* */ and /** */ comments
  const result = content.replace(/\/\*[\s\S]*?\*\//g, '')

  // Step 2: strip single-line // comments (respecting strings)
  // inTemplate MUST persist across line boundaries — template literals can
  // span multiple lines in JS/TS. inSingle/inDouble reset per line because
  // raw string literals can't span newlines, and prevWasBackslash also
  // resets because a backslash doesn't escape a newline for line-comment
  // purposes. See file-text-match.test.ts for regression coverage.
  const lines = result.split('\n')
  let inTemplate = false
  const stripped = lines.map(line => {
    let inSingle = false, inDouble = false
    let prevWasBackslash = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (!inSingle && !inDouble && !inTemplate && ch === '/' && line[i + 1] === '/') {
        return line.slice(0, i)
      }
      if (prevWasBackslash) {
        // This char is escaped — ignore it for toggle logic
        prevWasBackslash = false
        continue
      }
      if (ch === '\\') {
        prevWasBackslash = true
        continue
      }
      if (!inDouble && !inTemplate && ch === '\'') inSingle = !inSingle
      else if (!inSingle && !inTemplate && ch === '"') inDouble = !inDouble
      else if (!inSingle && !inDouble && ch === '`') inTemplate = !inTemplate
    }
    return line
  }).join('\n')

  // Step 3: blank out template literal contents
  return stripped.replace(/`[^`]*`/g, '``')
}

export function matchesConfigExport(content: string, key: string, value: string): boolean {
  const stripped = stripJsTsComments(content)
  // Find the export boundary
  const markers = ['module.exports', 'export default', 'defineConfig(']
  let exportIdx = -1
  for (const marker of markers) {
    const idx = stripped.indexOf(marker)
    if (idx >= 0 && (exportIdx === -1 || idx < exportIdx)) exportIdx = idx
  }
  const region = exportIdx >= 0 ? stripped.slice(exportIdx) : stripped
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const escapedValue = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const pattern = new RegExp(`\\b${escapedKey}\\s*:\\s*['"]${escapedValue}['"]`)
  return pattern.test(region)
}

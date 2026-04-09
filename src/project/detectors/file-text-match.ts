// src/project/detectors/file-text-match.ts
// Strips comments and template literal content from JS/TS source
// before doing substring or regex matches, to reduce false positives.

export function stripJsTsComments(content: string): string {
  // Step 1: strip /* */ and /** */ comments
  const result = content.replace(/\/\*[\s\S]*?\*\//g, '')

  // Step 2: strip single-line // comments (respecting strings)
  const lines = result.split('\n')
  const stripped = lines.map(line => {
    let inSingle = false, inDouble = false, inTemplate = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (!inSingle && !inDouble && !inTemplate && ch === '/' && line[i + 1] === '/') {
        return line.slice(0, i)
      }
      if (i > 0 && line[i - 1] === '\\') continue
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

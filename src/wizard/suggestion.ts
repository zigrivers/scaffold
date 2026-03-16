/**
 * Suggest a methodology based on project keywords and signals.
 * Returns 'mvp' for prototype/quick projects, 'deep' for complex ones.
 */
export function suggestMethodology(options: {
  idea?: string
  mode: 'greenfield' | 'brownfield' | 'v1-migration'
  sourceFileCount?: number
}): 'deep' | 'mvp' {
  const { idea = '', mode, sourceFileCount = 0 } = options

  // MVP signals in the idea text
  const mvpKeywords = ['prototype', 'mvp', 'quick', 'hack', 'simple', 'basic', 'minimal', 'poc']
  if (mvpKeywords.some(k => idea.toLowerCase().includes(k))) return 'mvp'

  // Large existing codebase → deep
  if (mode === 'brownfield' && sourceFileCount > 10) return 'deep'

  // Default: deep
  return 'deep'
}

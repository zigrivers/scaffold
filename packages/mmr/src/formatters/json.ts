import type { ReconciledResults } from '../types.js'

export function formatJson(results: ReconciledResults): string {
  return JSON.stringify(results, null, 2)
}

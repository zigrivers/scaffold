import fs from 'node:fs'

export interface ResolvedCritiqueInput {
  /** The artifact text to critique. */
  artifact: string
  /** Human-readable provenance: a file path or "stdin". */
  source: string
}

/**
 * Normalize the critique input into artifact text + a source label.
 * - a path → its file contents
 * - `-` → stdin (fd 0)
 * Throws a clear usage error on missing or empty input.
 */
export function resolveCritiqueInput(input: string | undefined): ResolvedCritiqueInput {
  if (input === undefined) {
    throw new Error('No input given. Pass a file path (mmr critique design.md) or - to read stdin.')
  }
  const isStdin = input === '-'
  const artifact = isStdin ? fs.readFileSync(0, 'utf-8') : fs.readFileSync(input, 'utf-8')
  if (!artifact.trim()) {
    throw new Error(`Critique input is empty: ${isStdin ? 'stdin' : input}`)
  }
  return { artifact, source: isStdin ? 'stdin' : input }
}

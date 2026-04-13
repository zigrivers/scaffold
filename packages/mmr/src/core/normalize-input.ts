import fs from 'node:fs'
import { stripMarkdownFences, extractJson, fixTrailingCommas, validateParsedOutputStrict, validateFindingStrict } from './parser.js'
import type { ParsedOutput } from './parser.js'

/**
 * Normalize external findings input into a ParsedOutput.
 * Accepts wrapper format ({ approved, findings, summary }) or bare array ([finding, ...]).
 * Strips markdown fences and surrounding text. Uses strict validation (throws on invalid).
 */
export function normalizeExternalInput(raw: string): ParsedOutput {
  let text = stripMarkdownFences(raw)
  text = text.trim()

  let parsed: unknown
  if (text.startsWith('[')) {
    // Bare array — use balanced bracket extraction to handle trailing text
    let depth = 0
    let inStr = false
    for (let i = 0; i < text.length; i++) {
      const c = text[i]
      if (inStr) { if (c === '\\') i++; else if (c === '"') inStr = false; continue }
      if (c === '"') inStr = true
      else if (c === '[') depth++
      else if (c === ']') {
        depth--
        if (depth === 0) {
          const arrayText = fixTrailingCommas(text.slice(0, i + 1))
          parsed = JSON.parse(arrayText)
          break
        }
      }
    }
    if (parsed === undefined) throw new Error('Unbalanced brackets in array input')
  } else if (text.startsWith('{')) {
    // Object at start — use extractJson for robustness
    text = extractJson(text)
    text = fixTrailingCommas(text)
    parsed = JSON.parse(text)
  } else {
    // Surrounded text — try extractJson for wrapper objects first
    let extractedWrapper = false
    try {
      const extracted = extractJson(text)
      const candidate = JSON.parse(fixTrailingCommas(extracted))
      // Only accept as wrapper if it has findings array AND does not look like a bare finding
      if (typeof candidate === 'object' && candidate !== null && Array.isArray(candidate.findings) && typeof candidate.severity !== 'string') {
        parsed = candidate
        extractedWrapper = true
      }
    } catch {
      // extractJson failed — will try array scanning below
    }

    if (!extractedWrapper) {
      // Look for bare array in the stripped text
      const stripped = stripMarkdownFences(raw).trim()
      const arrayStart = stripped.indexOf('[')
      if (arrayStart === -1) throw new Error('No JSON object or array found in input')
      // Find matching ] by tracking bracket depth (mirrors extractJson for arrays)
      let depth = 0
      let inStr = false
      for (let i = arrayStart; i < stripped.length; i++) {
        const c = stripped[i]
        if (inStr) { if (c === '\\') i++; else if (c === '"') inStr = false; continue }
        if (c === '"') inStr = true
        else if (c === '[') depth++
        else if (c === ']') { depth--; if (depth === 0) { const arrayText = fixTrailingCommas(stripped.slice(arrayStart, i + 1)); parsed = JSON.parse(arrayText); break } }
      }
      if (parsed === undefined) throw new Error('Unbalanced brackets in array input')
    }
  }

  // Normalize based on shape
  if (Array.isArray(parsed)) {
    const findings = parsed.map(validateFindingStrict)
    const hasBlockingFindings = findings.some(f => f.severity === 'P0' || f.severity === 'P1')
    return {
      approved: !hasBlockingFindings,
      findings,
      summary: 'Injected external findings',
    }
  }

  if (typeof parsed === 'object' && parsed !== null) {
    const record = parsed as Record<string, unknown>
    if (Array.isArray(record.findings)) {
      return validateParsedOutputStrict(parsed)
    }
  }

  throw new Error('Invalid input format: expected JSON object with findings array or bare array of findings')
}

/**
 * Read input from the detected source.
 * Detection order: stdin (-), inline JSON ({/[), file path, error.
 */
export function readInput(input: string): string {
  if (input === '-') {
    return fs.readFileSync(0, 'utf-8')
  }

  const trimmed = input.trimStart()
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    return input
  }

  // Try to read as file path
  try {
    return fs.readFileSync(input, 'utf-8')
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException).code
    if (code === 'ENOENT' || code === 'ENAMETOOLONG') {
      throw new Error(`Input not found: "${input}" is not a file, stdin (-), or valid JSON`)
    }
    throw err // permission error, etc. — surface it
  }
}

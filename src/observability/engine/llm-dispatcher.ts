import { spawn } from 'node:child_process'
import { StringDecoder } from 'node:string_decoder'

export interface DispatchInput {
  prompt: string
  command: string
  timeoutMs: number
}

export type DispatchResult =
  | { ok: true; parsed: unknown; raw: string }
  | { ok: false; reason: string; raw?: string }

export function dispatchLlm(input: DispatchInput): Promise<DispatchResult> {
  return new Promise((resolve) => {
    let child
    try {
      // detached: true puts the child in its own process group so the timeout
      // can kill the entire subtree (wrapper scripts + child LLM processes).
      // On Windows, 'sh' is unavailable; use cmd.exe instead.
      const shell = process.platform === 'win32' ? 'cmd.exe' : 'sh'
      const shellArgs = process.platform === 'win32' ? ['/d', '/s', '/c', input.command] : ['-c', input.command]
      child = spawn(shell, shellArgs, { detached: true, stdio: ['pipe', 'pipe', 'pipe'] })
    } catch (err) {
      resolve({ ok: false, reason: `spawn failed: ${(err as Error).message}` })
      return
    }

    let stdout = ''
    let stderr = ''
    let resolved = false
    const decoder = new StringDecoder('utf8')
    const stderrDecoder = new StringDecoder('utf8')

    const timer = setTimeout(() => {
      if (resolved) return
      resolved = true
      // Kill the entire process group (negated PID) so wrapper scripts and
      // child LLM processes are all terminated, not just the sh -c parent.
      // Negated PID is POSIX-only; Windows does not support process groups.
      // Guard child.pid — it may be undefined if spawn failed asynchronously.
      if (process.platform !== 'win32' && child.pid !== undefined) {
        const pid = child.pid
        try { process.kill(-pid, 'SIGTERM') } catch { /* ignore if already gone */ }
        setTimeout(() => { try { process.kill(-pid, 'SIGKILL') } catch { /* ignore */ } }, 500)
      } else {
        try { child.kill('SIGTERM') } catch { /* ignore */ }
      }
      resolve({ ok: false, reason: `timed out after ${input.timeoutMs}ms`, raw: stdout })
    }, input.timeoutMs)

    child.stdout?.on('data', (chunk: Buffer) => { stdout += decoder.write(chunk) })
    child.stderr?.on('data', (chunk: Buffer) => { stderr += stderrDecoder.write(chunk) })

    child.on('error', (err: NodeJS.ErrnoException) => {
      if (resolved) return
      resolved = true
      clearTimeout(timer)
      const code = err.code ?? 'unknown'
      resolve({ ok: false, reason: `subprocess error (${code}): ${err.message}`, raw: stdout })
    })

    child.on('close', (code, signal) => {
      if (resolved) return
      resolved = true
      clearTimeout(timer)
      stdout += decoder.end()
      stderr += stderrDecoder.end()
      if (code !== 0 || code === null) {
        const codeStr = code !== null ? `exit ${code}` : `signal ${signal ?? 'unknown'}`
        const hint = stderr.trim() ? ` — stderr: ${stderr.trim().slice(0, 200)}` : ''
        resolve({ ok: false, reason: `subprocess ${codeStr}${hint}`, raw: stdout })
        return
      }
      // Brace-depth extraction — tolerates LLM filler text before/after the JSON block
      try {
        const parsed = extractJsonObject(stdout)
        resolve({ ok: true, parsed, raw: stdout })
      } catch (err) {
        resolve({ ok: false, reason: `JSON parse failed: ${(err as Error).message}`, raw: stdout })
      }
    })

    try {
      if (child.stdin) {
        const flushed = child.stdin.write(input.prompt)
        if (!flushed) {
          child.stdin.once('drain', () => { child.stdin?.end() })
        } else {
          child.stdin.end()
        }
      }
    } catch (err) {
      resolved = true
      clearTimeout(timer)
      resolve({ ok: false, reason: `stdin write failed: ${(err as Error).message}` })
    }
  })
}

function extractJsonObject(text: string): unknown {
  // Fast path: try parsing the whole trimmed string first (common when LLM outputs
  // pure JSON with no conversational preamble).
  try { return JSON.parse(text.trim()) } catch { /* fall through to extraction */ }

  // Extraction path: collect all top-level { or [ positions (not nested), then try
  // from the LAST one first. This handles preamble examples: if the LLM writes
  // "Example: { ... }. Results: { ... }", we pick the last block (results), not
  // the first (example).
  const starts: Array<number> = []
  let inStr = false
  let d = 0
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inStr) {
      if (ch === '\\') { i++ } else if (ch === '"') { inStr = false }
      continue
    }
    if (ch === '"') { inStr = true }
    else if (ch === '{' || ch === '[') { if (d === 0) starts.push(i); d++ }
    else if (ch === '}' || ch === ']') { if (d > 0) d-- }
  }

  if (starts.length === 0) throw new Error('no JSON object or array found in output')

  // Try each top-level start from last to first.
  // Safety: tracking only the matched open/close pair ({} or []) is sufficient.
  // Nested arrays inside objects (or vice-versa) are balanced sub-content; they
  // never produce a spurious depth-0 event for the outer pair. Strings are
  // handled by the inString guard, so delimiters inside string values are skipped.
  for (let s = starts.length - 1; s >= 0; s--) {
    const start = starts[s]
    const open = text[start] as '{' | '['
    const close = open === '{' ? '}' : ']'
    let depth = 0
    let inString = false
    for (let i = start; i < text.length; i++) {
      const ch = text[i]
      if (inString) {
        if (ch === '\\') { i++ } else if (ch === '"') { inString = false }
        continue
      }
      if (ch === '"') { inString = true }
      else if (ch === open) { depth++ }
      else if (ch === close) {
        depth--
        if (depth === 0) {
          try { return JSON.parse(text.slice(start, i + 1)) } catch { break }
        }
      }
    }
  }

  throw new Error('no valid JSON found in output')
}

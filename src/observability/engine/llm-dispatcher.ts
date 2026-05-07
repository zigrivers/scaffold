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
      // can kill the entire subtree (wrapper scripts + child LLM processes)
      child = spawn('sh', ['-c', input.command], { detached: true, stdio: ['pipe', 'pipe', 'pipe'] })
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
      if (process.platform !== 'win32') {
        try { process.kill(-child.pid!, 'SIGTERM') } catch { /* ignore if already gone */ }
        setTimeout(() => { try { process.kill(-child.pid!, 'SIGKILL') } catch { /* ignore */ } }, 500)
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

    child.on('close', (code) => {
      if (resolved) return
      resolved = true
      clearTimeout(timer)
      stdout += decoder.end()
      stderr += stderrDecoder.end()
      if (code !== 0) {
        const hint = stderr.trim() ? ` — stderr: ${stderr.trim().slice(0, 200)}` : ''
        resolve({ ok: false, reason: `subprocess exit ${code}${hint}`, raw: stdout })
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
      child.stdin?.write(input.prompt)
      child.stdin?.end()
    } catch (err) {
      resolved = true
      clearTimeout(timer)
      resolve({ ok: false, reason: `stdin write failed: ${(err as Error).message}` })
    }
  })
}

function extractJsonObject(text: string): unknown {
  // Find the first { or [ — LLM prompts request objects but guard against arrays too
  const objIdx = text.indexOf('{')
  const arrIdx = text.indexOf('[')
  const start = objIdx === -1 ? arrIdx : arrIdx === -1 ? objIdx : Math.min(objIdx, arrIdx)
  if (start === -1) throw new Error('no JSON object or array found in output')

  const isArray = text[start] === '['
  const open = isArray ? '[' : '{'
  const close = isArray ? ']' : '}'

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
      if (depth === 0) return JSON.parse(text.slice(start, i + 1))
    }
  }

  throw new Error('unbalanced braces/brackets in JSON output')
}

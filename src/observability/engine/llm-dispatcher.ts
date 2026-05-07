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
      child = spawn('sh', ['-c', input.command], { stdio: ['pipe', 'pipe', 'pipe'] })
    } catch (err) {
      resolve({ ok: false, reason: `spawn failed: ${(err as Error).message}` })
      return
    }

    let stdout = ''
    let resolved = false
    const decoder = new StringDecoder('utf8')

    const timer = setTimeout(() => {
      if (resolved) return
      resolved = true
      try { child.kill('SIGTERM') } catch { /* ignore */ }
      resolve({ ok: false, reason: `timed out after ${input.timeoutMs}ms`, raw: stdout })
    }, input.timeoutMs)

    child.stdout?.on('data', (chunk: Buffer) => { stdout += decoder.write(chunk) })
    child.stderr?.on('data', (_chunk: Buffer) => { /* discard */ })

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
      if (code !== 0) {
        resolve({ ok: false, reason: `subprocess exit ${code}`, raw: stdout })
        return
      }
      // Extract the first JSON object/array block — LLMs sometimes emit conversational filler
      const start = stdout.indexOf('{')
      const end = stdout.lastIndexOf('}')
      if (start === -1 || end === -1) {
        resolve({ ok: false, reason: 'no JSON object found in output', raw: stdout })
        return
      }
      try {
        const parsed = JSON.parse(stdout.slice(start, end + 1))
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


import { spawn } from 'node:child_process'

export interface DispatchFixInput {
  prompt: string
  command: string
  timeoutMs: number
  cwd?: string
}

export type DispatchFixResult =
  | { ok: true; exit_code: 0; elapsed_ms: number }
  | { ok: false; reason: string; exit_code?: number; timed_out?: boolean; elapsed_ms?: number }

function parseShell(cmd: string): string[] {
  const args: string[] = []
  let current = ''
  let inSingle = false
  let inDouble = false
  for (let i = 0; i < cmd.length; i++) {
    const ch = cmd[i]
    if (ch === '\'' && !inDouble) { inSingle = !inSingle }
    else if (ch === '"' && !inSingle) { inDouble = !inDouble }
    else if (ch === ' ' && !inSingle && !inDouble) { if (current) { args.push(current); current = '' } }
    else { current += ch }
  }
  if (current) args.push(current)
  return args
}

export function dispatchFixAgent(input: DispatchFixInput): Promise<DispatchFixResult> {
  return new Promise((resolve) => {
    const started = Date.now()
    const [bin, ...args] = parseShell(input.command)
    let child
    try {
      child = spawn(bin, args, { stdio: ['pipe', 'inherit', 'inherit'], cwd: input.cwd })
    } catch (err) {
      resolve({ ok: false, reason: `spawn failed: ${(err as Error).message}` })
      return
    }

    let resolved = false
    const timer = setTimeout(() => {
      if (resolved) return
      resolved = true
      try { child.kill('SIGTERM') } catch { /* ignore */ }
      resolve({
        ok: false, reason: `timed out after ${input.timeoutMs}ms`,
        timed_out: true, elapsed_ms: Date.now() - started,
      })
    }, input.timeoutMs)

    child.on('error', (err: NodeJS.ErrnoException) => {
      if (resolved) return
      resolved = true
      clearTimeout(timer)
      const code = err.code ?? 'unknown'
      resolve({ ok: false, reason: `subprocess error (${code}): ${err.message}`, elapsed_ms: Date.now() - started })
    })

    child.on('close', (code) => {
      if (resolved) return
      resolved = true
      clearTimeout(timer)
      const elapsed = Date.now() - started
      if (code === 0) resolve({ ok: true, exit_code: 0, elapsed_ms: elapsed })
      else resolve({ ok: false, reason: `subprocess exit ${code}`, exit_code: code ?? -1, elapsed_ms: elapsed })
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

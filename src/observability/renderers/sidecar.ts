import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { EngineOutput } from '../engine/types.js'
import { redactEngineOutput } from '../engine/redact.js'

function dateStamp(iso: string): string {
  const d = new Date(iso)
  const pad2 = (n: number) => String(n).padStart(2, '0')
  const pad3 = (n: number) => String(n).padStart(3, '0')
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}` +
    `-${pad2(d.getUTCHours())}${pad2(d.getUTCMinutes())}${pad2(d.getUTCSeconds())}${pad3(d.getUTCMilliseconds())}`
}

export function deriveReportId(out: EngineOutput): string {
  const stamp = dateStamp(out.invocation.started_at)
  if (out.invocation.command === 'progress') return `progress-${stamp}`
  const args = out.invocation.args as { profile?: string; scope?: string; lensIds?: string[] }
  const profile = args.profile ?? 'fast'
  if (Array.isArray(args.lensIds) && args.lensIds.length === 1) {
    return `audit-${stamp}-${profile}-lens-${args.lensIds[0]}`
  }
  return `audit-${stamp}-${profile}-${args.scope ?? 'all'}`
}

export function sidecarPath(reportId: string, command: 'progress' | 'audit'): string {
  const dir = command === 'progress' ? 'docs/build-status' : 'docs/audits'
  return `${dir}/${reportId}.json`
}

export async function writeSidecar(cwd: string, out: EngineOutput, overridePath?: string): Promise<string> {
  const reportId = deriveReportId(out)
  const relPath = overridePath ?? sidecarPath(reportId, out.invocation.command)
  const absPath = join(cwd, relPath)
  await mkdir(dirname(absPath), { recursive: true })
  const redacted = redactEngineOutput(out)
  const wrapper = { report_id: reportId, engine_output: redacted }
  await writeFile(absPath, JSON.stringify(wrapper, null, 2) + '\n', { mode: 0o644 })
  return absPath
}

import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, join } from 'node:path'
import type { EngineOutput } from '../engine/types.js'
import { redactEngineOutput } from '../engine/redact.js'

function dateStamp(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.valueOf())) {
    return `unknown-${Date.now()}`
  }
  const pad2 = (n: number) => String(n).padStart(2, '0')
  const pad3 = (n: number) => String(n).padStart(3, '0')
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}` +
    `-${pad2(d.getUTCHours())}${pad2(d.getUTCMinutes())}${pad2(d.getUTCSeconds())}${pad3(d.getUTCMilliseconds())}`
}

function safeLensId(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9_-]/g, '_')
}

function shortId(): string {
  return Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0')
}

export function deriveReportId(out: EngineOutput): string {
  const stamp = dateStamp(out.invocation.started_at)
  const suffix = shortId()
  if (out.invocation.command === 'progress') return `progress-${stamp}-${suffix}`
  const args = out.invocation.args as { profile?: string; scope?: string; lensIds?: string[] }
  const profile = args.profile ?? 'fast'
  if (Array.isArray(args.lensIds) && args.lensIds.length > 0) {
    const sorted = [...args.lensIds].map(safeLensId).sort()
    if (sorted.length === 1) return `audit-${stamp}-${profile}-lens-${sorted[0]}-${suffix}`
    return `audit-${stamp}-${profile}-lenses-${sorted.join('+')}-${suffix}`
  }
  return `audit-${stamp}-${profile}-${args.scope ?? 'all'}-${suffix}`
}

export function sidecarPath(reportId: string, command: 'progress' | 'audit'): string {
  const dir = command === 'progress' ? 'docs/build-status' : 'docs/audits'
  return `${dir}/${reportId}.json`
}

export async function writeSidecar(
  cwd: string, out: EngineOutput, overridePath?: string, reportId?: string,
): Promise<string> {
  const id = reportId ?? deriveReportId(out)
  const defaultPath = sidecarPath(id, out.invocation.command)
  const absPath = overridePath
    ? (isAbsolute(overridePath) ? overridePath : join(cwd, overridePath))
    : join(cwd, defaultPath)
  await mkdir(dirname(absPath), { recursive: true })
  const redacted = redactEngineOutput(out)
  const wrapper = { report_id: id, engine_output: redacted }
  await writeFile(absPath, JSON.stringify(wrapper, null, 2) + '\n', { mode: 0o644 })
  return absPath
}

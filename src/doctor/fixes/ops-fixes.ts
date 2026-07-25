import { installHooks, type HooksInstallResult } from '../../core/hooks/install.js'
import { buildPostMergePollerJob } from '../../sched/jobs.js'
import { pickSchedBackend } from '../../sched/platform.js'
import type { SchedBackend, SchedJob } from '../../sched/types.js'

export interface OpsFixResult {
  ok: boolean
  messages: string[]
}

/** D5 R2 fix handler: hook re-registration — a THIN wrapper over the D8
 *  primitive (never duplicated logic). Safe to run repeatedly: installHooks
 *  only appends missing registrations and never rewrites existing entries. */
export function fixHookRegistration(
  projectRoot: string,
  deps: { install?: (projectRoot: string) => HooksInstallResult } = {},
): OpsFixResult {
  try {
    const res = (deps.install ?? installHooks)(projectRoot)
    const messages = [
      ...res.added.map(l => `registered ${l}`),
      ...res.skipped.map(s => s.reason),
    ]
    if (messages.length === 0) messages.push('all hook registrations already current')
    return { ok: true, messages }
  } catch (err) {
    return { ok: false, messages: [err instanceof Error ? err.message : String(err)] }
  }
}

/** D5 R2 fix handler: scheduler reload — a THIN wrapper over the D6 primitive.
 *  Reload = install: the backend's `bootout || true` + bootstrap + liveness
 *  verification make re-install the idempotent reload path (D6). */
export function fixSchedulerReload(
  projectRoot: string,
  deps: {
    backend?: SchedBackend
    buildJob?: (projectRoot: string) => SchedJob
  } = {},
): OpsFixResult {
  try {
    const backend = deps.backend ?? pickSchedBackend()
    const build = deps.buildJob ?? ((root: string): SchedJob => buildPostMergePollerJob(root))
    const res = backend.install(build(projectRoot))
    return { ok: res.ok && res.verified, messages: res.messages }
  } catch (err) {
    return { ok: false, messages: [err instanceof Error ? err.message : String(err)] }
  }
}

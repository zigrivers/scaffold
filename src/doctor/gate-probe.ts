import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

export interface GateProbeResult {
  /** False when no generated gate script exists — the R1 resolve-only
   *  reporting stands unchanged in that case. */
  ran: boolean
  ok: boolean
  detail: string
}

export const GATE_PROBE_TIMEOUT_MS = 120_000

/** D5 (R2): the bounded execution probe for doctor's gate section. Runs the
 *  generated gate seed with GATE_PROBE=1 — dependency presence, functional
 *  runtimes, test-runner startup — WITHOUT executing the suite (the full gate
 *  stays behind `doctor --deep`). gate-check.sh is preferred; the affected
 *  script delegates its probe mode there anyway (Task 8). */
export function runGateProbe(
  projectRoot: string,
  opts: { timeoutMs?: number } = {},
): GateProbeResult {
  const script = ['scripts/gate-check.sh', 'scripts/gate-check-affected.sh']
    .map(rel => path.join(projectRoot, rel))
    .find(p => fs.existsSync(p))
  if (script === undefined) {
    return {
      ran: false,
      ok: true,
      detail: 'no generated gate script — resolve-only check applies '
        + '(install: scaffold agent-ops install --component gate)',
    }
  }
  // The Makefile `check` target runs `./scripts/gate-check.sh` DIRECTLY, which
  // needs the executable bit. Running it under `bash` here would mask a missing
  // bit and report healthy while `make check` fails "permission denied" — so
  // verify the bit first and fail with actionable remediation if it's gone.
  const name = path.basename(script)
  if ((fs.statSync(script).mode & 0o111) === 0) {
    return {
      ran: true,
      ok: false,
      detail: `${name} is not executable — \`make check\` runs it directly and will fail; `
        + `fix with: chmod +x ${path.relative(projectRoot, script)}`,
    }
  }
  const res = spawnSync('bash', [script], {
    cwd: projectRoot,
    env: { ...process.env, GATE_PROBE: '1' },
    timeout: opts.timeoutMs ?? GATE_PROBE_TIMEOUT_MS,
    encoding: 'utf8',
  })
  if (res.status === 0) {
    return { ran: true, ok: true, detail: `GATE_PROBE=1 ${name}: prerequisites verified (suite not run)` }
  }
  const tail = `${res.stdout ?? ''}${res.stderr ?? ''}`.trim().split('\n').slice(-3).join(' | ')
  return {
    ran: true,
    ok: false,
    detail: `GATE_PROBE=1 ${name} failed${res.signal !== null ? ` (${res.signal})` : ''}: ${tail}`,
  }
}

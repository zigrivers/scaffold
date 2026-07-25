import fs from 'node:fs'
import path from 'node:path'
import type { Exec } from '../exec.js'
import type { SchedActionResult, SchedBackend, SchedJob, SchedStatus } from '../types.js'

/** systemd quoting: each ExecStart argv element is double-quoted so paths with
 *  spaces survive; our values never contain double quotes (absolute paths). */
function execStart(job: SchedJob): string {
  return job.programArguments.map(a => `"${a}"`).join(' ')
}

export function renderService(job: SchedJob): string {
  const env = Object.keys(job.environment)
    .sort()
    .map(k => `Environment="${k}=${job.environment[k]}"`)
    .join('\n')
  return `[Unit]
Description=scaffold sched job ${job.name} (${job.label})

[Service]
Type=oneshot
WorkingDirectory=${job.workingDirectory}
${env}
ExecStart=${execStart(job)}
StandardOutput=append:${job.stdoutPath}
StandardError=append:${job.stderrPath}
`
}

export function renderTimer(job: SchedJob): string {
  return `[Unit]
Description=scaffold sched timer ${job.name} (${job.label})

[Timer]
OnBootSec=60
OnUnitActiveSec=${job.intervalSeconds}
Unit=${job.unitBase}.service

[Install]
WantedBy=timers.target
`
}

export function createSystemdBackend(deps: { exec: Exec; home: string; user: string }): SchedBackend {
  const unitDir = path.join(deps.home, '.config', 'systemd', 'user')
  const servicePath = (job: SchedJob): string => path.join(unitDir, `${job.unitBase}.service`)
  const timerPath = (job: SchedJob): string => path.join(unitDir, `${job.unitBase}.timer`)

  return {
    platform: 'systemd',
    unitPaths: job => [servicePath(job), timerPath(job)],

    install(job): SchedActionResult {
      const messages: string[] = []
      fs.mkdirSync(unitDir, { recursive: true })
      fs.mkdirSync(path.dirname(job.stdoutPath), { recursive: true })
      fs.mkdirSync(path.dirname(job.stderrPath), { recursive: true })
      fs.writeFileSync(servicePath(job), renderService(job))
      fs.writeFileSync(timerPath(job), renderTimer(job))
      messages.push(`wrote ${servicePath(job)}`, `wrote ${timerPath(job)}`)
      const reload = deps.exec('systemctl', ['--user', 'daemon-reload'])
      if (reload.status !== 0) {
        messages.push(`systemctl --user daemon-reload failed: ${(reload.stderr || reload.stdout).trim()}`)
        return { ok: false, verified: false, messages }
      }
      // Linger keeps user timers running with no active session (D6); its
      // failure (e.g. no polkit authority) degrades, never blocks.
      const linger = deps.exec('loginctl', ['enable-linger', deps.user])
      if (linger.status !== 0) {
        messages.push(
          'loginctl enable-linger failed — the timer only runs while you are ' +
          'logged in; run manually: loginctl enable-linger ' + deps.user,
        )
      }
      const enable = deps.exec('systemctl', ['--user', 'enable', '--now', `${job.unitBase}.timer`])
      if (enable.status !== 0) {
        messages.push(`systemctl enable --now failed: ${(enable.stderr || enable.stdout).trim()}`)
        return { ok: false, verified: false, messages }
      }
      // Verify the timer is ACTUALLY active — unit files on disk prove nothing.
      const active = deps.exec('systemctl', ['--user', 'is-active', `${job.unitBase}.timer`])
      if (active.status !== 0) {
        messages.push('timer is not active after enable (systemctl --user is-active failed)')
        return { ok: false, verified: false, messages }
      }
      messages.push(`verified active: systemctl --user is-active ${job.unitBase}.timer`)
      return { ok: true, verified: true, messages }
    },

    uninstall(job): SchedActionResult {
      const messages: string[] = []
      deps.exec('systemctl', ['--user', 'disable', '--now', `${job.unitBase}.timer`]) // ignore
      for (const p of [servicePath(job), timerPath(job)]) {
        if (fs.existsSync(p)) {
          fs.rmSync(p)
          messages.push(`removed ${p}`)
        }
      }
      deps.exec('systemctl', ['--user', 'daemon-reload'])
      return { ok: true, verified: true, messages }
    },

    status(job): SchedStatus {
      const installed = fs.existsSync(timerPath(job)) && fs.existsSync(servicePath(job))
      const loaded = deps.exec('systemctl', ['--user', 'is-active', `${job.unitBase}.timer`]).status === 0
      const lastRunAt = fs.existsSync(job.stdoutPath)
        ? fs.statSync(job.stdoutPath).mtime.toISOString()
        : null
      const detail = loaded
        ? 'active'
        : installed
          ? 'units present but timer NOT active — run: scaffold sched install ' + job.name
          : 'not installed'
      return { installed, loaded, lastRunAt, detail }
    },
  }
}

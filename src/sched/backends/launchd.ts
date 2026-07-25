import fs from 'node:fs'
import path from 'node:path'
import type { Exec } from '../exec.js'
import type { SchedActionResult, SchedBackend, SchedJob, SchedStatus } from '../types.js'

function xmlEscape(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** Pure plist rendering — golden-fixture-tested against the rumble plist.
 *  Key order is fixed; environment keys are sorted for determinism. */
export function renderPlist(job: SchedJob): string {
  const args = job.programArguments
    .map(a => `    <string>${xmlEscape(a)}</string>`)
    .join('\n')
  const env = Object.keys(job.environment)
    .sort()
    .map(k => `    <key>${xmlEscape(k)}</key>\n    <string>${xmlEscape(job.environment[k])}</string>`)
    .join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${xmlEscape(job.label)}</string>
  <key>ProgramArguments</key>
  <array>
${args}
  </array>
  <key>StartInterval</key>
  <integer>${job.intervalSeconds}</integer>
  <key>WorkingDirectory</key>
  <string>${xmlEscape(job.workingDirectory)}</string>
  <key>EnvironmentVariables</key>
  <dict>
${env}
  </dict>
  <key>StandardOutPath</key>
  <string>${xmlEscape(job.stdoutPath)}</string>
  <key>StandardErrorPath</key>
  <string>${xmlEscape(job.stderrPath)}</string>
  <key>RunAtLoad</key>
  <true/>
</dict>
</plist>
`
}

export function createLaunchdBackend(deps: { exec: Exec; home: string; uid: number }): SchedBackend {
  const plistPath = (job: SchedJob): string =>
    path.join(deps.home, 'Library', 'LaunchAgents', `${job.label}.plist`)
  const domainTarget = (job: SchedJob): string => `gui/${deps.uid}/${job.label}`

  return {
    platform: 'launchd',
    unitPaths: job => [plistPath(job)],

    install(job): SchedActionResult {
      const messages: string[] = []
      fs.mkdirSync(path.dirname(plistPath(job)), { recursive: true })
      fs.mkdirSync(path.dirname(job.stdoutPath), { recursive: true })
      fs.mkdirSync(path.dirname(job.stderrPath), { recursive: true })
      fs.writeFileSync(plistPath(job), renderPlist(job))
      messages.push(`wrote ${plistPath(job)}`)
      // bootout || true — idempotent reload; "not loaded" is not an error (D6).
      deps.exec('launchctl', ['bootout', domainTarget(job)])
      const boot = deps.exec('launchctl', ['bootstrap', `gui/${deps.uid}`, plistPath(job)])
      if (boot.status !== 0) {
        messages.push(`launchctl bootstrap failed: ${(boot.stderr || boot.stdout).trim()}`)
        return { ok: false, verified: false, messages }
      }
      // File presence proves nothing — verify the job actually loaded (D6).
      const print = deps.exec('launchctl', ['print', domainTarget(job)])
      if (print.status !== 0) {
        messages.push(
          `job did not load: launchctl print ${domainTarget(job)} failed — ` +
          'check the plist paths and Console.app for launchd errors',
        )
        return { ok: false, verified: false, messages }
      }
      messages.push(`verified loaded: launchctl print ${domainTarget(job)}`)
      return { ok: true, verified: true, messages }
    },

    uninstall(job): SchedActionResult {
      const messages: string[] = []
      deps.exec('launchctl', ['bootout', domainTarget(job)]) // ignore "not loaded"
      if (fs.existsSync(plistPath(job))) {
        fs.rmSync(plistPath(job))
        messages.push(`removed ${plistPath(job)}`)
      } else {
        messages.push('plist was not installed')
      }
      return { ok: true, verified: true, messages }
    },

    status(job): SchedStatus {
      const installed = fs.existsSync(plistPath(job))
      const loaded = deps.exec('launchctl', ['print', domainTarget(job)]).status === 0
      const lastRunAt = fs.existsSync(job.stdoutPath)
        ? fs.statSync(job.stdoutPath).mtime.toISOString()
        : null
      const detail = loaded
        ? 'loaded'
        : installed
          ? 'plist present but NOT loaded — run: scaffold sched install ' + job.name
          : 'not installed'
      return { installed, loaded, lastRunAt, detail }
    },
  }
}

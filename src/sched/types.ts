export interface SchedJob {
  /** CLI job name: `scaffold sched install <name>`. */
  name: string
  /** launchd reverse-DNS label, e.g. com.<project>.merge-poller. */
  label: string
  /** systemd unit basename, e.g. scaffold-<project>-merge-poller. */
  unitBase: string
  /** Absolute program path + args — resolved at INSTALL time (D6). */
  programArguments: string[]
  intervalSeconds: number
  workingDirectory: string
  /** Absolute log paths under <project>/.mq/logs/ (D6). */
  stdoutPath: string
  stderrPath: string
  /** Explicit environment — launchd/systemd inherit no shell init (rumble lesson). */
  environment: Record<string, string>
}

export interface SchedActionResult {
  ok: boolean
  /** True only when the post-install liveness check passed (launchctl print /
   *  systemctl is-active) — file presence proves nothing (spec D6). */
  verified: boolean
  messages: string[]
}

export interface SchedStatus {
  /** Unit/plist file exists on disk. */
  installed: boolean
  /** Job actually loaded per launchctl print / systemctl is-active. */
  loaded: boolean
  /** Heartbeat: mtime of the stdout log, ISO — null when the job never ran. */
  lastRunAt: string | null
  detail: string
}

export interface SchedBackend {
  platform: 'launchd' | 'systemd'
  unitPaths(job: SchedJob): string[]
  install(job: SchedJob): SchedActionResult
  uninstall(job: SchedJob): SchedActionResult
  status(job: SchedJob): SchedStatus
}

import type { Argv, CommandModule } from 'yargs'
import { resolveOutputMode } from '../middleware/output-mode.js'
import { createOutputContext } from '../output/context.js'
import { ExitCode } from '../../types/enums.js'
import { pickSchedBackend } from '../../sched/platform.js'
import { SCHED_JOBS, type JobBuildOpts } from '../../sched/jobs.js'
import type { SchedBackend, SchedJob } from '../../sched/types.js'

export interface SchedArgs {
  action: string
  job?: string
  interval?: number
  root?: string
  format?: string
  auto?: boolean
  verbose?: boolean
}

export interface SchedOverrides {
  backend?: SchedBackend
  buildJob?: (name: string, projectRoot: string, opts: JobBuildOpts) => SchedJob
}

export async function schedHandler(argv: SchedArgs, overrides: SchedOverrides = {}): Promise<void> {
  const outputMode = resolveOutputMode(argv)
  const output = createOutputContext(outputMode)
  const projectRoot = argv.root ?? process.cwd()

  let backend: SchedBackend
  try {
    backend = overrides.backend ?? pickSchedBackend()
  } catch (err) {
    output.fail([{
      code: 'SCHED_BACKEND_UNAVAILABLE',
      message: String(err instanceof Error ? err.message : err),
      exitCode: ExitCode.ValidationError,
      recovery: 'Scheduling needs launchd (macOS) or systemd user timers (Linux); '
        + 'run the job from cron or a CI schedule instead',
    }])
    process.exitCode = ExitCode.ValidationError
    return
  }
  const buildJob =
    overrides.buildJob ??
    ((name: string, root: string, opts: JobBuildOpts): SchedJob => SCHED_JOBS[name](root, opts))

  const needJob = (): string | null => {
    const name = argv.job
    if (name === undefined || SCHED_JOBS[name] === undefined) {
      output.fail([{
        code: 'SCHED_UNKNOWN_JOB',
        message: `sched ${argv.action}: unknown job "${name ?? ''}"`,
        exitCode: ExitCode.ValidationError,
        recovery: `Use one of: ${Object.keys(SCHED_JOBS).join(', ')}`,
      }])
      process.exitCode = ExitCode.ValidationError
      return null
    }
    return name
  }

  switch (argv.action) {
  case 'install': {
    const name = needJob()
    if (name === null) return
    let job: SchedJob
    try {
      job = buildJob(name, projectRoot, { intervalSeconds: argv.interval })
    } catch (err) {
      output.fail([{
        code: 'SCHED_JOB_BUILD_FAILED',
        message: String(err instanceof Error ? err.message : err),
        exitCode: ExitCode.ValidationError,
        recovery: 'Check the job arguments (e.g. --interval) and that the project root is a scaffold project',
      }])
      process.exitCode = ExitCode.ValidationError
      return
    }
    const res = backend.install(job)
    for (const m of res.messages) output.info(m)
    if (res.ok) {
      output.success(`sched: ${name} installed and verified (${backend.platform}, every ${job.intervalSeconds}s)`)
    } else {
      output.fail([{
        code: 'SCHED_INSTALL_FAILED',
        message: `sched: ${name} install FAILED — see messages above`,
        exitCode: ExitCode.ValidationError,
        recovery: 'Read the backend messages above; on macOS check `launchctl print gui/$UID` for the label',
      }])
      process.exitCode = ExitCode.ValidationError
    }
    return
  }
  case 'uninstall': {
    const name = needJob()
    if (name === null) return
    let job: SchedJob
    try {
      job = buildJob(name, projectRoot, {})
    } catch (err) {
      output.fail([{
        code: 'SCHED_JOB_BUILD_FAILED',
        message: String(err instanceof Error ? err.message : err),
        exitCode: ExitCode.ValidationError,
        recovery: 'Check the job arguments (e.g. --interval) and that the project root is a scaffold project',
      }])
      process.exitCode = ExitCode.ValidationError
      return
    }
    const res = backend.uninstall(job)
    for (const m of res.messages) output.info(m)
    if (!res.ok) {
      output.fail([{
        code: 'SCHED_UNINSTALL_FAILED',
        message: `sched: ${name} uninstall failed`,
        exitCode: ExitCode.ValidationError,
        recovery: 'Read the backend messages above; the job may already be removed, or owned by another user',
      }])
      process.exitCode = ExitCode.ValidationError
      return
    }
    output.success(`sched: ${name} uninstalled`)
    return
  }
  case 'status': {
    const name = needJob()
    if (name === null) return
    let job: SchedJob
    try {
      job = buildJob(name, projectRoot, {})
    } catch (err) {
      output.fail([{
        code: 'SCHED_JOB_BUILD_FAILED',
        message: String(err instanceof Error ? err.message : err),
        exitCode: ExitCode.ValidationError,
        recovery: 'Check the job arguments (e.g. --interval) and that the project root is a scaffold project',
      }])
      process.exitCode = ExitCode.ValidationError
      return
    }
    const st = backend.status(job)
    if (argv.format === 'json') {
      output.result({ job: name, ...st })
    } else {
      output.info(`${name}: ${st.detail}`)
      output.info(`  unit: ${backend.unitPaths(job).join(', ')}`)
      output.info(`  last run: ${st.lastRunAt ?? 'never (no log yet)'}`)
    }
    if (!st.loaded) process.exitCode = 1
    return
  }
  case 'list': {
    for (const name of Object.keys(SCHED_JOBS)) {
      try {
        const st = backend.status(buildJob(name, projectRoot, {}))
        output.info(`${name}  ${st.loaded ? 'loaded' : st.installed ? 'installed (not loaded)' : 'not installed'}`)
      } catch (err) {
        output.info(`${name}  not installable: ${err instanceof Error ? err.message : String(err)}`)
      }
    }
    return
  }
  default:
    output.fail([{
      code: 'SCHED_UNKNOWN_ACTION',
      message: `unknown sched action "${argv.action}"`,
      exitCode: ExitCode.ValidationError,
      recovery: 'Valid actions: install, uninstall, status',
    }])
    process.exitCode = ExitCode.ValidationError
  }
}

const schedCommand: CommandModule<Record<string, unknown>, SchedArgs> = {
  command: 'sched <action> [job]',
  describe: 'Manage local scheduler jobs (launchd on macOS, systemd user timers on Linux)',
  builder: (yargs: Argv) => {
    return yargs
      .positional('action', {
        describe: 'Action to perform',
        choices: ['install', 'uninstall', 'status', 'list'] as const,
        type: 'string',
        demandOption: true,
      })
      .positional('job', { type: 'string', describe: `Job name (${Object.keys(SCHED_JOBS).join(', ')})` })
      .option('interval', { type: 'number', describe: 'Run interval in seconds (install; default 600)' })
  },
  handler: async argv => schedHandler(argv),
}

export default schedCommand

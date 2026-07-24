import type { CommandModule } from 'yargs'
import { findProjectRoot } from '../middleware/project-root.js'
import { resolveOutputMode } from '../middleware/output-mode.js'
import { createOutputContext } from '../output/context.js'
import { runDoctor } from '../../doctor/run.js'
import type { DoctorStatus } from '../../doctor/types.js'

interface DoctorArgs {
  fix?: boolean
  json?: boolean
  format?: string
  auto?: boolean
  verbose?: boolean
  root?: string
  force?: boolean
}

const STATUS_ICONS: Record<DoctorStatus, string> = {
  ok: '✓', warn: '⚠', error: '✗', skip: '-',
}

const doctorCommand: CommandModule<Record<string, unknown>, DoctorArgs> = {
  command: 'doctor',
  describe: 'Execute health checks across the installed scaffold surface '
    + '(pipeline, beads, hooks, gate, queue, scheduler)',
  builder: (yargs) => {
    return yargs
      .option('fix', {
        type: 'boolean', default: false,
        describe: 'Apply safe fixes (R1: delegates bd doctor --fix only; everything else reports its remediation)',
      })
      .option('json', { type: 'boolean', default: false, describe: 'Machine-readable report' })
  },
  handler: async (argv) => {
    const projectRoot = argv.root ?? findProjectRoot(process.cwd())
    if (!projectRoot) {
      process.stderr.write(
        '✗ error [PROJECT_NOT_INITIALIZED]: No .scaffold/ directory found\n' +
        '  Fix: Run `scaffold init` (or `scaffold adopt` for an existing repo)\n',
      )
      process.exitCode = 2
      return
    }
    const outputMode = resolveOutputMode(argv)
    const useJson = argv.json === true || outputMode === 'json'
    const output = createOutputContext(useJson ? 'json' : outputMode)
    const report = runDoctor(projectRoot, { fix: argv.fix === true })
    if (useJson) {
      output.result({
        schema_version: 1,
        verdict: report.verdict,
        exit_code: report.exitCode,
        checks: report.results,
      })
    } else {
      let currentSection = ''
      for (const result of report.results) {
        if (result.section !== currentSection) {
          output.info(result.section)
          currentSection = result.section
        }
        const name = result.id.includes('/') ? result.id.slice(result.id.indexOf('/') + 1) : result.id
        const skipPrefix = result.status === 'skip' ? 'skipped — ' : ''
        output.info(`  ${STATUS_ICONS[result.status]} ${name}: ${skipPrefix}${result.detail}`)
        if (result.remediation !== undefined && (result.status === 'warn' || result.status === 'error')) {
          output.info(`      fix: ${result.remediation}`)
        }
      }
      const errors = report.results.filter((r) => r.status === 'error').length
      const warnings = report.results.filter((r) => r.status === 'warn').length
      const skipped = report.results.filter((r) => r.status === 'skip').length
      output.info(`doctor: ${report.verdict} (${errors} error(s), ${warnings} warning(s), ${skipped} skipped)`)
    }
    process.exitCode = report.exitCode
  },
}

export default doctorCommand

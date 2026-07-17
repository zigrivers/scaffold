import fs from 'node:fs'
import path from 'node:path'
import type { CommandModule, Argv } from 'yargs'
import { resolveOutputMode } from '../middleware/output-mode.js'
import { createOutputContext } from '../output/context.js'
import { asScaffoldError } from '../../utils/errors.js'
import { ExitCode } from '../../types/enums.js'
import {
  type AgentOpsComponent,
  checkAgentOps,
  installAgentOps,
} from '../../core/agent-ops/install.js'

export function resolveComponents(raw: string | undefined): AgentOpsComponent[] {
  // 'all'/default stays git+staging on purpose: merge-queue and ci are explicit
  // opt-ins so upgrade re-installs never surprise existing projects with
  // workflows or merge guards.
  if (raw === undefined || raw === 'all') return ['git', 'staging']
  if (raw === 'git' || raw === 'staging' || raw === 'merge-queue' || raw === 'ci') return [raw]
  throw new Error(`unknown component "${raw}" (expected git, staging, merge-queue, ci, or all)`)
}

interface AgentOpsArgs {
  action: string
  component?: string
  force?: boolean
  root?: string
  format?: string
  auto?: boolean
  verbose?: boolean
}

const agentOpsCommand: CommandModule<Record<string, unknown>, AgentOpsArgs> = {
  command: 'agent-ops <action>',
  describe: 'Install or check the agent-ops script bundle (worktree + staging machinery)',
  builder: (yargs: Argv) => {
    return yargs
      .positional('action', {
        describe: 'Action to perform',
        choices: ['install', 'check'] as const,
        type: 'string',
        demandOption: true,
      })
      .option('component', {
        type: 'string',
        describe: 'git | staging | merge-queue | ci | all (default all = git+staging)',
      })
      .option('force', {
        type: 'boolean',
        default: false,
        describe: 'Overwrite locally modified files',
      })
  },
  handler: async (argv) => {
    const outputMode = resolveOutputMode(argv)
    const output = createOutputContext(outputMode)
    const projectRoot = argv.root ?? process.cwd()

    if (argv.action === 'check') {
      const res = checkAgentOps(projectRoot)
      if (res.upToDate) {
        output.success('agent-ops: up to date')
      } else {
        if (res.staleVersion) {
          output.warn('agent-ops: bundle version is stale — run: scaffold agent-ops install')
        }
        for (const f of res.modified) output.warn(`agent-ops: locally modified: ${f}`)
        for (const f of res.missing) output.warn(`agent-ops: missing: ${f}`)
      }
      // Unmanaged files are informational (they never affect the exit code): a
      // known agent-ops path exists on disk but scaffold isn't managing it.
      for (const dest of res.unmanaged) {
        if (fs.existsSync(path.join(projectRoot, dest))) {
          output.warn(
            `agent-ops: exists but not managed by scaffold (pre-existing — review manually): ${dest}`,
          )
        }
      }
      process.exit(res.upToDate ? 0 : 1)
    }

    let components: AgentOpsComponent[]
    try {
      components = resolveComponents(argv.component)
    } catch (err) {
      output.error(asScaffoldError(err, 'AGENT_OPS_INVALID_COMPONENT', ExitCode.ValidationError))
      process.exit(ExitCode.ValidationError)
    }

    const result = installAgentOps(projectRoot, { components, force: argv.force })

    for (const f of result.installed) output.info(`installed ${f}`)
    for (const f of result.skippedModified) {
      output.warn(`SKIPPED (locally modified or pre-existing — use --force to overwrite): ${f}`)
    }
    for (const e of result.errors) output.error(e)

    process.exit(result.errors.length > 0 ? 1 : 0)
  },
}

export default agentOpsCommand

import type { CommandModule } from 'yargs'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execSync } from 'node:child_process'
import { findProjectRoot } from '../middleware/project-root.js'
import { resolveOutputMode } from '../middleware/output-mode.js'
import { createOutputContext } from '../output/context.js'
import { StateManager } from '../../state/state-manager.js'
import { readDecisions } from '../../state/decision-logger.js'
import { loadConfig } from '../../config/loader.js'
import { generateDashboardData, generateHtml } from '../../dashboard/generator.js'
import { discoverMetaPrompts } from '../../core/assembly/meta-prompt-loader.js'
import { getPackagePipelineDir } from '../../utils/fs.js'
import type { PipelineState } from '../../types/index.js'

interface DashboardArgs {
  format?: string
  auto?: boolean
  verbose?: boolean
  root?: string
  force?: boolean
  output?: string
  'no-open'?: boolean
  'json-only'?: boolean
}

type ConfigWithMethodology = { methodology?: { preset?: string } } | null

const dashboardCommand: CommandModule<Record<string, unknown>, DashboardArgs> = {
  command: 'dashboard',
  describe: 'Open pipeline dashboard in browser',
  builder: (yargs) => {
    return yargs
      .option('output', {
        type: 'string',
        description: 'Output path for HTML file',
      })
      .option('no-open', {
        type: 'boolean',
        description: 'Skip opening in browser',
        default: false,
      })
      .option('json-only', {
        type: 'boolean',
        description: 'Output data as JSON to stdout',
        default: false,
      })
  },
  handler: async (argv) => {
    // 1. Resolve project root
    const projectRoot = argv.root ?? findProjectRoot(process.cwd())
    if (!projectRoot) {
      process.stderr.write(
        '✗ error [PROJECT_NOT_INITIALIZED]: No .scaffold/ directory found\n' +
        '  Fix: Run `scaffold init` to initialize a project\n',
      )
      process.exit(1)
      return
    }

    // 2. Resolve output mode and create context
    const outputMode = resolveOutputMode(argv)
    const output = createOutputContext(outputMode)

    // 3. Load state
    const stateManager = new StateManager(projectRoot, () => [])
    let state: PipelineState
    try {
      state = stateManager.loadState()
    } catch {
      output.error({
        code: 'STATE_MISSING',
        message: 'No state.json found',
        exitCode: 1,
        recovery: 'Run scaffold init',
      })
      process.exit(1)
      return
    }

    // 4. Load decisions
    const decisions = readDecisions(projectRoot)

    // 5. Load config for methodology
    const { config } = loadConfig(projectRoot, [])
    const methodology =
      (config as ConfigWithMethodology)?.methodology?.preset ??
      state.config_methodology ??
      'unknown'

    // 6. Load meta-prompts for enriched step data
    const metaPrompts = discoverMetaPrompts(getPackagePipelineDir(projectRoot))

    // 7. Generate dashboard data
    const dashboardData = generateDashboardData({ state, decisions, methodology, metaPrompts })

    // 8. JSON-only mode — output data and exit
    if (argv['json-only']) {
      output.result(dashboardData)
      process.exit(0)
      return
    }

    // 9. Generate HTML
    const html = generateHtml(dashboardData)

    // 10. Determine output path
    const outputPath = argv.output ?? path.join(os.tmpdir(), `scaffold-dashboard-${Date.now()}.html`)

    // 11. Create parent directory if needed and write file
    fs.mkdirSync(path.dirname(outputPath), { recursive: true })
    fs.writeFileSync(outputPath, html, 'utf8')

    // 12. Open in browser (unless --no-open)
    if (!argv['no-open']) {
      let opener = 'xdg-open'
      if (process.platform === 'darwin') opener = 'open'
      if (process.platform === 'win32') opener = 'start'
      try {
        execSync(`${opener} "${outputPath}"`)
      } catch {
        // Ignore errors when opening browser
      }
    }

    // 13. Report success
    output.success(`Dashboard generated: ${outputPath}`)
    process.exit(0)
  },
}

export default dashboardCommand

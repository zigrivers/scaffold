import type { CommandModule } from 'yargs'
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { discoverMetaPrompts } from '../../core/assembly/meta-prompt-loader.js'
import { getPackagePipelineDir } from '../../utils/fs.js'
import { createOutputContext } from '../output/context.js'
import { findProjectRoot } from '../middleware/project-root.js'
import { resolveOutputMode } from '../middleware/output-mode.js'
import { findClosestMatch } from '../../utils/levenshtein.js'

interface CheckArgs {
  step: string
  format?: string
  auto?: boolean
  verbose?: boolean
  root?: string
  force?: boolean
}

/** Dependency names that signal a web frontend. */
const WEB_SIGNALS = new Set([
  'react-dom', 'next', '@remix-run/react', 'gatsby', '@sveltejs/kit',
  'svelte', 'vue', '@angular/core', 'vite', 'nuxt', '@nuxtjs/core',
])

/** Dependency names that signal a mobile app. */
const MOBILE_SIGNALS = new Set([
  'expo', 'react-native',
])

function detectGithubRemote(projectRoot: string): { hasGithub: boolean; reason: string } {
  try {
    const output = execSync('git remote -v', { cwd: projectRoot, encoding: 'utf8', timeout: 5000 })
    const hasGithub = output.includes('github.com')
    return {
      hasGithub,
      reason: hasGithub
        ? 'GitHub remote detected'
        : 'No GitHub remote found (git remote -v has no github.com entry)',
    }
  } catch {
    return { hasGithub: false, reason: 'Not a git repository or git not available' }
  }
}

function detectPlatform(projectRoot: string): { platform: 'web' | 'mobile' | 'both' | 'none'; reason: string } {
  const pkgPath = path.join(projectRoot, 'package.json')
  let deps: Record<string, string> = {}
  let devDeps: Record<string, string> = {}

  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))
      deps = pkg.dependencies ?? {}
      devDeps = pkg.devDependencies ?? {}
    } catch {
      // Invalid JSON — fall through to no-detection
    }
  }

  const allDeps = { ...deps, ...devDeps }
  const hasWeb = Object.keys(allDeps).some(d => WEB_SIGNALS.has(d))
  const hasMobile = Object.keys(allDeps).some(d => MOBILE_SIGNALS.has(d))

  const webFramework = Object.keys(allDeps).find(d => WEB_SIGNALS.has(d))
  const mobileFramework = Object.keys(allDeps).find(d => MOBILE_SIGNALS.has(d))

  if (hasWeb && hasMobile) {
    return { platform: 'both', reason: `Web (${webFramework}) and mobile (${mobileFramework}) detected in package.json` }
  }
  if (hasWeb) {
    return { platform: 'web', reason: `Web frontend detected (${webFramework} in package.json)` }
  }
  if (hasMobile) {
    return { platform: 'mobile', reason: `Mobile app detected (${mobileFramework} in package.json)` }
  }

  return { platform: 'none', reason: 'No web or mobile frontend detected in package.json' }
}

function detectBrownfield(projectRoot: string): { brownfield: boolean; signals: string[] } {
  const signals: string[] = []

  // Playwright signals
  if (fs.existsSync(path.join(projectRoot, 'playwright.config.ts'))) signals.push('playwright.config.ts')
  if (fs.existsSync(path.join(projectRoot, 'playwright.config.js'))) signals.push('playwright.config.js')

  // Check @playwright/test in package.json
  const pkgPath = path.join(projectRoot, 'package.json')
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))
      if (pkg.devDependencies?.['@playwright/test'] || pkg.dependencies?.['@playwright/test']) {
        signals.push('@playwright/test')
      }
    } catch { /* ignore */ }
  }

  // Maestro signals
  const maestroDir = path.join(projectRoot, 'maestro')
  if (fs.existsSync(maestroDir) && fs.statSync(maestroDir).isDirectory()) {
    const hasFlows = fs.existsSync(path.join(maestroDir, 'flows')) ||
      fs.existsSync(path.join(maestroDir, 'config.yaml'))
    if (hasFlows) signals.push('maestro/')
  }

  return { brownfield: signals.length > 0, signals }
}

const checkCommand: CommandModule<Record<string, unknown>, CheckArgs> = {
  command: 'check <step>',
  describe: 'Check if a conditional step is applicable to this project',
  builder: (yargs) => {
    return yargs.positional('step', {
      type: 'string',
      description: 'Step slug to check applicability for',
      demandOption: true,
    })
  },
  handler: async (argv) => {
    const projectRoot = argv.root ?? findProjectRoot(process.cwd())
    if (!projectRoot) {
      process.stderr.write('✗ error [PROJECT_NOT_INITIALIZED]: No .scaffold/ directory found\n')
      process.exit(1)
      return
    }

    const outputMode = resolveOutputMode(argv)
    const output = createOutputContext(outputMode)

    // Find the step
    const metaPrompts = discoverMetaPrompts(getPackagePipelineDir(projectRoot))
    const mp = metaPrompts.get(argv.step)
    if (!mp) {
      const suggestion = findClosestMatch(argv.step, [...metaPrompts.keys()])
      const msg = suggestion
        ? `Step '${argv.step}' not found. Did you mean '${suggestion}'?`
        : `Step '${argv.step}' not found`
      output.error({ code: 'DEP_TARGET_MISSING', message: msg, exitCode: 2 })
      process.exit(2)
      return
    }

    // For add-e2e-testing: full platform + brownfield detection
    if (argv.step === 'add-e2e-testing') {
      const { platform, reason } = detectPlatform(projectRoot)
      const applicable = platform !== 'none'
      const { brownfield, signals } = applicable ? detectBrownfield(projectRoot) : { brownfield: false, signals: [] }
      const mode = !applicable ? 'skip' : brownfield ? 'update' : 'fresh'

      if (outputMode === 'json') {
        output.result({
          step: argv.step,
          applicable,
          reason,
          platform,
          brownfield,
          brownfieldSignals: signals,
          mode,
        })
      } else {
        output.info(`Step: ${argv.step}`)
        output.info(`Applicable: ${applicable ? 'yes' : 'no'}`)
        output.info(`Platform: ${platform}`)
        output.info(`Brownfield: ${brownfield ? `yes (${signals.join(', ')})` : 'no'}`)
        output.info(`Mode: ${mode}`)
        output.info(`Reason: ${reason}`)
      }
      process.exit(0)
      return
    }

    // For automated-pr-review: GitHub remote + CI + CLI detection
    if (argv.step === 'automated-pr-review') {
      const { hasGithub, reason: githubReason } = detectGithubRemote(projectRoot)
      const hasCi = fs.existsSync(path.join(projectRoot, '.github', 'workflows'))
      const applicable = hasGithub
      const hasAgentsMd = fs.existsSync(path.join(projectRoot, 'AGENTS.md'))
      const mode = !applicable ? 'skip' : hasAgentsMd ? 'update' : 'fresh'

      // Detect available CLIs for local review
      let hasCodexCli = false
      let hasGeminiCli = false
      try { execSync('command -v codex', { encoding: 'utf8', timeout: 3000 }); hasCodexCli = true } catch { /* not available */ }
      try { execSync('command -v gemini', { encoding: 'utf8', timeout: 3000 }); hasGeminiCli = true } catch { /* not available */ }
      const availableClis = [hasCodexCli && 'codex', hasGeminiCli && 'gemini'].filter(Boolean) as string[]
      const recommendedMode = availableClis.length > 0 ? 'local-cli' : 'external-bot'

      if (outputMode === 'json') {
        output.result({
          step: argv.step,
          applicable,
          reason: githubReason,
          hasGithubRemote: hasGithub,
          hasCi,
          brownfield: hasAgentsMd,
          mode,
          availableClis,
          recommendedReviewMode: recommendedMode,
        })
      } else {
        output.info(`Step: ${argv.step}`)
        output.info(`Applicable: ${applicable ? 'yes' : 'no'}`)
        output.info(`GitHub remote: ${hasGithub ? 'yes' : 'no'}`)
        output.info(`CI configured: ${hasCi ? 'yes' : 'no'}`)
        output.info(`Available CLIs: ${availableClis.length > 0 ? availableClis.join(', ') : 'none'}`)
        output.info(`Recommended: ${recommendedMode}${availableClis.length === 2 ? ' (dual-model)' : ''}`)
        output.info(`Mode: ${mode}`)
        output.info(`Reason: ${githubReason}`)
      }
      process.exit(0)
      return
    }

    // Generic handling for other conditional steps
    const conditional = mp.frontmatter.conditional
    if (conditional) {
      const reason = `Step '${argv.step}' is conditional (${conditional}). No automated applicability check available — run the step and it will self-determine.`
      if (outputMode === 'json') {
        output.result({
          step: argv.step,
          applicable: null,
          reason,
          conditional,
        })
      } else {
        output.info(`Step: ${argv.step}`)
        output.info(`Conditional: ${conditional}`)
        output.info(reason)
      }
    } else {
      const reason = `Step '${argv.step}' is not conditional — it always applies when enabled.`
      if (outputMode === 'json') {
        output.result({
          step: argv.step,
          applicable: true,
          reason,
          conditional: null,
        })
      } else {
        output.info(`Step: ${argv.step}`)
        output.info(`Always applicable (not conditional)`)
      }
    }
    process.exit(0)
  },
}

export default checkCommand

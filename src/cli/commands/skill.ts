import type { CommandModule, Argv } from 'yargs'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveOutputMode } from '../middleware/output-mode.js'
import { createOutputContext } from '../output/context.js'

interface SkillArgs {
  action: string
  format?: string
  auto?: boolean
  verbose?: boolean
  root?: string
  force?: boolean
}

/** Resolve the package's skills directory (works in both dev and dist). */
function getPackageSkillsDir(): string {
  const __dirname = path.dirname(fileURLToPath(import.meta.url))
  // dist/cli/commands/ → ../../skills/
  // src/cli/commands/ → ../../../skills/
  const candidates = [
    path.resolve(__dirname, '../../skills'),
    path.resolve(__dirname, '../../../skills'),
  ]
  for (const dir of candidates) {
    if (fs.existsSync(dir)) return dir
  }
  return candidates[0]
}

/** Available skills to install. */
const INSTALLABLE_SKILLS = [
  {
    name: 'scaffold-runner',
    source: 'scaffold-runner/SKILL.md',
    description: 'Interactive CLI wrapper that surfaces decision points before execution',
  },
  {
    name: 'scaffold-pipeline',
    source: 'scaffold-pipeline/SKILL.md',
    description: 'Pipeline ordering reference and completion detection',
  },
]

const skillCommand: CommandModule<Record<string, unknown>, SkillArgs> = {
  command: 'skill <action>',
  describe: 'Manage scaffold skills for Claude Code',
  builder: (yargs: Argv) => {
    return yargs
      .positional('action', {
        describe: 'Action to perform',
        choices: ['install', 'list', 'remove'] as const,
        type: 'string',
        demandOption: true,
      })
      .option('force', {
        type: 'boolean',
        description: 'Overwrite existing skill files',
        default: false,
      })
  },
  handler: async (argv) => {
    const outputMode = resolveOutputMode(argv)
    const output = createOutputContext(outputMode)
    const projectRoot = argv.root ?? process.cwd()
    const skillsDir = path.join(projectRoot, '.claude', 'skills')
    const packageSkillsDir = getPackageSkillsDir()

    switch (argv.action) {
    case 'install': {
      // Create .claude/skills/ if needed
      if (!fs.existsSync(skillsDir)) {
        fs.mkdirSync(skillsDir, { recursive: true })
      }

      let installed = 0
      for (const skill of INSTALLABLE_SKILLS) {
        const sourcePath = path.join(packageSkillsDir, skill.source)
        const destPath = path.join(skillsDir, `${skill.name}.md`)

        if (fs.existsSync(destPath) && !argv.force) {
          output.info(`${skill.name}: already installed (use --force to overwrite)`)
          continue
        }

        if (!fs.existsSync(sourcePath)) {
          output.error(`${skill.name}: source not found at ${sourcePath}`)
          continue
        }

        fs.copyFileSync(sourcePath, destPath)
        installed++
        output.success(`${skill.name}: installed to .claude/skills/${skill.name}.md`)
      }

      if (installed > 0) {
        output.info(`\n${installed} skill(s) installed. Start a new Claude Code session to activate.`)
      } else {
        output.info('\nAll skills already installed.')
      }
      break
    }

    case 'list': {
      if (outputMode === 'json') {
        const skills = INSTALLABLE_SKILLS.map(skill => ({
          name: skill.name,
          description: skill.description,
          installed: fs.existsSync(path.join(skillsDir, `${skill.name}.md`)),
        }))
        output.result(skills)
      } else {
        output.info('Available scaffold skills:\n')
        for (const skill of INSTALLABLE_SKILLS) {
          const installed = fs.existsSync(path.join(skillsDir, `${skill.name}.md`))
          const status = installed ? '\u2713 installed' : '  not installed'
          output.info(`  ${status}  ${skill.name} — ${skill.description}`)
        }
        output.info('\nRun `scaffold skill install` to install all skills.')
      }
      break
    }

    case 'remove': {
      let removed = 0
      for (const skill of INSTALLABLE_SKILLS) {
        const destPath = path.join(skillsDir, `${skill.name}.md`)
        if (fs.existsSync(destPath)) {
          fs.unlinkSync(destPath)
          removed++
          output.success(`${skill.name}: removed`)
        }
      }
      if (removed === 0) {
        output.info('No scaffold skills found to remove.')
      }
      break
    }
    }

    process.exit(0)
  },
}

export default skillCommand

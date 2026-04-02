import type { CommandModule, Argv } from 'yargs'
import fs from 'node:fs'
import path from 'node:path'
import { resolveOutputMode } from '../middleware/output-mode.js'
import { createOutputContext } from '../output/context.js'
import { getPackageRoot } from '../../utils/fs.js'

interface SkillArgs {
  action: string
  format?: string
  auto?: boolean
  verbose?: boolean
  root?: string
  force?: boolean
}

interface SkillDefinition {
  name: string
  description: string
}

interface SkillTarget {
  sourceDir: 'skills' | 'agent-skills'
  installDir: '.claude/skills' | '.agents/skills'
  label: string
}

interface SkillTargetState {
  target: SkillTarget
  sourcePath: string
  destDir: string
  destPath: string
}

const SKILL_TARGETS: SkillTarget[] = [
  {
    sourceDir: 'skills',
    installDir: '.claude/skills',
    label: 'Claude Code',
  },
  {
    sourceDir: 'agent-skills',
    installDir: '.agents/skills',
    label: 'shared agents',
  },
]

/** Available skills to install. */
const INSTALLABLE_SKILLS: SkillDefinition[] = [
  {
    name: 'scaffold-runner',
    description: 'Interactive CLI wrapper that surfaces decision points before execution',
  },
  {
    name: 'scaffold-pipeline',
    description: 'Static reference for pipeline ordering, dependencies, and phase structure',
  },
]

/** Resolve the package's skills directory using the same root as pipeline/knowledge. */
function getPackageSkillsDir(sourceDir: SkillTarget['sourceDir']): string {
  return path.join(getPackageRoot(), sourceDir)
}

function getSkillSourcePath(skillName: string, target: SkillTarget): string {
  return path.join(getPackageSkillsDir(target.sourceDir), skillName, 'SKILL.md')
}

function getSkillDestDir(projectRoot: string, target: SkillTarget, skillName: string): string {
  return path.join(projectRoot, target.installDir, skillName)
}

function getSkillDestPath(projectRoot: string, target: SkillTarget, skillName: string): string {
  return path.join(getSkillDestDir(projectRoot, target, skillName), 'SKILL.md')
}

function buildTargetStates(projectRoot: string, skillName: string): SkillTargetState[] {
  return SKILL_TARGETS.map(target => ({
    target,
    sourcePath: getSkillSourcePath(skillName, target),
    destDir: getSkillDestDir(projectRoot, target, skillName),
    destPath: getSkillDestPath(projectRoot, target, skillName),
  }))
}

const skillCommand: CommandModule<Record<string, unknown>, SkillArgs> = {
  command: 'skill <action>',
  describe: 'Manage scaffold skills for Claude Code and shared agents',
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

    switch (argv.action) {
    case 'install': {
      for (const target of SKILL_TARGETS) {
        fs.mkdirSync(path.join(projectRoot, target.installDir), { recursive: true })
      }

      let installed = 0
      let hadSourceErrors = false
      let hadPartialInstalls = false
      for (const skill of INSTALLABLE_SKILLS) {
        const targetStates = buildTargetStates(projectRoot, skill.name)
        const allTargetsInstalled = targetStates.every(state => fs.existsSync(state.destPath))

        if (allTargetsInstalled && !argv.force) {
          output.info(`${skill.name}: already installed (use --force to overwrite)`)
          continue
        }

        let copiedTargets = 0
        let missingSources = 0
        for (const state of targetStates) {
          if (fs.existsSync(state.destPath) && !argv.force) {
            continue
          }

          if (!fs.existsSync(state.sourcePath)) {
            output.error(`${skill.name} [${state.target.label}]: source not found at ${state.sourcePath}`)
            hadSourceErrors = true
            missingSources++
            continue
          }

          if (state.target.installDir === '.claude/skills') {
            const oldFlatPath = path.join(projectRoot, '.claude', 'skills', `${skill.name}.md`)
            if (fs.existsSync(oldFlatPath)) {
              fs.unlinkSync(oldFlatPath)
            }
          }

          fs.mkdirSync(state.destDir, { recursive: true })
          fs.copyFileSync(state.sourcePath, state.destPath)
          copiedTargets++
          output.success(`${skill.name}: installed to ${state.target.installDir}/${skill.name}/SKILL.md`)
        }

        if (copiedTargets > 0) {
          installed++
          const finalTargetsInstalled = targetStates.every(state => fs.existsSync(state.destPath))
          if (!finalTargetsInstalled || missingSources > 0) {
            hadPartialInstalls = true
            output.warn(`${skill.name}: installed ${copiedTargets} target(s)`)
          }
        }
      }

      if (installed > 0) {
        if (hadSourceErrors || hadPartialInstalls) {
          output.warn(
            `\n${installed} skill(s) installed with warnings. Start a new Claude Code or Gemini session to activate.`,
          )
        } else {
          output.info(
            `\n${installed} skill(s) installed. Start a new Claude Code or Gemini session to activate.`,
          )
        }
      } else if (hadSourceErrors) {
        output.warn('\nNo skills installed due to source errors.')
      } else {
        output.info('\nAll skills already installed.')
      }
      break
    }

    case 'list': {
      const skills = INSTALLABLE_SKILLS.map(skill => {
        const claudeInstalled = fs.existsSync(getSkillDestPath(projectRoot, SKILL_TARGETS[0], skill.name))
        const agentsInstalled = fs.existsSync(getSkillDestPath(projectRoot, SKILL_TARGETS[1], skill.name))
        return {
          name: skill.name,
          description: skill.description,
          installed: claudeInstalled && agentsInstalled,
          claudeInstalled,
          agentInstalled: agentsInstalled,
        }
      })

      if (outputMode === 'json') {
        output.result(skills)
      } else {
        output.info('Available scaffold skills for Claude Code and shared agents:\n')
        for (const skill of skills) {
          const status = skill.installed ? '\u2713 installed' : '  not installed'
          output.info(`  ${status}  ${skill.name} — ${skill.description}`)
          output.info(`    .claude/skills/${skill.name}/SKILL.md: ${skill.claudeInstalled ? 'present' : 'missing'}`)
          output.info(`    .agents/skills/${skill.name}/SKILL.md: ${skill.agentInstalled ? 'present' : 'missing'}`)
        }
        output.info('\nRun `scaffold skill install` to install all skills for Claude Code and shared agents.')
      }
      break
    }

    case 'remove': {
      let removed = 0
      for (const skill of INSTALLABLE_SKILLS) {
        const removedTargets: string[] = []
        for (const target of SKILL_TARGETS) {
          const destDir = getSkillDestDir(projectRoot, target, skill.name)
          if (fs.existsSync(destDir)) {
            fs.rmSync(destDir, { recursive: true, force: true })
            removedTargets.push(target.installDir)
          }
        }

        if (removedTargets.length > 0) {
          removed++
          output.success(`${skill.name}: removed from ${removedTargets.join(' and ')}`)
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

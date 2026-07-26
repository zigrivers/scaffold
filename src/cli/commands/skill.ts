import type { CommandModule, Argv } from 'yargs'
import fs from 'node:fs'
import path from 'node:path'
import { resolveOutputMode } from '../middleware/output-mode.js'
import { createOutputContext } from '../output/context.js'
import { ExitCode } from '../../types/enums.js'
import {
  type SkillTarget,
  SKILL_TARGETS,
  INSTALLABLE_SKILLS,
  installAllSkills,
} from '../../core/skills/sync.js'
import {
  type SkillPlatform,
  SKILL_PLATFORMS,
  installSkillsForPlatform,
} from '../../core/skills/platform-install.js'

interface SkillArgs {
  action: string
  format?: string
  auto?: boolean
  verbose?: boolean
  root?: string
  force?: boolean
  platform?: string
}

function getSkillDestDir(projectRoot: string, target: SkillTarget, skillName: string): string {
  return path.join(projectRoot, target.installDir, skillName)
}

function getSkillDestPath(projectRoot: string, target: SkillTarget, skillName: string): string {
  return path.join(getSkillDestDir(projectRoot, target, skillName), 'SKILL.md')
}

const skillCommand: CommandModule<Record<string, unknown>, SkillArgs> = {
  command: 'skill <action>',
  describe: 'Manage scaffold skills (Claude Code + shared agents by default; '
    + '--platform for Codex/Antigravity/Cursor/OpenCode native forms)',
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
      .option('platform', {
        type: 'string',
        choices: SKILL_PLATFORMS,
        description: 'Install in a CLI\'s native form (codex/antigravity → AGENTS.md, '
          + 'cursor → .cursor/rules, opencode → .opencode/skills). Default: Claude Code + shared agents.',
      })
  },
  handler: async (argv) => {
    const outputMode = resolveOutputMode(argv)
    const output = createOutputContext(outputMode)
    const projectRoot = argv.root ?? process.cwd()

    switch (argv.action) {
    case 'install': {
      // Native-form install for a specific CLI (AGENTS.md / .cursor/rules /
      // .opencode/skills); the default path below covers Claude Code + shared.
      if (argv.platform) {
        const { installed, skipped, errors } = installSkillsForPlatform(
          projectRoot, argv.platform as SkillPlatform, { force: argv.force },
        )
        // Errors are surfaced here as well as in the fail() envelope below, so
        // a partial install (some skills in, some failed) never loses them.
        for (const e of errors) output.warn(e)
        if (installed.length > 0) {
          output.info(`\nInstalled scaffold skills for ${argv.platform}:\n  ${installed.join('\n  ')}`)
        }
        if (skipped.length > 0) {
          output.warn(`\nSkipped:\n  ${skipped.join('\n  ')}`)
        }
        // A failed native install must not report success.
        if (errors.length > 0) {
          output.fail(errors.map(message => ({
            code: 'SKILL_INSTALL_FAILED',
            message,
            exitCode: ExitCode.ValidationError,
            recovery: 'Check the skill sources are readable, then re-run '
              + `\`scaffold skill install --platform ${argv.platform}\``,
          })))
          process.exitCode = ExitCode.ValidationError
          return
        }
        if (installed.length === 0 && skipped.length === 0) {
          output.warn('\nNo skills installed.')
        }
        break
      }

      // Clean up legacy flat-file skill format (.claude/skills/<name>.md)
      for (const skill of INSTALLABLE_SKILLS) {
        const oldFlatPath = path.join(projectRoot, '.claude', 'skills', `${skill.name}.md`)
        if (fs.existsSync(oldFlatPath)) {
          fs.unlinkSync(oldFlatPath)
        }
      }

      const result = installAllSkills(projectRoot, { force: argv.force })

      if (result.installed > 0) {
        if (result.errors.length > 0) {
          // Report each error, not just the count. Dropping the loop when this
          // site moved to fail() would have silently discarded every message on
          // the partial-success path — worse than the stderr-only reporting the
          // sweep set out to fix. They are warn() rather than error() because
          // this branch exits 0.
          for (const e of result.errors) output.warn(e)
          const msg = `\n${result.installed} skill(s) installed with warnings.`
            + ' Start a new agent session (Claude Code, OpenCode, …) to activate.'
          output.warn(msg)
        } else {
          output.info(
            `\n${result.installed} skill(s) installed. ` +
            'Start a new agent session (Claude Code, OpenCode, …) to activate.',
          )
        }
      } else if (result.errors.length > 0) {
        output.fail(result.errors.map(message => ({
          code: 'SKILL_INSTALL_FAILED',
          message,
          exitCode: ExitCode.ValidationError,
          recovery: 'Check the bundled skill sources are readable, then re-run `scaffold skill install`',
        })))
        process.exitCode = ExitCode.ValidationError
        return // a failed install must not report success (matches --platform)
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

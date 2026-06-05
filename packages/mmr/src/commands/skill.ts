import type { CommandModule, ArgumentsCamelCase } from 'yargs'
import { existsSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { findProjectRoot } from '../core/project-root.js'
import {
  SKILL_PLATFORMS,
  resolvePlatforms,
  planSkillInstall,
  executePlan,
  UnknownPlatformError,
  type PlanEntry,
} from '../core/skill-install.js'

interface SkillArgs {
  action: string
  platform?: string[]
  all?: boolean
  dir?: string
  force?: boolean
  'dry-run'?: boolean
}

function describeEntry(entry: PlanEntry): string {
  const who = entry.platforms.join(' + ')
  switch (entry.action) {
  case 'create':
    return `  + ${entry.relPath}  (${who})`
  case 'update':
    return `  ~ ${entry.relPath}  (${who})`
  case 'unchanged':
    return `  = ${entry.relPath}  (${who}) — already up to date`
  case 'blocked-exists':
    return `  ! ${entry.relPath}  (${who}) — exists; pass --force to overwrite`
  }
}

function skillInstall(args: ArgumentsCamelCase<SkillArgs>): void {
  let platforms
  try {
    platforms = resolvePlatforms(args.platform ?? [], args.all === true)
  } catch (err) {
    if (err instanceof UnknownPlatformError) {
      console.error(err.message)
      process.exit(1)
    }
    throw err
  }

  if (platforms.length === 0) {
    console.error(
      `Specify at least one platform (--platform ${SKILL_PLATFORMS.join('|')}) or --all.`,
    )
    process.exit(1)
    return
  }

  const projectRoot = args.dir ? resolve(args.dir) : findProjectRoot()
  if (args.dir && existsSync(projectRoot) && !statSync(projectRoot).isDirectory()) {
    console.error(`--dir is not a directory: ${projectRoot}`)
    process.exit(1)
    return
  }
  const dryRun = args['dry-run'] === true
  const plan = planSkillInstall({ projectRoot, platforms, force: args.force === true })

  const blocked = plan.filter((e) => e.action === 'blocked-exists')
  const writes = plan.filter((e) => e.action === 'create' || e.action === 'update')

  console.log(`${dryRun ? 'Planned' : 'Installing'} MMR review skill in ${projectRoot}:`)
  for (const entry of plan) console.log(describeEntry(entry))

  if (dryRun) {
    console.log(`\nDry run — no files written (${writes.length} would change).`)
    return
  }

  executePlan(plan)
  console.log(`\nDone — ${writes.length} file(s) written.`)
  if (blocked.length > 0) {
    console.log(`${blocked.length} skipped (already exist; re-run with --force to overwrite).`)
    process.exit(1)
  }
}

export const skillCommand: CommandModule<object, SkillArgs> = {
  command: 'skill <action>',
  describe: 'Install platform-specific MMR review skills into a project',
  builder: (yargs) =>
    yargs
      .positional('action', {
        type: 'string',
        demandOption: true,
        describe: 'Skill action',
        choices: ['install'],
      })
      .option('platform', {
        type: 'string',
        array: true,
        describe: `Target platform (repeatable): ${SKILL_PLATFORMS.join(', ')}`,
      })
      .option('all', {
        type: 'boolean',
        default: false,
        describe: 'Install for every supported platform',
      })
      .option('dir', {
        type: 'string',
        describe: 'Install into this directory instead of the detected project root',
      })
      .option('force', {
        type: 'boolean',
        default: false,
        describe: 'Overwrite existing dedicated skill files (e.g. .cursor/rules/mmr-review.mdc)',
      })
      .option('dry-run', {
        type: 'boolean',
        default: false,
        describe: 'Show what would be written without writing anything',
      }),
  handler: (args: ArgumentsCamelCase<SkillArgs>) => {
    switch (args.action) {
    case 'install':
      skillInstall(args)
      break
    default:
      console.error(`Unknown skill action: ${args.action}`)
      process.exit(1)
    }
  },
}

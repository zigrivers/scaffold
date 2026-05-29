import type { CommandModule, Argv } from 'yargs'
import fs from 'node:fs'
import { execFileSync } from 'node:child_process'
import { getPackageGuidesDir } from '../../utils/fs.js'
import { buildGuidesIndex } from '../../guides/loader.js'
import { buildAllGuides } from '../../guides/build.js'
import { findProjectRoot } from '../middleware/project-root.js'
import { resolveOutputMode } from '../middleware/output-mode.js'
import { createOutputContext } from '../output/context.js'
import type { GuideEntry } from '../../guides/types.js'

export interface GuideSummary {
  topic: string
  title: string
  description: string
  category: string
}

export function listGuides(projectRoot?: string): GuideSummary[] {
  const idx = buildGuidesIndex(getPackageGuidesDir(projectRoot))
  return [...idx.values()]
    .sort((a, b) => a.frontmatter.order - b.frontmatter.order)
    .map((e) => ({
      topic: e.topic,
      title: e.frontmatter.title,
      description: e.frontmatter.description,
      category: e.frontmatter.category,
    }))
}

export function resolveGuide(projectRoot: string | undefined, topic: string): GuideEntry | null {
  return buildGuidesIndex(getPackageGuidesDir(projectRoot)).get(topic) ?? null
}

function openInBrowser(file: string): void {
  let opener = 'xdg-open'
  if (process.platform === 'darwin') opener = 'open'
  if (process.platform === 'win32') opener = 'start'
  try {
    execFileSync(opener, [file])
  } catch {
    // Ignore errors when opening browser
  }
}

interface GuidesArgs {
  topic?: string
  list?: boolean
  markdown?: boolean
  'print-path'?: boolean
  'no-open'?: boolean
  build?: boolean
  all?: boolean
  format?: string
  auto?: boolean
  root?: string
}

const guidesCommand: CommandModule<Record<string, unknown>, GuidesArgs> = {
  command: 'guides [topic]',
  describe: 'Open, list, or build scaffold reference guides',
  builder: (yargs: Argv) =>
    yargs
      .positional('topic', { type: 'string', describe: 'Guide topic to open' })
      .option('list', { type: 'boolean', default: false, describe: 'List available guides' })
      .option('markdown', { type: 'boolean', default: false, describe: 'Print the guide markdown source' })
      .option('print-path', { type: 'boolean', default: false, describe: 'Print the guide\'s markdown path' })
      .option('no-open', { type: 'boolean', default: false, describe: 'Do not open a browser' })
      .option('build', {
        type: 'boolean', default: false, describe: 'Regenerate guide HTML from sources (maintainer)',
      })
      .option('all', {
        type: 'boolean', default: false, describe: 'With --build, regenerate every guide',
      }) as Argv<GuidesArgs>,
  handler: async (argv) => {
    const output = createOutputContext(resolveOutputMode(argv))
    const projectRoot = argv.root ?? findProjectRoot(process.cwd()) ?? undefined

    if (argv.build) {
      await buildAllGuides(projectRoot)
      output.success('Guides rebuilt.')
      process.exit(0)
    }

    if (argv.list) {
      const guides = listGuides(projectRoot)
      if (resolveOutputMode(argv) === 'json') {
        output.result(guides)
      } else {
        for (const g of guides) {
          output.info(`${g.topic.padEnd(16)} ${g.description}`)
        }
      }
      process.exit(0)
    }

    if (!argv.topic) {
      const indexHtml = `${getPackageGuidesDir(projectRoot)}/index.html`
      if (!argv['no-open'] && fs.existsSync(indexHtml)) openInBrowser(indexHtml)
      output.info(`Guides index: ${indexHtml}`)
      process.exit(0)
    }

    const guide = resolveGuide(projectRoot, argv.topic)
    if (!guide) {
      output.error({ code: 'GUIDE_NOT_FOUND', message: `No guide named "${argv.topic}"`, exitCode: 1 })
      process.exit(1)
    }

    if (argv['print-path']) {
      output.info(guide.mdPath)
      process.exit(0)
    }

    if (argv.markdown) {
      output.info(fs.readFileSync(guide.mdPath, 'utf8'))
      process.exit(0)
    }

    if (!argv['no-open']) openInBrowser(guide.htmlPath)
    output.info(`Opened ${guide.htmlPath}`)
    process.exit(0)
  },
}

export default guidesCommand

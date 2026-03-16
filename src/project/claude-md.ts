import fs from 'node:fs'
import path from 'node:path'
import type { ScaffoldWarning } from '../types/index.js'

export interface SectionRegistry {
  [stepSlug: string]: {
    heading: string
    tokenBudget: number
  }
}

export interface SectionStatus {
  slug: string
  heading: string
  tokenBudget: number
  tokensUsed: number
  filled: boolean
  overBudget: boolean
}

export interface BudgetStatus {
  totalBudget: number
  totalUsed: number
  sections: SectionStatus[]
}

const OPEN_MARKER = (slug: string) => `<!-- scaffold:managed by ${slug} -->`
const CLOSE_MARKER = '<!-- /scaffold:managed -->'
const TOTAL_BUDGET = 2000

// Token count approximation: word count * 1.3
function estimateTokens(content: string): number {
  const words = content.trim().split(/\s+/).filter(w => w.length > 0)
  return Math.ceil(words.length * 1.3)
}

const DEFAULT_REGISTRY: SectionRegistry = {
  'create-prd': { heading: '## Project Overview', tokenBudget: 300 },
  'system-architecture': { heading: '## Architecture Summary', tokenBudget: 300 },
  'domain-modeling': { heading: '## Domain Model', tokenBudget: 300 },
  'implementation-tasks': { heading: '## Implementation Tasks', tokenBudget: 300 },
  'testing-strategy': { heading: '## Testing Strategy', tokenBudget: 200 },
  'developer-onboarding-guide': { heading: '## Developer Onboarding', tokenBudget: 300 },
}

export class ClaudeMdManager {
  private claudeMdPath: string
  private registry: SectionRegistry

  constructor(projectRoot: string, registry: SectionRegistry = DEFAULT_REGISTRY) {
    this.claudeMdPath = path.join(projectRoot, 'CLAUDE.md')
    this.registry = registry
  }

  private readFile(): string {
    if (!fs.existsSync(this.claudeMdPath)) return ''
    return fs.readFileSync(this.claudeMdPath, 'utf8')
  }

  private writeFile(content: string): void {
    const dir = path.dirname(this.claudeMdPath)
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(this.claudeMdPath, content, 'utf8')
  }

  fillSection(slug: string, content: string): ScaffoldWarning[] {
    const warnings: ScaffoldWarning[] = []
    const sectionDef = this.registry[slug]
    if (!sectionDef) return warnings

    const openMarker = OPEN_MARKER(slug)
    const closeMarker = CLOSE_MARKER
    const tokensUsed = estimateTokens(content)
    const totalAfter = this.getBudgetStatus().totalUsed - this.getSectionTokens(slug) + tokensUsed

    if (tokensUsed > sectionDef.tokenBudget) {
      warnings.push({
        code: 'CMD_SECTION_OVER_BUDGET',
        message: `Section '${slug}' uses ~${tokensUsed} tokens, exceeding budget of ${sectionDef.tokenBudget}`,
        context: { slug, tokensUsed, budget: sectionDef.tokenBudget },
      })
    }
    if (totalAfter > TOTAL_BUDGET) {
      warnings.push({
        code: 'CMD_SECTION_OVER_BUDGET',
        message: `Total managed sections use ~${totalAfter} tokens, exceeding total budget of ${TOTAL_BUDGET}`,
        context: { totalUsed: totalAfter, totalBudget: TOTAL_BUDGET },
      })
    }

    let fileContent = this.readFile()
    const managedBlock = `${openMarker}\n${sectionDef.heading}\n\n${content}\n${closeMarker}`

    // Replace existing or insert before first unmanaged content, or append
    const existingPattern = new RegExp(
      escapeRegex(openMarker) + '[\\s\\S]*?' + escapeRegex(closeMarker),
      'g',
    )

    if (existingPattern.test(fileContent)) {
      fileContent = fileContent.replace(existingPattern, managedBlock)
    } else {
      fileContent = fileContent + (fileContent.endsWith('\n') ? '' : '\n') + '\n' + managedBlock + '\n'
    }

    this.writeFile(fileContent)
    return warnings
  }

  readSection(slug: string): string | null {
    const openMarker = OPEN_MARKER(slug)
    const fileContent = this.readFile()
    const pattern = new RegExp(
      escapeRegex(openMarker) + '([\\s\\S]*?)' + escapeRegex(CLOSE_MARKER),
    )
    const match = fileContent.match(pattern)
    if (!match) return null
    // Remove the heading line
    const lines = match[1].split('\n').filter(l => l.trim().length > 0)
    const withoutHeading = lines.slice(1).join('\n').trim()
    return withoutHeading || null
  }

  private getSectionTokens(slug: string): number {
    const content = this.readSection(slug)
    if (!content) return 0
    return estimateTokens(content)
  }

  listSections(): SectionStatus[] {
    return Object.entries(this.registry).map(([slug, def]) => {
      const tokensUsed = this.getSectionTokens(slug)
      return {
        slug,
        heading: def.heading,
        tokenBudget: def.tokenBudget,
        tokensUsed,
        filled: this.readSection(slug) !== null,
        overBudget: tokensUsed > def.tokenBudget,
      }
    })
  }

  getBudgetStatus(): BudgetStatus {
    const sections = this.listSections()
    const totalUsed = sections.reduce((sum, s) => sum + s.tokensUsed, 0)
    return { totalBudget: TOTAL_BUDGET, totalUsed, sections }
  }
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

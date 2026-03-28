/**
 * Canonical phase definitions for the scaffold pipeline.
 * This is the single source of truth for phase slugs, display names, and ordering.
 * All other references (docs, skills, commands) must match these definitions.
 */
export const PHASES = [
  { number: 1, slug: 'pre', displayName: 'Product Definition' },
  { number: 2, slug: 'foundation', displayName: 'Project Foundation' },
  { number: 3, slug: 'environment', displayName: 'Development Environment' },
  { number: 4, slug: 'integration', displayName: 'Testing Integration' },
  { number: 5, slug: 'modeling', displayName: 'Domain Modeling' },
  { number: 6, slug: 'decisions', displayName: 'Architecture Decisions' },
  { number: 7, slug: 'architecture', displayName: 'System Architecture' },
  { number: 8, slug: 'specification', displayName: 'Specifications' },
  { number: 9, slug: 'quality', displayName: 'Quality Gates' },
  { number: 10, slug: 'parity', displayName: 'Platform Parity' },
  { number: 11, slug: 'consolidation', displayName: 'Consolidation' },
  { number: 12, slug: 'planning', displayName: 'Planning' },
  { number: 13, slug: 'validation', displayName: 'Validation' },
  { number: 14, slug: 'finalization', displayName: 'Finalization' },
] as const

/** Valid phase slug values derived from the PHASES constant. */
export type PhaseSlug = typeof PHASES[number]['slug']

/** Lookup map from phase slug to phase metadata. */
export const PHASE_BY_SLUG = Object.fromEntries(
  PHASES.map(p => [p.slug, p]),
) as Record<PhaseSlug, typeof PHASES[number]>

/**
 * Parsed YAML frontmatter from a meta-prompt .md file.
 * See frontmatter-schema.md (authoritative source).
 * Note: kebab-case YAML keys are converted to camelCase on parse.
 */
export interface MetaPromptFrontmatter {
  /** Step identifier matching the filename stem. Kebab-case pattern ^[a-z][a-z0-9-]*$ */
  name: string
  /** One-line purpose. Max 200 chars. */
  description: string
  /** Pipeline phase slug. See PHASES constant for valid values. */
  phase: string
  /** Unique position. Phase-aligned: Phase N → N00-N99. Primary tiebreaker in topological sort. */
  order: number
  /** Step slugs that must complete before this step can run. */
  dependencies: string[]
  /** Artifact paths this step produces (relative to project root). */
  outputs: string[]
  /** When 'if-needed', step is conditionally evaluated during init. */
  conditional: 'if-needed' | null
  /** Knowledge base entry names to load during assembly. */
  knowledgeBase: string[]  // from 'knowledge-base' YAML key
  /** Cross-cutting artifact references beyond the dependency chain. */
  reads: string[]
  [key: string]: unknown  // forward compatibility — unknown fields preserved
}

/** A loaded meta-prompt file with parsed frontmatter and body. */
export interface MetaPromptFile {
  /** The filename stem (matches frontmatter name). */
  stepName: string
  /** Absolute file path. */
  filePath: string
  /** Validated frontmatter. */
  frontmatter: MetaPromptFrontmatter
  /** Raw markdown body (everything after closing ---). */
  body: string
  /** Parsed level-2 heading sections from the body. */
  sections: Record<string, string>
}

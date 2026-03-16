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
  /**
   * Pipeline phase: 'pre' | 'modeling' | 'decisions' | 'architecture' |
   * 'specification' | 'planning' | 'quality' | 'validation' | 'finalization'
   */
  phase: string
  /** Unique position 1-36. Primary tiebreaker in topological sort. */
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

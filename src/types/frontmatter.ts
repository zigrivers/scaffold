/**
 * Canonical phase definitions for the scaffold pipeline.
 * This is the single source of truth for phase slugs, display names, and ordering.
 * All other references (docs, skills, commands) must match these definitions.
 */
export const PHASES = [
  {
    number: 0, slug: 'vision', displayName: 'Product Vision',
    // eslint-disable-next-line max-len
    description: 'Transforms your idea into a strategic vision document covering who it\'s for, what makes it different, and what success looks like. The review step stress-tests the vision for gaps, and the innovate step explores market positioning opportunities. Without this, later steps lack a clear North Star and features drift.',
  },
  {
    number: 1, slug: 'pre', displayName: 'Product Definition',
    // eslint-disable-next-line max-len
    description: 'Translates your vision into a detailed product requirements document (PRD) with features, user personas, constraints, and success criteria, then breaks the PRD into user stories with testable acceptance criteria. Review and innovation steps audit for gaps and suggest enhancements. Without this, you\'re building without a spec.',
  },
  {
    number: 2, slug: 'foundation', displayName: 'Project Foundation',
    // eslint-disable-next-line max-len
    description: 'Researches and documents your technology choices with rationale, creates coding standards tailored to your stack with actual linter configs, defines your testing strategy and test pyramid, and designs a directory layout optimized for parallel AI agent work. Without this, agents guess at conventions and produce inconsistent code.',
  },
  {
    number: 3, slug: 'environment', displayName: 'Development Environment',
    // eslint-disable-next-line max-len
    description: 'Sets up your local dev environment with one-command startup and live reload, creates a design system (web apps only), configures your git branching strategy with CI pipeline and worktree scripts for parallel agents, optionally sets up automated PR review, and configures AI memory so conventions persist across sessions.',
  },
  {
    number: 4, slug: 'integration', displayName: 'Testing Integration',
    // eslint-disable-next-line max-len
    description: 'Auto-detects your platform (web or mobile) and configures end-to-end testing — Playwright for web apps, Maestro for mobile/Expo. Skips automatically for backend-only projects. Without this, your test pyramid has no top level.',
  },
  {
    number: 5, slug: 'modeling', displayName: 'Domain Modeling',
    // eslint-disable-next-line max-len
    description: 'Analyzes your user stories to identify the core concepts in your project — entities, their relationships, invariants, and domain events. Establishes a shared vocabulary that all docs and code will use. Without this, different docs use different names for the same concept and agents create duplicate logic.',
  },
  {
    number: 6, slug: 'decisions', displayName: 'Architecture Decisions',
    // eslint-disable-next-line max-len
    description: 'Documents every significant technology and design decision as an Architecture Decision Record — what was decided, what alternatives were considered, and why. The review catches contradictions and missing decisions. Without this, future contributors don\'t know why things are the way they are.',
  },
  {
    number: 7, slug: 'architecture', displayName: 'System Architecture',
    // eslint-disable-next-line max-len
    description: 'Designs the system blueprint — which components exist, how data flows between them, where each piece of code lives, and how the system can be extended. Translates your domain model and decisions into a concrete structure that implementation will follow. Without this, agents make conflicting structural assumptions.',
  },
  {
    number: 8, slug: 'specification', displayName: 'Specifications',
    // eslint-disable-next-line max-len
    description: 'Creates detailed interface specifications for each layer of your system. Database schema enforces business rules via constraints. API contracts define every endpoint with request/response shapes, error codes, and auth requirements. UX spec maps user flows, interaction states, and accessibility. Each is conditional — only generated if your project has that layer.',
  },
  {
    number: 9, slug: 'quality', displayName: 'Quality Gates',
    // eslint-disable-next-line max-len
    description: 'Reviews your testing strategy for coverage gaps, generates test skeletons from acceptance criteria, creates automated eval checks that verify code meets documented standards, designs your deployment pipeline with monitoring and incident response, and conducts a security review covering OWASP Top 10 and threat modeling. Without this, quality is an afterthought.',
  },
  {
    number: 10, slug: 'parity', displayName: 'Platform Parity',
    // eslint-disable-next-line max-len
    description: 'For projects targeting multiple platforms, audits all documentation for platform-specific gaps — features that work on one platform but aren\'t specified for another, input pattern differences, and platform-specific testing coverage. Skips automatically for single-platform projects.',
  },
  {
    number: 11, slug: 'consolidation', displayName: 'Consolidation',
    // eslint-disable-next-line max-len
    description: 'Optimizes your CLAUDE.md to stay under 200 lines with critical patterns front-loaded, then audits all workflow documentation for consistency — making sure commit formats, branch naming, PR workflows, and key commands match across every doc. Without this, agents encounter conflicting instructions.',
  },
  {
    number: 12, slug: 'planning', displayName: 'Planning',
    // eslint-disable-next-line max-len
    description: 'Decomposes your user stories and architecture into concrete, implementable tasks — each scoped to ~150 lines of code, limited to 3 files, with clear acceptance criteria and no ambiguous decisions. The review validates coverage, checks the dependency graph for cycles, and runs multi-model validation at higher depths.',
  },
  {
    number: 13, slug: 'validation', displayName: 'Validation',
    // eslint-disable-next-line max-len
    description: 'Seven cross-cutting audits that catch problems before implementation begins: scope creep, dependency graph cycles, implementability ambiguities, decision completeness, traceability gaps, cross-phase naming drift, and critical path broken handoffs. Without this phase, hidden spec problems surface during implementation as expensive rework.',
  },
  {
    number: 14, slug: 'finalization', displayName: 'Finalization',
    // eslint-disable-next-line max-len
    description: 'Applies all findings from the validation phase, freezes documentation, creates a developer onboarding guide for anyone joining the project, and writes the implementation playbook — the operational document agents reference during every coding session. Without this, there\'s no bridge between planning and building.',
  },
  {
    number: 15, slug: 'build', displayName: 'Build',
    // eslint-disable-next-line max-len
    description: 'Stateless execution steps that can be run repeatedly. Single-agent and multi-agent modes start the TDD implementation loop. Resume commands restore session context after breaks. Quick-task handles one-off bug fixes outside the main plan. New-enhancement adds a feature to an existing project with full planning rigor.',
  },
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
  /** User-facing summary of what the step does and what it produces. Optional, max 500 chars. */
  summary?: string | null
  /** Pipeline phase slug. See PHASES constant for valid values. Null for tools. */
  phase: string | null
  /** Unique position. Phase-aligned: Phase N → N00-N99. Primary tiebreaker in topological sort. Null for tools. */
  order: number | null
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
  /** Cross-service artifact references — each entry points at a foreign service:step pair (Wave 3c). */
  crossReads?: Array<{ service: string; step: string }>
  /** When true, step has no completion state tracking (on-demand, always available). */
  stateless: boolean
  /** Source category: 'pipeline' for sequential steps, 'tool' for utility commands. */
  category: 'pipeline' | 'tool'
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

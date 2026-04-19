// src/project/frontmatter.ts
import fs from 'node:fs'
import yaml from 'js-yaml'
import { z } from 'zod'
import type { MetaPromptFrontmatter } from '../types/index.js'
import type { ScaffoldError, ScaffoldWarning } from '../types/index.js'
import { PHASES } from '../types/frontmatter.js'
import {
  frontmatterMissing,
  frontmatterUnclosed,
  frontmatterYamlError,
  frontmatterNameInvalid,
  frontmatterUnknownField,
  fieldMissing,
} from '../utils/errors.js'

// Known valid YAML keys (for unknown field detection)
const KNOWN_YAML_KEYS = new Set([
  'name',
  'description',
  'summary',
  'phase',
  'order',
  'dependencies',
  'depends-on',
  'outputs',
  'conditional',
  'knowledge-base',
  'reads',
  'cross-reads',
  'stateless',
  'category',
  'argument-hint',
])

// Valid categories for meta-prompt source classification
const VALID_CATEGORIES = ['pipeline', 'tool'] as const

// Zod schema for frontmatter validation
// Tools (category: 'tool') allow null phase/order and empty outputs.
// Pipeline steps (category: 'pipeline') require phase/order and non-empty outputs.
const frontmatterSchema = z.object({
  name: z.string().regex(/^[a-z][a-z0-9-]*$/, 'name must be kebab-case'),
  description: z.string().max(200),
  summary: z.string().max(500).nullable().default(null),
  phase: z.enum(PHASES.map(p => p.slug) as [string, ...string[]]).nullable().default(null),
  order: z.number().min(0).max(1599).nullable().default(null),
  dependencies: z.array(z.string().regex(/^[a-z][a-z0-9-]*$/)).default([]),
  outputs: z.array(z.string()).default([]),
  conditional: z.enum(['if-needed']).nullable().default(null),
  knowledgeBase: z.array(z.string()).default([]),
  reads: z.array(z.string().regex(/^[a-z][a-z0-9-]*$/)).default([]),
  crossReads: z.array(
    z.object({
      service: z.string().regex(/^[a-z][a-z0-9-]*$/, 'cross-reads.service must be kebab-case'),
      step: z.string().regex(/^[a-z][a-z0-9-]*$/, 'cross-reads.step must be kebab-case'),
    }),
  ).default([]),
  stateless: z.boolean().default(false),
  category: z.enum(VALID_CATEGORIES).default('pipeline'),
}).superRefine((data, ctx) => {
  // Pipeline steps require phase, order, and non-empty outputs
  if (data.category === 'pipeline') {
    if (data.phase === null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'phase is required for pipeline steps', path: ['phase'] })
    }
    if (data.order === null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'order is required for pipeline steps', path: ['order'] })
    }
    // Stateless pipeline steps (build phase) can have empty outputs
    if (!data.stateless && data.outputs.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'outputs must not be empty for stateful pipeline steps',
        path: ['outputs'],
      })
    }
  }
})

interface ParseResult {
  yamlText: string
  body: string
}

/** Extract YAML text and body from file content. Throws ScaffoldError on structural issues. */
function extractFrontmatter(content: string, filePath: string): ParseResult {
  const lines = content.split('\n')

  if (lines[0].trim() !== '---') {
    throw frontmatterMissing(filePath)
  }

  // Find the closing ---
  let closeIdx = -1
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') {
      closeIdx = i
      break
    }
  }

  if (closeIdx === -1) {
    throw frontmatterUnclosed(filePath)
  }

  const yamlText = lines.slice(1, closeIdx).join('\n')
  // Body is everything after the closing ---, preserving a leading newline
  const body = lines.slice(closeIdx + 1).join('\n')

  return { yamlText, body }
}

/** Parse YAML text into a raw object. Throws ScaffoldError on parse failure. */
function parseYaml(yamlText: string, filePath: string): Record<string, unknown> {
  let parsed: unknown
  try {
    parsed = yaml.load(yamlText, { schema: yaml.FAILSAFE_SCHEMA })
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    throw frontmatterYamlError(filePath, detail)
  }

  if (parsed === null || parsed === undefined) {
    return {}
  }

  if (typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw frontmatterYamlError(filePath, 'frontmatter must be a YAML mapping')
  }

  return parsed as Record<string, unknown>
}

/** Detect unknown fields and return warnings. */
function collectUnknownFieldWarnings(raw: Record<string, unknown>, filePath: string): ScaffoldWarning[] {
  const warnings: ScaffoldWarning[] = []
  for (const key of Object.keys(raw)) {
    if (!KNOWN_YAML_KEYS.has(key)) {
      warnings.push(frontmatterUnknownField(key, filePath))
    }
  }
  return warnings
}

/**
 * Convert raw YAML object to normalized TypeScript shape:
 * - knowledge-base → knowledgeBase
 * - depends-on → dependencies (alias)
 * - FAILSAFE_SCHEMA returns all values as strings, so we must coerce numbers
 */
function normalizeRawObject(raw: Record<string, unknown>): Record<string, unknown> {
  const normalized: Record<string, unknown> = { ...raw }

  // knowledge-base → knowledgeBase
  if ('knowledge-base' in normalized) {
    normalized['knowledgeBase'] = normalized['knowledge-base']
    delete normalized['knowledge-base']
  }

  // depends-on → dependencies (alias, only if dependencies not already set)
  if ('depends-on' in normalized && !('dependencies' in normalized)) {
    normalized['dependencies'] = normalized['depends-on']
  }
  // Always remove depends-on from the object
  if ('depends-on' in normalized) {
    delete normalized['depends-on']
  }

  // cross-reads → crossReads (Wave 3c)
  if ('cross-reads' in normalized) {
    normalized['crossReads'] = normalized['cross-reads']
    delete normalized['cross-reads']
  }

  // FAILSAFE_SCHEMA returns all scalars as strings — coerce order to number
  if (typeof normalized['order'] === 'string') {
    if (normalized['order'] === 'null') {
      normalized['order'] = null
    } else {
      const n = Number(normalized['order'])
      normalized['order'] = isNaN(n) ? normalized['order'] : n
    }
  }

  // FAILSAFE_SCHEMA returns null as the string "null" — coerce to actual null
  if (normalized['conditional'] === 'null') {
    normalized['conditional'] = null
  }

  // Coerce phase "null" string to actual null (for tools)
  if (normalized['phase'] === 'null') {
    normalized['phase'] = null
  }

  // FAILSAFE_SCHEMA returns booleans as strings — coerce stateless
  if (normalized['stateless'] === 'true') {
    normalized['stateless'] = true
  } else if (normalized['stateless'] === 'false') {
    normalized['stateless'] = false
  }

  // Coerce arrays parsed via FAILSAFE_SCHEMA (values remain strings, which is correct)
  // Arrays returned by FAILSAFE_SCHEMA are already arrays of strings — no coercion needed

  return normalized
}

/**
 * Validate the normalized object with Zod, mapping errors to ScaffoldError.
 * Returns validated frontmatter + array of errors.
 */
function zodValidate(
  normalized: Record<string, unknown>,
  filePath: string,
): { frontmatter: MetaPromptFrontmatter | null; errors: ScaffoldError[] } {
  const result = frontmatterSchema.safeParse(normalized)
  if (result.success) {
    // Preserve unknown fields on the returned object
    const fm: MetaPromptFrontmatter = {
      ...normalized,
      ...result.data,
    } as MetaPromptFrontmatter
    return { frontmatter: fm, errors: [] }
  }

  const errors: ScaffoldError[] = []
  for (const issue of result.error.issues) {
    const field = issue.path[0] ? String(issue.path[0]) : 'unknown'

    if (issue.code === 'invalid_enum_value' || issue.code === 'too_small' || issue.code === 'too_big') {
      // Generic field-level error — map to FIELD_MISSING-like or use fieldWrongType
      errors.push(fieldMissing(field, filePath))
    } else if (issue.code === 'invalid_string' && field === 'name') {
      const nameVal = String(normalized['name'] ?? '')
      errors.push(frontmatterNameInvalid(nameVal, filePath))
    } else if (issue.code === 'invalid_type' && issue.received === 'undefined') {
      errors.push(fieldMissing(field, filePath))
    } else {
      // Catch-all
      errors.push(fieldMissing(field, filePath))
    }
  }

  return { frontmatter: null, errors }
}

/**
 * Parse frontmatter only — throws ScaffoldError on malformed YAML or missing required fields.
 */
export function parseFrontmatter(filePath: string): MetaPromptFrontmatter {
  const content = fs.readFileSync(filePath, 'utf8')
  const { yamlText } = extractFrontmatter(content, filePath)
  const raw = parseYaml(yamlText, filePath)
  const normalized = normalizeRawObject(raw)

  // Validate name first for clear error
  if ('name' in normalized) {
    const nameVal = normalized['name']
    if (typeof nameVal === 'string' && !/^[a-z][a-z0-9-]*$/.test(nameVal)) {
      throw frontmatterNameInvalid(nameVal, filePath)
    }
  }

  const { frontmatter, errors } = zodValidate(normalized, filePath)
  if (errors.length > 0) {
    throw errors[0]
  }
  if (!frontmatter) {
    throw fieldMissing('frontmatter', filePath)
  }
  return frontmatter
}

/**
 * Parse frontmatter + body with validation.
 * Returns errors array (empty on success) rather than throwing.
 */
export function parseAndValidate(filePath: string): {
  frontmatter: MetaPromptFrontmatter
  body: string
  errors: ScaffoldError[]
  warnings: ScaffoldWarning[]
} {
  const errors: ScaffoldError[] = []
  const warnings: ScaffoldWarning[] = []

  const emptyFrontmatter: MetaPromptFrontmatter = {
    name: '',
    description: '',
    summary: null,
    phase: '',
    order: 0,
    dependencies: [],
    outputs: [],
    conditional: null,
    knowledgeBase: [],
    reads: [],
    stateless: false,
    category: 'pipeline',
  }

  let content: string
  try {
    content = fs.readFileSync(filePath, 'utf8')
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    errors.push(frontmatterYamlError(filePath, detail))
    return { frontmatter: emptyFrontmatter, body: '', errors, warnings }
  }

  let yamlText: string
  let body: string
  try {
    const extracted = extractFrontmatter(content, filePath)
    yamlText = extracted.yamlText
    body = extracted.body
  } catch (err) {
    errors.push(err as ScaffoldError)
    return { frontmatter: emptyFrontmatter, body: '', errors, warnings }
  }

  let raw: Record<string, unknown>
  try {
    raw = parseYaml(yamlText, filePath)
  } catch (err) {
    errors.push(err as ScaffoldError)
    return { frontmatter: emptyFrontmatter, body, errors, warnings }
  }

  // Collect unknown field warnings before normalizing
  warnings.push(...collectUnknownFieldWarnings(raw, filePath))

  const normalized = normalizeRawObject(raw)

  const { frontmatter, errors: zodErrors } = zodValidate(normalized, filePath)
  errors.push(...zodErrors)

  if (frontmatter) {
    return { frontmatter, body, errors, warnings }
  }

  return { frontmatter: emptyFrontmatter, body, errors, warnings }
}

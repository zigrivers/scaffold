import type { StepEnablementEntry } from '../../types/index.js'
import type {
  PipelineOverlay, KnowledgeOverride, ReadsOverride, DependencyOverride,
  CrossReadsOverride,
} from '../../types/index.js'
import type { ScaffoldError, ScaffoldWarning } from '../../types/index.js'
import { ProjectTypeSchema } from '../../config/schema.js'
import { fileExists } from '../../utils/fs.js'
import {
  overlayMissing, overlayParseError, overlayMalformedSection, overlayMalformedEntry,
  overlayMalformedAppendItem,
} from '../../utils/errors.js'
import yaml from 'js-yaml'
import fs from 'node:fs'
import path from 'node:path'

/** Check if a value is a plain object (not null, not array). */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Parse step-overrides section from YAML object. */
export function parseStepOverrides(
  raw: Record<string, unknown>,
  warnings: ScaffoldWarning[],
  filePath: string,
): Record<string, StepEnablementEntry> {
  const result: Record<string, StepEnablementEntry> = {}
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      warnings.push(overlayMalformedEntry(key, 'value', filePath))
      continue
    }
    const obj = value as Record<string, unknown>
    if (typeof obj['enabled'] !== 'boolean') {
      warnings.push(overlayMalformedEntry(key, 'enabled', filePath))
      continue
    }
    const entry: StepEnablementEntry = { enabled: obj['enabled'] }
    if (obj['conditional'] === 'if-needed') {
      entry.conditional = 'if-needed'
    }
    result[key] = entry
  }
  return result
}

/** Parse knowledge-overrides section from YAML object. */
export function parseKnowledgeOverrides(
  raw: Record<string, unknown>,
  warnings: ScaffoldWarning[],
  filePath: string,
): Record<string, KnowledgeOverride> {
  const result: Record<string, KnowledgeOverride> = {}
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      warnings.push(overlayMalformedEntry(key, 'value', filePath))
      continue
    }
    const obj = value as Record<string, unknown>
    if (obj['append'] !== undefined && !Array.isArray(obj['append'])) {
      warnings.push(overlayMalformedEntry(key, 'append', filePath))
    }
    const append = Array.isArray(obj['append'])
      ? (obj['append'] as unknown[]).filter((v): v is string => typeof v === 'string')
      : []
    result[key] = { append }
  }
  return result
}

/** Parse reads-overrides section from YAML object. */
export function parseReadsOverrides(
  raw: Record<string, unknown>,
  warnings: ScaffoldWarning[],
  filePath: string,
): Record<string, ReadsOverride> {
  const result: Record<string, ReadsOverride> = {}
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      warnings.push(overlayMalformedEntry(key, 'value', filePath))
      continue
    }
    const obj = value as Record<string, unknown>
    if (obj['replace'] !== undefined && !isPlainObject(obj['replace'])) {
      warnings.push(overlayMalformedEntry(key, 'replace', filePath))
    }
    if (obj['append'] !== undefined && !Array.isArray(obj['append'])) {
      warnings.push(overlayMalformedEntry(key, 'append', filePath))
    }
    const replace: Record<string, string> = {}
    if (typeof obj['replace'] === 'object' && obj['replace'] !== null && !Array.isArray(obj['replace'])) {
      for (const [rk, rv] of Object.entries(obj['replace'] as Record<string, unknown>)) {
        if (typeof rv === 'string') replace[rk] = rv
      }
    }
    const append = Array.isArray(obj['append'])
      ? (obj['append'] as unknown[]).filter((v): v is string => typeof v === 'string')
      : []
    result[key] = { replace, append }
  }
  return result
}

/** Parse dependency-overrides section from YAML object. */
export function parseDependencyOverrides(
  raw: Record<string, unknown>,
  warnings: ScaffoldWarning[],
  filePath: string,
): Record<string, DependencyOverride> {
  const result: Record<string, DependencyOverride> = {}
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      warnings.push(overlayMalformedEntry(key, 'value', filePath))
      continue
    }
    const obj = value as Record<string, unknown>
    if (obj['replace'] !== undefined && !isPlainObject(obj['replace'])) {
      warnings.push(overlayMalformedEntry(key, 'replace', filePath))
    }
    if (obj['append'] !== undefined && !Array.isArray(obj['append'])) {
      warnings.push(overlayMalformedEntry(key, 'append', filePath))
    }
    const replace: Record<string, string> = {}
    if (typeof obj['replace'] === 'object' && obj['replace'] !== null && !Array.isArray(obj['replace'])) {
      for (const [rk, rv] of Object.entries(obj['replace'] as Record<string, unknown>)) {
        if (typeof rv === 'string') replace[rk] = rv
      }
    }
    const append = Array.isArray(obj['append'])
      ? (obj['append'] as unknown[]).filter((v): v is string => typeof v === 'string')
      : []
    result[key] = { replace, append }
  }
  return result
}

const CROSS_READS_SLUG = /^[a-z][a-z0-9-]*$/

/** Parse cross-reads-overrides section from YAML object. */
export function parseCrossReadsOverrides(
  raw: Record<string, unknown>,
  warnings: ScaffoldWarning[],
  filePath: string,
): Record<string, CrossReadsOverride> {
  const result: Record<string, CrossReadsOverride> = {}
  for (const [key, value] of Object.entries(raw)) {
    if (!isPlainObject(value)) {
      warnings.push(overlayMalformedEntry(key, 'value', filePath))
      continue
    }
    const obj = value as Record<string, unknown>
    if (obj['append'] !== undefined && !Array.isArray(obj['append'])) {
      warnings.push(overlayMalformedEntry(key, 'append', filePath))
    }
    const append: Array<{ service: string; step: string }> = []
    if (Array.isArray(obj['append'])) {
      for (let index = 0; index < obj['append'].length; index++) {
        const item = obj['append'][index]
        if (!isPlainObject(item)) {
          warnings.push(overlayMalformedAppendItem(key, index, filePath))
          continue
        }
        const entry = item as Record<string, unknown>
        if (
          typeof entry['service'] === 'string' && CROSS_READS_SLUG.test(entry['service'])
          && typeof entry['step'] === 'string' && CROSS_READS_SLUG.test(entry['step'])
        ) {
          append.push({ service: entry['service'], step: entry['step'] })
        } else {
          warnings.push(overlayMalformedAppendItem(key, index, filePath))
        }
      }
    }
    result[key] = { append }
  }
  return result
}

/**
 * Load a project-type overlay YAML file.
 * @param overlayPath - Absolute path to overlay file
 * @returns { overlay, errors, warnings }
 */
export function loadOverlay(
  overlayPath: string,
): { overlay: PipelineOverlay | null; errors: ScaffoldError[]; warnings: ScaffoldWarning[] } {
  const errors: ScaffoldError[] = []
  const warnings: ScaffoldWarning[] = []

  // 1. Check file exists
  if (!fileExists(overlayPath)) {
    const overlayName = path.basename(overlayPath, '.yml')
    errors.push(overlayMissing(overlayName, overlayPath))
    return { overlay: null, errors, warnings }
  }

  // 2. Read file
  const raw = fs.readFileSync(overlayPath, 'utf8')

  // 3. Parse YAML
  let parsed: unknown
  try {
    parsed = yaml.load(raw)
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    errors.push(overlayParseError(overlayPath, detail))
    return { overlay: null, errors, warnings }
  }

  // 4. Validate top-level structure
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    errors.push(overlayParseError(overlayPath, 'overlay must be a YAML object'))
    return { overlay: null, errors, warnings }
  }

  const obj = parsed as Record<string, unknown>

  // Validate required fields
  if (typeof obj['name'] !== 'string' || obj['name'].trim() === '') {
    errors.push(overlayParseError(overlayPath, 'required field "name" must be a non-empty string'))
  }

  if (typeof obj['description'] !== 'string' || obj['description'].trim() === '') {
    errors.push(overlayParseError(overlayPath, 'required field "description" must be a non-empty string'))
  }

  if (typeof obj['project-type'] !== 'string' || obj['project-type'].trim() === '') {
    errors.push(overlayParseError(overlayPath, 'required field "project-type" must be a non-empty string'))
  } else {
    const validProjectTypes = ProjectTypeSchema.options
    const pt = obj['project-type'].trim()
    if (!validProjectTypes.includes(pt as typeof validProjectTypes[number])) {
      const allowed = validProjectTypes.join(', ')
      errors.push(overlayParseError(
        overlayPath, `"project-type" must be one of ${allowed}, got "${pt}"`,
      ))
    }
  }

  if (errors.length > 0) {
    return { overlay: null, errors, warnings }
  }

  // 5. Parse override sections (gracefully handle missing/malformed)
  const overrideSections = ['step-overrides', 'knowledge-overrides', 'reads-overrides', 'dependency-overrides'] as const

  for (const section of overrideSections) {
    const value = obj[section]
    if (value !== undefined && value !== null) {
      if (typeof value !== 'object' || Array.isArray(value)) {
        warnings.push(overlayMalformedSection(section, overlayPath))
      }
    }
  }

  const stepOverridesRaw = isPlainObject(obj['step-overrides'])
    ? obj['step-overrides'] as Record<string, unknown> : {}
  const knowledgeOverridesRaw = isPlainObject(obj['knowledge-overrides'])
    ? obj['knowledge-overrides'] as Record<string, unknown> : {}
  const readsOverridesRaw = isPlainObject(obj['reads-overrides'])
    ? obj['reads-overrides'] as Record<string, unknown> : {}
  const dependencyOverridesRaw = isPlainObject(obj['dependency-overrides'])
    ? obj['dependency-overrides'] as Record<string, unknown> : {}

  const overlay: PipelineOverlay = {
    name: (obj['name'] as string).trim(),
    description: (obj['description'] as string).trim(),
    projectType: (obj['project-type'] as string).trim() as PipelineOverlay['projectType'],
    stepOverrides: parseStepOverrides(stepOverridesRaw, warnings, overlayPath),
    knowledgeOverrides: parseKnowledgeOverrides(knowledgeOverridesRaw, warnings, overlayPath),
    readsOverrides: parseReadsOverrides(readsOverridesRaw, warnings, overlayPath),
    dependencyOverrides: parseDependencyOverrides(dependencyOverridesRaw, warnings, overlayPath),
    crossReadsOverrides: {},  // NEW — placeholder; Task 5 replaces with the strip-and-warn logic
  }

  return { overlay, errors, warnings }
}

/**
 * Load a domain sub-overlay YAML file with knowledge-only constraint.
 * Sub-overlays may only contain knowledge-overrides; any step, reads, or
 * dependency override sections are stripped with a warning.
 * @param overlayPath - Absolute path to sub-overlay file
 * @returns { overlay, errors, warnings }
 */
export function loadSubOverlay(
  overlayPath: string,
): { overlay: PipelineOverlay | null; errors: ScaffoldError[]; warnings: ScaffoldWarning[] } {
  const result = loadOverlay(overlayPath)
  if (!result.overlay) return result

  const warnings = [...result.warnings]
  const overlay = { ...result.overlay }

  // Enforce knowledge-only constraint for domain sub-overlays
  const hasStep = Object.keys(overlay.stepOverrides ?? {}).length > 0
  const hasReads = Object.keys(overlay.readsOverrides ?? {}).length > 0
  const hasDeps = Object.keys(overlay.dependencyOverrides ?? {}).length > 0

  if (hasStep || hasReads || hasDeps) {
    warnings.push({
      code: 'SUB_OVERLAY_NON_KNOWLEDGE',
      message: `Sub-overlay ${overlayPath} contains non-knowledge sections`
        + ' (step/reads/dependency overrides). These are stripped for domain sub-overlays.',
      context: { file: overlayPath },
    })
    overlay.stepOverrides = {}
    overlay.readsOverrides = {}
    overlay.dependencyOverrides = {}
  }

  return { overlay, errors: result.errors, warnings }
}

/**
 * Load a structural overlay YAML file (e.g., multi-service-overlay.yml).
 * Structural overlays have no project-type — they apply across project types
 * based on config properties (e.g., services[] presence).
 *
 * Validates name + description. Ignores project-type field if present.
 * @param overlayPath - Absolute path to structural overlay file
 * @returns { overlay, errors, warnings }
 */
export function loadStructuralOverlay(
  overlayPath: string,
): { overlay: PipelineOverlay | null; errors: ScaffoldError[]; warnings: ScaffoldWarning[] } {
  const errors: ScaffoldError[] = []
  const warnings: ScaffoldWarning[] = []

  // 1. Check file exists
  if (!fileExists(overlayPath)) {
    const overlayName = path.basename(overlayPath, '.yml')
    errors.push(overlayMissing(overlayName, overlayPath))
    return { overlay: null, errors, warnings }
  }

  // 2. Read file
  const raw = fs.readFileSync(overlayPath, 'utf8')

  // 3. Parse YAML
  let parsed: unknown
  try {
    parsed = yaml.load(raw)
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    errors.push(overlayParseError(overlayPath, detail))
    return { overlay: null, errors, warnings }
  }

  // 4. Validate top-level structure
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    errors.push(overlayParseError(overlayPath, 'overlay must be a YAML object'))
    return { overlay: null, errors, warnings }
  }

  const obj = parsed as Record<string, unknown>

  // Validate required fields (name + description only — no project-type)
  if (typeof obj['name'] !== 'string' || obj['name'].trim() === '') {
    errors.push(overlayParseError(overlayPath, 'required field "name" must be a non-empty string'))
  }

  if (typeof obj['description'] !== 'string' || obj['description'].trim() === '') {
    errors.push(overlayParseError(overlayPath, 'required field "description" must be a non-empty string'))
  }

  if (errors.length > 0) {
    return { overlay: null, errors, warnings }
  }

  // 5. Parse override sections (gracefully handle missing/malformed)
  const overrideSections = ['step-overrides', 'knowledge-overrides', 'reads-overrides', 'dependency-overrides', 'cross-reads-overrides'] as const

  for (const section of overrideSections) {
    const value = obj[section]
    if (value !== undefined && value !== null) {
      if (typeof value !== 'object' || Array.isArray(value)) {
        warnings.push(overlayMalformedSection(section, overlayPath))
      }
    }
  }

  const stepOverridesRaw = isPlainObject(obj['step-overrides'])
    ? obj['step-overrides'] as Record<string, unknown> : {}
  const knowledgeOverridesRaw = isPlainObject(obj['knowledge-overrides'])
    ? obj['knowledge-overrides'] as Record<string, unknown> : {}
  const readsOverridesRaw = isPlainObject(obj['reads-overrides'])
    ? obj['reads-overrides'] as Record<string, unknown> : {}
  const dependencyOverridesRaw = isPlainObject(obj['dependency-overrides'])
    ? obj['dependency-overrides'] as Record<string, unknown> : {}
  const crossReadsOverridesRaw = isPlainObject(obj['cross-reads-overrides'])
    ? obj['cross-reads-overrides'] as Record<string, unknown> : {}

  const overlay: PipelineOverlay = {
    name: (obj['name'] as string).trim(),
    description: (obj['description'] as string).trim(),
    // No projectType for structural overlays
    stepOverrides: parseStepOverrides(stepOverridesRaw, warnings, overlayPath),
    knowledgeOverrides: parseKnowledgeOverrides(knowledgeOverridesRaw, warnings, overlayPath),
    readsOverrides: parseReadsOverrides(readsOverridesRaw, warnings, overlayPath),
    dependencyOverrides: parseDependencyOverrides(dependencyOverridesRaw, warnings, overlayPath),
    crossReadsOverrides: parseCrossReadsOverrides(crossReadsOverridesRaw, warnings, overlayPath),
  }

  return { overlay, errors, warnings }
}

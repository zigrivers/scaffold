import type { MethodologyPreset } from '../../types/index.js'
import type {
  ProjectTypeOverlay, KnowledgeOverride, ReadsOverride, DependencyOverride,
} from '../../types/index.js'
import type { ScaffoldError, ScaffoldWarning } from '../../types/index.js'
import { fileExists } from '../../utils/fs.js'
import {
  presetMissing, presetParseError, presetInvalidStep,
  presetMissingStep, presetUnmetDependency, overlayMalformedSection,
} from '../../utils/errors.js'
import yaml from 'js-yaml'
import fs from 'node:fs'
import path from 'node:path'

/** Validate that a value is a valid DepthLevel (integer 1–5). */
function isDepthLevel(value: unknown): value is 1 | 2 | 3 | 4 | 5 {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 5
}

/** Validate kebab-case string (lowercase letters, digits, hyphens). */
function isKebabCase(value: string): boolean {
  return /^[a-z0-9]+(-[a-z0-9]+)*$/.test(value)
}

/**
 * Load a methodology preset YAML file.
 * @param presetPath - Absolute path to preset file
 * @param knownStepNames - Step names from discovered meta-prompts (for validation)
 * @returns { preset, errors, warnings }
 */
export function loadPreset(
  presetPath: string,
  knownStepNames: string[],
): { preset: MethodologyPreset | null; errors: ScaffoldError[]; warnings: ScaffoldWarning[] } {
  const errors: ScaffoldError[] = []
  const warnings: ScaffoldWarning[] = []

  // 1. Check file exists
  if (!fileExists(presetPath)) {
    const presetName = path.basename(presetPath, '.yml')
    errors.push(presetMissing(presetName, presetPath))
    return { preset: null, errors, warnings }
  }

  // 2. Read file
  const raw = fs.readFileSync(presetPath, 'utf8')

  // 3. Parse YAML
  let parsed: unknown
  try {
    parsed = yaml.load(raw)
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    errors.push(presetParseError(presetPath, detail))
    return { preset: null, errors, warnings }
  }

  // 4. Validate top-level structure
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    errors.push(presetParseError(presetPath, 'preset must be a YAML object'))
    return { preset: null, errors, warnings }
  }

  const obj = parsed as Record<string, unknown>

  // Validate required fields
  if (typeof obj['name'] !== 'string' || obj['name'].trim() === '') {
    errors.push(presetParseError(presetPath, 'required field "name" must be a non-empty string'))
  }

  if (typeof obj['description'] !== 'string' || obj['description'].trim() === '') {
    errors.push(presetParseError(presetPath, 'required field "description" must be a non-empty string'))
  }

  if (!isDepthLevel(obj['default_depth'])) {
    const got = JSON.stringify(obj['default_depth'])
    errors.push(presetParseError(presetPath, `"default_depth" must be an integer between 1 and 5, got ${got}`))
  }

  if (typeof obj['steps'] !== 'object' || obj['steps'] === null || Array.isArray(obj['steps'])) {
    errors.push(presetParseError(presetPath, 'required field "steps" must be a YAML object'))
    return { preset: null, errors, warnings }
  }

  if (errors.length > 0) {
    return { preset: null, errors, warnings }
  }

  // 5. Validate steps entries
  const stepsRaw = obj['steps'] as Record<string, unknown>
  const presetName = (obj['name'] as string).trim()
  const steps: Record<string, { enabled: boolean; conditional?: 'if-needed' }> = {}

  for (const [stepKey, stepValue] of Object.entries(stepsRaw)) {
    // Key must be kebab-case
    if (!isKebabCase(stepKey)) {
      errors.push(presetParseError(presetPath, `step key "${stepKey}" must be kebab-case`))
      continue
    }

    // If knownStepNames is provided, each step must be known
    if (knownStepNames.length > 0 && !knownStepNames.includes(stepKey)) {
      errors.push(presetInvalidStep(stepKey, presetName))
      continue
    }

    // Validate step entry structure
    if (typeof stepValue !== 'object' || stepValue === null || Array.isArray(stepValue)) {
      errors.push(presetParseError(presetPath, `step "${stepKey}" must be an object with an "enabled" field`))
      continue
    }

    const stepObj = stepValue as Record<string, unknown>
    if (typeof stepObj['enabled'] !== 'boolean') {
      errors.push(presetParseError(presetPath, `step "${stepKey}.enabled" must be a boolean`))
      continue
    }

    const entry: { enabled: boolean; conditional?: 'if-needed' } = {
      enabled: stepObj['enabled'],
    }

    if (stepObj['conditional'] !== undefined) {
      if (stepObj['conditional'] !== 'if-needed') {
        errors.push(presetParseError(presetPath, `step "${stepKey}.conditional" must be "if-needed" if present`))
        continue
      }
      entry.conditional = 'if-needed'
    }

    steps[stepKey] = entry
  }

  if (errors.length > 0) {
    return { preset: null, errors, warnings }
  }

  // Warn about known steps missing from the preset
  if (knownStepNames.length > 0) {
    for (const knownStep of knownStepNames) {
      if (!(knownStep in steps)) {
        warnings.push(presetMissingStep(knownStep, presetName))
      }
    }
  }

  const preset: MethodologyPreset = {
    name: presetName,
    description: (obj['description'] as string).trim(),
    default_depth: obj['default_depth'] as 1 | 2 | 3 | 4 | 5,
    steps,
  }

  return { preset, errors, warnings }
}

/**
 * Load all three standard presets from the given directory.
 * In production: pass the methodology/ dir from package installation root.
 * In tests: pass the fixture directory.
 */
export function loadAllPresets(
  methodologyDir: string,
  knownStepNames: string[],
): {
  deep: MethodologyPreset | null
  mvp: MethodologyPreset | null
  custom: MethodologyPreset | null
  errors: ScaffoldError[]
  warnings: ScaffoldWarning[]
} {
  const allErrors: ScaffoldError[] = []
  const allWarnings: ScaffoldWarning[] = []

  const { preset: deep, errors: deepErrors, warnings: deepWarnings } = loadPreset(
    path.join(methodologyDir, 'deep.yml'),
    knownStepNames,
  )
  allErrors.push(...deepErrors)
  allWarnings.push(...deepWarnings)

  const { preset: mvp, errors: mvpErrors, warnings: mvpWarnings } = loadPreset(
    path.join(methodologyDir, 'mvp.yml'),
    knownStepNames,
  )
  allErrors.push(...mvpErrors)
  allWarnings.push(...mvpWarnings)

  const { preset: custom, errors: customErrors, warnings: customWarnings } = loadPreset(
    path.join(methodologyDir, 'custom-defaults.yml'),
    knownStepNames,
  )
  allErrors.push(...customErrors)
  allWarnings.push(...customWarnings)

  return {
    deep,
    mvp,
    custom,
    errors: allErrors,
    warnings: allWarnings,
  }
}

/**
 * Validate that enabled steps in a preset have their dependencies also enabled.
 * The engine treats disabled dependencies as satisfied (soft-dependency behavior),
 * but this validation warns users about potential quality gaps.
 *
 * @param preset - A loaded methodology preset
 * @param stepDependencies - Map of step name to its dependency list (from pipeline frontmatter)
 * @returns Array of warnings for enabled steps with disabled dependencies
 */
export function validateDependencyCoherence(
  preset: MethodologyPreset,
  stepDependencies: Map<string, string[]>,
): ScaffoldWarning[] {
  const warnings: ScaffoldWarning[] = []

  for (const [stepName, stepConfig] of Object.entries(preset.steps)) {
    if (!stepConfig.enabled) continue

    const deps = stepDependencies.get(stepName) ?? []
    for (const dep of deps) {
      const depConfig = preset.steps[dep]
      // Warn if dependency is explicitly disabled (or absent from preset)
      if (depConfig && !depConfig.enabled) {
        warnings.push(presetUnmetDependency(stepName, dep, preset.name))
      }
    }
  }

  return warnings
}

// --- Overlay helpers ---

/** Parse step-overrides section from YAML object. */
function parseStepOverrides(
  raw: Record<string, unknown>,
): Record<string, { enabled: boolean; conditional?: 'if-needed' }> {
  const result: Record<string, { enabled: boolean; conditional?: 'if-needed' }> = {}
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) continue
    const obj = value as Record<string, unknown>
    if (typeof obj['enabled'] !== 'boolean') continue
    const entry: { enabled: boolean; conditional?: 'if-needed' } = { enabled: obj['enabled'] }
    if (obj['conditional'] === 'if-needed') {
      entry.conditional = 'if-needed'
    }
    result[key] = entry
  }
  return result
}

/** Parse knowledge-overrides section from YAML object. */
function parseKnowledgeOverrides(
  raw: Record<string, unknown>,
): Record<string, KnowledgeOverride> {
  const result: Record<string, KnowledgeOverride> = {}
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) continue
    const obj = value as Record<string, unknown>
    const append = Array.isArray(obj['append'])
      ? (obj['append'] as unknown[]).filter((v): v is string => typeof v === 'string')
      : []
    result[key] = { append }
  }
  return result
}

/** Parse reads-overrides section from YAML object. */
function parseReadsOverrides(
  raw: Record<string, unknown>,
): Record<string, ReadsOverride> {
  const result: Record<string, ReadsOverride> = {}
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) continue
    const obj = value as Record<string, unknown>
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
function parseDependencyOverrides(
  raw: Record<string, unknown>,
): Record<string, DependencyOverride> {
  const result: Record<string, DependencyOverride> = {}
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) continue
    const obj = value as Record<string, unknown>
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

/**
 * Load a project-type overlay YAML file.
 * @param overlayPath - Absolute path to overlay file
 * @returns { overlay, errors, warnings }
 */
export function loadOverlay(
  overlayPath: string,
): { overlay: ProjectTypeOverlay | null; errors: ScaffoldError[]; warnings: ScaffoldWarning[] } {
  const errors: ScaffoldError[] = []
  const warnings: ScaffoldWarning[] = []

  // 1. Check file exists
  if (!fileExists(overlayPath)) {
    const overlayName = path.basename(overlayPath, '.yml')
    errors.push(presetMissing(overlayName, overlayPath))
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
    errors.push(presetParseError(overlayPath, detail))
    return { overlay: null, errors, warnings }
  }

  // 4. Validate top-level structure
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    errors.push(presetParseError(overlayPath, 'overlay must be a YAML object'))
    return { overlay: null, errors, warnings }
  }

  const obj = parsed as Record<string, unknown>

  // Validate required fields
  if (typeof obj['name'] !== 'string' || obj['name'].trim() === '') {
    errors.push(presetParseError(overlayPath, 'required field "name" must be a non-empty string'))
  }

  if (typeof obj['description'] !== 'string' || obj['description'].trim() === '') {
    errors.push(presetParseError(overlayPath, 'required field "description" must be a non-empty string'))
  }

  if (typeof obj['project-type'] !== 'string' || obj['project-type'].trim() === '') {
    errors.push(presetParseError(overlayPath, 'required field "project-type" must be a non-empty string'))
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

  const overlay: ProjectTypeOverlay = {
    name: (obj['name'] as string).trim(),
    description: (obj['description'] as string).trim(),
    projectType: (obj['project-type'] as string).trim() as ProjectTypeOverlay['projectType'],
    stepOverrides: parseStepOverrides(stepOverridesRaw),
    knowledgeOverrides: parseKnowledgeOverrides(knowledgeOverridesRaw),
    readsOverrides: parseReadsOverrides(readsOverridesRaw),
    dependencyOverrides: parseDependencyOverrides(dependencyOverridesRaw),
  }

  return { overlay, errors, warnings }
}

/** Check if a value is a plain object (not null, not array). */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

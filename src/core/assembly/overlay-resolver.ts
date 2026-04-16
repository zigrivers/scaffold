import type {
  PipelineOverlay,
  KnowledgeOverride,
  ReadsOverride,
  DependencyOverride,
  StepEnablementEntry,
} from '../../types/index.js'

/**
 * Apply a project-type overlay to resolved pipeline state.
 *
 * Pure function — no I/O, no side effects. Spreads input maps,
 * applies overlay overrides (replace-then-append-then-dedup),
 * and returns new pipeline state without mutating inputs.
 */
export function applyOverlay(
  steps: Record<string, StepEnablementEntry>,
  knowledgeMap: Record<string, string[]>,
  readsMap: Record<string, string[]>,
  dependencyMap: Record<string, string[]>,
  overlay: PipelineOverlay,
): {
  steps: Record<string, StepEnablementEntry>
  knowledge: Record<string, string[]>
  reads: Record<string, string[]>
  dependencies: Record<string, string[]>
} {
  // 1. Step overrides: deep-clone all entries so callers cannot mutate originals
  const mergedSteps: Record<string, StepEnablementEntry> = {}
  for (const [name, entry] of Object.entries(steps)) {
    mergedSteps[name] = { ...entry }
  }
  for (const [name, override] of Object.entries(overlay.stepOverrides)) {
    mergedSteps[name] = { ...mergedSteps[name], ...override }
  }

  // 2. Knowledge overrides: append + deduplicate
  const mergedKnowledge = applyArrayOverrides(
    knowledgeMap,
    overlay.knowledgeOverrides,
    applyKnowledgeEntry,
  )

  // 3. Reads overrides: replace-then-append-then-dedup
  const mergedReads = applyArrayOverrides(
    readsMap,
    overlay.readsOverrides,
    applyReplaceAppendEntry,
  )

  // 4. Dependency overrides: replace-then-append-then-dedup
  const mergedDependencies = applyArrayOverrides(
    dependencyMap,
    overlay.dependencyOverrides,
    applyReplaceAppendEntry,
  )

  return {
    steps: mergedSteps,
    knowledge: mergedKnowledge,
    reads: mergedReads,
    dependencies: mergedDependencies,
  }
}

/** Generic helper: copy the input map, then apply per-step overrides via a merger function. */
function applyArrayOverrides<T>(
  inputMap: Record<string, string[]>,
  overrides: Record<string, T>,
  merger: (existing: string[], override: T) => string[],
): Record<string, string[]> {
  // Shallow-copy arrays so we never mutate the input
  const result: Record<string, string[]> = {}
  for (const [key, arr] of Object.entries(inputMap)) {
    result[key] = [...arr]
  }

  for (const [step, override] of Object.entries(overrides)) {
    const existing = result[step] ?? []
    result[step] = merger(existing, override)
  }

  return result
}

/** Knowledge: append then deduplicate. */
function applyKnowledgeEntry(existing: string[], override: KnowledgeOverride): string[] {
  const merged = [...existing, ...override.append]
  return [...new Set(merged)]
}

/** Reads / Dependencies: replace-then-append-then-dedup. */
function applyReplaceAppendEntry(existing: string[], override: ReadsOverride | DependencyOverride): string[] {
  // Step 1: apply replacements
  const replaceMap = override.replace ?? {}
  const replaced = existing.map((entry) => replaceMap[entry] ?? entry)

  // Step 2: append
  const appended = [...replaced, ...(override.append ?? [])]

  // Step 3: deduplicate (preserves first occurrence order)
  return [...new Set(appended)]
}

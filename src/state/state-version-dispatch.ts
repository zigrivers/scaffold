import { stateSchemaVersion } from '../utils/errors.js'

export interface MigrationContext {
  readonly hasServices: boolean
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/**
 * Dispatches schema-version handling on raw state JSON.
 * - Rejects unknown / missing versions.
 * - Bumps v1 → v2 in-place when the companion config has services[].
 * - Does NOT run Zod full-shape validation — caller is responsible.
 * - Mutates the input object; callers may rely on that side effect.
 *
 * Wave 3b will extend this module to bump v2 → v3 when per-service
 * state fields are introduced.
 */
export function dispatchStateMigration(
  raw: unknown,
  ctx: MigrationContext,
  file: string,
): asserts raw is Record<string, unknown> & { 'schema-version': 1 | 2 | 3 } {
  if (!isPlainObject(raw) || typeof raw['schema-version'] !== 'number') {
    throw stateSchemaVersion([1, 2, 3], Number(raw && (raw as Record<string, unknown>)['schema-version']), file)
  }
  const version = raw['schema-version']
  if (version !== 1 && version !== 2 && version !== 3) {
    throw stateSchemaVersion([1, 2, 3], version, file)
  }
  if (version === 1 && ctx.hasServices) {
    raw['schema-version'] = 2
  }
}

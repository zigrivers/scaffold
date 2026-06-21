// src/config/migration.ts

import type { ScaffoldConfig } from '../types/index.js'

/**
 * Migrate a v1 config object to v2 format.
 *
 * V1 detection: has version === 1 or no version field, may have a mixins object.
 *
 * Migration rules:
 * - Remove mixins
 * - Map methodology: 'classic' → 'deep', 'classic-lite' → 'mvp', else → 'custom'
 * - Set version: 2
 * - Add platforms: ['claude-code'] if missing
 * - Preserve other fields
 */
export function migrateV1(raw: Record<string, unknown>): ScaffoldConfig {
  const rest: Record<string, unknown> = {}
  for (const key of Object.keys(raw)) {
    if (key !== 'mixins' && key !== 'version') {
      rest[key] = raw[key]
    }
  }

  const methodology = raw['methodology']
  const platforms = raw['platforms']

  const migratedMethodology = mapMethodology(String(methodology ?? ''))
  // Gemini was dropped — strip ONLY that entry and preserve every other value so
  // the schema (not the migration) validates the platform enum. Backfill if empty.
  const rawPlatforms = (platforms as string[] | undefined) ?? ['claude-code']
  const stripped = rawPlatforms.filter((p) => p !== 'gemini')
  const migratedPlatforms = (stripped.length > 0 ? stripped : ['claude-code']) as ScaffoldConfig['platforms']

  return {
    ...rest,
    version: 2,
    methodology: migratedMethodology,
    platforms: migratedPlatforms,
  } as ScaffoldConfig
}

function mapMethodology(value: string): 'deep' | 'mvp' | 'custom' {
  if (value === 'classic') return 'deep'
  if (value === 'classic-lite') return 'mvp'
  return 'custom'
}

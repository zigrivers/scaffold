import fs from 'node:fs'
import path from 'node:path'

/**
 * Reads `.scaffold/state.json` and returns the `save_counter` field.
 * Returns null on any failure (missing file, invalid JSON, missing field).
 *
 * Used by service-scope cache readers (readEligible) to verify that the
 * service's cached next_eligible was written against the current root state
 * (spec §6). Not used at cache WRITE time — StateManager captures the counter
 * internally during loadState to avoid TOCTOU.
 */
export function readRootSaveCounter(projectRoot: string): number | null {
  const rootStatePath = path.join(projectRoot, '.scaffold', 'state.json')
  try {
    if (!fs.existsSync(rootStatePath)) return null
    const raw = JSON.parse(fs.readFileSync(rootStatePath, 'utf8')) as Record<string, unknown>
    const counter = raw['save_counter']
    return typeof counter === 'number' ? counter : null
  } catch {
    return null
  }
}

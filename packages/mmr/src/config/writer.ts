import fs from 'node:fs'
import { parseDocument, isSeq, type Document } from 'yaml'

/**
 * Comment-preserving config mutation (vision decision D2).
 *
 * All MMR config writers go through this module so that hand-edited,
 * self-documenting `.mmr.yaml` files keep their comments, key order, and
 * scalar styles when a value is changed. We use the eemeli `yaml` package's
 * Document API (parse → setIn/deleteIn → toString) rather than a
 * parse-to-object → re-serialize round-trip, which would strip comments.
 *
 * The reader path still uses `js-yaml` (config/loader.ts); this module is
 * write-side only.
 */

function loadDoc(file: string, opts: { create?: boolean } = {}): Document {
  let raw = ''
  if (fs.existsSync(file)) {
    raw = fs.readFileSync(file, 'utf-8')
  } else if (opts.create) {
    raw = 'version: 1\n'
  } else {
    throw new Error(`config file not found: ${file}`)
  }
  // Refuse multi-document files: setIn against the first document would
  // silently ignore later documents, so fail loudly instead (D2).
  if (/^---\s*$/m.test(raw)) {
    throw new Error(`multi-document YAML not supported: ${file}`)
  }
  return parseDocument(raw)
}

/**
 * Coerce a CLI-supplied string into the YAML scalar it represents, so
 * `set … false` writes a boolean and `set … 300` writes a number — never the
 * string `"false"` (D2, type-coercion pitfall).
 */
export function coerceScalar(raw: string): string | number | boolean {
  if (raw === 'true') return true
  if (raw === 'false') return false
  if (raw.trim() !== '' && !Number.isNaN(Number(raw))) return Number(raw)
  return raw
}

/**
 * Set a dotted-path value in a config file, preserving surrounding comments.
 * String values are coerced to typed scalars; non-string values are written
 * as-is. Missing intermediate maps are created. Creates the file (with a
 * `version: 1` header) when absent and `create` is not explicitly false.
 */
export function setConfigValue(
  file: string,
  dottedPath: string,
  value: unknown,
  opts: { create?: boolean } = { create: true },
): void {
  const doc = loadDoc(file, { create: opts.create !== false })
  const segs = dottedPath.split('.')
  const coerced = typeof value === 'string' ? coerceScalar(value) : value
  doc.setIn(segs, coerced)
  fs.writeFileSync(file, doc.toString())
}

/**
 * Remove `channel` from a top-level `channels_disabled` sequence if present.
 * Returns whether the file was changed. No-op (returns false) when the file is
 * missing, has no `channels_disabled`, or the channel is not listed.
 */
export function pruneChannelsDisabled(file: string, channel: string): boolean {
  if (!fs.existsSync(file)) return false
  const doc = loadDoc(file)
  const seq = doc.get('channels_disabled')
  if (!isSeq(seq)) return false
  const idx = seq.items.findIndex((item) => {
    const v = (item as { value?: unknown }).value ?? item
    return v === channel
  })
  if (idx === -1) return false
  seq.delete(idx)
  fs.writeFileSync(file, doc.toString())
  return true
}

/**
 * Set `channels.<channel>.enabled` to the given boolean — the canonical disable
 * mechanism (D5). When enabling, also prune any stale `channels_disabled`
 * membership so the enable cannot be silently overridden by the legacy list.
 */
export function setChannelEnabled(file: string, channel: string, enabled: boolean): void {
  setConfigValue(file, `channels.${channel}.enabled`, enabled)
  if (enabled) pruneChannelsDisabled(file, channel)
}

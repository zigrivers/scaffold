import fs from 'node:fs'
import { parseDocument, parseAllDocuments, isSeq, type Document } from 'yaml'
import { normalizeChannelName } from './channel-aliases.js'

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
  // silently ignore later documents, so fail loudly instead (D2). Count actual
  // documents with the parser rather than regex-matching `---`, which would
  // false-reject a valid single document that merely starts with a `---`
  // marker or contains `---` inside a block scalar.
  if (parseAllDocuments(raw).length > 1) {
    throw new Error(`multi-document YAML not supported: ${file}`)
  }
  return parseDocument(raw)
}

/** Write config to disk in place — see the body for the symlink/mode/security rationale. */
function safeWrite(file: string, content: string): void {
  // Deliberately a plain in-place write, not a temp-file+rename:
  //  - it writes THROUGH a symlink to the real file, so dotfiles managers
  //    (chezmoi/stow) keep working (the link is preserved);
  //  - it preserves an existing file's mode (the inode is reused), so a private
  //    0600 config is never widened;
  //  - it introduces no predictable temp path, avoiding the symlink/TOCTOU
  //    attack surface a `<file>.tmp-<pid>` sibling would create.
  // The only thing it gives up versus temp+rename is atomicity — acceptable for
  // a local, single-user config edited by an interactive command. New files get
  // a restrictive 0600 default since config can hold secrets in env/headers.
  const existed = fs.existsSync(file)
  fs.writeFileSync(file, content)
  if (!existed) fs.chmodSync(file, 0o600)
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
  setConfigValueSegs(file, dottedPath.split('.'), value, opts)
}

/**
 * Set a value at an explicit path-segment array, preserving comments. Use this
 * (rather than `setConfigValue`) when a segment can itself contain a dot — e.g.
 * a custom channel named `my-bot.v2`, where a dotted string would wrongly nest
 * `channels.my-bot.v2.enabled` into four keys.
 */
export function setConfigValueSegs(
  file: string,
  segs: string[],
  value: unknown,
  opts: { create?: boolean } = { create: true },
): void {
  const doc = loadDoc(file, { create: opts.create !== false })
  const coerced = typeof value === 'string' ? coerceScalar(value) : value
  doc.setIn(segs, coerced)
  safeWrite(file, doc.toString())
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
  // Match by canonical name so an alias entry (e.g. `agy`) is pruned when
  // enabling its canonical channel (`antigravity`). Remove every match, not
  // just the first, in case both forms are listed.
  const target = normalizeChannelName(channel)
  let changed = false
  for (let i = seq.items.length - 1; i >= 0; i -= 1) {
    const v = (seq.items[i] as { value?: unknown }).value ?? seq.items[i]
    if (typeof v === 'string' && normalizeChannelName(v) === target) {
      seq.delete(i)
      changed = true
    }
  }
  if (changed) safeWrite(file, doc.toString())
  return changed
}

/**
 * Set `channels.<channel>.enabled` to the given boolean — the canonical disable
 * mechanism (D5). When enabling, also prune any stale `channels_disabled`
 * membership so the enable cannot be silently overridden by the legacy list.
 */
export function setChannelEnabled(file: string, channel: string, enabled: boolean): void {
  // Use the segment form so a channel name containing a dot is treated as one
  // key, not split into nested maps.
  setConfigValueSegs(file, ['channels', channel, 'enabled'], enabled)
  if (enabled) pruneChannelsDisabled(file, channel)
}

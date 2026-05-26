/**
 * Strip end-of-string line/column spans from a location string.
 * Patterns matched (all anchored to end-of-string):
 *   - `:N` - trailing single line number
 *   - `:N-M` - trailing line range
 *   - `:N:M` - trailing line:column
 *   - `(line N)` (with optional leading whitespace) - prose-style line ref
 */
const LOCATION_SPAN_RE = /(?::\d+(?::\d+)?(?:-\d+)?|\s*\(line \d+\))$/

export function normalizeLocationForKey(location: string): string {
  return location.toLowerCase().trim().replace(LOCATION_SPAN_RE, '')
}

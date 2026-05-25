/**
 * Minimal jsonpath subset used by the `unwrap-jsonpath` parser kind.
 *
 * Supported forms:
 *   $                        - root
 *   $.foo                    - property
 *   $.foo.bar                - nested property
 *   $.foo[0]                 - array index
 *   $.foo[0].bar             - property of an indexed element
 *
 * Returns `undefined` when the path does not resolve. Throws only for
 * structural errors in the path itself.
 */
export function jsonpathGet(root: unknown, path: string): unknown {
  if (!path.startsWith('$')) {
    throw new Error(`jsonpath must start with $ (got: ${path})`)
  }
  if (path === '$') return root

  let cursor: unknown = root
  let i = 1
  while (i < path.length) {
    const ch = path[i]
    if (ch === '.') {
      i += 1
      if (path[i] === '[') continue
      const match = /^[A-Za-z_][A-Za-z0-9_-]*/.exec(path.slice(i))
      if (!match) throw new Error(`jsonpath malformed empty property at offset ${i - 1} (path: ${path})`)
      if (cursor === null || typeof cursor !== 'object') return undefined
      cursor = (cursor as Record<string, unknown>)[match[0]]
      i += match[0].length
    } else if (ch === '[') {
      const end = path.indexOf(']', i + 1)
      if (end === -1) {
        throw new Error(`jsonpath malformed: unclosed [ at offset ${i} (path: ${path})`)
      }
      const inside = path.slice(i + 1, end)
      if (!/^\d+$/.test(inside)) {
        throw new Error(
          `jsonpath invalid index "${inside}" (only numeric indices supported) at offset ${i} (path: ${path})`,
        )
      }
      if (!Array.isArray(cursor)) return undefined
      cursor = cursor[Number.parseInt(inside, 10)]
      i = end + 1
    } else {
      throw new Error(`jsonpath unexpected character "${ch}" at offset ${i} (path: ${path})`)
    }
    if (cursor === undefined) return undefined
  }
  return cursor
}

/**
 * Coerce a yargs string|string[] CSV input into a deduplicated array.
 *
 * Handles both repeated flags (`--foo a --foo b`) and CSV strings
 * (`--foo a,b`). Empty strings are filtered out.
 */
export function coerceCSV(val: string | string[]): string[] {
  const items = (Array.isArray(val) ? val : [val])
    .flatMap((v: string) => v.split(',').map((s: string) => s.trim()).filter(Boolean))
  return [...new Set(items)]
}

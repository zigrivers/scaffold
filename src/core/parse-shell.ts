/** Minimal, dependency-free shell-ish tokenizer: splits a command string on
 *  UNQUOTED whitespace, honoring single and double quotes so a quoted value
 *  containing spaces (e.g. `FOO='bar baz'`) stays one token with the quotes
 *  stripped. It does NOT expand variables, command substitutions, or escapes —
 *  callers must never pass a token back to a shell unquoted (pass it as a
 *  positional parameter instead). Shared by the observability fix dispatcher
 *  and the merge-queue gate-target resolution check. */
export function parseShell(cmd: string): string[] {
  const args: string[] = []
  let current = ''
  let inSingle = false
  let inDouble = false
  for (let i = 0; i < cmd.length; i++) {
    const ch = cmd[i]
    if (ch === '\'' && !inDouble) { inSingle = !inSingle }
    else if (ch === '"' && !inSingle) { inDouble = !inDouble }
    else if (ch === ' ' && !inSingle && !inDouble) { if (current) { args.push(current); current = '' } }
    else { current += ch }
  }
  if (current) args.push(current)
  return args
}

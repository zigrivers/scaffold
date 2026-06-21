/**
 * Session-id validation, shared by the review session store (commands/sessions)
 * and the critique session store (core/critique-session) — lives in core so
 * neither store has to import from a command module.
 */
const SESSION_ID_RE = /^[a-zA-Z0-9_-]+$/
const WINDOWS_RESERVED_ID_RE = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i
const SYSTEM_SESSION_ID_RE = /^(index|__proto__)$/i

export const SESSION_ID_RULE =
  '^[a-zA-Z0-9_-]+$ and not a reserved name (con, prn, aux, nul, com1-9, lpt1-9, index, __proto__)'

export function isValidSessionId(id: string): boolean {
  return SESSION_ID_RE.test(id) && !WINDOWS_RESERVED_ID_RE.test(id) && !SYSTEM_SESSION_ID_RE.test(id)
}

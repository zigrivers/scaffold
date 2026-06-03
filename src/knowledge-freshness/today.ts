/**
 * UTC YYYY-MM-DD for the current (or an injected) date. Shared so both the
 * PR builder (branch naming) and the audit runner (stamping run/fetch dates
 * into the verdict) use the same deterministic, test-pinnable source of truth
 * instead of trusting the LLM-claimed `audit_date` / `retrieved_at`.
 */
export function todayUtcYmd(now: Date = new Date()): string {
  const y = now.getUTCFullYear().toString().padStart(4, '0')
  const m = (now.getUTCMonth() + 1).toString().padStart(2, '0')
  const d = now.getUTCDate().toString().padStart(2, '0')
  return `${y}-${m}-${d}`
}

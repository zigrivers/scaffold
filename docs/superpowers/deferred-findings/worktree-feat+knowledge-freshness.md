# Deferred MMR Findings — worktree-feat+knowledge-freshness

P2/P3 findings surfaced from round 6 onwards on PR #373 (knowledge-freshness
Phase 1 bundle). Per the execution rule for this PR, rounds 1–5 fix every
P2-or-above finding; rounds 6+ fix only P0/P1 and defer P2/P3 here. Revisit
during Phase 2 hardening.

## Round 7

### F-005 — Project root resolution is brittle (P2)

- **Round:** 7
- **MMR job_id:** mmr-08c23aa7d76e
- **Severity:** P2
- **Sources:** gemini (unique)
- **Location:** `src/cli/commands/validate-knowledge.ts:6`
- **Description:** "Project root resolution is brittle. Using path.resolve('.')
  may fail to find docs/knowledge-freshness/authoritative-sources.yaml if the
  CLI is invoked from a subdirectory."
- **Suggestion:** Use `findProjectRoot(process.cwd())` to ensure the allowlist
  is always located relative to the repository root.
- **Defer rationale:** Real but low-severity — affects only the advisory
  allowlist warnings, not validation correctness. `make validate-knowledge`
  always runs from the repo root (Makefile target), so the practical case
  is fine. Worth fixing during Phase 2 hardening when validator UX gets a
  pass.

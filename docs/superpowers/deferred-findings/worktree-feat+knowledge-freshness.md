# Deferred MMR Findings — worktree-feat+knowledge-freshness

P2/P3 findings surfaced from round 6 onwards on PR #373 (knowledge-freshness
Phase 1 bundle). Per the execution rule for this PR, rounds 1–5 fix every
P2-or-above finding; rounds 6+ fix only P0/P1 and defer P2/P3 here. Revisit
during Phase 2 hardening.

## Task 9 live-audit corroboration

### Format — audit-apply re-serializes YAML in block style (P3/Phase 2 polish)

- **Task:** 9 (live-audit dry-run)
- **Severity:** P3 (noisy diff; surfaced indirectly via the bats eval at
  `tests/evals/knowledge-quality.bats` which checks `topics:` has a value on
  its same line)
- **Location:** `src/knowledge-freshness/audit-apply.ts` (yaml.dump call)
- **Description:** After audit-apply round-trips frontmatter through
  `yaml.load → yaml.dump`, flow-style fields like `topics: [a, b, c]`
  re-serialize in block style (`topics:\n  - a\n  - b\n...`). The on-disk
  result still parses identically, but the diff in a freshness PR is
  noisy and the bash-eval helper at `eval_helper.bash:extract_field`
  returns empty for `topics:` (no value on the same line).
- **Suggested fix:** Either (a) preserve input style by editing the
  frontmatter string region directly instead of round-tripping yaml.dump,
  or (b) configure yaml.dump with `flowLevel` to keep arrays inline. Both
  approaches have edge cases; needs a design pass.
- **Defer rationale:** Cosmetic. Doesn't affect correctness — entries
  still validate. The eval failure only fires once a real freshness PR
  lands (Phase 2 cron), not on the Phase 1 infrastructure PR. Phase 2
  Task 11 (CI gates on freshness PRs) is the right time to address.

### F-002 — source URL/version-pin mismatch on the OWASP entry (P2)

- **Task:** 9 (live-audit dry-run)
- **MMR job_id:** mmr-5e13f6db08de
- **Severity:** P2
- **Sources:** gemini (unique)
- **Location:** `content/knowledge/core/security-best-practices.md:14`
- **Description:** "The source URL points to the generic OWASP Top 10 page
  which now redirects to the 2025 edition, creating a mismatch with the
  'version-pin: OWASP Top 10 2021' and the actual content of the file."
- **Suggestion:** Update the source URL to the specific 2021 archive URL
  (https://owasp.org/www-project-top-ten/2021/), OR rewrite the entry's
  body against the 2025 edition.
- **Defer rationale:** Real, but resolving it is a *content* judgment, not
  an infrastructure fix. Either decision (re-pin to 2021 archive, or
  rewrite body against 2025) is the kind of work the freshness *system*
  is now in a position to drive in Phase 2 via a proper PR. This finding
  was the system surfacing its own first real audit signal. Filing as
  a follow-up content task. The corresponding F-001 (P1, codex) about
  advancing `last-reviewed` was fixed in code — `audit-apply` now leaves
  last-reviewed unchanged on `superseded` verdicts.

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

# Knowledge-freshness gate fixtures

These fixtures power the Phase 2 Task 11 acceptance test
(`bad-pr-gates.test.ts`): each one represents one of the failure modes the
five CI gates must block. They are intentionally minimal — every file is the
SMALLEST input that still triggers exactly one gate so a regression points
right at the responsible gate.

| Fixture | Triggers |
|---|---|
| `validator-missing-description.md` | Knowledge frontmatter validator (missing `description:`) |
| `linkcheck-404.md` | Link-check gate (URL returns 404 in mocked fetch) |
| `lint-unsourced-claim.md` | Lint-unsourced (advisory warning only) |
| `over-rewrite-stable.md` + `over-rewrite-stable.diff` | Anti-over-rewrite (50% diff on stable) |
| `deep-guidance-missing.md` | Deep-Guidance preserved (heading replaced with `## Guidance`) |

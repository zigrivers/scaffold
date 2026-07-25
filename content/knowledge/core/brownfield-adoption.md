---
name: brownfield-adoption
description: Brownfield adoption patterns — evidence-first codification, incumbent translation with provenance, interview-for-intent discipline, and artifact mapping for existing codebases entering the scaffold pipeline
topics:
  - brownfield
  - adoption
  - ingestion
  - provenance
  - artifact-mapping
  - evidence
volatility: stable
last-reviewed: 2026-07-19
version-pin: null
sources:
  - url: https://docs.renovatebot.com/configuration-options/
    anchor: '#onboarding'
    retrieved: 2026-07-19
  - url: https://biomejs.dev/guides/migrate-eslint-prettier/
    anchor: '#migrate-from-eslint'
    retrieved: 2026-07-19
---

# Brownfield Adoption

Adopting an existing, working codebase into a structured pipeline is a
different discipline from greenfield scaffolding. Greenfield steps design;
adoption steps **codify**. The repository — its code, configs, lockfiles,
CI workflows, and git history — is the primary source of truth, and every
document produced during adoption describes the system as-built before it
says anything about the future. This entry is injected automatically for
every step that runs in adoption mode.

## Summary

### The adoption stance

Three postures, in priority order:

1. **Codify** — the repo already answers most questions a pipeline step
   would normally ask. Record those answers as decisions, with evidence.
2. **Interview for intent** — the repo cannot answer questions of intent:
   goals, priorities, risk appetite, planned changes, and which observed
   patterns are deliberate. Those are the only questions worth the user's
   time.
3. **Record gaps, don't fix them** — where the as-built system falls short
   of a standard, write the gap down with evidence and severity. Fixing it
   is follow-up work the user schedules, never a side effect of running a
   documentation step.

### Evidence-first codification

A claim without a source is a guess. Every statement written into an
adoption-mode document carries its evidence inline: a file path, a config
key, a command output, or a git-history observation. This does two jobs:
it makes the document verifiable, and it makes later drift detectable —
when the evidence changes, the statement is known-stale.

Weak: "The project uses PostgreSQL."
Strong: "PostgreSQL 16 (docker-compose.yml `db` service, `pg` ^8.11 in
package.json dependencies)."

### Interview only for intent

Never ask the user a question the repo answers. Asking "what test runner do
you use?" of a repo with a `vitest.config.ts` wastes the user's attention
and teaches them the tool doesn't look. The inverse also holds: never
answer an intent question from code. A README's marketing copy is evidence
of past positioning, not of current strategy — confirm before treating it
as the user's intent.

### Incumbent translation and provenance

When an incumbent artifact (linter config, CI workflow, CONTRIBUTING guide,
compose file) feeds a scaffold document, translate its actual content —
never a generic template — and mark every translated section with a
provenance annotation naming the source. What cannot be translated
faithfully is listed under a "Not translated" heading with the reason.
Silence is the failure mode: a dropped incumbent rule is worse than an
untranslated one, because nobody knows it's gone.

### Artifact mapping

`.scaffold/config.yml` may carry an `artifact_map` that lets an incumbent
document satisfy a pipeline step outright (`coding-standards:
CONTRIBUTING.md`). A mapped step is verified through the incumbent, and
later update-mode runs treat the incumbent as the prior artifact — extend
it, don't replace it. Mappings are proposed in the adoption plan and only
ever applied with approval.

## Deep Guidance

### Evidence-gathering command palette

The fastest honest picture of a repo comes from a handful of read-only
commands. Run what applies; cite outputs in the documents you write:

```bash
# Stack and dependencies (versions from lockfiles, not guesses)
cat package.json | jq '{deps: .dependencies, dev: .devDependencies, scripts}'
ls *.lock* pnpm-lock.yaml poetry.lock go.mod Cargo.toml 2>/dev/null

# Conventions actually followed
git log --oneline -50                  # commit-message convention adherence
git log --merges --oneline -30         # squash vs merge-commit reality
git branch -a --sort=-committerdate | head -20   # branch naming in practice

# Quality tooling as configured (not as wished)
ls .eslintrc* eslint.config.* biome.json* .prettierrc* ruff.toml 2>/dev/null
ls vitest.config.* jest.config.* playwright.config.* pytest.ini 2>/dev/null
ls .github/workflows/                  # what CI actually runs

# Runtime topology
ls Dockerfile docker-compose.yml compose.yaml fly.toml vercel.json 2>/dev/null
```

Read the outputs before forming any opinion. The gap between "what the
README says" and "what the lockfile and CI say" is itself a finding worth
recording.

### Provenance annotation convention

Every section of a scaffold document whose content was translated from an
incumbent source carries an HTML comment immediately under its heading:

```markdown
## Linting and Formatting
<!-- provenance: ingested from biome.json (2026-07-19) -->

The project enforces formatting via Biome with a 100-column line width
(biome.json `formatter.lineWidth`), ...

## Not translated
- biome.json `overrides[0]` (per-directory rule relaxations for `legacy/`):
  scaffold's standards format has no per-directory override section — kept
  in biome.json as the source of truth, noted here so it is not lost.
```

The annotation names the source path and the ingestion date. When the
incumbent later changes, the date makes staleness computable. The
"Not translated" section is mandatory whenever anything was skipped — an
empty section ("Not translated: nothing — full fidelity") is better than an
absent one, because it proves the question was asked.

### The as-built / evolution split

Adoption documents that mix description and aspiration become untrustworthy
in both directions. Keep two clearly separated layers:

- **As-built** — what exists, with evidence. This layer must survive an
  adversarial diff against the repo.
- **Evolution** (optional) — what the user wants to change, gathered by
  interview, marked as intent. Never written as if it already exists.

A PRD in adoption mode has a "Current capabilities (as-built)" section
before any roadmap. An architecture doc describes the real module graph
before a separated "Evolution" section mentions the target state.

### Conflict classes during verification

Adoption verification distinguishes two conflict shapes (both are recorded,
never silently resolved):

- **State-claim conflict** — pipeline state says a step completed but its
  artifacts or live checks fail now. The claim is reversed to pending with
  an audit record preserving who/when/what claimed completion.
- **Artifact-only conflict** — no completion claim, but partial artifacts
  exist (the classic false positive: a `CLAUDE.md` exists, so a task-tracker
  step "looks done" while `bd info` fails). Recorded as pending with the
  found artifacts listed.

The rule both classes share: **a conflicted step is not a completed step.**
It re-enters the pipeline in adoption mode, where the evidence-first
posture applies.

### Anti-patterns

- **The README false positive.** "A file with the right name exists" is not
  completion. Verify content and live behavior (`bd info`, `git remote
  get-url origin`) before honoring any artifact.
- **Drive-by modernization.** Swapping a working test runner, linter, or
  framework because the pipeline's greenfield default differs. The
  incumbent is the decision; document it.
- **Repo-wide reformatting.** A formatting sweep buries the adoption diff
  and destroys blame. Standards apply to new code unless the user
  explicitly schedules a sweep.
- **Interview theater.** Asking twenty discovery questions whose answers
  are one `jq` away. Every unnecessary question spends trust.
- **Aspirational documentation.** Writing the architecture the team wishes
  it had. The doc must survive a diff against the code.
- **Silent dropping.** Skipping an incumbent rule or config section without
  listing it under "Not translated". If it can't translate, say so.
- **Trusting CI config over CI history.** A workflow file that declares
  `on: push` gating tests is not evidence the gate is enforced — check
  recent workflow runs (`gh run list`) for actual pass/fail history before
  citing CI as a quality signal; a red pipeline nobody fixed is common.
- **Mapping an incumbent doc that contradicts the code.** An `artifact_map`
  entry promotes a CONTRIBUTING.md or ADR to satisfy a pipeline step only
  when its claims hold up against the evidence-gathering commands above.
  A doc that says "we use Yarn" next to a committed `package-lock.json` is
  a conflict to record, not a mapping to accept as-is.

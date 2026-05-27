# Knowledge-Freshness Phase 4 — Full Backfill Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `volatility` + (where applicable) `sources` frontmatter to the
~234 knowledge entries that don't yet have them, so the cron's audit coverage
matches the full knowledge base — and so the validator stops emitting the two
classes of warning the Phase 4 acceptance criterion calls out.

**Architecture:** No code changes. Pure content edit across
`content/knowledge/**/*.md`, plus a one-shot expansion of
`docs/knowledge-freshness/authoritative-sources.yaml` to admit the
authoritative hosts already cited by the 32 entries that landed in Phases 1–2.
Volatility is classified per the cadence table in the parent design (§A.6 /
Cadence windows); sources are populated only from the allowlist (with the
allowlist expanded as needed in the same PR).

**Tech Stack:** `git`, the existing `make validate-knowledge` target (Node +
TypeScript), no new dependencies.

**Companion docs:**
- Parent design: [`docs/superpowers/specs/2026-05-24-knowledge-freshness-design.md`](../specs/2026-05-24-knowledge-freshness-design.md) — read §A.1 (frontmatter schema), §A.6 (backfill list precedent), §A.7 (allowlist seed)
- Parent plan: [`docs/superpowers/plans/2026-05-24-knowledge-freshness.md`](2026-05-24-knowledge-freshness.md) — Phase 4 acceptance criterion at line 2021
- Phase 3 deferred findings: [`docs/superpowers/deferred-findings/feat+knowledge-freshness-phase-3.md`](../deferred-findings/feat+knowledge-freshness-phase-3.md) — workstreams B and C live here

---

## Phase 4 acceptance (Workstream A)

`make validate-knowledge` from a clean checkout reports:
- **Zero** `fast-moving entry has empty sources — audit cannot run` warnings.
- **Zero** `source "..." host not in authoritative-sources.yaml allowlist (advisory)` warnings.
- All other warning classes (description-length, missing Deep Guidance) are
  out of scope; leave them alone.

Snapshot at branch creation (`feat/knowledge-freshness-phase-4` off
`origin/main`): 266 entries, 32 backfilled, 234 remaining; 65 warnings total
(0 errors).

---

## Volatility classification (apply uniformly)

Pick one of `stable | evolving | fast-moving` per entry. Rules:

| Volatility | Re-audit window | Use when… |
|---|---|---|
| `fast-moving` | 14 d | Vendor SDKs/APIs that ship updates monthly (Anthropic, OpenAI, Gemini, Claude Code CLI, MCP spec), smart-contract library security releases (OpenZeppelin/Foundry), browser-extension manifest churn (MV2→MV3), agent framework conventions |
| `evolving` | 60 d | Multi-year specs with errata (OWASP, NIST SSDF, working RFCs), framework conventions (React/Next/Django), CI/CD tooling, mobile platform best practices, microservices patterns from active maintainers |
| `stable` | 180 d | Foundational principles (TDD, DDD, SOLID, REST), foundational RFCs (HTTP/1.1, TCP), classic CS topics, mature architectural patterns, process documentation (user stories, code reviews) |

**When in doubt, pick `evolving`** — it's the validator default and matches
how the existing seed-list entries are tagged.

**Tension to avoid:** an entry with `volatility: fast-moving` and `sources: []`
triggers the warning we're trying to eliminate. If no authoritative source
exists for a fast-moving topic, **downgrade to `evolving`** rather than ship
empty sources or invent a fake URL.

---

## Source rules (apply uniformly)

- 1–3 sources per entry. More is fine but not required.
- Every source URL must be on the allowlist after Task 0. If a needed host is
  not on the allowlist, add it in the Task 0 PR commit, not in the entry commit.
- Prefer official spec / RFC / vendor-docs URLs over blog posts.
- Source URLs must be HTTPS (the SSRF guard refuses http: today only
  incidentally; treat HTTPS as the policy).
- `anchor:` is optional. When present it MUST start with `#` (validator enforces).
- Leave `last-reviewed: null` — that's the audit's job, not backfill's.
- `version-pin:` is optional. Add it when the source obviously pins to a
  versioned thing (e.g. `'OWASP Top 10 2021'`, `'React 19'`,
  `'OpenZeppelin Contracts 5.x'`); leave `null` otherwise.

**Frontmatter shape to add** (insert after `topics:`):

```yaml
volatility: evolving
last-reviewed: null
version-pin: null   # or 'Some Spec Name 1.2' when applicable
sources:
  - url: https://owasp.org/Top10/
  - url: https://www.rfc-editor.org/rfc/rfc9110
```

---

## Task 0: Expand authoritative-sources.yaml allowlist

**Files:**
- Modify: `docs/knowledge-freshness/authoritative-sources.yaml`

The 32 Phase 1–2 backfill entries already cite hosts that aren't on the seed
allowlist (the validator currently warns 41 times on this). Expand the
allowlist with the legitimately-authoritative hosts before backfilling more,
so subagents have a stable target.

- [ ] **Step 1: Replace the allowlist contents**

Overwrite `docs/knowledge-freshness/authoritative-sources.yaml` with:

```yaml
# Knowledge-freshness source allowlist.
# Sources outside this list trigger a warning (not a block) in the audit gates
# (locked decision #4). Expand per-PR with reviewer approval.
#
# Host matching: bare hostname matches host and any subdomain (e.g.
# "anthropic.com" matches "docs.anthropic.com"). A host+path entry (e.g.
# "ietf.org/rfc") additionally requires the URL pathname to start with the
# given prefix. Bare hostnames are preferred for vendor docs whose path
# layout changes; path-prefixed entries are preferred for shared-tenancy
# hosts (e.g. github.com is locked to specific repos via github_repos below).

hosts:
  # Security / risk
  - owasp.org              # OWASP Top 10, ASVS, SAMM
  - nist.gov               # NIST SSDF, SP 800-series
  - ietf.org/rfc           # IETF RFCs by path
  - www.rfc-editor.org     # canonical RFC publication host
  - openid.net             # OpenID Connect specs

  # AI / ML platform docs
  - modelcontextprotocol.io # MCP specification
  - anthropic.com          # Anthropic docs (covers docs.anthropic.com)
  - platform.openai.com    # OpenAI API docs
  - ai.google.dev          # Gemini API docs
  - mlflow.org             # MLflow tracking + registry
  - docs.wandb.ai          # Weights & Biases

  # API + spec
  - spec.openapis.org      # OpenAPI spec
  - spec.graphql.org       # GraphQL spec

  # Web / browser / standards
  - www.w3.org             # W3C standards (incl. trace-context, design-tokens)
  - tr.designtokens.org    # W3C Design Tokens Community Group TR

  # Cloud + ops + reliability
  - opentelemetry.io       # OpenTelemetry spec
  - sre.google             # Google SRE Book / Workbook
  - docs.aws.amazon.com    # AWS Well-Architected, service docs

  # Language / tooling official
  - git-scm.com            # Git official docs/manpages
  - peps.python.org        # Python PEPs
  - docs.astral.sh         # uv, ruff (Astral)
  - www.postgresql.org     # Postgres official docs
  - www.iso.org            # ISO standards

  # Patterns + practice (widely-cited maintained references)
  - martinfowler.com       # Martin Fowler's pattern catalog
  - microservices.io       # Chris Richardson microservices patterns
  - conventionalcommits.org # Conventional Commits spec
  - agilealliance.org      # Agile Alliance glossary
  - adr.github.io          # Architecture Decision Records reference
  - google.github.io       # Google open-source style guides
  - thoughtworks.com       # ThoughtWorks Tech Radar

  # Smart contracts / web3
  - docs.openzeppelin.com  # OpenZeppelin Contracts
  - docs.safe.global       # Safe (multisig) docs
  - swcregistry.io         # Smart Contract Weakness Classification
  - consensys.github.io    # Consensys smart-contract best practices
  - ethereum.org           # Ethereum.org developer docs

  # Testing
  - docs.pact.io           # Pact (consumer-driven contract tests)

  # Research / data-science reproducibility (added during Task 0 execution)
  - the-turing-way.netlify.app  # The Turing Way reproducible-research handbook

  # Compliance / regulatory (added during PR-review round 1)
  - pcisecuritystandards.org  # PCI Security Standards Council
  - aicpa.org              # AICPA legacy domain
  - aicpa-cima.com         # AICPA-CIMA post-merger combined association
  - www.sec.gov            # US Securities and Exchange Commission
  - www.finra.org          # FINRA
  - eur-lex.europa.eu      # EU legislation portal (GDPR + EU financial regulation)

  # Mobile platform docs (add as needed)
  - developer.apple.com    # Apple developer docs
  - developer.android.com  # Android developer docs

  # Browser extensions
  - developer.chrome.com   # Chrome extensions / MV3
  - developer.mozilla.org  # MDN (cross-browser reference)

github_repos:
  - modelcontextprotocol/specification
  - steveyegge/beads
  - joelparkerhenderson/architecture-decision-record
```

> **Note on snippet drift:** the snippet above shows the allowlist as
> committed in Task 0 plus the additions made during PR-review rounds
> (notably `the-turing-way.netlify.app` and the fintech-regulator hosts).
> The authoritative source of truth is always
> `docs/knowledge-freshness/authoritative-sources.yaml` itself — re-read
> that file before extending it; this snippet is for context, not for
> overwriting.

- [ ] **Step 2: Re-run validator to confirm Phase 1–2 warnings drop to zero**

Run: `make validate-knowledge 2>&1 | grep "host not in" | wc -l`
Expected: `0` (the 41 advisory-allowlist warnings from the 32 backfilled
entries should all be resolved by the broader allowlist).

If any remain, either (a) the host genuinely isn't authoritative — replace
the source in the entry with one that is, or (b) it's authoritative and
missing from the list — add it in this commit.

- [ ] **Step 3: Commit**

```bash
git add docs/knowledge-freshness/authoritative-sources.yaml
git commit -m "feat(knowledge-freshness): expand authoritative-sources allowlist for full backfill

Adds the authoritative hosts already cited by Phases 1-2 entries plus the
common official-spec hosts the Phase 4 backfill will need (W3C, OpenTelemetry,
OpenAPI/GraphQL specs, mobile/browser-extension platform docs, web3 standards,
Astral tooling). All additions are either official spec sites, vendor docs,
or widely-cited maintained reference catalogs.

Resolves 41 of the 65 pre-Phase-4 \`make validate-knowledge\` advisory warnings.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 1–16: Per-category backfill (dispatched in parallel)

Each category is a single self-contained subagent task. Categories are
disjoint (subagents never touch the same files), so all 16 can run in
parallel waves.

**Snapshot of remaining entries per category** (count at branch creation):

| # | Category | Entries to backfill |
|---|---|---|
| 1 | `core/` | 9 |
| 2 | `research/` | 25 |
| 3 | `game/` | 25 |
| 4 | `backend/` | 22 |
| 5 | `review/` | 20 |
| 6 | `web-app/` | 17 |
| 7 | `web3/` | 11 |
| 8 | `data-science/` | 10 |
| 9 | `mobile-app/` | 12 |
| 10 | `ml/` | 12 |
| 11 | `library/` | 12 |
| 12 | `data-pipeline/` | 12 |
| 13 | `browser-extension/` | 12 |
| 14 | `cli/` | 10 |
| 15 | `validation/` | 7 |
| 16 | `product/` + `execution/` + `tools/` + `finalization/` | 18 (4 small dirs grouped) |

**Subagent contract (each task):**

The dispatcher (main session) sends each subagent a self-contained prompt
that:

1. Names the category directory.
2. Lists the entries to backfill (the dispatcher should pre-glob and pass
   the exact paths so the subagent doesn't waste turns rediscovering them).
3. Quotes the volatility classification table from this plan.
4. Quotes the source rules from this plan.
5. Passes the allowlist (read once, include verbatim in the prompt) so the
   subagent doesn't need to fetch authoritative-sources.yaml.
6. Tells the subagent to:
   - Read each entry (head -30 is enough — we care about the topic + topics
     list, not the body).
   - Insert the `volatility / last-reviewed / version-pin / sources` block
     after the existing `topics:` line.
   - Use only allowlisted source URLs. If the obvious authoritative source
     for a topic isn't on the allowlist, leave `sources: []` and downgrade
     `volatility` to `evolving` or `stable` rather than `fast-moving`.
   - Make one commit per entry with message
     `chore(knowledge): backfill freshness metadata for <entry-name>` and
     the standard Claude trailer.
   - After the last commit, run `make validate-knowledge 2>&1 | tail -5`
     and report the warning/error counts plus any entries it skipped.
7. Returns a short summary: entries backfilled, allowlist additions needed
   (none — the dispatcher already locked the allowlist), validator output
   counts.

**Subagent prompt template** (paste into Agent tool, substitute):

````
You are backfilling knowledge-freshness frontmatter for one category of
`content/knowledge/`. This is a content edit, not code. The strategy and
allowlist are already locked — do not deviate.

Working directory: <ABS_PATH_TO_WORKTREE>
Branch: feat/knowledge-freshness-phase-4 (already checked out)
Category: <CATEGORY>
Entries to backfill (exact paths):
<PATHS_NEWLINE_LIST>

Allowlist (the only hosts you may cite — passed verbatim from
docs/knowledge-freshness/authoritative-sources.yaml). If an obvious
authoritative source for an entry isn't on this list, leave `sources: []`
and pick `volatility: evolving` or `stable` rather than `fast-moving`:

<ALLOWLIST_YAML_INLINE>

Volatility rules:
- fast-moving (14d): vendor SDKs/APIs that ship monthly (Anthropic, OpenAI,
  Gemini, Claude Code CLI, MCP spec), smart-contract library security
  releases (OpenZeppelin/Foundry), browser-extension manifest churn,
  agent framework conventions.
- evolving (60d, validator DEFAULT): multi-year specs with errata (OWASP,
  NIST SSDF, working RFCs), framework conventions, CI/CD tooling, mobile
  platform best practices, microservices patterns.
- stable (180d): foundational principles (TDD, DDD, SOLID, REST),
  foundational RFCs (HTTP/1.1, TCP), classic CS topics, mature architectural
  patterns, process documentation.

When in doubt, pick `evolving`. If you'd pick `fast-moving` but no authoritative
source exists, downgrade to `evolving`.

For each entry:
1. Read the file (just enough — head -30 lines).
2. Insert this YAML block after the existing `topics:` line in the
   frontmatter, before the closing `---`:

     volatility: <stable|evolving|fast-moving>
     last-reviewed: null
     version-pin: null    # or 'Spec Name X.Y' when the entry pins to one
     sources:
       - url: https://example.org/...
         # anchor: '#section'   # OPTIONAL, must start with '#'

3. Use the Edit tool to make this change (it's surgical — the existing
   frontmatter is small). Preserve every existing line untouched.
4. Stage and commit JUST that one file:

     git add <path>
     git commit -m "chore(knowledge): backfill freshness metadata for <entry-name>

     Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"

5. Move to the next entry.

After the last commit:
- Run: make validate-knowledge 2>&1 | tail -5
- Report: how many entries you backfilled, how many committed,
  any entries you skipped (and why), and the final tail-5 validator output.

Hard rules:
- ONE commit per entry. No batched commits.
- Use the Edit tool (not Write) so the body of the entry is untouched.
- Do not edit any files outside `content/knowledge/<CATEGORY>/`.
- Do not modify `docs/knowledge-freshness/authoritative-sources.yaml`.
  If an entry needs a host that isn't on the list, leave it `sources: []`
  and report it in your summary so the dispatcher can decide.
- Do not invent sources. Empty sources is better than a fake URL.
- Do not run any test or lint commands other than `make validate-knowledge`.
- HTTPS URLs only.
````

The dispatcher waits for each batch of subagents to return, spot-checks one
random commit from each (`git show <sha>` and confirm the frontmatter
insertion is surgical), then dispatches the next wave.

**Dispatch plan (parallel waves):**

- **Wave 1** (small, validate the contract): cli, validation, product, tools,
  execution, finalization — small categories totaling ~35 entries, dispatched
  in 6 parallel Agent calls. After return: confirm the contract works and
  the commits look right.
- **Wave 2** (medium): library, data-pipeline, browser-extension, mobile-app,
  ml, data-science — ~70 entries in 6 parallel Agent calls.
- **Wave 3** (large): backend, web3, web-app, core, review — ~79 entries in 5
  parallel Agent calls.
- **Wave 4** (largest): research, game — 50 entries in 2 parallel Agent calls.

If a subagent reports it skipped entries for lack of an allowlist host,
the dispatcher decides per case whether to (a) add the host to the
allowlist in a follow-up commit on top of Task 0, or (b) accept the
entry with `sources: []` + a non-fast-moving volatility.

---

## Task 17: Final validation + PR

- [ ] **Step 1: Confirm acceptance criterion**

```bash
make validate-knowledge 2>&1 | tee /tmp/validate-out.txt
grep "fast-moving entry has empty sources" /tmp/validate-out.txt | wc -l
grep "host not in authoritative-sources.yaml allowlist" /tmp/validate-out.txt | wc -l
```

Expected: both counts are `0`. Total error count must be `0` (this gates CI).

If any "fast-moving with empty sources" warnings remain, find the entry
and either add an allowlisted source or downgrade volatility.

If any "host not in allowlist" warnings remain, edit the entry to use
an allowlisted source — do NOT expand the allowlist further at this stage
(any host that should be on the list should have been added in Task 0).

- [ ] **Step 2: Sanity-check the commit history**

```bash
git log --oneline feat/knowledge-freshness-phase-4 ^origin/main | head -30
git log --oneline feat/knowledge-freshness-phase-4 ^origin/main | wc -l
```

Expected: ~235 commits (Task 0 + ~234 per-entry). Spot-check 5 random
commits with `git show <sha>` — each should touch exactly one file with
a surgical frontmatter insertion.

- [ ] **Step 3: Push and open PR**

```bash
git push -u origin feat/knowledge-freshness-phase-4
gh pr create --title "feat(knowledge-freshness): Phase 4 full backfill of volatility + sources" \
  --body "$(cat <<'EOF'
## Summary
- Backfills `volatility` + (where applicable) `sources` to the ~234 knowledge entries that weren't part of the Phase 1–2 seed set, taking the cron's audit-eligible coverage from 32 → all 266 entries.
- Expands `docs/knowledge-freshness/authoritative-sources.yaml` to cover the hosts already cited by Phase 1–2 entries plus the standard official-spec hosts the broader backfill needed.
- Per-entry commits keep blame meaningful for future audits.

## Acceptance
- `make validate-knowledge` reports zero "fast-moving entry has empty sources" warnings.
- `make validate-knowledge` reports zero "host not in authoritative-sources.yaml allowlist (advisory)" warnings.
- Zero errors.

## Test plan
- [x] `make validate-knowledge` from a clean checkout
- [ ] CI: `make check-all` green
- [ ] MMR + grok review loop per branch CLAUDE.md

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 4: Review loop** (per the user's instructions on this branch)

Run MMR + grok in parallel after each push. Apply the per-PR round budget
documented in the user's session prompt:
- Rounds 1–5: fix every P2-or-above; verify single-source findings empirically.
- Round 6+: fix only P0/P1; append P2/P3 to
  `docs/superpowers/deferred-findings/feat+knowledge-freshness-phase-4.md`.
- Stop when MMR verdict is `pass`/`degraded-pass` AND no P0/P1 remain from
  either tool AND grok's prose is P0/P1-free.

For a content-only PR like this, expect the review surface to be narrow:
volatility classifications that look wrong, sources that aren't truly
authoritative, frontmatter formatting bugs. If reviewers push back on a
classification, the principled tiebreaker is: cite the parent design's
cadence table.

- [ ] **Step 5: Merge**

`gh pr merge --squash --delete-branch` after green CI and review-loop stop.

---

## Out of scope for Workstream A

- **`last-reviewed`** stays `null` everywhere. The audit fills it in.
- **Description-length warnings (>200 chars)** are left as-is. They're soft
  warnings that don't gate CI and aren't part of the Phase 4 acceptance.
- **The `## Deep Guidance` missing-heading warning** on
  `execution/multi-agent-coordination.md` is pre-existing and unrelated —
  flag as a follow-up issue.
- **Workstreams B and C** (Phase 3 deferred findings — Lens I existing-entry
  suppression + `as never` refactor) are tracked separately and are not part
  of this PR.

---

## Self-review checklist

After backfill is done, before pushing:
- [ ] Every modified entry has exactly `volatility` + `last-reviewed` +
  `version-pin` + `sources` added to its frontmatter. Nothing else changed.
- [ ] No entry has `volatility: fast-moving` + `sources: []`.
- [ ] No source URL points to a host outside the (expanded) allowlist.
- [ ] Per-entry commits — no batched commits. `git log` shows ~235 commits.
- [ ] Task 0's allowlist commit is the first new commit on the branch.
- [ ] Zero validator errors. Acceptance warnings at zero.

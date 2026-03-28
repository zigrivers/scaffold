# Pipeline Deep-Dive Audit — 2026-03-28

Comprehensive analysis of all 51 pipeline meta-prompts, 47 knowledge entries, and 67 generated commands across 14 phases.

---

## Executive Summary

**Top 5 Most Impactful Findings:**

1. **Frontmatter `outputs` incomplete for depth 4+ artifacts** — All review steps (15+ files) declare only the primary output in frontmatter, omitting multi-model review artifacts produced at depth 4+. Breaks completion detection and brownfield adoption at higher depths.

2. **`docs/tdd-standards.md` claimed by two steps** — Both `tdd` (Phase 2) and `add-e2e-testing` (Phase 4) list this file as an output. The latter only *modifies* it; the frontmatter signals creation, causing state-tracking ambiguity.

3. **CLAUDE.md updated by 7 steps with no coordination** — `beads`, `project-structure`, `dev-env-setup`, `git-workflow`, `design-system`, `ai-memory-setup`, and `automated-pr-review` all modify CLAUDE.md with no merge strategy, ownership model, or update sequencing.

4. **`reads` field unused across entire pipeline** — The frontmatter schema supports a `reads` field for soft artifact references, but zero of 51 pipeline files use it. Many steps reference artifacts in their Inputs section without declaring the producing step as a dependency.

5. **Update Mode Specifics blocks missing from most creation steps** — CLAUDE.md guidelines require both Mode Detection and Update Mode Specifics blocks. Most creation steps have only a terse Mode Detection line with no Update Mode Specifics.

---

## Overlap

| Prompt A | Prompt B | Overlapping Content | Suggested Resolution |
|----------|----------|---------------------|----------------------|
| `tdd` (Ph2, order 240) | `add-e2e-testing` (Ph4, order 410) | Both declare `docs/tdd-standards.md` as output | Remove from `add-e2e-testing` outputs; add `reads: [tdd]` instead |
| `dev-env-setup` (Ph3, order 310) | `git-workflow` (Ph3, order 330) | Both update CLAUDE.md "Key Commands" table | Document section ownership; later step enhances earlier step's section |
| `beads` (Ph2, order 210) | `ai-memory-setup` (Ph3, order 350) | Both restructure CLAUDE.md (core principles vs. pointer pattern) | Define merge strategy; `ai-memory-setup` should preserve `beads` sections |
| 9 review files (Ph5-9, Ph13) | Each other | ~80% identical boilerplate (Purpose, Methodology Scaling, depth 4+ multi-model dispatch) | Extract shared review-step template to knowledge entry; each file focuses on unique failure modes |
| `knowledge/core/domain-modeling.md` | `pipeline/modeling/domain-modeling.md` | Both cover bounded contexts, aggregates, entities | Intentional (knowledge = reference, pipeline = prompt). No action needed. |
| `knowledge/core/testing-strategy.md` | `pipeline/foundation/tdd.md` + `pipeline/quality/story-tests.md` | Test pyramid, coverage, patterns | Intentional distribution. No action needed. |

---

## Gaps

| Gap Description | Affected Phase(s) | Impact | Suggested Fix |
|----------------|-------------------|--------|---------------|
| `add-e2e-testing` depends on `git-workflow` but not `tdd`, despite requiring `docs/tdd-standards.md` as input | Integration (Ph4) | Topological sort may run E2E setup before TDD standards exist | Add `tdd` to `add-e2e-testing` dependencies |
| Phase 2 steps (`tech-stack`, `coding-standards`, `tdd`, `project-structure`) use `docs/plan.md` as input but don't declare Phase 1 dependencies | Foundation (Ph2) | Brownfield adoption may skip PRD; steps run without required context | Add `reads: [create-prd]` or explicit dependencies |
| `create-evals` (Ph9) doesn't reference `tests/acceptance/` from `story-tests` (Ph9) | Quality (Ph9) | Eval generation misses story test skeletons for coverage mapping | Add `tests/acceptance/ (optional)` to `create-evals` Inputs |
| `platform-parity-review` depends only on `user-stories` (Ph1) but requires architecture + specification context | Parity (Ph10) | Review runs without API/DB/UX artifacts to check against | Add dependencies on `review-architecture` and specification review steps |
| `platform-parity-review.md` lives in `pipeline/stories/` but declares `phase: "parity"` | Parity (Ph10) | Violates phase-directory naming convention; tools expecting `pipeline/<phase>/` fail | Move to `pipeline/parity/` |
| No knowledge entry for Beads task management patterns | Foundation (Ph2) | `beads` step has no domain expertise backing | Create `knowledge/core/task-tracking.md` |
| No knowledge entry for CLAUDE.md structure/patterns | Consolidation (Ph11) | `claude-md-optimization` has empty knowledge-base reference | Create `knowledge/core/claude-md-patterns.md` |
| No knowledge entry for multi-model review dispatch | All review phases | 9+ files mention depth 4+ Codex/Gemini dispatch with no shared guidance on fallback, timeouts, reconciliation | Create `knowledge/core/multi-model-review-dispatch.md` |
| No knowledge entry for CI/CD practices | Environment (Ph3) | `automated-pr-review` references only `review-methodology` | Create `knowledge/core/ci-cd-practices.md` or expand `dev-environment.md` |
| `story-tests` step missing from `scaffold status` output in existing projects | Quality (Ph9) | Step is invisible in progress tracking; only appears in "Next eligible" line | Bug in status rendering or state initialization — step not registered in project state for pre-existing projects |
| No glossary for pipeline terms (brownfield, greenfield, wave plan, depth levels) | Cross-cutting | Newcomers lack context for key terms used throughout | Create `docs/glossary.md` |
| `design-system-tokens.md` knowledge entry marked WIP (`<!-- eval-wip -->`) | Environment (Ph3) | Incomplete domain expertise for design system step | Expand to full coverage |
| CLAUDE.md references "Process" sections in prompts but v2 meta-prompts don't have them | Cross-cutting | Stale CLAUDE.md guidance | Remove "Process" reference from CLAUDE.md or add sections |

---

## Enhancement Opportunities

| File | Issue | Priority | Suggested Change |
|------|-------|----------|-----------------|
| All 15+ review steps | Frontmatter `outputs` omits depth 4+ artifacts | H | Add `conditional-outputs` schema field OR list all potential outputs in frontmatter |
| `tdd.md` (Ph2) | Mode Detection is one line: "Update mode if strategy exists" | H | Expand to 4-6 lines: file check, what gets preserved, what triggers re-generation |
| `database-schema.md`, `api-contracts.md`, `ux-spec.md` (Ph8) | Mode Detection is one line each; no Update Mode Specifics | H | Expand with concrete update scenarios (what changed, how to diff, what to preserve) |
| `claude-md-optimization.md`, `workflow-audit.md` (Ph11) | Mode Detection says "always update mode" but doesn't explain how to handle custom sections | H | Add detection steps for prior optimization, custom section preservation |
| All 7 validation steps (Ph13) | No escalation/disposition guidance for P0-P3 findings | M | Add "Finding Disposition" section defining who decides, when, how tasks reorder |
| `operations.md`, `security.md` (Ph9) | Quality Criteria less concrete than specification phase equivalents | M | Add specific, testable criteria matching the granularity of `database-schema.md` |
| `platform-parity-review.md` (Ph10) | Lacks detailed checklist compared to other review files | M | Add "Detailed Checks" section: feature matrix, input models, navigation, connectivity, testing |
| `add-e2e-testing.md` (Ph4) | Platform detection algorithm undocumented | M | Add "Platform Detection Logic" decision tree |
| `tdd.md` (Ph2) | Methodology Scaling vague ("comprehensive strategy", "scale detail with depth") | M | Add page counts, pattern counts, specific sections per depth |
| `create-evals.md` (Ph9) | Quality Criteria don't vary by depth (but methodology does) | M | State MVP-specific criteria separately from deep criteria |
| 6 conditional steps | No decision trees for when to enable/disable | M | Add "Conditional Evaluation" subsection with project signals |
| `adrs.md` (Ph6) | Inputs section omits `docs/plan.md` despite quality criteria requiring PRD traceability | M | Add `docs/plan.md (required)` to Inputs |
| All creation steps (Ph4-8) | No "Update Mode Specifics" blocks per CLAUDE.md guidelines | M | Add blocks explaining: detect existing artifact, identify changes, selective update vs. regenerate |
| `system-architecture.md` (Ph7) | Doesn't specify output format (ASCII diagrams? SVG? tables?) | L | Clarify artifact format in Expected Outputs |
| All steps | No "Success Evidence" showing measurable proof of completion | L | Add evidence criteria (artifact counts, section presence, traceability links) |
| `review-api-contracts`, `review-database-schema`, `review-ux-spec` knowledge entries | Naming inconsistent with creation-step knowledge names (`api-design`, `database-design`, `ux-specification`) | L | Standardize to match creation-step names or document naming convention |
| `domain-modeling.md` → `task-decomposition.md`, `testing-strategy.md` → `api-design.md`, etc. | Missing cross-references between related knowledge entries | L | Add "See also" sections to 15+ knowledge files |
| `eval-craft.md` knowledge entry | 44KB, referenced by only 1 pipeline file | L | Review whether to split or reference from more quality/testing pipelines |
| Knowledge topic tags | Inconsistent singular vs. plural (`adr` vs. `entities`) | L | Standardize naming convention |

---

## Consistency Issues

| File | Issue | Category |
|------|-------|----------|
| `pipeline/stories/platform-parity-review.md` | Located in `stories/` but declares `phase: "parity"` | Directory naming |
| All review steps (15+ files) | Frontmatter `outputs` lists 1 artifact; body lists 4+ at depth 4+ | Schema completeness |
| `add-e2e-testing.md` | Lists `docs/tdd-standards.md` as output (should be modification, not creation) | Output semantics |
| `review-api-contracts` vs `api-design` knowledge names | Review knowledge uses artifact name; creation uses concept name | Naming convention |
| `review-database-schema` vs `database-design` knowledge names | Same pattern inconsistency | Naming convention |
| `review-ux-spec` vs `ux-specification` knowledge names | Same pattern inconsistency | Naming convention |
| `docs/reviews/database/` vs `docs/reviews/operations/` | Singular vs. plural directory naming for multi-model outputs | Path convention |
| `docs/reviews/pre-review-prd.md` | Uses `pre-` prefix; other reviews don't (e.g., `review-database.md`) | Path convention |
| 0 of 51 pipeline files use `reads` field | Schema supports it; no files declare soft artifact references | Field adoption |
| CLAUDE.md references "Process" sections | v2 meta-prompts don't have Process sections | Stale documentation |
| 8 of 67 commands missing "After This Step" | All 8 are utilities/control-flow — appropriately omitted | Documentation coverage |

---

## Dependency Graph Validation

**Status: Valid DAG — no cycles detected across 72 dependency relationships.**

### Cross-Phase Flow (verified correct)
```
Phase 1 (Pre) ──────────────── Phase 2 (Foundation) ── Phase 3 (Environment) ── Phase 4 (Integration)
  create-prd → review-prd        tech-stack               dev-env-setup            add-e2e-testing
       ↓            ↓            coding-standards          design-system
  innovate-prd  user-stories      tdd                     git-workflow
                    ↓            project-structure         automated-pr-review
             review-user-stories                           ai-memory-setup
                    ↓
             innovate-user-stories

Phase 5 (Modeling) → Phase 6 (Decisions) → Phase 7 (Architecture) → Phase 8 (Specification)
  domain-modeling      adrs                  system-architecture     database-schema, api-contracts, ux-spec
  review-domain-modeling  review-adrs        review-architecture     + reviews for each

Phase 9 (Quality) → Phase 10 (Parity) → Phase 11 (Consolidation) → Phase 12 (Planning) → Phase 13 (Validation)
  review-testing, story-tests, create-evals   platform-parity-review   claude-md-optimization   implementation-plan    7 validation steps
  operations, security + reviews                                       workflow-audit            implementation-plan-review
```

### Noted Dependency Gaps
- `tech-stack` (Ph2) uses `docs/plan.md` but has no Phase 1 dependency
- `add-e2e-testing` (Ph4) uses `docs/tdd-standards.md` but doesn't depend on `tdd`
- `platform-parity-review` (Ph10) needs architecture/specification context but only depends on `user-stories`

---

## Recommendations by Priority

### P0 — Fix Before Next Release
1. **Fix `add-e2e-testing` dependencies**: Add `tdd` to dependencies; remove `docs/tdd-standards.md` from outputs
2. **Fix `platform-parity-review` location**: Move from `pipeline/stories/` to `pipeline/parity/`
3. **Fix `platform-parity-review` dependencies**: Add architecture/specification review dependencies
4. **`story-tests` missing from `scaffold status` output**: The `story-tests` step (Ph9, order 915) does not appear in `scaffold status` for existing projects. Status lists all other quality steps (`review-testing`, `create-evals`, `operations`, etc.) but `story-tests` is absent from the rendered list — it only shows up in the "Next eligible" line. This means the step is invisible in progress tracking despite being a required pipeline step. Likely a bug in status rendering or state initialization for projects that predate the step's addition.

### P1 — High Impact
4. **Address depth 4+ output declarations**: Either extend frontmatter schema with `conditional-outputs` or list all potential outputs
5. **Document CLAUDE.md merge strategy**: Define section ownership across the 7 steps that modify it
6. **Expand terse Mode Detection blocks**: `tdd.md`, `database-schema.md`, `api-contracts.md`, `ux-spec.md`, consolidation files
7. **Add missing knowledge entries**: `task-tracking.md`, `claude-md-patterns.md`, `multi-model-review-dispatch.md`

### P2 — Medium Impact
8. **Adopt `reads` field**: Audit all Inputs sections; add `reads` for soft artifact references
9. **Add Update Mode Specifics**: All creation steps missing this block per CLAUDE.md guidelines
10. **Strengthen Quality Criteria**: `operations.md`, `security.md`, validation steps need more concrete/testable criteria
11. **Add escalation guidance**: Validation phase needs P0-P3 finding disposition process
12. **Complete `design-system-tokens.md`**: Remove WIP marker; expand to full coverage

### P3 — Polish
13. **Standardize knowledge naming**: Align review knowledge names with creation knowledge names
14. **Add cross-references**: "See also" sections in 15+ knowledge entries
15. **Document conditional step decision trees**: 6 conditional steps lack enable/disable logic
16. **Create glossary**: Define brownfield, greenfield, wave plan, depth levels
17. **Extract review-step template**: Reduce 80% boilerplate across 15+ review files
18. **Update CLAUDE.md**: Remove stale "Process" section reference

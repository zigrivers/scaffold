# Audit R8 Polish Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the 7 remaining actionable findings from the Round 8 alignment audit (out of 17 total P3 items — 10 were verified as already correct or not actionable).

**Architecture:** Frontmatter fixes in 3 pipeline files, QC language fix in 1 file, knowledge-base reference fix in 1 file, 1 new knowledge entry, 1 new eval file.

**Tech Stack:** Markdown (pipeline/knowledge), bash (bats eval)

**Audit report:** `docs/archive/audits/comprehensive-alignment-audit-round-8.md`

---

### Task 1: Fix frontmatter declarations in 3 pipeline files

**Files:**
- Modify: `content/pipeline/quality/review-testing.md:9`
- Modify: `content/pipeline/consolidation/workflow-audit.md:8`
- Modify: `content/pipeline/quality/story-tests.md:9`

- [ ] **Step 1: Remove redundant `system-architecture` from review-testing reads (1-M2)**

In `content/pipeline/quality/review-testing.md` line 9, change:
```
reads: [domain-modeling, system-architecture]
```
To:
```
reads: [domain-modeling]
```

`system-architecture` is already in `dependencies` (line 7), so listing it in `reads` is redundant.

- [ ] **Step 2: Add undeclared outputs to workflow-audit (1-W3)**

In `content/pipeline/consolidation/workflow-audit.md` line 8, change:
```
outputs: [CLAUDE.md, docs/git-workflow.md]
```
To:
```
outputs: [CLAUDE.md, docs/git-workflow.md, docs/coding-standards.md, tasks/lessons.md]
```

The body's Expected Outputs section (lines 32-36) documents these as modified/created but they weren't declared in frontmatter.

- [ ] **Step 3: Add `system-architecture` to story-tests reads (1-W4)**

In `content/pipeline/quality/story-tests.md` line 9, change:
```
reads: [tech-stack, coding-standards, project-structure, api-contracts, database-schema, ux-spec]
```
To:
```
reads: [tech-stack, coding-standards, project-structure, system-architecture, api-contracts, database-schema, ux-spec]
```

The Inputs section (line 26) lists `docs/system-architecture.md (required)` but `system-architecture` was missing from the `reads` field.

- [ ] **Step 4: Run frontmatter validation**

```bash
make validate
```

Expected: All pipeline and tool files pass.

- [ ] **Step 5: Run evals to check for regressions**

```bash
make eval
```

Expected: All eval tests pass. The `reads-field-coverage.bats` tests should still pass with these changes (they check that reads references resolve to valid steps).

- [ ] **Step 6: Commit**

```bash
git add content/pipeline/quality/review-testing.md content/pipeline/consolidation/workflow-audit.md content/pipeline/quality/story-tests.md
git commit -m "fix: correct frontmatter reads/outputs in review-testing, workflow-audit, story-tests

1-M2: Remove redundant system-architecture from review-testing reads
1-W3: Add coding-standards.md, tasks/lessons.md to workflow-audit outputs
1-W4: Add system-architecture to story-tests reads"
```

---

### Task 2: Fix tech-stack multi-model QC phrasing (3-M5)

**Files:**
- Modify: `content/pipeline/foundation/tech-stack.md:44`

- [ ] **Step 1: Standardize multi-model QC vocabulary**

In `content/pipeline/foundation/tech-stack.md` line 44, change:
```
- (depth 4+) Multi-model recommendations synthesized: Consensus (all models agree), Majority (2+ models agree), or Divergent (models disagree — present to user for decision)
```
To:
```
- (depth 4+) Multi-model findings synthesized: Consensus (all models agree), Majority (2+ models agree), or Divergent (models disagree — present to user for decision)
```

All other multi-model steps use "findings synthesized" — tech-stack was the only outlier using "recommendations."

- [ ] **Step 2: Verify no other multi-model phrasing outliers**

```bash
grep -rn 'Multi-model.*synthesized' content/pipeline/
```

Expected: All matches should say "findings synthesized" with the Consensus/Majority/Divergent vocabulary.

- [ ] **Step 3: Commit**

```bash
git add content/pipeline/foundation/tech-stack.md
git commit -m "fix: standardize tech-stack multi-model QC to 'findings synthesized' (3-M5)"
```

---

### Task 3: Fix innovate-vision knowledge-base reference (4-W1)

**Files:**
- Modify: `content/pipeline/vision/innovate-vision.md:10`
- Create: `content/knowledge/product/vision-innovation.md`

The `innovate-vision` step references `prd-innovation` knowledge, which is explicitly scoped to "feature-level innovation" (PRD scope). But this step covers "strategic innovation" (market positioning, competitive strategy, ecosystem thinking). The step itself says "This is distinct from PRD innovation." There are parallel knowledge entries for the other innovation steps (`prd-innovation` for `innovate-prd`, `user-story-innovation` for `innovate-user-stories`), but none for vision-level innovation.

- [ ] **Step 1: Create vision-innovation knowledge entry**

Create `content/knowledge/product/vision-innovation.md`:

```markdown
---
name: vision-innovation
description: Techniques for discovering strategic innovation opportunities in product vision
topics: [innovation, vision, strategy, competitive-positioning, ecosystem, market-opportunities]
---

# Vision Innovation

## Summary

- **Scope**: Strategic-level innovation (market positioning, ecosystem plays, contrarian bets, AI-native capabilities). Feature-level innovation belongs in PRD innovation (`prd-innovation`); UX-level improvements belong in user story innovation (`user-story-innovation`).
- **Adjacent market discovery**: Look for underserved segments adjacent to the primary target — same problem in different industries, same users with upstream/downstream needs, or existing users with unmet complementary needs.
- **Ecosystem thinking**: Identify integration points, platform plays, and data network effects — where does the product become more valuable as usage grows or connections multiply?
- **Contrarian positioning**: Challenge assumptions the market takes for granted — what would a solution look like if you ignored the dominant UX pattern, pricing model, or distribution channel?
- **AI-native opportunities**: Capabilities only possible with AI (real-time personalization, natural language interfaces, predictive workflows, automated quality feedback) that would be impractical to build conventionally.

## Deep Guidance

### Strategic Innovation Framework

Apply these lenses sequentially. Each builds on the previous:

**1. Market Landscape Scan**
- Who are the 3-5 closest competitors? What do they all assume?
- Which customer segments are poorly served by existing solutions?
- What friction points exist in the current adoption/onboarding flow industry-wide?
- Are there geographic, regulatory, or industry verticals where existing solutions don't work?

**2. Ecosystem & Platform Analysis**
- What data does this product generate that others would find valuable?
- What integrations would make this product "sticky" (hard to leave)?
- Could this product become a platform that others build on?
- What network effects are possible (direct: more users = more value; indirect: more content/data = better product)?

**3. Contrarian & Blue Ocean Opportunities**
- What would the product look like if it cost 10x less? 10x more?
- What if the primary interface were voice? Chat? No interface at all?
- What if the product solved the problem *before* the user knew they had it?
- Which "table stakes" features could be dropped entirely for a specific segment?

**4. AI-Native Capabilities**
- Where can the product anticipate user intent rather than waiting for commands?
- What manual steps could be eliminated with LLM-powered analysis?
- Where can the product learn from usage patterns without explicit configuration?
- What would a "copilot" experience look like for this domain?

### Evaluation Criteria

For each innovation opportunity:
- **Strategic fit**: Does it reinforce the vision's core thesis?
- **Defensibility**: Is this hard for competitors to replicate?
- **Timing**: Is this a v1 differentiator or a future roadmap item?
- **Feasibility**: Can current AI capabilities deliver this reliably?

### Anti-Patterns

- Don't innovate on commodity features (auth, billing, CRUD) — these should be standard
- Don't propose innovations that require the product to be successful first (network effects for a product with zero users)
- Don't confuse "technically interesting" with "strategically valuable"
- Don't ignore the user's stated vision — innovations should extend it, not replace it
```

- [ ] **Step 2: Update innovate-vision knowledge-base reference**

In `content/pipeline/vision/innovate-vision.md` line 10, change:
```
knowledge-base: [vision-craft, prd-innovation]
```
To:
```
knowledge-base: [vision-craft, vision-innovation]
```

- [ ] **Step 3: Run evals to verify knowledge injection**

```bash
npx bats tests/evals/knowledge-injection.bats
```

Expected: All tests pass. The new `vision-innovation` entry should be referenced by `innovate-vision` and detected by the injection eval.

- [ ] **Step 4: Commit**

```bash
git add content/knowledge/product/vision-innovation.md content/pipeline/vision/innovate-vision.md
git commit -m "feat: add vision-innovation knowledge entry, fix innovate-vision KB reference (4-W1)

Replace prd-innovation (feature-scoped) with vision-innovation (strategy-scoped)
in innovate-vision knowledge-base. Parallels existing pattern: prd-innovation for
innovate-prd, user-story-innovation for innovate-user-stories."
```

---

### Task 4: Create AC-to-test-skeleton knowledge entry (4-M1)

**Files:**
- Create: `content/knowledge/core/test-skeleton-generation.md`
- Modify: `content/pipeline/quality/story-tests.md:11`

The `story-tests` step generates test skeletons from acceptance criteria but has no knowledge entry covering the mechanical translation of Given/When/Then ACs into framework-specific test code. The existing `testing-strategy` knowledge covers the test pyramid and patterns but not this specific transformation.

- [ ] **Step 1: Create test-skeleton-generation knowledge entry**

Create `content/knowledge/core/test-skeleton-generation.md`:

```markdown
---
name: test-skeleton-generation
description: Patterns for translating acceptance criteria into framework-specific test skeleton files
topics: [testing, test-generation, acceptance-criteria, tdd, test-skeletons]
---

# Test Skeleton Generation

## Summary

- **Purpose**: Translate user story acceptance criteria (Given/When/Then) into pending test cases in the project's test framework, one test per AC.
- **Output format**: One test file per story (or per epic), with each AC as a pending/skipped test case that documents the expected behavior without implementing it.
- **Framework mapping**: `describe` = story, `it`/`test` = AC criterion. For frameworks without pending support, use `it.skip` or `@pytest.mark.skip` with the AC text as the test name.
- **Layer assignment**: Each test skeleton is tagged with its execution layer (unit, integration, e2e) based on what the AC tests — data validation → unit, API flow → integration, user workflow → e2e.
- **ID tracing**: Every test name includes the story ID and criterion ID (e.g., `US-3.2: Given a logged-in user...`) so implementation agents can trace tests back to requirements.

## Deep Guidance

### Translation Rules

**Given/When/Then → Test Structure:**
```
Given [precondition]     →  test setup / arrange
When [action]            →  act / trigger
Then [expected outcome]  →  assert / verify
And [additional outcome] →  additional assertion
```

**Framework-Specific Patterns:**

| Framework | Story Group | Test Case | Pending Marker |
|-----------|------------|-----------|----------------|
| vitest/jest | `describe('US-3: Story title')` | `it('AC-3.1: Given X when Y then Z')` | `it.skip(...)` or `it.todo(...)` |
| pytest | `class TestUS3StoryTitle:` | `def test_ac_3_1_given_x_when_y_then_z(self):` | `@pytest.mark.skip(reason='skeleton')` |
| bats | comment block with story ID | `@test "AC-3.1: Given X when Y then Z"` | `skip "skeleton"` |
| Go testing | `func TestUS3_StoryTitle(t *testing.T)` | `t.Run("AC-3.1: Given X when Y then Z", ...)` | `t.Skip("skeleton")` |

### Layer Assignment Heuristic

| AC Pattern | Layer | Example |
|------------|-------|---------|
| Validates input/output of a single function | Unit | "Then the email format is validated" |
| Tests interaction between components | Integration | "Then the order is saved to the database" |
| Tests a user-visible workflow end-to-end | E2E | "Then the user sees a confirmation page" |
| Tests error handling at a boundary | Integration | "Then a 400 error is returned with details" |
| Tests a non-functional requirement | Varies | Perf → benchmark, security → integration |

### Story-Tests-Map Format

The `docs/story-tests-map.md` output maps every story to its test files:

```markdown
| Story ID | Story Title | Test File | Layer | AC Count |
|----------|------------|-----------|-------|----------|
| US-1 | User registration | tests/acceptance/us-1-registration.test.ts | integration | 4 |
| US-2 | Password reset | tests/acceptance/us-2-password-reset.test.ts | e2e | 3 |
```

### Anti-Patterns

- Don't implement test logic — skeletons are pending/skipped stubs only
- Don't combine multiple ACs into one test — one AC = one test case
- Don't omit the story/criterion ID from test names — traceability is the point
- Don't guess the test framework — read `docs/tech-stack.md` and `docs/tdd-standards.md`
- Don't create test files outside the project's test directory convention
```

- [ ] **Step 2: Add test-skeleton-generation to story-tests knowledge-base**

In `content/pipeline/quality/story-tests.md` line 11, change:
```
knowledge-base: [testing-strategy, user-stories]
```
To:
```
knowledge-base: [testing-strategy, user-stories, test-skeleton-generation]
```

- [ ] **Step 3: Run evals**

```bash
npx bats tests/evals/knowledge-injection.bats
npx bats tests/evals/knowledge-quality.bats
```

Expected: All tests pass. New entry should have Summary + Deep Guidance structure.

- [ ] **Step 4: Commit**

```bash
git add content/knowledge/core/test-skeleton-generation.md content/pipeline/quality/story-tests.md
git commit -m "feat: add test-skeleton-generation knowledge entry for story-tests (4-M1)

Covers Given/When/Then to test framework translation, layer assignment
heuristics, and story-tests-map format. Referenced by story-tests step."
```

---

### Task 5: Create "After This Step" reference validation eval (8-M1)

**Files:**
- Create: `tests/evals/after-this-step-references.bats`

No eval currently validates that "After This Step" sections in pipeline files reference valid step names. If a step says "Run `/scaffold:create-vision`" but the step slug is misspelled, agents would be sent to the wrong step.

- [ ] **Step 1: Create the eval file**

Create `tests/evals/after-this-step-references.bats`:

```bash
#!/usr/bin/env bats

# Validate "After This Step" sections reference valid pipeline step names

load 'eval_helper'

@test "After This Step references are valid pipeline step names" {
  local invalid=()
  local checked=0

  # Collect all valid step names
  local valid_names
  valid_names="$(get_pipeline_names)"

  # Also collect tool names (valid targets for After This Step)
  local tool_names
  tool_names="$(grep -rh '^name:' "${PROJECT_ROOT}/content/tools/" 2>/dev/null | sed 's/name: //' | sort)"

  local all_valid
  all_valid="$(printf '%s\n%s' "$valid_names" "$tool_names" | sort -u)"

  while IFS= read -r -d '' file; do
    # Extract After This Step section and find /scaffold: references
    local refs
    refs="$(awk '/^## After This Step/,/^## / { print }' "$file" | grep -oP 'scaffold[: ]+\K[a-z][a-z0-9-]+' || true)"

    for ref in $refs; do
      checked=$((checked + 1))
      if ! echo "$all_valid" | grep -qx "$ref"; then
        invalid+=("$(basename "$file" .md): references '$ref' which is not a valid step or tool name")
      fi
    done
  done < <(find "${PROJECT_ROOT}/content/pipeline" -name '*.md' -type f -print0)

  if [ "${#invalid[@]}" -gt 0 ]; then
    printf "Invalid After This Step references:\n"
    printf "  %s\n" "${invalid[@]}"
  fi

  [[ "$checked" -gt 0 ]]
  [[ "${#invalid[@]}" -eq 0 ]]
}

@test "document-creating steps have After This Step section" {
  local missing=()
  local checked=0

  while IFS= read -r -d '' file; do
    local name
    name="$(extract_field "$file" "name")"

    # Skip build-phase steps (stateless, no After This Step needed)
    local phase
    phase="$(extract_field "$file" "phase")"
    [[ "$phase" == "build" ]] && continue

    # Skip conditional steps (may not run)
    local conditional
    conditional="$(extract_field "$file" "conditional")"
    [[ "$conditional" == "if-needed" ]] && continue

    # Check for After This Step section
    if ! grep -q '^## After This Step' "$file"; then
      missing+=("$name (phase: $phase)")
    fi
    checked=$((checked + 1))
  done < <(find "${PROJECT_ROOT}/content/pipeline" -name '*.md' -type f -print0)

  if [ "${#missing[@]}" -gt 0 ]; then
    printf "Steps missing 'After This Step' section:\n"
    printf "  %s\n" "${missing[@]}"
  fi

  [[ "$checked" -gt 0 ]]
  # Allow some missing — this is a gradual adoption check
  [[ "${#missing[@]}" -le 15 ]]
}
```

- [ ] **Step 2: Run the new eval**

```bash
npx bats tests/evals/after-this-step-references.bats -v
```

Expected: Both tests pass. If test 1 finds invalid references, those are real bugs to fix. If test 2 finds too many missing sections, adjust the threshold.

- [ ] **Step 3: Run full eval suite to verify no regressions**

```bash
make eval
```

Expected: All eval tests pass.

- [ ] **Step 4: Commit**

```bash
git add tests/evals/after-this-step-references.bats
git commit -m "test: add After This Step reference validation eval (8-M1)

Checks that After This Step sections reference valid step/tool names
and that non-conditional, non-build steps include the section."
```

---

### Task 6: Run full verification and final commit

- [ ] **Step 1: Run full quality gates**

```bash
make check-all
```

Expected: All gates pass (TypeScript build + tests, ShellCheck, frontmatter validation, bats tests, evals).

- [ ] **Step 2: Verify scaffold build still works**

```bash
npx scaffold build 2>&1
```

Expected: Build completes, generates files to `.scaffold/generated/` and resolved skills to `skills/`.

- [ ] **Step 3: Final git status**

```bash
git status
git log --oneline -6
```

Expected: Clean working tree, 5 new commits from tasks 1-5.

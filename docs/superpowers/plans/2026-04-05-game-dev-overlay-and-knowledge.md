# Game Dev Overlay + Knowledge Entries — Implementation Plan (Plan 2 of 4)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create the game-overlay.yml project-type overlay definition and all 29 game-specific knowledge entries that inject domain expertise into pipeline steps.

**Architecture:** Pure content files (markdown + YAML). No TypeScript changes. Knowledge entries follow the existing two-section pattern (Summary + Deep Guidance) with frontmatter containing name, description, and topics fields. The game overlay YAML follows the schema defined in Plan 1.

**Tech Stack:** Markdown, YAML

**Spec:** `docs/superpowers/specs/2026-04-05-game-dev-pipeline-design.md` (Section 2b for overlay, Section 5 for knowledge entries)

**Depends on:** Plan 1 (engine prerequisites — TypeScript types and overlay loader)

---

## File Map

| File | Category | Min Lines |
|------|----------|-----------|
| `content/methodology/game-overlay.yml` | overlay | N/A |
| `content/knowledge/game/game-design-document.md` | core | 200 |
| `content/knowledge/game/game-engine-selection.md` | core | 200 |
| `content/knowledge/game/game-asset-pipeline.md` | core | 200 |
| `content/knowledge/game/game-binary-vcs-strategy.md` | core | 200 |
| `content/knowledge/game/game-performance-budgeting.md` | core | 200 |
| `content/knowledge/game/game-testing-strategy.md` | core | 200 |
| `content/knowledge/game/game-economy-design.md` | core | 200 |
| `content/knowledge/game/game-accessibility.md` | core | 200 |
| `content/knowledge/game/game-audio-design.md` | core | 200 |
| `content/knowledge/game/game-networking.md` | core | 200 |
| `content/knowledge/game/game-platform-certification.md` | core | 200 |
| `content/knowledge/game/game-ui-patterns.md` | core | 200 |
| `content/knowledge/game/game-save-systems.md` | core | 200 |
| `content/knowledge/game/game-project-structure.md` | core | 200 |
| `content/knowledge/game/game-domain-patterns.md` | core | 200 |
| `content/knowledge/game/game-milestone-definitions.md` | core | 200 |
| `content/knowledge/game/game-narrative-design.md` | core | 200 |
| `content/knowledge/game/game-level-content-design.md` | core | 200 |
| `content/knowledge/game/game-ai-patterns.md` | core | 200 |
| `content/knowledge/game/game-input-systems.md` | core | 200 |
| `content/knowledge/game/game-liveops-analytics.md` | core | 200 |
| `content/knowledge/game/game-localization.md` | core | 200 |
| `content/knowledge/game/game-vr-ar-design.md` | core | 200 |
| `content/knowledge/game/game-modding-ugc.md` | core | 200 |
| `content/knowledge/review/review-game-design.md` | review | 150 |
| `content/knowledge/review/review-art-bible.md` | review | 150 |
| `content/knowledge/review/review-game-economy.md` | review | 150 |
| `content/knowledge/review/review-netcode.md` | review | 150 |
| `content/knowledge/review/review-platform-cert.md` | review | 150 |

## Structural Requirements for Knowledge Entries

Every knowledge entry MUST have:

1. **Frontmatter** (lines 1-5):
```yaml
---
name: <kebab-case matching filename>
description: <one-line purpose, max 200 chars>
topics: [<comma-separated lowercase topic tags>]
---
```

2. **Body sections** (in order):
- Opening paragraph (2-3 sentences of context)
- `## Summary` — Core concepts, key patterns, quick mental models (~40 lines)
- `## Deep Guidance` — Extended explanations, detailed patterns, when-to-use, pitfalls, examples (~150+ lines)

3. **Code blocks**: Core category entries need at least 1 fenced code block. Review category needs at least 1.

4. **Minimum line count**: Core = 200 lines, Review = 150 lines (including frontmatter)

---

### Task 1: Create game-overlay.yml

**Files:**
- Create: `content/methodology/game-overlay.yml`

- [ ] **Step 1: Create the game overlay file**

Write the full overlay YAML from spec Section 2b. Include all sections:
- `name`, `description`, `project-type`
- `step-overrides` (all 24 game steps enabled/conditional, 3 disabled)
- `knowledge-overrides` (30+ step-to-knowledge mappings from spec)
- `reads-overrides` (7 remappings from spec)
- `dependency-overrides` (2 remappings from spec)

Reference the COMPLETE overlay definition in the spec at `docs/superpowers/specs/2026-04-05-game-dev-pipeline-design.md` Section 2b. Copy it verbatim — do NOT abbreviate.

- [ ] **Step 2: Validate YAML syntax**

Run: `node -e "const yaml = require('js-yaml'); const fs = require('fs'); yaml.load(fs.readFileSync('content/methodology/game-overlay.yml', 'utf8')); console.log('Valid YAML')"`
Expected: "Valid YAML"

- [ ] **Step 3: Commit**

```bash
git add content/methodology/game-overlay.yml
git commit -m "feat: add game-overlay.yml project-type overlay definition"
```

---

### Task 2: Knowledge entries — Game Design foundations (5 entries)

**Files:**
- Create: `content/knowledge/game/game-design-document.md`
- Create: `content/knowledge/game/game-engine-selection.md`
- Create: `content/knowledge/game/game-milestone-definitions.md`
- Create: `content/knowledge/game/game-domain-patterns.md`
- Create: `content/knowledge/game/game-project-structure.md`

Write each entry following the structural requirements above. Content for each entry is defined in the spec Section 5, entries K1, K2, K15, K14, K13.

For each entry:
- [ ] **Step 1: Write the knowledge entry** following the template (frontmatter + intro + Summary + Deep Guidance)
- [ ] **Step 2: Verify line count** — `wc -l <file>` must be >= 200
- [ ] **Step 3: Verify at least 1 code block** — `grep -c '^\`\`\`' <file>` must be >= 2 (open + close)

After all 5 entries:
- [ ] **Step 4: Run make validate** to check frontmatter
- [ ] **Step 5: Commit**

```bash
git add content/knowledge/game/
git commit -m "feat: add game design foundation knowledge entries (5 files)"
```

---

### Task 3: Knowledge entries — Technical systems (5 entries)

**Files:**
- Create: `content/knowledge/game/game-performance-budgeting.md`
- Create: `content/knowledge/game/game-networking.md`
- Create: `content/knowledge/game/game-audio-design.md`
- Create: `content/knowledge/game/game-input-systems.md`
- Create: `content/knowledge/game/game-save-systems.md`

Content from spec Section 5: K5, K10, K9, K20, K13.

Follow same per-entry steps as Task 2 (write, verify line count >= 200, verify code block).

- [ ] **Step 1-3: Write each entry** (5 entries, same pattern as Task 2)
- [ ] **Step 4: Run make validate**
- [ ] **Step 5: Commit**

```bash
git add content/knowledge/game/
git commit -m "feat: add game technical systems knowledge entries (5 files)"
```

---

### Task 4: Knowledge entries — Content & production (5 entries)

**Files:**
- Create: `content/knowledge/game/game-asset-pipeline.md`
- Create: `content/knowledge/game/game-binary-vcs-strategy.md`
- Create: `content/knowledge/game/game-testing-strategy.md`
- Create: `content/knowledge/game/game-ui-patterns.md`
- Create: `content/knowledge/game/game-level-content-design.md`

Content from spec Section 5: K3, K4, K6, K12, K18.

Follow same per-entry steps as Task 2.

- [ ] **Step 1-3: Write each entry** (5 entries)
- [ ] **Step 4: Run make validate**
- [ ] **Step 5: Commit**

```bash
git add content/knowledge/game/
git commit -m "feat: add game content and production knowledge entries (5 files)"
```

---

### Task 5: Knowledge entries — Player experience & platform (5 entries)

**Files:**
- Create: `content/knowledge/game/game-accessibility.md`
- Create: `content/knowledge/game/game-economy-design.md`
- Create: `content/knowledge/game/game-platform-certification.md`
- Create: `content/knowledge/game/game-narrative-design.md`
- Create: `content/knowledge/game/game-ai-patterns.md`

Content from spec Section 5: K8, K7, K11, K17, K19.

Follow same per-entry steps as Task 2.

- [ ] **Step 1-3: Write each entry** (5 entries)
- [ ] **Step 4: Run make validate**
- [ ] **Step 5: Commit**

```bash
git add content/knowledge/game/
git commit -m "feat: add game player experience and platform knowledge entries (5 files)"
```

---

### Task 6: Knowledge entries — Operations & specialized (4 entries)

**Files:**
- Create: `content/knowledge/game/game-liveops-analytics.md`
- Create: `content/knowledge/game/game-localization.md`
- Create: `content/knowledge/game/game-vr-ar-design.md`
- Create: `content/knowledge/game/game-modding-ugc.md`

Content from spec Section 5: K21, K22, K23, K24.

Follow same per-entry steps as Task 2.

- [ ] **Step 1-3: Write each entry** (4 entries)
- [ ] **Step 4: Run make validate**
- [ ] **Step 5: Commit**

```bash
git add content/knowledge/game/
git commit -m "feat: add game operations and specialized knowledge entries (4 files)"
```

---

### Task 7: Knowledge entries — Review entries (5 entries)

**Files:**
- Create: `content/knowledge/review/review-game-design.md`
- Create: `content/knowledge/review/review-art-bible.md`
- Create: `content/knowledge/review/review-game-economy.md`
- Create: `content/knowledge/review/review-netcode.md`
- Create: `content/knowledge/review/review-platform-cert.md`

Content from spec Section 5: K25-K29.

Review entries follow the same structure but with review-specific focus: What to Check, Why It Matters, How to Check, Finding Templates, Severity Examples. Min 150 lines each. Need at least 1 code block each.

- [ ] **Step 1-3: Write each entry** (5 entries, min 150 lines, 1+ code block)
- [ ] **Step 4: Run make validate**
- [ ] **Step 5: Commit**

```bash
git add content/knowledge/review/
git commit -m "feat: add game review knowledge entries (5 files)"
```

---

### Task 8: Run quality gates and fix eval failures

**Files:** None new (verification + fixes)

- [ ] **Step 1: Run make check**

Run: `make check`
Expected: May have eval failures (new knowledge entries need to be referenced by pipeline steps)

- [ ] **Step 2: Check eval that requires knowledge entries to be referenced**

The eval `knowledge-quality.bats` requires every knowledge entry to be referenced by at least one pipeline step. Since game pipeline steps don't exist yet (Plan 3), these entries will fail that eval.

Workaround: Add `<!-- eval-wip -->` as the first line of each new knowledge entry to temporarily exclude from evals. This will be removed when Plan 3 adds the pipeline steps that reference them.

- [ ] **Step 3: Re-run make check**

Run: `make check`
Expected: All evals pass

- [ ] **Step 4: Commit**

```bash
git add content/knowledge/
git commit -m "chore: add eval-wip markers to game knowledge entries (pending Plan 3 pipeline steps)"
```

# Scaffold Completeness Audit

Perform a comprehensive audit of the scaffold project's dual-distribution architecture to identify gaps, assess quality, and ensure both distribution channels deliver equivalent value.

## Architecture Context

Scaffold v2 has **two distribution channels** for the same prompt pipeline:

### Channel 1: TypeScript CLI (`scaffold run <step>`)
- **Engine**: `src/core/assembly/engine.ts` assembles prompts at runtime
- **Step definitions**: `pipeline/<phase>/<step>.md` — lightweight meta-prompts with YAML frontmatter (name, phase, order, dependencies, outputs, knowledge-base)
- **Domain expertise**: `knowledge/<category>/<entry>.md` — loaded by `knowledge-loader.ts` based on each step's `knowledge-base:` field
- **Depth presets**: `methodology/deep.yml`, `mvp.yml`, `custom-defaults.yml` — scale step detail
- **Shipped via npm**: `dist/`, `pipeline/`, `knowledge/`, `methodology/` (see `package.json` `files` array)

### Channel 2: Claude Code Plugin (`/scaffold:<command>`)
- **Full prompts**: `commands/<slug>.md` — pre-rendered, self-contained prompts with YAML frontmatter
- **Generated from**: `prompts.md` via `scripts/extract-commands.sh`
- **NOT shipped via npm** (in `.npmignore`) — distributed through Claude Code plugin install
- **No runtime assembly** — the full prompt text is in the file itself

### Source of Truth
`prompts.md` is the canonical source. It contains:
- Setup Order table (execution sequence)
- Individual prompt sections (full prompt text)
- `commands/` is generated from it; `pipeline/` is a parallel representation for the CLI

### Why This Matters
A gap in `pipeline/` means CLI users (`scaffold run`) can't access that step with knowledge injection. A gap in `commands/` means plugin users (`/scaffold:`) can't invoke that step at all. A thin knowledge file means CLI-assembled prompts are degraded for every user.

---

## Before You Start

Read these files to understand the dual architecture:

**Assembly engine** (understand how pipeline + knowledge are loaded at runtime):
- `src/core/assembly/engine.ts` — The prompt assembly orchestrator
- `src/core/assembly/meta-prompt-loader.ts` — How pipeline steps are discovered and parsed
- `src/core/assembly/knowledge-loader.ts` — How knowledge entries are indexed and loaded
- `src/utils/fs.ts` — Path resolution (`getPackagePipelineDir`, `getPackageKnowledgeDir`)

**Distribution config**:
- `package.json` — `files` array (what ships via npm), `bin` entry
- `.claude-plugin/plugin.json` — Plugin manifest
- `.npmignore` — What's excluded from npm (commands/ is excluded)

**Exemplars** (what "complete" looks like across all systems):
- `commands/create-evals.md` — Complete command with all structural sections
- `pipeline/quality/create-evals.md` — Complete pipeline step with full frontmatter
- `knowledge/core/eval-craft.md` — High-quality knowledge file (843 lines, 30 code blocks)
- `knowledge/core/testing-strategy.md` — Another strong exemplar (410 lines)
- `pipeline/planning/implementation-plan.md` — Pipeline step with detailed sections

**Pipeline definition**:
- `prompts.md` lines 1-160 — Setup Order table, phases, dependency graph
- `methodology/deep.yml`, `methodology/mvp.yml` — Depth presets

Then inventory:
- All files in `commands/` (filenames only)
- All files in `pipeline/` recursively (filenames + full frontmatter)
- All files in `knowledge/` recursively (filenames + full frontmatter + line count)

---

## Part 1: Dual-Channel Cross-Reference Map

### Step 1: Canonical Pipeline Inventory

Read `prompts.md` Setup Order table. For each entry, record:
- **#** (position number)
- **Prompt name** (as shown in table)
- **Phase** (1-7 + Ongoing)
- **Command slug** (from `commands/` filename) — or MISSING
- **Pipeline step name** (from `pipeline/` `name:` field) — or MISSING
- **Knowledge entries** (from pipeline step's `knowledge-base:` field) — or N/A
- **Channel gap**: "CLI only" | "Plugin only" | "Both" | "Neither"

Produce the full mapping table covering every Setup Order entry AND every pipeline step not in the Setup Order.

### Step 2: Identify Orphans in Each Channel

**Plugin orphans**: Commands in `commands/` that don't correspond to ANY prompt in `prompts.md` Setup Order or Ongoing tables, and don't correspond to any pipeline step.

**CLI orphans**: Pipeline steps in `pipeline/` that don't correspond to any command OR any Setup Order entry. These may be legitimate (part of the CLI-only expanded pipeline) or stale.

**Knowledge orphans**: Knowledge files in `knowledge/` not referenced by any pipeline step's `knowledge-base:` field.

### Step 3: Classify All Commands

For each file in `commands/`, classify as:

| Type | Description | Example |
|------|-------------|---------|
| **Pipeline (core)** | In Setup Order table, creates project artifacts | `create-prd`, `tech-stack`, `coding-standards` |
| **Pipeline (review)** | In Setup Order table, reviews/innovates existing artifacts | `prd-gap-analysis`, `workflow-audit` |
| **Pipeline (optional)** | In Setup Order table, conditional on project type | `add-playwright`, `design-system` |
| **Ongoing** | In Ongoing table, re-runnable for maintenance | `new-enhancement`, `create-evals` (re-run) |
| **Execution** | Agent start/resume commands | `single-agent-start`, `multi-agent-resume` |
| **Utility** | Operational tools, not part of pipeline | `release`, `version-bump`, `dashboard` |

---

## Part 2: Gap Analysis

### Gap Type 1: Setup Order Entries Missing Pipeline Steps (CLI Gap)

For each Setup Order entry that has a command in `commands/` but NO pipeline step in `pipeline/`:

| Field | What to Record |
|-------|---------------|
| Command slug | The command file name |
| Phase | From Setup Order table |
| Severity | **P1** if it's a core document-creating prompt, **P2** if review/optional |
| Impact | CLI users can't run this step; no knowledge injection happens |
| Knowledge needed | What domain expertise would improve this prompt if assembled via CLI |
| Recommended knowledge entries | Existing entries to reference + new entries to create |

### Gap Type 2: Pipeline Steps Missing Commands (Plugin Gap)

For each pipeline step that has NO corresponding command in `commands/`:

| Field | What to Record |
|-------|---------------|
| Step name | From pipeline frontmatter |
| Phase | From pipeline frontmatter |
| Severity | **P2** for core steps, **P3** for validation/finalization (which may be CLI-only by design) |
| Impact | Plugin users can't invoke this step |
| Question | Is this intentionally CLI-only, or should it have a command? |

### Gap Type 3: Knowledge Quality Gaps (Production Quality)

**This is the highest-leverage finding.** Knowledge files ship with the npm package and are injected into every CLI-assembled prompt. Thin files = degraded prompts for all CLI users.

For each knowledge file, assess against **production quality bars**:

**Core knowledge** (knowledge/core/):
| Criterion | Minimum Bar | Rationale |
|-----------|-------------|-----------|
| Line count | 200+ | Must provide depth beyond what the prompt itself contains |
| Code blocks | 3+ | AI agents need concrete examples, not just prose |
| Anti-patterns section | Required | "What NOT to do" prevents common mistakes |
| Multi-framework | 2+ frameworks | Scaffold targets all stacks; knowledge must be portable |
| Prescriptive guidance | >70% prescriptive | "Do X because Y" not "X is a concept that..." |

**Review knowledge** (knowledge/review/):
| Criterion | Minimum Bar | Rationale |
|-----------|-------------|-----------|
| Line count | 150+ | Each review pass needs enough depth to guide findings |
| Review passes | 3+ defined passes | Multi-pass structure per review-methodology pattern |
| Finding examples | 1+ per pass (P0-P2) | AI agents need calibration examples |
| What a Finding Looks Like | Required per pass | The key section — shows expected output format |

**Validation knowledge** (knowledge/validation/):
| Criterion | Minimum Bar | Rationale |
|-----------|-------------|-----------|
| Line count | 150+ | Validation logic needs specificity |
| Checklist items | 5+ | Concrete things to verify |
| Common issues | 3+ | Patterns the validation typically catches |

**Finalization knowledge** (knowledge/finalization/):
| Criterion | Minimum Bar | Rationale |
|-----------|-------------|-----------|
| Line count | 150+ | Finalization steps are complex multi-part operations |
| Output format | Specified | What the finalized artifact looks like |

**Product knowledge** (knowledge/product/):
| Criterion | Minimum Bar | Rationale |
|-----------|-------------|-----------|
| Line count | 200+ | Product decisions need deep methodology |
| Code blocks | 1+ | At least format/structure examples |
| Anti-patterns | Required | Bad PRDs/stories are common; must show what to avoid |

Grade each file:
- **A**: Exceeds all bars, could stand alone as reference material
- **B**: Meets all bars, adequate depth
- **C**: Below bar on 1-2 criteria, provides some value but gaps exist
- **D**: Below bar on 3+ criteria, likely not improving assembled prompts meaningfully
- **F**: Stub/placeholder (under 120 lines with minimal structure)

**Flag any file at exactly ~100 lines** — this pattern suggests batch-generated stubs that were never fleshed out.

### Gap Type 4: Cross-Channel Sync Issues

Check for inconsistencies between the two channels:
- Command prompt text in `commands/` differs materially from what the CLI would assemble from `pipeline/` + `knowledge/` for the same step
- After This Step / Next guidance in commands points to a step that doesn't exist in pipeline (or vice versa)
- Dependencies declared in pipeline step frontmatter don't match the ordering implied by the Setup Order table

---

## Part 3: Pipeline Step Quality Assessment

### For Each Pipeline Step Definition

Assess completeness against the schema used by `meta-prompt-loader.ts`:

**Required frontmatter fields** (8 total):
- `name` — matches the step identifier used in `knowledge-base:` references
- `description` — one-line summary
- `phase` — which pipeline phase this belongs to
- `order` — numeric position (determines execution sequence)
- `dependencies` — array of step names that must complete first
- `outputs` — array of file paths this step produces
- `conditional` — null or condition string (e.g., "if-needed")
- `knowledge-base` — array of knowledge entry names to inject

**Required content sections** (6 total):
- Purpose — what this step does and why
- Inputs — required and optional document inputs with paths
- Expected Outputs — what artifacts this step produces
- Quality Criteria — how to know the step is complete and correct
- Methodology Scaling — deep/mvp/custom depth variations
- Mode Detection — fresh vs update behavior

**Quality signals**:
- Do dependencies form a valid DAG with no cycles?
- Are output paths consistent with what the corresponding command actually produces?
- Does Methodology Scaling reference methodology presets that exist in `methodology/`?

### For Each Command File

Assess structural completeness:

**Required for document-creating commands**:
- Frontmatter: `description`, `long-description`
- Mode Detection block
- Update Mode Specifics (Primary output, Secondary output, Preserve, Related docs, Special rules)
- Process section (execution steps)
- After This Step section (next pipeline step guidance)

**Recommended for all commands**:
- "What This Prompt Should NOT Do" section

---

## Part 4: Naming Consistency Audit

The three systems use different naming conventions. Map and assess:

| System | Convention | Example |
|--------|-----------|---------|
| Command slug | kebab-case from filename | `create-evals` |
| Pipeline step name | kebab-case from frontmatter `name:` | `create-evals` |
| Knowledge entry name | kebab-case from frontmatter `name:` | `eval-craft` |

For each prompt that exists in multiple systems, produce:

| Command Slug | Pipeline Step Name | Knowledge Entry | Match? | Recommendation |
|---|---|---|---|---|
| `create-prd` | `create-prd` | `prd-craft` | Partial | Knowledge uses domain name (acceptable) |
| `tdd` | `tdd` | `testing-strategy` | Partial | Knowledge uses domain name (acceptable) |
| `implementation-plan` | `implementation-plan` | `task-decomposition` | Partial | Knowledge uses domain name (acceptable) |

**Assessment criteria**:
- Command ↔ Pipeline step: Should match exactly (same prompt, different representation)
- Pipeline step ↔ Knowledge: Can differ (step name = what it does, knowledge name = domain concept)

---

## Part 5: Overlap & Redundancy Analysis

The v1→v2 migration created a dual-distribution architecture. During that migration, content may have been duplicated rather than cleanly decomposed. This section identifies redundancy that wastes context window tokens, creates maintenance burden (two copies of the same guidance to keep in sync), and confuses which source is authoritative.

### Analysis 1: Command ↔ Command Functional Overlap

Check for commands that serve overlapping purposes or produce overlapping outputs.

**How to check:**
1. For each pair of commands, compare their `description`, `long-description`, and output artifacts
2. Look specifically for these overlap patterns:
   - Two commands that both modify the same output file (e.g., both update `CLAUDE.md`)
   - Two commands that perform the same type of analysis on the same inputs
   - A "gap analysis" command that substantially overlaps with a "review" command for the same artifact
   - An "innovation" variant that duplicates the review logic before adding its own

**Known suspects to investigate:**
- `prd-gap-analysis` vs the pipeline's `review-prd` + `innovate-prd` — is the command doing what two pipeline steps do? Is there redundant review logic?
- `user-stories-gaps` vs `review-user-stories` + `innovate-user-stories` — same pattern
- `workflow-audit` vs the pipeline's `cross-phase-consistency` step — do they check the same things?
- `implementation-plan-review` command vs `implementation-plan-review` pipeline step — is the command just the pipeline step, or does it add/duplicate?
- `tdd` command vs `tdd` pipeline step — same prompt expressed twice, or genuinely different scope?

**For each overlap found, record:**

| Command A | Command/Step B | Overlap Type | % Overlap (estimate) | Recommendation |
|---|---|---|---|---|
| ... | ... | Functional / Content / Output | Low/Medium/High | Merge / Deduplicate / Intentional (document why) |

### Analysis 2: Command Content ↔ Knowledge Content Redundancy

When the CLI assembles a prompt via `scaffold run`, it combines:
- Pipeline step body (from `pipeline/<phase>/<step>.md`)
- Knowledge entries (from `knowledge/<category>/<entry>.md`)
- Methodology guidance (from `methodology/*.yml`)

When a user invokes the same prompt via the plugin (`/scaffold:<command>`), they get:
- The full command text (from `commands/<slug>.md`)

**The question:** Does the command file contain guidance that is ALSO in the knowledge file? If so, CLI users get it twice (wasted context), and there are two copies to maintain.

**How to check:**
For each prompt that exists in BOTH channels (the 7 identified in Part 1):
1. Read the command file (`commands/<slug>.md`) — this is the full prompt
2. Read the knowledge entries referenced by the corresponding pipeline step
3. Compare: identify paragraphs, code examples, rules, or guidance sections that appear in BOTH the command and the knowledge file
4. Quantify: estimate what percentage of the knowledge file's content is already present in the command text

**For each finding, record:**

| Command | Knowledge Entry | Duplicated Content | Est. Duplicate Lines | Recommendation |
|---|---|---|---|---|
| `create-evals` | `eval-craft` | The 4 eval category descriptions, design principles, framework examples | ... | Decide: keep in command only (plugin), knowledge only (CLI), or accept duplication |

**Key question:** Should knowledge files contain content that's already in the command prompt? Or should knowledge provide ONLY supplementary expertise beyond what the prompt itself contains?

Design principle to evaluate against: The assembly engine concatenates step body + knowledge. If the step body says "check consistency" and the knowledge file explains "how to check consistency with code examples," that's complementary (good). If both contain the same code example, that's redundancy (bad).

### Analysis 3: Knowledge ↔ Knowledge Content Overlap

Check for knowledge files that cover the same domain with overlapping content.

**How to check:**
1. For each pair of knowledge files with overlapping `topics` arrays, compare their content
2. Look specifically for:
   - A core knowledge file and its corresponding review knowledge file duplicating the same guidance
   - Validation knowledge files duplicating methodology from core files
   - Multiple knowledge files explaining the same concept (e.g., test pyramid, dependency graphs)

**Known suspects:**
- `testing-strategy` (core) vs `review-testing-strategy` (review) — does the review file re-explain testing concepts?
- `traceability` (validation) vs coverage checks in `eval-craft` (core) — both deal with requirement→implementation mapping
- `task-decomposition` (core) vs `review-implementation-tasks` (review) — does the review file re-explain task sizing?
- `prd-craft` (product) vs `review-prd` (review) — does the review file re-explain what makes a good PRD?
- `user-stories` (core) vs `review-user-stories` (review) — same pattern
- `security-review` (core) vs `review-security` (review) — is `security-review` actually a review knowledge file in the wrong category?

**The ideal separation:**
- **Core knowledge**: Deep domain expertise — patterns, anti-patterns, code examples, framework-specific guidance. Answers: "What does good look like?"
- **Review knowledge**: Multi-pass review methodology specific to that artifact type — what to check, what findings look like, severity calibration. Answers: "How do I evaluate whether this artifact is good?"
- **Validation knowledge**: Cross-artifact consistency checks. Answers: "Do the artifacts agree with each other?"

If a review knowledge file contains "what good looks like" content that's also in the core file, that's redundancy. The review file should REFERENCE the core file's standards (e.g., "evaluate against the testing strategy patterns in `testing-strategy` knowledge") rather than restating them.

**For each overlap found, record:**

| File A | File B | Overlapping Content | Est. Duplicate Lines | Recommendation |
|---|---|---|---|---|
| ... | ... | ... | ... | Extract to one file / Cross-reference / Intentional (different audience) |

### Analysis 4: Pipeline Step Body ↔ Knowledge Content Redundancy

Pipeline step markdown bodies (the content below frontmatter in `pipeline/` files) should be lightweight — purpose, inputs, outputs, quality criteria. The deep guidance should be in knowledge files, not in the step body.

**How to check:**
For each pipeline step:
1. Read the step body (everything after frontmatter)
2. Read the knowledge entries it references
3. Check if the step body contains guidance, examples, or rules that are also in the knowledge files

**Red flags:**
- Step body contains code examples (should be in knowledge only)
- Step body explains methodology in depth (should be in knowledge)
- Step body is >100 lines of content beyond the standard sections (bloated — move excess to knowledge)

**For each finding:**

| Pipeline Step | Knowledge Entry | Redundant Content | Recommendation |
|---|---|---|---|
| ... | ... | ... | Move to knowledge / Keep in step (if it's quality criteria) |

### Analysis 5: prompts.md ↔ commands/ Drift

`commands/` is generated from `prompts.md` via `scripts/extract-commands.sh`. But `commands/` files also have sections maintained independently (`After This Step`, frontmatter `long-description`). Check for drift:

1. For a sample of 5 commands, compare the prompt text in `commands/<slug>.md` against the corresponding section in `prompts.md`
2. Identify any content that exists in one but not the other (beyond the known independent sections)
3. If drift exists, determine which is authoritative and flag the other as stale

### Overlap Summary Table

After completing all 5 analyses, produce a summary:

| Overlap Type | Instances Found | Total Est. Duplicate Lines | Highest Priority Fix |
|---|---|---|---|
| Command ↔ Command functional | ... | ... | ... |
| Command ↔ Knowledge content | ... | ... | ... |
| Knowledge ↔ Knowledge content | ... | ... | ... |
| Pipeline body ↔ Knowledge | ... | ... | ... |
| prompts.md ↔ commands/ drift | ... | ... | ... |

### Deduplication Principles

When resolving overlap, apply these rules:
1. **Single source of truth**: Each piece of guidance lives in exactly one place
2. **Knowledge files own deep expertise**: Code examples, patterns, anti-patterns, framework-specific guidance
3. **Pipeline steps own metadata**: Purpose, inputs, outputs, quality criteria, methodology scaling
4. **Commands own the full prompt**: For the plugin channel, the command IS the prompt — it must be self-contained
5. **Cross-reference, don't duplicate**: If a review knowledge file needs to reference patterns, say "evaluate against patterns in `testing-strategy` knowledge" rather than restating them
6. **Accept intentional duplication between channels**: Commands (plugin) and pipeline+knowledge (CLI) are independent channels. Some duplication is expected — the command must be self-contained since it has no assembly engine. But WITHIN each channel, no duplication.

---

## Part 6: Prioritized Recommendations

### P0: Redundancy Elimination
Overlap and duplication found in Part 5. Redundant content wastes context window tokens (CLI channel) and creates maintenance burden (two copies to keep in sync).

For each P0 redundancy finding, specify:
- Which files overlap
- Estimated duplicate lines
- Recommended resolution (extract to one location, cross-reference, or accept with justification)
- Which channel is affected (CLI, Plugin, or both)

### P0: Production Data Quality
Knowledge files shipped via npm that are below production quality bar. These degrade every CLI-assembled prompt.

For each P0 finding, specify:
- File path
- Current line count
- Current grade
- What's missing
- Estimated effort to bring to grade B+

### P1: CLI Coverage Gaps
Setup Order entries that have commands but no pipeline steps. CLI users can't access these steps.

For each P1 finding, specify:
- Command slug
- Phase
- What knowledge entries should be referenced
- Whether new knowledge entries need to be created

### P2: Plugin Coverage Gaps
Pipeline steps that have no commands. Plugin users can't access these.

For each P2 finding:
- Determine if this is intentionally CLI-only (validation/finalization steps may be)
- If not intentional, note that a command needs to be extracted/created

### P3: Naming and Sync Issues
Naming mismatches between channels, cross-channel sync issues.

### P4: Structural Improvements
- Explicit mapping file between channels
- Meta-evals to keep channels in sync
- Methodology preset coverage

---

## Part 7: Meta-Eval Specification

Based on audit findings, specify bats tests for `tests/evals/` that catch these problems automatically:

### Eval 1: Channel Parity
```
For each entry in prompts.md Setup Order table:
  - Assert: commands/<slug>.md exists
  - Assert: pipeline/<phase>/<step>.md exists with matching name
  - Assert: all knowledge-base entries in pipeline step resolve to knowledge/ files
```
**False positive mitigation**: Some steps may be intentionally single-channel. Maintain an exclusion list with documented reasons.

### Eval 2: Knowledge Quality Gates
```
For each .md file in knowledge/:
  - Assert: frontmatter has name, description, topics (all non-empty)
  - Assert: line count >= category minimum (core: 200, review: 150, validation: 150, finalization: 150)
  - Assert: at least 1 fenced code block for core/review categories
```
**False positive mitigation**: New files being developed may temporarily be below bar. Use a `<!-- eval-wip -->` comment to exclude.

### Eval 3: Pipeline Step Completeness
```
For each .md file in pipeline/:
  - Assert: frontmatter has all 8 required fields
  - Assert: body contains all 6 required section headings
  - Assert: order values are unique within each phase
  - Assert: dependencies reference step names that exist
```

### Eval 4: Command Structure
```
For each .md file in commands/ that is classified as a pipeline command:
  - Assert: frontmatter has description and long-description
  - Assert: contains "Mode Detection" heading (for document-creating commands)
  - Assert: contains "After This Step" heading
  - Assert: contains "Process" heading
```

### Eval 5: Cross-Channel Consistency
```
For each prompt that exists in BOTH commands/ and pipeline/:
  - Assert: command's After This Step references match pipeline step's dependencies
  - Assert: pipeline step's outputs match what the command's Mode Detection checks for
```

### Eval 6: Redundancy Detection
```
For each knowledge entry referenced by a pipeline step that also has a command:
  - Extract key phrases (3+ word sequences) from the knowledge file
  - Search for those phrases in the command file
  - Assert: overlap ratio < 30% (knowledge content shouldn't be copy-pasted into commands)

For each pair of knowledge files with overlapping topics:
  - Extract H2 section headings from both
  - Assert: no identical headings covering the same content
```
**False positive mitigation**: Some overlap between core and review knowledge is expected (review references core concepts). Flag only when content is duplicated verbatim, not when the review file references concepts from the core file.

For each eval, provide the bats test implementation.

---

## Output Format

Deliver the audit as a structured report with:
1. **Executive summary** (5-10 bullet points of key findings with severity)
2. **Channel coverage map** (Part 1 — the full cross-reference table)
3. **Gap analysis** with severity ratings and specific files (Part 2)
4. **Quality scorecards** for all knowledge files, pipeline steps, and commands (Part 3)
5. **Naming consistency table** (Part 4)
6. **Overlap & redundancy findings** with deduplication recommendations (Part 5)
7. **Prioritized action items** with effort estimates (Part 6)
8. **Meta-eval bats test implementations** (Part 7)

Do NOT modify any files. This is a read-only audit. Present findings to the user for review before any changes are made.

---

## After This Audit

When the audit is complete, tell the user:

---
**Audit complete.** Report covers both distribution channels (CLI and Plugin), knowledge quality, and cross-channel parity.

**Recommended next steps** (in priority order):
1. Resolve redundancy/overlap findings (P0 — reduces maintenance burden and wasted context tokens)
2. Expand weak knowledge files to production quality (P0 — affects all CLI users)
3. Create missing pipeline steps for Phase 2-6 commands (P1 — enables CLI for core prompts)
4. Implement meta-evals to prevent future drift (P3 — automated quality gate)

**To start fixing:** Ask me to tackle the highest-priority findings, starting with redundancy elimination and knowledge quality improvements.

---

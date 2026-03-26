# Scaffold Meta-Eval Specification

Specification for automated eval checks that verify the scaffold project's own internal consistency across its dual-distribution architecture. These are bats tests in `tests/evals/` — separate from the user-facing `create-evals` command.

## Purpose

Scaffold has three parallel systems (commands, pipeline steps, knowledge base) distributed across two channels (CLI and Plugin). These evals catch drift between the systems before it reaches users.

Run via: `make eval` (to be added to Makefile)

---

## Eval 1: Channel Parity

**What it checks:** Every entry in the `prompts.md` Setup Order table has both a command file and a pipeline step definition.

**Assertions:**
```
For each entry in prompts.md Setup Order table (lines matching "| N |"):
  - Extract the prompt name from the table row
  - Assert: a corresponding .md file exists in commands/
  - Assert: a corresponding .md file exists in pipeline/ with matching name in frontmatter
```

**Implementation approach:**
1. Parse `prompts.md` Setup Order tables (Phase 1-7) for prompt names
2. Map prompt names to command slugs (use `scripts/extract-commands.sh` HEADING_TO_SLUG map as reference)
3. For each slug, check `commands/<slug>.md` exists
4. For each slug, check a pipeline step with `name: <slug>` exists (grep frontmatter)

**False positive mitigation:**
- Some commands map to 2 pipeline steps (e.g., `prd-gap-analysis` → `review-prd` + `innovate-prd`). Maintain an explicit mapping list for these cases.
- Execution commands (`single-agent-start`, `multi-agent-resume`) don't need pipeline steps. Maintain an exclusion list.

**Exclusion list:**
```bash
PIPELINE_EXEMPT=(
  "single-agent-start"
  "single-agent-resume"
  "multi-agent-start"
  "multi-agent-resume"
)
```

---

## Eval 2: Knowledge Quality Gates

**What it checks:** All knowledge files meet minimum quality thresholds for production distribution.

**Assertions:**
```
For each .md file in knowledge/:
  - Assert: frontmatter has name field (non-empty string)
  - Assert: frontmatter has description field (non-empty string)
  - Assert: frontmatter has topics field (non-empty array)
  - Assert: line count >= category minimum:
    - core/: 200 lines
    - review/: 150 lines
    - validation/: 150 lines
    - finalization/: 150 lines
    - product/: 200 lines
  - Assert: at least 1 fenced code block (``` pair) for core/ and review/ categories
```

**Implementation approach:**
1. Find all `.md` files in `knowledge/` recursively
2. For each file, extract frontmatter fields with grep/awk
3. Count lines with `wc -l`
4. Count code blocks with `grep -c '^\`\`\`' | divide by 2`
5. Determine category from parent directory

**False positive mitigation:**
- New files being developed may temporarily be below the line count bar. If a file contains `<!-- eval-wip -->` on line 1, skip it.

---

## Eval 3: Pipeline Step Completeness

**What it checks:** All pipeline step definitions have valid frontmatter and required body sections.

**Assertions:**
```
For each .md file in pipeline/:
  - Assert: frontmatter has all 8 required fields:
    name, description, phase, order, dependencies, outputs, conditional, knowledge-base
  - Assert: body contains these section headings (## level):
    Purpose, Inputs, Expected Outputs, Quality Criteria, Methodology Scaling, Mode Detection
  - Assert: order values are unique within each phase
  - Assert: each entry in dependencies[] matches the name of another pipeline step
  - Assert: each entry in knowledge-base[] matches the name of a knowledge file
```

**Implementation approach:**
1. Find all `.md` files in `pipeline/` recursively
2. Extract frontmatter with awk (between `---` delimiters)
3. Check each required field exists (grep for `^fieldname:`)
4. Check section headings with `grep -c '## Purpose'` etc.
5. Collect all names and order+phase pairs to check uniqueness and dependency resolution

**False positive mitigation:**
- `conditional` field may be `null` — check that the key exists, not that it has a value.

---

## Eval 4: Command Structure

**What it checks:** Pipeline commands (not utility commands) have the required structural sections.

**Assertions:**
```
For each .md file in commands/ classified as a pipeline command:
  - Assert: frontmatter has description field
  - Assert: frontmatter has long-description field
  - Assert: body contains "Mode Detection" heading (for document-creating commands)
  - Assert: body contains "After This Step" heading
  - Assert: body contains "Process" heading
```

**Implementation approach:**
1. Classify commands by checking for `## Mode Detection` heading — if present, it's a document-creating pipeline command
2. For each pipeline command, grep for required section headings
3. For utility commands (no Mode Detection), only check for frontmatter fields

**False positive mitigation:**
- Execution commands (`single-agent-start`, `multi-agent-resume`, etc.) are intentionally minimal. Exclude files under 50 lines from structural checks.
- Some review commands don't create documents (no Mode Detection) but still have Process and After This Step sections. Only require Mode Detection for commands that have it.

---

## Eval 5: Cross-Channel Consistency

**What it checks:** For prompts that exist in both channels, the pipeline step's outputs and dependencies align with the command's Mode Detection and After This Step sections.

**Assertions:**
```
For each pipeline step that has a matching command:
  - Assert: pipeline step outputs[] paths appear in the command's Mode Detection block
    (the command checks for the file the pipeline step says it produces)
  - Assert: pipeline step dependencies align with the command's After This Step target
    (if command A points to command B, then step A should have step B in its dependency chain — or vice versa)
```

**Implementation approach:**
1. Build a map of pipeline step name → outputs[] and dependencies[]
2. For each matching command, extract the Mode Detection file check and After This Step target
3. Verify the file paths and step references match

**False positive mitigation:**
- Some commands consolidate multiple pipeline steps (e.g., `prd-gap-analysis` → `review-prd` + `innovate-prd`). These won't have 1:1 output/dependency alignment. Exclude known consolidation commands.
- After This Step in commands uses `/scaffold:` command names, while pipeline steps use step names. Normalize before comparing.

---

## Eval 6: Redundancy Detection

**What it checks:** Knowledge files with `## Deep Guidance` sections don't have significant content overlap with their Summary section (which would indicate incomplete restructuring).

**Assertions:**
```
For each knowledge file with both ## Summary and ## Deep Guidance:
  - Extract 4+ word phrases from Summary section
  - Search for those phrases in Deep Guidance section
  - Assert: phrase overlap ratio < 20%
    (Summary should be a condensed reference, not a copy of Deep Guidance)
```

**Implementation approach:**
1. Find knowledge files with `## Summary` heading
2. Extract text between `## Summary` and `## Deep Guidance`
3. Extract meaningful phrases (skip headings, code blocks, common words)
4. Search for each phrase in the Deep Guidance section
5. Report overlap ratio

**False positive mitigation:**
- Technical terms that appear in both sections are expected (e.g., "test pyramid", "INVEST criteria"). Only flag duplicate SENTENCES, not duplicate terms.
- This eval warns rather than fails — it's informational.

---

## Implementation Notes

**Framework:** bats-core (scaffold's existing test framework)

**File locations:**
- `tests/evals/channel-parity.bats` — Eval 1
- `tests/evals/knowledge-quality.bats` — Eval 2
- `tests/evals/pipeline-completeness.bats` — Eval 3
- `tests/evals/command-structure.bats` — Eval 4
- `tests/evals/cross-channel.bats` — Eval 5
- `tests/evals/redundancy.bats` — Eval 6

**Makefile target:**
```makefile
eval: ## Run scaffold meta-evals
	bats tests/evals/
```

**Separation from regular tests:**
- `make test` runs functional tests in `tests/`
- `make eval` runs meta-evals in `tests/evals/`
- `make check` runs `lint + validate + test` (does NOT include eval — opt-in for CI)

**Run cadence:**
- After adding/modifying any pipeline step, knowledge file, or command
- Before releases
- NOT on every commit (evals check project-wide properties, not code correctness)

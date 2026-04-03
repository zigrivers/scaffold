# Comprehensive Pipeline Alignment Audit Suite

You are performing a multi-dimensional alignment audit of the scaffold
pipeline. The objective: verify that an AI agent can run through every
step of the pipeline and produce artifacts of sufficient quality for
other AI agents to implement the project. Every broken link, vague
instruction, or missing connection reduces the quality of what gets
built.

This audit is organized into 8 independent modules. Execute each one
completely. For each, read the relevant files, assess alignment, and
log findings.

---

## Engine Behaviors (Read Before Auditing)

These are by design. Do NOT flag them as findings:

1. **Disabled dependencies are satisfied**: `src/core/dependency/eligibility.ts:29` —
   `if (depNode && !depNode.enabled) return true`. Steps depending on disabled
   steps (e.g., `implementation-plan` → `operations` in MVP) work correctly.
   The step bodies mark these inputs as "(optional — not available in MVP)".

2. **`reads` is a passive data-flow hint**: It does NOT enforce execution ordering.
   Only `dependencies` enforce ordering. A step reading from a later phase is
   valid — the hint tells the assembly engine to include that context, not to
   block on it.

3. **Pipeline files live in phase subdirectories**: `content/pipeline/{phase}/{step}.md`.
   Always search all subdirectories (`content/pipeline/**/*.md`), never guess paths.

4. **Tool-scoped knowledge entries** in `content/knowledge/tools/` are referenced by
   tool meta-prompts in `content/tools/`, not pipeline steps. Check `content/tools/`
   before flagging as unused.

5. **"context7"** in `ai-memory-management.md` topics is a real MCP server name
   (`@upstash/context7-mcp`), not a typo.

6. **Skills are templates**: `content/skills/` contains skill templates with
   `{{INSTRUCTIONS_FILE}}` markers resolved per platform during `scaffold build`
   and `scaffold skill install`. Do not flag unresolved markers in template source.

---

## Prior Audit Context

Read the most recent audit report under `docs/archive/audits/comprehensive-alignment-audit-round-*.md`
(pick the highest round number) before starting. It contains:
- Known false-positive patterns (Appendix)
- Prior findings by module (for delta comparison)
- Current eval coverage map

For each finding you produce, check if it appeared in a prior round:
- **Fixed then reappearing** → flag as a regression
- **Filtered as false positive** → do not re-report
- **Deferred** → report with updated priority and note it carried forward

Focus audit effort on **new findings** not present in prior rounds.

---

## Audit Architecture

Each module produces findings categorized as:
- **BROKEN**: Will cause agent failures or incorrect output
- **MISALIGNED**: Exists but connections are wrong
- **MISSING**: Should exist but doesn't
- **WEAK**: Exists but insufficient quality

---

## Module 1: Dependency, Data Flow & Mode Detection

**Question**: Does every step receive what it needs, produce what
downstream steps expect, and correctly detect fresh vs. update mode?

Read ALL pipeline step files in `content/pipeline/**/*.md`. For each step:

1. **Inputs ↔ Dependencies match**: Does the Inputs section list
   artifacts from every dependency? Are there files referenced in
   Inputs that aren't produced by any dependency or reads target?

2. **Outputs ↔ Downstream consumption**: For each output, is it
   consumed by at least one downstream step (via dependencies, reads,
   or body reference)? If not, is it genuinely terminal (human-facing)?

3. **Reads completeness**: Steps that reference artifacts in their body
   or Inputs section but DON'T list those steps in reads or
   dependencies — these are implicit dependencies. Flag them.

4. **Output path consistency**: When step A produces `docs/foo.md` and
   step B references it, do the paths match exactly?

5. **Conditional step dependency safety**: Conditional steps (if-needed)
   that are dependencies of non-conditional steps — if the conditional
   step is skipped, does the downstream step still work? (Remember:
   disabled deps count as satisfied in the engine.)

6. **Mode Detection spot-check**: For any step you flagged above,
   verify its Mode Detection and Update Mode Specifics are consistent.
   For document-creating steps, confirm the 4 required fields exist
   (Detect, Preserve, Triggers, Conflict resolution). Don't audit
   every step — focus on steps with findings or steps that changed
   since the last audit.

Deliverable: Dependency/data-flow/mode-detection correctness table.

---

## Module 2: Methodology Scaling Coherence

**Question**: Does each depth level produce meaningfully different
output, and do presets correctly control the pipeline?

Read ALL pipeline step Methodology Scaling sections AND the methodology
preset files in `content/methodology/*.yml`.

1. **Preset validity**: Do preset files reference only valid step names?
   Do enabled/disabled flags match step conditional fields?

2. **Depth progression**: For each step, does depth 1→5 produce
   strictly increasing output? Flag any step where depth levels are
   ambiguous, overlapping, or non-monotonic. Each depth level should
   be described individually (not grouped as "Depth 1-2" or "Depth
   4-5") — flag steps that still lump levels together.

3. **Preset ↔ step alignment**: Do mvp-enabled steps make sense
   together? Can you run just the mvp steps and produce a coherent
   result? (Remember: disabled deps count as satisfied, so only flag
   gaps where the step body genuinely requires the artifact.)

4. **Quality Criteria ↔ depth**: Do Quality Criteria items tagged with
   (mvp) or (deep) align with the Methodology Scaling section? Are
   there criteria that only apply at certain depths but aren't marked?

5. **Custom depth coverage**: Does every step's `custom:depth(1-5)`
   section explicitly describe what happens at EACH of the 5 levels
   individually?

Deliverable: Methodology coherence matrix.

---

## Module 3: Quality Criteria Assessment

**Question**: Are Quality Criteria specific enough that an AI agent can
self-assess whether it met them?

Read ALL pipeline step Quality Criteria sections in `content/pipeline/**/*.md`.

1. **Measurability**: For each criterion, can an AI agent objectively
   determine pass/fail? Flag vague language like "comprehensive",
   "thorough", "well-structured", "sufficient", "appropriate" that
   lacks concrete thresholds.

2. **Completeness**: Does the Quality Criteria section cover the full
   scope of what the step produces? Are there aspects of Expected
   Outputs with no corresponding quality criterion?

3. **Depth-awareness**: Are criteria tagged by depth (mvp/deep) where
   appropriate? Are there criteria that implicitly apply only at
   certain depths but aren't marked?

4. **Cross-step consistency**: Do similar steps (all `review-*` steps,
   all specification steps) have consistent quality criteria patterns?
   Flag outliers. In particular:
   - Do all review steps use the standardized P0-P3 definitions?
     (P0=Breaks downstream work, P1=Prevents quality milestone,
     P2=Known tech debt, P3=Polish)
   - Do all multi-model steps define consensus thresholds?
   - Is traceability language consistent? ("maps to" vs "traces to"
     vs "corresponds to")

5. **Testability**: Could the criteria be automated as evals? Which
   criteria are inherently subjective vs. automatable?

Deliverable: Quality Criteria assessment with specific fix suggestions.

---

## Module 4: Knowledge System Alignment

**Question**: Does each step get the right knowledge, and does the
knowledge cover what the step needs?

Read ALL knowledge entry frontmatter in `content/knowledge/**/*.md` AND all
pipeline step `knowledge-base` references.

1. **Coverage gaps**: Are there steps whose Purpose requires domain
   expertise not covered by their knowledge-base entries? Read the step
   body and verify the knowledge entries provide sufficient guidance.

2. **Unused entries**: Are there knowledge entries that no pipeline step
   or tool references? Check both `content/pipeline/**/*.md` and
   `content/tools/*.md` before flagging — tool-scoped entries in
   `content/knowledge/tools/` are expected to be tool-only.

3. **Topic coherence**: Do topics in knowledge entry frontmatter align
   with actual content? Are topics consistent across entries?

4. **Deep Guidance optimization**: Which knowledge entries have
   Summary + Deep Guidance structure? Which should but don't? (Long
   entries >300 lines without Deep Guidance are inefficient for
   assembly.)

5. **Knowledge ↔ step quality**: For 10 representative steps
   (create-prd, tdd, story-tests, create-evals, system-architecture,
   implementation-plan, traceability-matrix, apply-fixes-and-freeze,
   implementation-playbook, domain-modeling), verify the knowledge
   entries actually help the AI produce better output. Flag entries
   where the knowledge is too generic or misaligned with step needs.

Deliverable: Knowledge alignment matrix with coverage gaps.

---

## Module 5: Skill & Tool Alignment

**Question**: Do skills and tools correctly complement the pipeline,
and are they consistent with current project structure?

Read ALL tool files in `content/tools/*.md` and skill templates in
`content/skills/*/SKILL.md`.

1. **Tool ↔ pipeline consistency**: Do tool meta-prompts reference
   artifacts and paths that match current pipeline step outputs? Flag
   stale references to old paths or removed artifacts.

2. **Skill template correctness**: Do skill templates use only
   `{{INSTRUCTIONS_FILE}}` and other defined markers? Is every
   platform-varying reference properly templatized? Check that
   canonical pipeline slugs (like `claude-md-optimization`) are NOT
   templatized — these are pipeline identifiers, not platform references.

3. **Skill activation boundaries**: Do the scaffold-pipeline and
   scaffold-runner skills have clear, non-overlapping activation
   criteria? Does the pipeline skill correctly defer status/progress
   queries to the runner skill?

4. **Tool completeness**: Do the 10 utility tools cover the full
   post-pipeline workflow? Are there common user needs (debugging,
   rollback, dependency auditing) that lack a tool?

5. **Build output verification**: Does `scaffold build` generate
   resolved skills to `skills/` at root and adapter output to
   `.scaffold/generated/`? Does `scaffold skill install` correctly
   resolve templates for each platform target?

Deliverable: Skill and tool alignment assessment.

---

## Module 6: Implementation Handoff Quality

**Question**: When the pipeline is complete, do implementation agents
have everything they need?

Read the finalization-phase steps (apply-fixes-and-freeze,
developer-onboarding-guide, implementation-playbook) and trace backward.

1. **Artifact completeness**: List every artifact the pipeline produces
   (all outputs from all steps). Which does the implementation-playbook
   reference? Which does it miss?

2. **Task ↔ test ↔ eval chain**: Can an implementation agent trace from
   a task in implementation-plan.md to its test skeletons in
   tests/acceptance/ to eval checks in tests/evals/? Is this chain
   explicit or must the agent discover it?

3. **Quality gate completeness**: Does the playbook define ALL quality
   gates an agent should run? (unit tests, integration tests, evals,
   lint, type-check, etc.)

4. **Context requirements**: For each task type (feature, bug fix,
   infrastructure), does the playbook specify which docs to read first?
   Is there a clear "minimum viable context"?

5. **Error recovery**: What happens if an agent's output fails quality
   gates? Does the playbook explain the recovery process?

6. **Post-pipeline workflows**: Do the ongoing tools
   (new-enhancement, quick-task, release, version-bump) correctly
   integrate with pipeline artifacts? Can a user add a new feature
   after the pipeline completes and have it flow through properly?

Deliverable: Implementation readiness assessment with specific gaps.

---

## Module 7: End-to-End Path Simulation

**Question**: Can an AI agent actually execute the MVP path end-to-end
without getting stuck?

Pick ONE project type: {fresh SaaS web app, fresh CLI tool, fresh
mobile app}. Mentally simulate (don't execute) the MVP methodology
path:

1. **Step-by-step walkthrough**: For each MVP-enabled step in execution
   order:
   - Do all required inputs exist (produced by prior steps or marked
     optional)?
   - Are the instructions unambiguous enough that an agent wouldn't
     need to ask clarifying questions?
   - Are the expected outputs defined clearly enough to write?

2. **First stuck point**: Identify the FIRST step where an agent would
   get stuck, confused, or produce incorrect output. This is the
   pipeline's weakest link. Explain what's missing or ambiguous.

3. **Handoff readiness**: After the last finalization step, verify an
   implementation agent could start work using ONLY the artifacts the
   pipeline produced. What would they be missing?

4. **Deep path delta**: Briefly note 3-5 steps where the deep path
   produces significantly better output than MVP — where should a user
   invest extra depth?

Deliverable: First-stuck-point analysis with specific fix.

---

## Module 8: Meta-Eval Self-Assessment

**Question**: Do our evals catch the alignment issues found above, and
where are the coverage gaps?

Read ALL eval files in `tests/evals/*.bats` and assess:

1. **Coverage mapping**: For each audit module above (1-7), which evals
   partially cover it? Which modules have zero eval coverage?

2. **False negative risk**: For each eval, identify scenarios where the
   eval passes but the underlying quality is actually broken. (Example:
   grep-based output-consumption passes because a path appears in a
   comment, not in a reads field.)

3. **Regression check**: Compare current eval count and coverage against
   the prior audit report. Were any evals proposed in a prior round but
   not yet implemented? Did any eval's test count decrease?

4. **Proposed new evals**: Based on gaps found in modules 1-7, propose
   specific new eval tests. For each:
   - What invariant it checks
   - What breakage it catches
   - File path and estimated complexity (low/medium/high)

5. **Eval maintenance burden**: Are any evals brittle (would break from
   routine pipeline changes)? Should any be restructured?

Deliverable: Meta-eval coverage map and proposed additions.

---

## Final Deliverable

Produce `docs/archive/audits/comprehensive-alignment-audit-round-N.md` (increment N
from the most recent existing report) containing:

1. **Executive Summary** — Health score with trend vs. prior round
   (improving / stable / declining). Include table comparing finding
   counts across the last 3 rounds.

2. **Delta from Prior Round** — New findings only, clearly separated
   from carried-forward items.

3. **Regressions** — Any prior fix that reverted or degraded.

4. **Findings by Module** — All findings from modules 1-8, each with:
   - Finding ID (e.g., 1-B1, 3-W2)
   - Category (BROKEN / MISALIGNED / MISSING / WEAK)
   - Step or file affected
   - Evidence (file path, line number, specific text)
   - Impact on implementation agent success
   - Whether this is new, carried forward, or a regression

5. **False Positive Filtering** — Findings that were initially flagged
   but filtered after validation, with explanation. Update the Appendix
   of known false-positive patterns if any new patterns emerged.

6. **Priority Matrix** — All validated findings ranked by impact.

7. **Recommended Actions** — Specific file edits, grouped into
   implementable work packages that avoid file conflicts (for parallel
   agent execution).

8. **Proposed New Evals** — From Module 8, to prevent regression.

---

## Constraints

- Read actual file contents — don't infer from names
- Test your findings: if you claim step A doesn't reference artifact X,
  grep for it first to be sure
- Focus on what affects implementation agent success — not cosmetic
  issues
- Consider the full lifecycle: fresh project, brownfield adoption,
  mid-pipeline re-runs, post-pipeline enhancements
- The MVP methodology path is critical — audit it as a distinct path
  through the pipeline, not just a subset of deep
- Check findings against the Engine Behaviors section and the prior
  audit report's false-positive appendix before reporting

---

## Parallelization Guide

This prompt is structured as 8 independent modules for parallel
execution with subagents. Each module targets a different dimension:

| Module | What It Catches |
|--------|----------------|
| 1. Dependency, Data Flow & Mode Detection | Broken handoffs, missing reads, path mismatches, stale update-mode rules |
| 2. Methodology Scaling | Incoherent depth levels, broken MVP path, preset ↔ step gaps |
| 3. Quality Criteria | Vague criteria agents can't self-assess, missing depth tags |
| 4. Knowledge System | Wrong knowledge injected, unused entries, coverage gaps |
| 5. Skill & Tool Alignment | Stale tool references, skill template errors, activation boundary overlap |
| 6. Implementation Handoff | Missing artifacts, incomplete quality gates, broken task→test chain |
| 7. End-to-End Path Simulation | First point where an agent gets stuck on the MVP path |
| 8. Meta-Eval Gaps | Which dimensions have zero eval coverage, proposed new evals |

---
description: "Discover feature-level innovation opportunities in the PRD"
long-description: "Reads the PRD and conducts a feature-level innovation pass covering competitive gaps, AI-native opportunities, defensive product thinking, and missing expected features. Updates docs/plan.md with approved innovations."
---

Read `docs/plan.md` and `docs/reviews/pre-review-prd.md` (if it exists), then conduct a feature-level innovation pass. Discover new capabilities, competitive gaps, and defensive product improvements. Create `docs/prd-innovation.md` with findings and, after user approval, integrate accepted innovations into `docs/plan.md`.

**Scope boundary**: This is feature-level innovation — whether the right features exist in the PRD at all. UX-level enhancements (smart defaults, progressive disclosure, accessibility polish) belong in `/scaffold:innovate-user-stories`, not here.

## Mode Detection

Before starting, check if `docs/prd-innovation.md` already exists:

**If the file does NOT exist -> FRESH MODE**: Skip to the next section and create from scratch.

**If the file exists -> UPDATE MODE**:
1. **Read & analyze**: Read the existing document completely. Check for a tracking comment on line 1: `<!-- scaffold:innovate-prd v<ver> <date> -->`. If absent, treat as legacy/manual — be extra conservative.
2. **Read previous dispositions**: Note which suggestions were accepted, rejected, or deferred.
3. **Focus on delta**: Identify new innovation opportunities from PRD changes since the last run. Don't re-propose rejected suggestions unless the context has materially changed.
4. **Preview new suggestions**: Present only new findings. Wait for user approval before modifying the PRD.
5. **Update tracking comment**: Add/update on line 1: `<!-- scaffold:innovate-prd v<ver> <date> -->`
6. **Post-update summary**: Report new suggestions, disposition changes, and PRD updates.

**In both modes**, follow all instructions below. If multi-model artifacts exist under `docs/reviews/prd-innovation/` (e.g., `review-summary.md`, `codex-review.json`, `gemini-review.json`), preserve prior suggestion dispositions.

### Update Mode Specifics
- **Primary output**: `docs/prd-innovation.md`
- **Secondary output**: `docs/plan.md` (updated with approved innovations only)
- **Preserve**: Previous disposition decisions (accepted/rejected/deferred), user rationale for rejections
- **Related docs**: `docs/plan.md`, `docs/reviews/pre-review-prd.md`
- **Special rules**: Never re-propose a rejected suggestion unless explicitly asked. Never modify `docs/plan.md` without user approval. Approved innovations must be documented to the same standard as existing PRD features.

---

## Innovation Categories

Conduct the innovation pass across all five categories defined in the `prd-innovation` knowledge base:

1. **Competitive & Market Analysis** — Research competitors, adjacent products, emerging patterns. Use subagents for parallel research.
2. **User Experience Gaps** — First 60 seconds, flow friction, missing flows.
3. **Missing Expected Features** — Features whose absence feels like a bug. Walk each persona's typical week.
4. **AI-Native Opportunities** — Capabilities impractical without AI. Apply the magic vs. gimmick test.
5. **Defensive Product Thinking** — 1-star review technique, abandonment analysis.

Follow the detailed category guidance, anti-patterns, and detection techniques from the knowledge base. Do not invent additional categories.

## Evaluation Framework

Use the cost/impact framework and decision matrix from the `prd-innovation` knowledge base to evaluate each suggestion:
- **Cost**: Trivial / Moderate / Significant
- **Impact**: Nice-to-have / Noticeable / Differentiator
- **Decision**: Must-have v1 / Backlog / Reject (per the matrix)

---

## Presenting Suggestions

Group related suggestions for efficient decision-making. For each group:
1. Describe the enhancement and its user benefit (1-2 sentences)
2. State the cost (trivial/moderate/significant)
3. State your recommendation (must-have v1 / backlog / reject) with reasoning
4. **Wait for user approval before integrating into the PRD**
5. Document approved innovations to the same standard as existing PRD features — full description, priority, business rules. No vague one-liners.

---

## Process

1. **Read all inputs** — Read `docs/plan.md` completely. Read `docs/reviews/pre-review-prd.md` if it exists.
2. **Use subagents** to research competitive landscape, industry patterns, and AI-native opportunities for the project's domain in parallel
3. **Conduct innovation pass** across all five categories above
4. **Evaluate each suggestion** using the cost/impact framework
5. **Present grouped suggestions** to the user using AskUserQuestionTool. Wait for approval.
6. **Integrate approved innovations** into `docs/plan.md` at the same quality standard as existing features
7. **Create `docs/prd-innovation.md`** documenting all findings with their disposition (accepted/rejected/deferred)
8. If using Beads: create a task (`bd create "docs: PRD innovation pass" -p 0 && bd update <id> --claim`) and close when done (`bd close <id>`)
10. If this surfaces implementation concerns, create separate Beads tasks

## After This Step

When this step is complete, tell the user:

---
**Innovation pass complete** — `docs/prd-innovation.md` documents all findings. Approved innovations integrated into `docs/plan.md`.

**Next:** Run `/scaffold:user-stories` — Create user stories from the updated PRD, or `/scaffold:innovate-user-stories` — UX-level innovation pass on existing stories.

**Pipeline reference:** `/scaffold:prompt-pipeline`

---

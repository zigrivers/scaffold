---
description: "Discover feature-level innovation opportunities in the PRD"
long-description: "Reads the PRD and conducts a feature-level innovation pass covering competitive gaps, AI-native opportunities, defensive product thinking, and missing expected features. Updates docs/prd.md with approved innovations."
---

Read `docs/prd.md` and `docs/reviews/pre-review-prd.md` (if it exists), then conduct a feature-level innovation pass. Discover new capabilities, competitive gaps, and defensive product improvements. Create `docs/prd-innovation.md` with findings and, after user approval, integrate accepted innovations into `docs/prd.md`.

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

**In both modes**, follow all instructions below.

### Update Mode Specifics
- **Primary output**: `docs/prd-innovation.md`
- **Secondary output**: `docs/prd.md` (updated with approved innovations only)
- **Preserve**: Previous disposition decisions (accepted/rejected/deferred), user rationale for rejections
- **Related docs**: `docs/prd.md`, `docs/reviews/pre-review-prd.md`
- **Special rules**: Never re-propose a rejected suggestion unless explicitly asked. Never modify `docs/prd.md` without user approval. Approved innovations must be documented to the same standard as existing PRD features.

---

## Innovation Categories

### 1. Competitive & Market Analysis

Research similar products to identify gaps:
- **Direct competitors** — Products solving the same problem. What do they do well? What do users complain about?
- **Adjacent products** — Products in the same space. What patterns do users now expect?
- **Emerging patterns** — UX conventions that are table stakes (dark mode, keyboard shortcuts, real-time collab)

For each insight:
- Table-stakes feature? -> Must-have candidate
- Differentiator competitors lack but users would love? -> Evaluate cost/impact
- Copied feature that doesn't serve our users? -> Skip

**Anti-patterns**: Feature parity obsession (copying everything dilutes focus). Exhaustive matrices (3-5 actionable insights, not 50-row comparisons).

### 2. User Experience Gaps

Look at core user flows and ask where a real user would get frustrated:

**First 60 seconds**: Can a new user understand the product's value in 60 seconds? Is there a clear first action? How many steps to the first "aha moment"?

**Flow friction points**: How many steps per flow? Unnecessary confirmations? Does the user need to leave the flow for information? What's the "delightful" version vs. the "functional" version?

**Missing flows**: Common user goals without a dedicated flow? Workarounds the user must invent?

### 3. Missing Expected Features

Features whose absence feels like a bug:
- **Search & discovery**: Text search, filtering, sorting, recently viewed
- **Data management**: Bulk import/export, undo for destructive actions, duplicate/clone
- **Communication**: Notification preferences, email digests, in-app notification center
- **Personalization**: User preferences, saved views, customizable dashboard

**Detection technique**: For each persona, walk through their typical week. For each action, is there a supporting feature? Would the user be surprised it's missing?

### 4. AI-Native Opportunities

Capabilities impractical without AI that fundamentally change the user experience (not "AI bolted on"):
- **Natural language interfaces**: Intent-based search, conversational data entry, context-aware commands
- **Auto-categorization**: Content auto-categorized, suggested tags, self-organizing views
- **Predictive behavior**: Pre-filled forms from patterns, suggested next actions, anomaly detection
- **Content generation**: Draft generation, summarization, template suggestions

**Magic vs. gimmick test**: "Magic" = user thinks "how did it know?" and saves real time. "Gimmick" = user thinks "cool" once and never uses it again. Only propose magic.

### 5. Defensive Product Thinking

Proactively identify what users would complain about:

**1-star review technique**: Write the most likely 1-star reviews:
- "Can't believe it doesn't have [obvious feature]"
- "Tried to [common action] and it [broke/was confusing/lost data]"
- "Great concept but unusable on [mobile/slow connection/screen reader]"

For each plausible review: is the complaint addressed in the PRD?

**Abandonment analysis**: Why would someone try the product and stop?
1. Complexity barrier — Too hard to learn
2. Performance barrier — Too slow
3. Trust barrier — Doesn't feel reliable
4. Value barrier — Doesn't deliver value fast enough
5. Integration barrier — Doesn't connect to existing tools

---

## Evaluation Framework

For each suggestion, assess cost and impact:

### Cost Assessment
- **Trivial**: Small addition to existing PRD section. No new flows or entities.
- **Moderate**: New PRD feature entries, possibly a new user flow. Contained in existing scope.
- **Significant**: Rethinks product boundaries, adds personas, changes architecture assumptions.

### Impact Assessment
- **Nice-to-have**: Users wouldn't notice if absent.
- **Noticeable improvement**: Users would appreciate it. Reduces friction.
- **Significant differentiator**: Users would choose the product partly for this.

### Decision Matrix

| | Trivial Cost | Moderate Cost | Significant Cost |
|---|---|---|---|
| **Differentiator** | Must-have v1 | Must-have v1 | Backlog |
| **Noticeable** | Must-have v1 | Backlog | Backlog |
| **Nice-to-have** | Include if free | Backlog | Reject |

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

1. **Read all inputs** — Read `docs/prd.md` completely. Read `docs/reviews/pre-review-prd.md` if it exists.
2. **Use subagents** to research competitive landscape, industry patterns, and AI-native opportunities for the project's domain in parallel
3. **Conduct innovation pass** across all five categories above
4. **Evaluate each suggestion** using the cost/impact framework
5. **Present grouped suggestions** to the user using AskUserQuestionTool. Wait for approval.
6. **Integrate approved innovations** into `docs/prd.md` at the same quality standard as existing features
7. **Create `docs/prd-innovation.md`** documenting all findings with their disposition (accepted/rejected/deferred)
8. If using Beads: create a task (`bd create "docs: PRD innovation pass" -p 0 && bd update <id> --claim`) and close when done (`bd close <id>`)
10. If this surfaces implementation concerns, create separate Beads tasks

## After This Step

When this step is complete, tell the user:

---
**Innovation pass complete** — `docs/prd-innovation.md` documents all findings. Approved innovations integrated into `docs/prd.md`.

**Next:** Run `/scaffold:user-stories` — Create user stories from the updated PRD, or `/scaffold:innovate-user-stories` — UX-level innovation pass on existing stories.

**Pipeline reference:** `/scaffold:prompt-pipeline`

---

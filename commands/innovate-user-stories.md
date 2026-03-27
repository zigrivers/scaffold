---
description: "Discover UX-level innovation opportunities in user stories"
long-description: "Reads user stories and discovers UX enhancements including smart defaults, progressive disclosure, accessibility improvements, and AI-native capabilities. Updates docs/user-stories.md with approved enhancements."
---

Read `docs/user-stories.md` and `docs/plan.md`, then conduct a UX-level innovation pass on the existing user stories. Discover enhancements that make existing features better — smart defaults, progressive disclosure, accessibility improvements, error recovery, and AI-native capabilities. Create `docs/user-stories-innovation.md` with findings and, after user approval, integrate accepted enhancements into `docs/user-stories.md`.

**Scope boundary**: This is UX-level innovation — making existing features better, not adding new features. If an idea requires a new PRD section or feature entry, it belongs in `/scaffold:innovate-prd`, not here. Enhancements must stay within PRD scope boundaries.

## Mode Detection

Before starting, check if `docs/user-stories-innovation.md` already exists:

**If the file does NOT exist -> FRESH MODE**: Skip to the next section and create from scratch.

**If the file exists -> UPDATE MODE**:
1. **Read & analyze**: Read the existing document completely. Check for a tracking comment on line 1: `<!-- scaffold:innovate-user-stories v<ver> <date> -->`. If absent, treat as legacy/manual — be extra conservative.
2. **Read previous dispositions**: Note which suggestions were accepted, rejected, or deferred.
3. **Focus on delta**: Identify new enhancement opportunities from story changes since the last run. Don't re-propose rejected suggestions unless context changed.
4. **Preview new suggestions**: Present only new findings. Wait for user approval.
5. **Update tracking comment**: Add/update on line 1: `<!-- scaffold:innovate-user-stories v<ver> <date> -->`
6. **Post-update summary**: Report new suggestions, disposition changes, and story updates.

**In both modes**, follow all instructions below.

### Update Mode Specifics
- **Primary output**: `docs/user-stories-innovation.md`
- **Secondary output**: `docs/user-stories.md` (updated with approved enhancements only)
- **Preserve**: Previous disposition decisions, user rationale for rejections, enhancement integration style
- **Related docs**: `docs/user-stories.md`, `docs/plan.md`
- **Special rules**: Never re-propose rejected suggestions. Never modify stories without approval. Enhancements integrate into existing stories (new acceptance criteria or enhanced scenarios), not as new stories.

---

## Enhancement Categories

Conduct the UX-level innovation pass across all three categories defined in the `user-story-innovation` knowledge base:

1. **High-Value Low-Effort Enhancements** — Smart defaults, inline validation, keyboard shortcuts, progressive disclosure, leveraging existing data, undo/redo, batch operations. Scan every story against these patterns.
2. **Differentiators** — "Wow" moments, AI-native features, personalization without configuration.
3. **Defensive Gaps** — Accessibility (WCAG AA), mobile responsiveness, offline/degraded mode, performance under load, error recovery, empty states.

Follow the detailed pattern lists, detection techniques, and anti-patterns from the knowledge base. For each enhancement found, note which story it improves and how.

## Evaluation Framework

Use the cost/impact framework from the `user-story-innovation` knowledge base:
- **Cost**: Trivial (< 1 task) / Moderate (1-3 tasks) / Significant (4+ tasks)
- **Impact**: Nice-to-have / Noticeable improvement / Significant differentiator
- **Decision**: Must-have v1 / Backlog / Reject

Enhancements integrate into existing stories as new acceptance criteria — not as new stories.

---

## Presenting Suggestions

Group related suggestions for efficient decision-making. For each group:
1. Describe the enhancement and its user benefit (1-2 sentences)
2. State the cost (trivial/moderate/significant)
3. State your recommendation (must-have v1 / backlog / reject) with reasoning
4. **Wait for user approval before integrating into stories**
5. Integrate approved enhancements into existing stories as new acceptance criteria or enhanced scenarios — not as new stories

---

## Process

1. **Read all inputs** — Read `docs/user-stories.md` and `docs/plan.md` completely.
2. **Scan every story** against all three enhancement categories above
3. **Use subagents** to research UX best practices and innovation patterns for the project's domain
4. **Evaluate each suggestion** using the cost/impact framework
5. **Present grouped suggestions** to the user using AskUserQuestionTool. Wait for approval.
6. **Integrate approved enhancements** into `docs/user-stories.md` as enhanced acceptance criteria within existing stories
7. **Create `docs/user-stories-innovation.md`** documenting all findings with disposition (accepted/rejected/deferred)
8. If using Beads: create a task (`bd create "docs: user story innovation pass" -p 0 && bd update <id> --claim`) and close when done (`bd close <id>`)
10. If this surfaces feature-level ideas (new PRD features), note them in the innovation doc and recommend `/scaffold:innovate-prd`

## After This Step

When this step is complete, tell the user:

---
**Innovation pass complete** — `docs/user-stories-innovation.md` documents all findings. Approved enhancements integrated into `docs/user-stories.md`.

**Next:** Run `/scaffold:domain-modeling` — Model project domains from updated stories, or continue to the next pipeline step.

**Pipeline reference:** `/scaffold:prompt-pipeline`

---

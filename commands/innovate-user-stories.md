---
description: "Discover UX-level innovation opportunities in user stories"
long-description: "Reads user stories and discovers UX enhancements including smart defaults, progressive disclosure, accessibility improvements, and AI-native capabilities. Updates docs/user-stories.md with approved enhancements."
---

Read `docs/user-stories.md` and `docs/prd.md`, then conduct a UX-level innovation pass on the existing user stories. Discover enhancements that make existing features better — smart defaults, progressive disclosure, accessibility improvements, error recovery, and AI-native capabilities. Create `docs/user-stories-innovation.md` with findings and, after user approval, integrate accepted enhancements into `docs/user-stories.md`.

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
- **Related docs**: `docs/user-stories.md`, `docs/prd.md`
- **Special rules**: Never re-propose rejected suggestions. Never modify stories without approval. Enhancements integrate into existing stories (new acceptance criteria or enhanced scenarios), not as new stories.

---

## Enhancement Categories

### 1. High-Value Low-Effort Enhancements

Look for these patterns in every story:

**Smart defaults** — pre-fill fields from context, history, or most common choice:
- Forms pre-populated from user profile or previous submissions
- Timezone auto-detected from browser
- "Same as billing address" for shipping
- Default selections based on most frequent user choice

**Inline validation** — immediate feedback instead of submit-then-fail:
- Email format on blur, password strength on keypress
- Username availability before submission
- Character count approaching limit

**Keyboard shortcuts** — power users want speed:
- Ctrl/Cmd+S (save), Ctrl/Cmd+K (search), Escape (close)
- Arrow keys for list navigation
- Logical tab ordering through forms

**Progressive disclosure** — don't overwhelm on first encounter:
- "Advanced options" expandable sections
- Contextual help on hover/focus
- Default simple view with "show more"

**Leveraging existing data** — use what's already collected:
- Activity data for usage insights, streaks
- Search history for suggestions, "recently viewed"
- Error patterns for proactive warnings

**Undo/redo** — prefer undo over "are you sure?" dialogs:
- Soft delete with "undo" toast
- "Restore defaults" for settings
- Auto-save drafts to prevent data loss

**Batch operations** — where users repeat single actions:
- Select multiple -> bulk delete, archive, assign
- "Apply to all" in settings
- Bulk import/export

### 2. Differentiators

Features that make the product stand out:

**"Wow" moments** — small touches that inspire sharing:
- Satisfying completion animations
- Personalized empty states
- Thoughtful microcopy with personality

**AI-native features** — capabilities that wouldn't exist without AI:
- Natural language search understanding intent
- Auto-categorization of user content
- Smart suggestions ("users who did X often do Y")
- Draft generation for text-heavy inputs

**Personalization without configuration** — adapts to the user:
- Recently used items surfaced first
- Notification frequency auto-tuned to engagement
- Content ordering reflecting individual priorities

### 3. Defensive Gaps

Things users expect that specs often miss:

**Accessibility:**
- WCAG AA compliance as minimum
- Keyboard navigation for all interactive elements
- Screen reader compatibility with ARIA labels
- Color contrast 4.5:1 for normal text
- Visible focus indicators in all themes

**Mobile responsiveness** (if web):
- Touch targets minimum 44x44px
- Readable without zooming
- Forms working with mobile keyboards
- One-hand navigation patterns

**Offline/degraded mode:**
- Network drops mid-action? Queue writes for sync.
- Show stale data with "last updated" rather than blank screens
- Graceful error messages explaining what happened and what to do

**Performance under load:**
- Loading states for every async operation (never stare at nothing)
- Pagination or virtual scrolling for large lists
- Image lazy loading
- Optimistic UI updates where safe

**Error recovery:**
- Never lose user work — auto-save drafts, preserve form state on error
- Clear messages: what happened AND what to do next
- Retry logic for transient failures
- Graceful degradation when non-critical features fail

**Empty states:**
- First-time: guide, don't confuse
- Empty lists: "here's how to add your first X"
- Zero-data dashboards: sample data or onboarding steps
- No search results: suggest alternatives

---

## Evaluation Framework

### Cost Assessment
- **Trivial** (< 1 task): Added to existing story's acceptance criteria. No new stories.
- **Moderate** (1-3 tasks): New stories or significant additions. Scoped to single epic.
- **Significant** (4+ tasks): Multiple new stories, possibly new epic. May affect architecture.

### Impact Assessment
- **Nice-to-have**: Polishes experience. Users wouldn't notice absence.
- **Noticeable improvement**: Users appreciate it. Reduces friction in common workflows.
- **Significant differentiator**: Sets product apart. Users choose it partly for this.

### Decision Framework
- **Must-have v1**: High impact + trivial/moderate cost. Absence would be a visible gap.
- **Backlog**: High impact + significant cost, or moderate impact at any cost.
- **Reject**: Low impact regardless of cost, or out of PRD scope.

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

1. **Read all inputs** — Read `docs/user-stories.md` and `docs/prd.md` completely.
2. **Scan every story** against all three enhancement categories above
3. **Use subagents** to research UX best practices and innovation patterns for the project's domain
4. **Evaluate each suggestion** using the cost/impact framework
5. **Present grouped suggestions** to the user using AskUserQuestionTool. Wait for approval.
6. **Integrate approved enhancements** into `docs/user-stories.md` as enhanced acceptance criteria within existing stories
7. **Create `docs/user-stories-innovation.md`** documenting all findings with disposition (accepted/rejected/deferred)
8. Create a Beads task: `bd create "docs: user story innovation pass" -p 0` and `bd update <id> --claim`
9. When complete and committed: `bd close <id>`
10. If this surfaces feature-level ideas (new PRD features), note them in the innovation doc and recommend `/scaffold:innovate-prd`

## After This Step

When this step is complete, tell the user:

---
**Innovation pass complete** — `docs/user-stories-innovation.md` documents all findings. Approved enhancements integrated into `docs/user-stories.md`.

**Next:** Run `/scaffold:domain-modeling` — Model project domains from updated stories, or continue to the next pipeline step.

**Pipeline reference:** `/scaffold:prompt-pipeline`

---

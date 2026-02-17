---
description: "Gap analysis and UX innovation for user stories"
long-description: "Reviews user stories for missing flows, edge cases, and accessibility gaps, then proposes UX innovations for approval before updating docs/user-stories.md."
---

## Phase 1: Gap Analysis

Deeply research docs/plan.md and docs/user-stories.md and perform a systematic gap analysis. Specifically check for:

### Coverage Gaps
- Every PRD feature, requirement, and flow has at least one user story
- Every user persona in the PRD is represented in the stories
- Happy paths AND error/edge cases are covered (e.g., what happens when a network request fails, a user enters invalid data, a session times out?)
- Onboarding / first-time user experience is addressed
- Data migration, seeding, or initial state setup if applicable

### Quality Weaknesses
- Acceptance criteria that are vague or untestable — rewrite as specific Given/When/Then
- Stories that are too large to implement in 1-3 Claude Code sessions — split them
- Stories missing scope boundaries, data requirements, or UI/UX notes per our template
- Dependencies between stories that aren't obvious — call these out (they become Beads dependencies later)
- Contradictions between the PRD and user stories

### Structural Issues
- Stories that overlap significantly — consolidate or clarify boundaries
- Missing epics or stories that are miscategorized
- Priority assignments that seem off based on PRD emphasis

Create a summary of all findings, then apply the fixes directly to user-stories.md. Don't just list problems — resolve them.

## Phase 2: Innovation (UX-Level Only)

After the gap analysis is complete, shift to a product thinking mindset. Research current best practices and competitive landscape relevant to this application.

**Scope boundary:** Feature-level innovation (new capabilities, new user flows) should have been done during the PRD Gap Analysis prompt. This innovation pass focuses on **UX quality and implementation-level improvements** to features already approved in the PRD. Don't propose new features here — propose better ways to deliver existing ones.

Identify opportunities in these categories:

### High-Value, Low-Effort Enhancements
- Small additions that would significantly improve UX (e.g., smart defaults, inline validation, keyboard shortcuts)
- Data we're already collecting that could power useful features (e.g., if we track sessions, we can show streaks or trends for free)

### Differentiators
- What would make a user choose THIS over alternatives? What's the "wow" moment?
- AI-native features that wouldn't exist in a traditionally-built app

### Defensive Gaps
- What would a user complain about in a v1 review? Address the obvious ones now.
- Accessibility, mobile responsiveness, or performance concerns not yet covered

For each innovation idea, present it with:
- **What**: The feature or enhancement
- **Why**: The user benefit and strategic rationale
- **Cost**: Rough sense of effort (trivial / moderate / significant)
- **Recommendation**: Must-have for v1, or backlog for later

Use AskUserQuestionTool to present innovation ideas for my approval BEFORE adding them to user-stories.md. Group related ideas together so we can make decisions efficiently rather than one at a time.

## Process
- Create a Beads task for this work before starting: `bd create "docs: <document being created>" -p 0` and `bd update <id> --claim`
- When the document is complete and committed, close it: `bd close <id>`
- If this work surfaces implementation tasks (bugs, missing infrastructure), create separate Beads tasks for those — don't try to do them now
- Use subagents to research the competitive landscape and best practices in parallel with the gap analysis
- After all approved changes, do a final INVEST criteria pass on any new or modified stories
- At the end, provide a concise changelog of what was added, modified, or removed
- After all changes are applied, add a tracking comment to `docs/user-stories.md` after any existing scaffold tracking comment: `<!-- scaffold:user-stories-gaps v1 YYYY-MM-DD -->` (use actual date)

## After This Step

When this step is complete, tell the user:

---
**Phase 5 in progress** — `docs/user-stories.md` updated with gap fixes and approved innovations.

**Next:**
- **(Optional)** If you have **Codex CLI and/or Gemini CLI** installed: Run `/scaffold:user-stories-multi-model-review` — Multi-model coverage audit with independent reviewers.
- If your project targets **multiple platforms** (web + mobile): Run `/scaffold:platform-parity-review` — Audit platform coverage across all docs.
- Otherwise: Skip to `/scaffold:claude-md-optimization` — Consolidate and optimize CLAUDE.md (starts Phase 6).

**Pipeline reference:** `/scaffold:prompt-pipeline`

---

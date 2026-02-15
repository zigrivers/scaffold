---
description: "Create user stories covering every PRD feature"
---

First, deeply research best practices for creating user stories, with emphasis on stories that will be consumed by AI agents (not human developers) for implementation. Focus on what makes a user story unambiguous and implementable without further clarification.

Then thoroughly review and analyze the PRD (docs/plan.md) and create all user stories needed to cover every feature, flow, and requirement identified in the PRD.

## Output: `docs/user-stories.md`

### Document Structure
1. **Best Practices Summary** — concise reference at the top (not a textbook, just the rules you followed)
2. **User Personas** — define each distinct user type before writing stories (reference the PRD for these)
3. **Epics** — group related stories under epics that map to major PRD sections
4. **User Stories** — every story under its epic

### Each User Story MUST Include
- **ID**: Unique identifier (e.g., US-001) for traceability to future Beads tasks
- **Title**: Short, scannable summary
- **Story**: "As a [persona], I want [action], so that [outcome]"
- **Acceptance Criteria**: Written as testable Given/When/Then scenarios — these become TDD test cases later. Be explicit about edge cases.
- **Scope Boundary**: What this story does NOT include (prevents scope creep during implementation)
- **Data/State Requirements**: What data models, state, or dependencies are implied
- **UI/UX Notes**: If applicable — what the user sees, key interactions, error states
- **Priority**: MoSCoW (Must/Should/Could/Won't for v1)

### Quality Checks Before Finishing
- Every PRD feature maps to at least one user story — nothing is missed
- Stories follow INVEST criteria (Independent, Negotiable, Valuable, Estimable, Small, Testable)
- No story is so large it couldn't be implemented in 1-3 focused Claude Code sessions
- Acceptance criteria are specific enough that pass/fail is unambiguous
- Cross-reference back to the PRD: call out anything in the PRD that is ambiguous or contradictory

## Process
- Review `docs/tech-stack.md` to understand technical constraints — don't write stories that require capabilities the tech stack doesn't support
- Review `docs/project-structure.md` (if it exists) to understand module boundaries — stories should align with the architecture
- Review `docs/design-system.md` (if it exists) — reference established component patterns in UI/UX notes rather than describing custom UI from scratch
- Use subagents to research best practices while analyzing the PRD in parallel
- Use AskUserQuestionTool for any questions, ambiguities in the PRD, or priority decisions
- After drafting, do a final pass to verify full PRD coverage and story quality against INVEST
- Create a Beads task for this work before starting: `bd create "docs: <document being created>" -p 0` and `bd update <id> --claim`
- When the document is complete and committed, close it: `bd close <id>`
- If this work surfaces implementation tasks (bugs, missing infrastructure), create separate Beads tasks for those — don't try to do them now

## After This Step

When this step is complete, tell the user:

---
**Phase 5 in progress** — `docs/user-stories.md` created.

**Next:** Run `/scaffold:user-stories-gaps` — Gap analysis and UX innovation for user stories.

**Pipeline reference:** `/scaffold:prompt-pipeline`

---

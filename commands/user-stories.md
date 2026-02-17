---
description: "Create user stories covering every PRD feature"
long-description: "Translates every PRD feature into structured user stories in docs/user-stories.md with acceptance criteria, test scenarios, and priority assignments."
---

First, deeply research best practices for creating user stories, with emphasis on stories that will be consumed by AI agents (not human developers) for implementation. Focus on what makes a user story unambiguous and implementable without further clarification.

Then thoroughly review and analyze the PRD (docs/plan.md) and create all user stories needed to cover every feature, flow, and requirement identified in the PRD.

## Mode Detection

Before starting, check if `docs/user-stories.md` already exists:

**If the file does NOT exist → FRESH MODE**: Skip to the next section and create from scratch.

**If the file exists → UPDATE MODE**:
1. **Read & analyze**: Read the existing document completely. Check for a tracking comment on line 1: `<!-- scaffold:user-stories v<ver> <date> -->`. If absent, treat as legacy/manual — be extra conservative.
2. **Diff against current structure**: Compare the existing document's sections against what this prompt would produce fresh. Categorize every piece of content:
   - **ADD** — Required by current prompt but missing from existing doc
   - **RESTRUCTURE** — Exists but doesn't match current prompt's structure or best practices
   - **PRESERVE** — Project-specific decisions, rationale, and customizations
3. **Cross-doc consistency**: Read related docs (`docs/plan.md`, `docs/tech-stack.md`, `docs/implementation-plan.md`) and verify updates won't contradict them. Skip any that don't exist yet.
4. **Preview changes**: Present the user a summary:
   | Action | Section | Detail |
   |--------|---------|--------|
   | ADD | ... | ... |
   | RESTRUCTURE | ... | ... |
   | PRESERVE | ... | ... |
   If >60% of content is unrecognized PRESERVE, note: "Document has been significantly customized. Update will add missing sections but won't force restructuring."
   Wait for user approval before proceeding.
5. **Execute update**: Restructure to match current prompt's layout. Preserve all project-specific content. Add missing sections with project-appropriate content (using existing docs as context).
6. **Update tracking comment**: Add/update on line 1: `<!-- scaffold:user-stories v<ver> <date> -->`
7. **Post-update summary**: Report sections added, sections restructured (with what changed), content preserved, and any cross-doc issues found.

**In both modes**, follow all instructions below — update mode starts from existing content rather than a blank slate.

### Update Mode Specifics
- **Primary output**: `docs/user-stories.md`
- **Preserve**: All story IDs (US-xxx), enhancement markers (`<!-- enhancement: ... -->`), epic groupings, acceptance criteria refinements, priority decisions
- **Related docs**: `docs/plan.md`, `docs/tech-stack.md`, `docs/implementation-plan.md`
- **Special rules**: **Never renumber story IDs** — Beads tasks and implementation plan reference them. **Never remove stories** without user approval. Preserve all `<!-- enhancement: ... -->` markers. New stories get the next available ID in sequence.

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

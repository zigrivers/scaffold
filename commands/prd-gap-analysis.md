---
description: "Analyze PRD for gaps, then innovate"
long-description: "Performs a structured analysis of docs/plan.md to identify missing requirements, edge cases, and UX gaps, then proposes innovations for user approval before updating the PRD."
---
Deeply research docs/plan.md and perform a systematic gap analysis, then identify innovation opportunities. This is our last chance to strengthen the PRD before it drives every downstream document (tech stack, coding standards, user stories, implementation plan).

## Phase 1: Gap Analysis

### Completeness
- Every user persona has clearly defined goals, pain points, and context
- Every core user flow is documented end-to-end — not just the happy path but error states, edge cases, and empty states
- Every feature has a clear description, priority, and business rules
- Non-functional requirements are specific and measurable (not "fast" — how fast?)
- External integrations are identified with enough detail to evaluate tech stack options
- Out of scope is explicitly defined — not just absent

### Clarity & Precision
- Flag any vague language that an AI agent could misinterpret: "intuitive," "user-friendly," "seamless," "handles gracefully," "appropriate error message" — these must be replaced with specific, testable descriptions
- Identify features where two reasonable engineers could read the same requirement and build different things — that's a gap
- Check that terminology is consistent throughout (e.g., don't call the same thing "session" in one place and "activity" in another)
- Verify that business rules and conditional logic are explicit, not implied

### Structural Integrity
- Features don't contradict each other
- Data model relationships are consistent with the described user flows
- Priority assignments make sense — are any "must-have" features actually dependent on "should-have" features?
- Success metrics are measurable and tied to actual features being built

### Feasibility Red Flags
- Any feature that sounds simple but hides significant technical complexity — call it out
- Any requirement that assumes a capability without specifying it (e.g., "users receive notifications" — push? email? in-app? all three?)
- Any integration with a third-party service that may have API limitations, costs, or rate limits worth noting

Summarize all findings, then apply fixes directly to plan.md. Don't just list problems — resolve them.

## Phase 2: Innovation

Shift to product thinking. Research the competitive landscape, current UX trends, and best practices relevant to this application domain.

### User Experience Gaps
- Are there friction points in the core user flows that could be eliminated?
- What would the "delightful" version of each flow look like versus the "functional" version?
- Are there onboarding or first-time user experience gaps? The first 60 seconds determines if someone keeps using the app.

### Missing Features That Users Will Expect
- Based on competitive research: what do similar apps offer that we haven't addressed?
- What would a user search for in the app and be surprised it's missing?
- Are there obvious quality-of-life features not mentioned (search, filtering, sorting, undo, keyboard shortcuts)?

### AI-Native Opportunities
- Features that would be impractical to build traditionally but are easy with AI
- Smart defaults, auto-categorization, natural language interfaces, predictive behavior
- Where could AI make the experience feel magic rather than manual?

### Defensive Product Thinking
- What would a 1-star review say about this v1? Address the most likely complaints now.
- What's the most common reason a user would abandon this app after trying it?
- Are there accessibility, performance, or mobile gaps that would alienate users?

### For Each Innovation Idea, Present:
- **What**: The feature or enhancement
- **Why**: User benefit and strategic rationale
- **Impact**: How much better the product gets (high / medium / low)
- **Cost**: Implementation effort (trivial / moderate / significant)
- **Recommendation**: Must-have for v1, or backlog

Use AskUserQuestionTool to present innovation ideas grouped by theme for my approval BEFORE modifying plan.md. Let me make the calls on what goes in v1 versus later.

## Phase 3: Final Validation

After all changes are applied:
- Read the entire PRD fresh and verify it tells a coherent, complete story
- Confirm every feature could be turned into user stories without ambiguity
- Confirm the data model supports every described user flow
- Provide a concise changelog of what was added, modified, or removed
- Add a tracking comment to `docs/plan.md` after the PRD tracking comment (line 2 or after the existing `<!-- scaffold:prd -->` comment): `<!-- scaffold:prd-gap-analysis v1 YYYY-MM-DD -->` (use actual date)

## Process
- Use subagents to research the competitive landscape and UX best practices in parallel with the gap analysis
- Use AskUserQuestionTool for all innovation approvals — batch related ideas together
- Do NOT modify feature priorities without my approval
- Do NOT add approved innovations as vague one-liners — document them to the same standard as existing features (description, priority, business rules)
- Do NOT create Beads tasks — Beads is not yet initialized at this stage. If this analysis surfaces implementation work, note it in a "## Implementation Notes" section at the bottom of plan.md. These will be picked up when the Implementation Plan prompt runs later.

## After This Step

When this step is complete, tell the user:

---
**Phase 1 complete** — `docs/plan.md` updated with gap fixes and approved innovations.

**Next:** Run `/scaffold:beads` — Initialize Beads task tracking (starts Phase 2).

**Pipeline reference:** `/scaffold:prompt-pipeline`

---

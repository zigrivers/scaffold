---
name: innovate-vision
description: Discover strategic innovation opportunities in the product vision
summary: "Explores untapped opportunities — adjacent markets, AI-native capabilities, ecosystem partnerships, and contrarian positioning — and proposes innovations for your approval."
phase: "vision"
order: 030
dependencies: [review-vision]
outputs: [docs/vision.md]
conditional: "if-needed"
knowledge-base: [vision-craft]
---

## Purpose
Discover strategic innovation opportunities within the product vision. This
covers market positioning, competitive strategy, ecosystem thinking, and
contrarian bets. It operates at the strategic level — should the product be
positioned differently? Are there market opportunities being missed? What
would an AI-native rethinking look like?

This is distinct from PRD innovation (innovate-prd), which covers feature-level
gaps. If an idea is about a specific feature, it belongs in PRD innovation,
not here.

## Inputs
- docs/vision.md (required) — Vision document to analyze
- docs/reviews/vision-review-vision.md (optional) — review findings for context

## Expected Outputs
- docs/vision.md — updated with approved strategic innovations

## Quality Criteria
- Innovations are strategic-level, not feature-level
- (mvp) Each innovation categorized: market opportunity, positioning, AI-native, ecosystem, or contrarian
- (mvp) Each innovation includes: what to change, why, impact (high/medium/low), cost estimate
- (mvp) Each suggestion has an implementation cost estimate (trivial/moderate/significant)
- (mvp) Recommended disposition stated for each: must-have, backlog, or reject with rationale
- (deep) Impact assessments compared to existing document content
- (deep) Each approved innovation is integrated with the same subsection headings and detail level as existing vision sections
- Vision scope is respected — no uncontrolled strategic drift
- User approval is obtained before modifying the vision document

## Methodology Scaling
- **deep**: Full innovation pass across all 5 dimensions. Competitive research
  via web search. Detailed integration of approved innovations into vision.
- **mvp**: Not applicable — this step is conditional and skipped in MVP.
- **custom:depth(1-5)**: Depth 1-2: Quick scan only — identify 1-2 high-impact
  strategic angles with brief rationale. Depth 3: quick scan for positioning
  gaps and obvious market opportunities. Depth 4-5: full innovation pass
  across all 5 dimensions.

## Conditional Evaluation
Enable when: project has competitive landscape content in vision.md, user
explicitly requests a strategic innovation pass, or the vision review
(review-vision) identifies strategic gaps or weak positioning. Skip when:
vision is minimal/exploratory, depth < 3, or user explicitly declines innovation.

## Mode Detection
If this step has been run before (tracking comment
`<!-- scaffold:innovate-vision -->` exists in docs/vision.md), this is a
re-innovation pass. Focus on new opportunities from vision changes since last run.

## Update Mode Specifics
- **Detect prior artifact**: `<!-- scaffold:innovate-vision -->` tracking
  comment in docs/vision.md
- **Preserve**: Previously accepted strategic decisions, positioning choices
  approved by user
- **Triggers for update**: Vision strategy changed, new market data available,
  user requests re-evaluation
- **Conflict resolution**: if a previously rejected strategic angle is now
  relevant due to vision changes, re-propose with updated rationale

## Instructions

Deeply research docs/vision.md and identify strategic innovation opportunities
across 5 dimensions. This is the last chance to strengthen the vision before
it drives the PRD and everything downstream.

### Dimension 1: Market Opportunity Expansion

Research adjacent opportunities:
- Adjacent markets or segments not currently addressed
- Underserved niches within the target audience
- Timing advantages (regulatory changes, technology shifts, cultural moments)
- Platform or ecosystem opportunities that could amplify reach
- Geographic or demographic expansion possibilities

### Dimension 2: Positioning Alternatives

Explore how the product could be positioned differently:
- Could the product be positioned differently for greater impact?
- Alternative framings of the value proposition
- Category creation vs category competition — which is the stronger play?
- Messaging angles that haven't been explored
- What would a "10x better positioning" look like?

### Dimension 3: AI-Native Rethinking

If this product were conceived today with AI capabilities assumed:
- What changes fundamentally about the product concept?
- Features that become trivial with AI (and therefore table stakes)
- Experiences that become possible that were previously impractical
- Intelligence that can be embedded vs bolted on
- How does AI change the competitive landscape for this product?

### Dimension 4: Ecosystem Thinking

Explore how the product fits into a broader ecosystem:
- Partners and integrations that amplify the product's value
- Platform effects or network effects available
- Data advantages that compound over time
- Build vs buy vs partner decisions at the strategic level
- Community or marketplace opportunities

### Dimension 5: Contrarian Bets

Challenge the vision's assumptions:
- What does the vision assume that most people agree with? What if the opposite were true?
- Industry orthodoxies worth challenging
- One genuinely contrarian strategic angle, evaluated honestly
- "What would we do differently if we believed X?"
- Which assumptions, if wrong, would invalidate the entire vision?

### For Each Innovation Idea, Present:
- **What**: The strategic innovation
- **Why**: Strategic rationale and market context
- **Impact**: How much better the product positioning gets (high / medium / low)
- **Cost**: Implementation effort (trivial / moderate / significant)
- **Recommendation**: Must-have for vision, or backlog for future consideration

### Process

1. Research competitive landscape and market trends via web search
2. Generate innovation ideas across all 5 dimensions
3. Use AskUserQuestionTool to present innovations grouped by dimension for user approval
4. For each approved innovation, integrate it into the appropriate section of docs/vision.md
5. Update tracking comment: add `<!-- scaffold:innovate-vision v1 YYYY-MM-DD -->` after the vision tracking comment
6. Provide a summary of what was added, modified, or deferred

### Quality Standards
- Strategic-level only — feature ideas belong in innovate-prd
- Honest about costs and risks — don't oversell
- Respect the existing guiding principles — innovations should align, not contradict
- Do NOT modify the vision statement without explicit user approval
- Do NOT add approved innovations as vague one-liners — document them to the same standard as existing sections

## After This Step

When this step is complete, tell the user:

---
**Innovation complete** — `docs/vision.md` updated with approved strategic innovations.

**Next:** Run `/scaffold:create-prd` — Translate the vision into product requirements.

**Pipeline reference:** `/scaffold:prompt-pipeline`

---

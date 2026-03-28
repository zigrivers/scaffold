---
description: "Discover strategic innovation opportunities in the product vision"
long-description: "Discover strategic innovation opportunities within the product vision. This covers market positioning, competitive strategy, ecosystem thinking, and contrarian bets. It operates at the strategic level — should the product be positioned differently? Are there market opportunities being missed?"
---

Deeply research docs/vision.md and identify strategic innovation opportunities
across 5 dimensions. This is the last chance to strengthen the vision before
it drives the PRD and everything downstream.

**Scope boundary**: This is strategic-level innovation — market positioning, competitive strategy, ecosystem thinking. Feature-level innovation belongs in `/scaffold:innovate-prd`, not here.

## Mode Detection

Before starting, check if tracking comment `<!-- scaffold:innovate-vision -->` exists in `docs/vision.md`:

**If the comment does NOT exist -> FRESH MODE**: Proceed with a full innovation pass from scratch.

**If the comment exists -> RE-INNOVATION MODE**:
1. Read the existing vision document and note previous strategic decisions
2. Focus on new opportunities from vision changes since the last run
3. Don't re-propose rejected strategic angles unless the context has materially changed
4. Present only new findings. Wait for user approval before modifying the vision.
5. Update tracking comment with new version and date
6. Report new suggestions, disposition changes, and vision updates

**In both modes**, follow all instructions below.

### Update Mode Specifics
- **Primary output**: `docs/vision.md` (updated with approved innovations)
- **Preserve**: Previously accepted strategic decisions, positioning choices approved by user
- **Related docs**: `docs/reviews/vision-review-vision.md`
- **Special rules**: Never re-propose a rejected strategic angle unless explicitly asked. Never modify the vision statement without explicit user approval. Approved innovations must be documented to the same standard as existing sections.

---

## Innovation Dimensions

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

## Evaluation Framework

For each innovation idea, present:
- **What**: The strategic innovation
- **Why**: Strategic rationale and market context
- **Impact**: How much better the product positioning gets (high / medium / low)
- **Cost**: Implementation effort (trivial / moderate / significant)
- **Recommendation**: Must-have for vision, or backlog for future consideration

## Process

1. **Read all inputs** — Read `docs/vision.md` completely. Read `docs/reviews/vision-review-vision.md` if it exists.
2. **Use subagents** to research competitive landscape, market trends, and strategic opportunities in parallel
3. **Conduct innovation pass** across all 5 dimensions above
4. **Evaluate each suggestion** using the cost/impact framework
5. **Present grouped suggestions** to the user using AskUserQuestionTool. Wait for approval.
6. **Integrate approved innovations** into `docs/vision.md` at the same quality standard as existing sections
7. **Update tracking comment**: add `<!-- scaffold:innovate-vision v1 YYYY-MM-DD -->` after the vision tracking comment
8. **Provide summary** of what was added, modified, or deferred

## Quality Standards

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

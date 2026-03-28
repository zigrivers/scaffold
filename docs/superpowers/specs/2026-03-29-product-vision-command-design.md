# Product Vision Command Design

## Summary

Add a new Phase 0 ("Product Vision") to the scaffold pipeline with three steps — `create-vision`, `review-vision`, and `innovate-vision` — that produce a comprehensive strategic vision document (`docs/vision.md`) before the PRD phase. The vision document serves as the strategic North Star that guides all downstream product definition.

## Motivation

The current pipeline starts at `create-prd`, which includes a lightweight "Understand the Vision" discovery section (3 bullet points). This mixes strategic thinking with requirements gathering. A dedicated vision step:

- Separates "why" (vision) from "what" (requirements)
- Produces a referenceable artifact that anchors the entire pipeline
- Gives users space to think strategically before diving into tactical product definition
- Follows the product development hierarchy: Vision → Strategy → Requirements → Implementation

## Pipeline Placement

### New Phase

Add Phase 0 `"vision"` (display name: "Product Vision") to the PHASES constant in `src/types/frontmatter.ts`.

### Step Ordering

| Order | Step | Dependencies | Outputs | Conditional |
|-------|------|-------------|---------|-------------|
| 010 | `create-vision` | `[]` | `docs/vision.md` | `null` |
| 020 | `review-vision` | `[create-vision]` | `docs/reviews/vision-review-vision.md` | `null` |
| 030 | `innovate-vision` | `[review-vision]` | `docs/vision.md` (update in place) | `if-needed` |

### Relationship to PRD

- `create-prd` gets `reads: [create-vision]` added to frontmatter (soft read, not hard dependency)
- Users can still start the pipeline at `create-prd` and skip the vision phase
- When `docs/vision.md` exists, `create-prd` skips its "Understand the Vision" discovery questions and uses the vision doc as strategic foundation
- When `docs/vision.md` does not exist, `create-prd` works exactly as it does today

## Command Design: `create-vision`

### Overview

The command uses a hybrid framework combining Geoffrey Moore's elevator pitch, Roman Pichler's Vision Board, Reforge's narrative approach, and Amazon's Working Backwards methodology. It adapts based on what context the user provides — walking through full discovery for raw ideas, or extracting and structuring for users who provide existing docs.

### Mode Detection

Before starting, check if `docs/vision.md` already exists:

**If the file does NOT exist → FRESH MODE**: Create from scratch via the discovery phases below.

**If the file exists → UPDATE MODE**:
1. Read and analyze the existing document. Check for tracking comment: `<!-- scaffold:vision v<ver> <date> -->`.
2. Diff against current structure — categorize content as ADD / RESTRUCTURE / PRESERVE.
3. Cross-doc consistency: check `docs/plan.md` if it exists.
4. Preview changes to user for approval.
5. Execute update preserving project-specific content.
6. Update tracking comment.

### Phase 1: Strategic Discovery (via AskUserQuestion, batched)

**Problem Space:**
- What problem exists in the world? Who suffers from it? How do they cope today?
- Push for specificity — "everyone" is not a target audience, "it's slow" is not a problem statement
- What's the root cause of the pain, not just the symptom?

**Vision Articulation:**
- What does the world look like when this product succeeds?
- Craft the Geoffrey Moore elevator pitch: For [target customer] who [need], the [product] is a [category] that [key benefit]. Unlike [alternative], our product [differentiation].
- Is this vision inspiring enough that someone would want to work on it?

**Target Audience:**
- Deep persona work — behaviors, motivations, contexts of use (not demographics)
- Primary vs secondary audiences
- What are they doing the moment before they reach for this product?

**Market Context:**
- What alternatives exist today? Why do they fall short?
- What's the market gap or timing advantage?
- Is this a new category, a better mousetrap, or a different approach entirely?

### Phase 2: Strategic Depth (via AskUserQuestion, batched)

**Business Model & Viability:**
- How does this make money (or sustain itself)?
- What's the go-to-market intuition? (Not a full business plan — directional thinking)
- What are the unit economics assumptions?

**Guiding Principles:**
- 3-5 design tenets that guide every downstream decision
- Framed as "When in doubt, we choose X over Y"
- These must actually constrain decisions — "be user-friendly" is not a principle

**Anti-Vision:**
- What is this product explicitly NOT?
- What traps should the team avoid?
- What features or directions would dilute the vision?

**Success Horizon:**
- What does year 1 vs year 3 look like?
- What are the leading indicators that the vision is being realized?
- What would make this a failure even if it ships on time?

### Phase 3: Competitive & Market Research

The AI researches the competitive landscape using web search:
- Identifies direct competitors, indirect alternatives, and "do nothing"
- Surfaces trends, opportunities, and threats
- Validates or challenges the user's assumptions about the market gap

### Phase 4: Documentation

Produce `docs/vision.md` with tracking comment `<!-- scaffold:vision v1 YYYY-MM-DD -->` on line 1.

#### Required Sections

1. **Vision Statement** — One inspiring sentence. The North Star. Should describe the positive change the product creates in the world, not a product feature. Must be concise enough to remember and repeat.

2. **Elevator Pitch** — Geoffrey Moore template filled in:
   > For [target customer] who [need], [product name] is a [product category] that [key benefit]. Unlike [primary alternative], our product [primary differentiation].

3. **Problem Space** — The pain in vivid detail: who feels it, how they cope today, why existing solutions fail, what the root cause is. Grounded in evidence, not assumptions.

4. **Target Audience** — Primary and secondary personas with:
   - Behaviors and motivations (not demographics)
   - Context of use (when, where, why they reach for this product)
   - Current workarounds and their limitations
   - What "success" looks like from their perspective

5. **Value Proposition** — The unique value delivered, framed as outcomes not features. Why someone would choose this over alternatives (including doing nothing).

6. **Competitive Landscape** — Market map showing:
   - Direct competitors and their strengths/weaknesses
   - Indirect alternatives (different approaches to the same problem)
   - The "do nothing" option and why it's insufficient
   - The product's genuine differentiation (not wishful thinking)

7. **Guiding Principles** — 3-5 design tenets framed as prioritization tradeoffs:
   - "We choose simplicity over power" or "We choose correctness over speed"
   - Each must actually constrain decisions — if nobody would disagree, it's not a principle

8. **Anti-Vision** — What the product is NOT:
   - Features and directions explicitly excluded
   - Common traps in this product space to avoid
   - "If we find ourselves doing X, we've lost the plot"

9. **Business Model Intuition** — Directional thinking about sustainability:
   - Revenue model (or how it sustains itself if non-commercial)
   - Key unit economics assumptions
   - Go-to-market direction (not a full GTM plan)

10. **Success Criteria** — Measurable indicators across time horizons:
    - Leading indicators (early signals the vision is working)
    - Year 1 milestones
    - Year 3 aspirations
    - What failure looks like (even if the product ships)

11. **Strategic Risks & Assumptions** — Explicit bets being made:
    - Key assumptions that must hold true for the vision to succeed
    - What could invalidate each assumption
    - Risk severity and mitigation thinking

12. **Open Questions** — Unresolved strategic questions:
    - Questions that don't need answers now but will need them eventually
    - Research or validation needed before committing to specific directions

#### Documentation Quality Standards

- Every section must be specific enough to guide PRD writing without strategic ambiguity
- Avoid corporate boilerplate: "user-friendly interface" and "seamless experience" are banned
- The vision statement must be testable: could you evaluate a product decision against it and get a clear yes/no?
- Guiding principles must create real tradeoffs, not platitudes
- Competitive analysis must be honest about the product's weaknesses, not just strengths

### After This Step

```
**Phase 0 complete** — `docs/vision.md` created.

**Next:** Run `/scaffold:review-vision` — Review the vision for clarity, coherence, and downstream readiness.

**Pipeline reference:** `/scaffold:prompt-pipeline`
```

## Command Design: `review-vision`

### 5-Pass Review Structure

**Pass 1: Vision Clarity**
- Is the vision statement inspiring, concise, and memorable?
- Could someone repeat it from memory after hearing it once?
- Does it describe positive change in the world, not a product feature?
- Is it enduring (would survive a pivot in approach)?
- Apply Roman Pichler's checklist: Inspiring, Shared, Ethical, Concise, Ambitious, Enduring

**Pass 2: Audience Precision**
- Are target personas specific enough to make product decisions?
- Do they describe behaviors and motivations, not just demographics?
- Is the primary persona clearly identified?
- Could two people read the persona descriptions and agree on design decisions?

**Pass 3: Competitive Rigor**
- Is the competitive landscape thorough and honest?
- Is differentiation genuine or wishful thinking?
- Are "do nothing" alternatives considered?
- Is the market gap validated with evidence, not just asserted?
- Are competitor strengths acknowledged, not dismissed?

**Pass 4: Strategic Coherence**
- Do guiding principles actually constrain decisions (or are they platitudes)?
- Does the anti-vision prevent real traps (or is it vague)?
- Are success criteria measurable and time-bound?
- Does the business model intuition hold together with the target audience and value proposition?
- Are strategic risks honest about severity?

**Pass 5: Downstream Readiness**
- Can the PRD be written from this vision without strategic ambiguity?
- Are there unresolved questions that would block product definition?
- Is the target audience clear enough to write user personas and stories?
- Are guiding principles concrete enough to inform tech stack and architecture decisions?
- Is there enough competitive context to differentiate features?

### Output

`docs/reviews/vision-review-vision.md` with structured findings table:

| Pass | Finding | Severity | Fix |
|------|---------|----------|-----|
| 1 | Vision statement references a feature ("AI-powered...") | P1 | Reframe around the positive change, not the technology |
| ... | ... | ... | ... |

Applies fixes directly to `docs/vision.md` after presenting the fix plan.

### After This Step

```
**Review complete** — `docs/reviews/vision-review-vision.md` created, fixes applied to `docs/vision.md`.

**Next:** Run `/scaffold:innovate-vision` (optional) — Explore strategic innovation opportunities.
Or skip to: `/scaffold:create-prd` — Start product requirements.

**Pipeline reference:** `/scaffold:prompt-pipeline`
```

## Command Design: `innovate-vision`

### 5 Innovation Dimensions

**1. Market Opportunity Expansion**
- Adjacent markets or segments not currently addressed
- Underserved niches within the target audience
- Timing advantages (regulatory changes, technology shifts, cultural moments)
- Platform or ecosystem opportunities

**2. Positioning Alternatives**
- Could the product be positioned differently for greater impact?
- Alternative framings of the value proposition
- Category creation vs category competition — which is the stronger play?
- Messaging angles that haven't been explored

**3. AI-Native Rethinking**
- If this product were conceived today with AI capabilities assumed, what changes?
- Features that become trivial with AI (and therefore table stakes)
- Experiences that become possible that were previously impractical
- Intelligence that can be embedded vs bolted on

**4. Ecosystem Thinking**
- Partners and integrations that amplify the product's value
- Platform effects or network effects available
- Data advantages that compound over time
- Build vs buy vs partner decisions at the strategic level

**5. Contrarian Bets**
- What does the vision assume that most people agree with? What if the opposite were true?
- Industry orthodoxies worth challenging
- One genuinely contrarian strategic angle, evaluated honestly
- "What would we do differently if we believed X?"

### Process

1. Research competitive landscape and market trends via web search
2. Generate innovation ideas across all 5 dimensions
3. Present innovations to user grouped by dimension via AskUserQuestion
4. For each idea, present: What, Why, Impact (high/medium/low), Cost (trivial/moderate/significant), Recommendation (v1/backlog)
5. Apply approved innovations directly to `docs/vision.md`
6. Update tracking comment: `<!-- scaffold:innovate-vision v1 YYYY-MM-DD -->`

### After This Step

```
**Innovation complete** — `docs/vision.md` updated with approved strategic innovations.

**Next:** Run `/scaffold:create-prd` — Translate the vision into product requirements.

**Pipeline reference:** `/scaffold:prompt-pipeline`
```

## Knowledge Base Entry

A new `knowledge/vision-craft.md` entry containing:

- Product vision best practices synthesized from Geoffrey Moore, Roman Pichler, Marty Cagan, Reforge, and Amazon Working Backwards
- The Geoffrey Moore elevator pitch template
- Roman Pichler's vision quality checklist (Inspiring, Shared, Ethical, Concise, Ambitious, Enduring)
- Common anti-patterns (confusing vision with strategy, tying vision to a solution, failing to inspire, changing it too frequently)
- Examples of strong vision statements
- The distinction between vision, strategy, and requirements

Referenced by all three steps: `knowledge-base: [vision-craft]`

## Integration Changes

### Runner Skill Update

Add to the phase name reference table in `skills/scaffold-runner/SKILL.md`:

| vision | Product Vision | create-vision, review-vision, innovate-vision |

### PRD Adaptation

In `pipeline/pre/create-prd.md`:
- Add `reads: [create-vision]` to frontmatter
- Add conditional to Phase 1 Discovery → "Understand the Vision":

```
### Understand the Vision

**If `docs/vision.md` exists**: Read it completely. This is your strategic foundation. Skip the vision discovery questions below — the vision document has already established the problem space, target audience, value proposition, and guiding principles. Reference the vision document throughout this PRD, ensuring requirements align with the stated vision and guiding principles.

**If `docs/vision.md` does NOT exist**: [existing discovery questions remain unchanged]
```

### PHASES Constant Update

In `src/types/frontmatter.ts`, add at position 0:

```typescript
{ number: 0, slug: 'vision', displayName: 'Product Vision' },
```

## What This Design Does NOT Change

- No renumbering of existing phases or steps
- No changes to the runner skill logic (handles new phases generically)
- No changes to the build system (`scaffold build` picks up new pipeline steps)
- No changes to the dashboard or status display (they render from phase/step data)
- No changes to existing commands beyond the PRD soft-read adaptation

## Implementation Notes

### Files to Create
- `pipeline/vision/create-vision.md` — Pipeline step with frontmatter + prompt
- `pipeline/vision/review-vision.md` — Pipeline step
- `pipeline/vision/innovate-vision.md` — Pipeline step
- `knowledge/vision-craft.md` — Knowledge base entry

### Files to Modify
- `src/types/frontmatter.ts` — Add Phase 0 to PHASES
- `pipeline/pre/create-prd.md` — Add reads field, add vision doc conditional
- `skills/scaffold-runner/SKILL.md` — Add vision phase to reference table

### Files Generated (via `scaffold build`)
- `commands/create-vision.md`
- `commands/review-vision.md`
- `commands/innovate-vision.md`

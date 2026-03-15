---
name: prd-innovation
description: Techniques for discovering feature-level innovation opportunities in product requirements
topics: [innovation, prd, competitive-analysis, product-thinking, features]
---

# PRD Innovation

This knowledge covers feature-level innovation — discovering new capabilities, competitive gaps, and defensive product improvements that belong in the PRD. It operates at the product scope level: should this feature exist at all?

This is distinct from user story innovation (`user-story-innovation.md`), which covers UX-level enhancements to existing features. If an idea doesn't require a new PRD section or feature entry, it belongs in user story innovation, not here.

## Scope Boundary

**In scope:**
- New features users would expect based on competitive norms
- New user flows that address friction points in existing flows
- Competitive positioning — capabilities that differentiate the product
- Defensive product gaps — things users would complain about on day 1
- AI-native capabilities that wouldn't exist without AI

**Out of scope:**
- UX polish on existing features (smart defaults, inline validation, progressive disclosure) — belongs in user story innovation
- Implementation details (technology choices, architecture) — belongs in ADRs
- Non-functional improvements to existing features — belongs in user story innovation

---

## Competitive & Market Analysis

Research similar products to identify gaps and opportunities. The goal is actionable findings, not an exhaustive market report.

### What to Research

- **Direct competitors** — Products solving the same problem for the same users. What do they do well? What do users complain about?
- **Adjacent products** — Products in the same space that solve related problems. What patterns do they use that users now expect?
- **Emerging patterns** — UX conventions that have become table stakes. Users don't request them, but their absence feels like a gap (e.g., dark mode, keyboard shortcuts, real-time collaboration).

### How to Use Findings

For each competitive insight:
1. Is this a table-stakes feature (users expect it)? → Must-have candidate
2. Is this a differentiator (competitors don't have it, but users would love it)? → Evaluate cost/impact
3. Is this a copied feature (competitors have it, but it doesn't serve our users' specific needs)? → Skip

### Anti-Patterns

- **Feature parity obsession** — Copying every competitor feature dilutes focus. Only adopt features that serve your users' specific problem.
- **Exhaustive matrices** — A 50-row competitor comparison belongs in market research, not the PRD innovation pass. Focus on the 3-5 insights that actually affect product decisions.

## User Experience Gaps

Look at the core user flows described in the PRD and ask: where would a real user get frustrated?

### First 60 Seconds

The onboarding experience determines whether a user keeps the product:
- Can a new user understand the product's value within 60 seconds?
- Is there a clear first action? Or does the user land on an empty state with no guidance?
- How many steps between signup and the first "aha moment" where the product delivers value?

### Flow Friction Points

For each core user flow:
- How many steps does it take? Can any be eliminated or combined?
- Are there unnecessary confirmation dialogs? (Prefer undo over "are you sure?")
- Does the user need to leave the flow to get information required by the flow?
- What's the "delightful" version of this flow versus the "functional" version?

### Missing Flows

- Are there common user goals that the PRD doesn't address with a dedicated flow?
- Does the user have to work around the product to accomplish something obvious?

## Missing Expected Features

Features that users would search for and be surprised are absent. These are not innovative — they're expected. Their absence feels like a bug.

### Common Missing Features by Category

**Search & Discovery:**
- Text search across primary content types
- Filtering and sorting on list views
- Recently viewed / recently used items

**Data Management:**
- Bulk import/export (CSV, JSON)
- Undo for destructive actions
- Duplicate/clone for repetitive creation

**Communication:**
- Notification preferences (what, when, how)
- Email digests vs. real-time notifications
- In-app notification center

**Personalization:**
- User preferences / settings
- Saved views or filters
- Customizable dashboard or home screen

### Detection Technique

For each persona in the PRD, walk through their typical week:
1. What would they do daily? Weekly? Monthly?
2. For each action, is there a feature that supports it?
3. For each gap, would the user be surprised it's missing?

## AI-Native Opportunities

Features that would be impractical to build without AI but become natural with it. These are not "AI bolted on" — they are capabilities that fundamentally change the user experience.

### Categories

**Natural language interfaces:**
- Search that understands intent ("show me overdue invoices from last quarter") rather than requiring structured queries
- Data entry through conversation rather than forms for complex inputs
- Commands that understand context ("send the same email I sent to the last batch")

**Auto-categorization and tagging:**
- Content automatically categorized based on content analysis
- Suggested tags that learn from user corrections
- Smart folders or views that organize themselves

**Predictive behavior:**
- Pre-filled forms based on patterns ("you usually set this to X")
- Suggested next actions based on workflow patterns
- Anomaly detection ("this value is unusual — did you mean X?")

**Content generation:**
- Draft generation for repetitive writing (emails, descriptions, reports)
- Summarization of long content (meeting notes, documents, threads)
- Template suggestions based on context

### Evaluation

AI features should pass the "magic vs. gimmick" test:
- **Magic:** User thinks "how did it know?" and saves meaningful time
- **Gimmick:** User thinks "that's cool" once and never uses it again
- Only propose features that pass the magic test

## Defensive Product Thinking

Proactively identify what users would complain about. Fix the most likely complaints before they happen.

### The 1-Star Review Technique

Write the most likely 1-star review for the v1 product. Common templates:
- "I can't believe it doesn't even have [obvious feature]."
- "I tried to [common action] and it just [broke/was confusing/lost my data]."
- "Great concept but unusable on [mobile/slow connection/screen reader]."
- "I wanted to [goal] but had to [painful workaround] because [missing capability]."

For each plausible 1-star review: is the complaint addressed in the PRD? If not, should it be?

### Abandonment Analysis

Identify the most common reasons a user would try the product and stop using it:
1. **Complexity barrier** — Too hard to learn. Is onboarding addressed?
2. **Performance barrier** — Too slow. Are performance NFRs adequate?
3. **Trust barrier** — Doesn't feel reliable. Is error handling comprehensive?
4. **Value barrier** — Doesn't deliver on the promise fast enough. Is time-to-value minimized?
5. **Integration barrier** — Doesn't connect to their existing tools. Are integrations addressed?

### Accessibility & Inclusion

Gaps that alienate entire user segments:
- Keyboard-only navigation for users who can't use a mouse
- Screen reader support for visually impaired users
- Mobile responsiveness for users on phones
- Offline or degraded-mode support for users with unreliable connections
- Internationalization for non-English-speaking users

## Evaluation Framework

For each innovation suggestion, evaluate before proposing to the user.

### Cost Assessment

- **Trivial** (no new features): A small addition to an existing PRD feature section. No new user flows, no new data entities.
- **Moderate** (1-3 new features): Requires new PRD feature entries, possibly a new user flow. Contained within existing product scope.
- **Significant** (reshapes scope): Requires rethinking product boundaries, adding new personas, or fundamentally changing architecture assumptions.

### Impact Assessment

- **Nice-to-have**: Users wouldn't notice if absent. Polishes the product but doesn't change adoption or satisfaction meaningfully.
- **Noticeable improvement**: Users would appreciate it. Reduces friction in common workflows or addresses a gap competitors have filled.
- **Significant differentiator**: Sets the product apart. Users would choose this product partly because of this capability.

### Decision Framework

| | Trivial Cost | Moderate Cost | Significant Cost |
|---|---|---|---|
| **Differentiator** | Must-have v1 | Must-have v1 | Backlog (worth it but not now) |
| **Noticeable** | Must-have v1 | Backlog | Backlog |
| **Nice-to-have** | Include if free | Backlog | Reject |

### Presenting to the User

Group related suggestions for efficient decision-making. For each group:
1. Describe the enhancement and its user benefit (1-2 sentences)
2. State the cost (trivial/moderate/significant)
3. State your recommendation (must-have v1 / backlog / reject) with reasoning
4. Wait for approval before integrating into the PRD
5. Document approved innovations to the same standard as existing PRD features — full description, priority, business rules. No vague one-liners.

---
description: "Create a product requirements document from an idea"
argument-hint: "<idea or @files>"
---
I have an idea for an application and I want you to help me create a thorough and detailed product requirements document that AI will use to build user stories, define the tech stack, and create an implementation plan.

## Here's my idea:
$ARGUMENTS

## Phase 1: Discovery

Use AskUserQuestionTool throughout this phase. Batch related questions together — don't ask one at a time.

### Understand the Vision
- What problem does this solve and for whom? Push me to be specific about the target user.
- What does success look like? How will we know this is working?
- What's the single most important thing this app must do well?

### Challenge and Innovate
- Challenge my assumptions — if something doesn't make sense or is overengineered, say so
- Identify areas I haven't considered (edge cases, user flows I'm overlooking, operational concerns)
- Research the competitive landscape: what exists today? What do they do well? Where do they fall short?
- Propose innovations — features or approaches I haven't thought of that would make this significantly better. Focus on ideas that are high-impact and realistic for v1, not sci-fi.

### Define the Boundaries
- What is explicitly OUT of scope for v1? Force this decision early.
- What are the riskiest assumptions we're making? Call them out.
- Are there any regulatory, legal, or compliance considerations?

## Phase 2: Planning

### Scope v1
- Propose exactly what we'll build in version 1 — ruthlessly prioritize
- For anything I want that you'd recommend deferring, explain why and what version it belongs in
- Identify the core loop: what is the user doing repeatedly? This must be frictionless.

### Technical Approach (Plain Language)
- Explain the high-level technical approach without jargon
- Identify any tradeoffs and let me make the call
- List anything I'll need to provide or set up (accounts, services, API keys, design assets, decisions)

### User Personas
- Define each distinct user type (even if there's only one, make it explicit)
- What are their goals, pain points, and context of use?
- These personas will carry through to user stories — get them right here

## Phase 3: Documentation

Create `docs/plan.md` (create the `docs/` directory if it doesn't already exist) covering:

### Required Sections
1. **Product Overview** — One-paragraph elevator pitch. What it is, who it's for, why it matters.
2. **User Personas** — Each persona with goals, pain points, and context
3. **Core User Flows** — Step-by-step walkthrough of the primary user journeys (happy path AND key error/edge cases)
4. **Feature Requirements** — Every feature grouped by area, with:
   - Clear description of what it does
   - Why it exists (tied to user need)
   - Priority: Must-have (v1) / Should-have (v1 if time) / Future
   - Any business rules or logic that aren't obvious
5. **Data Model Overview** — What are the key entities and their relationships? (Plain language, not schema — that comes later)
6. **External Integrations** — Every third-party service or API the app needs to interact with
7. **Non-Functional Requirements** — Performance expectations, security requirements, accessibility needs, supported platforms/browsers
8. **Open Questions & Risks** — Anything unresolved that could affect implementation
9. **Out of Scope** — Explicit list of what we're NOT building in v1
10. **Success Metrics** — How we'll measure if this is working

### Documentation Quality Standards
- Every feature must be described thoroughly enough that an AI agent can build it without asking follow-up questions
- Avoid ambiguity: "the app should handle errors gracefully" is useless. Specify what errors can occur and what the user sees for each.
- Include concrete examples where behavior might be misinterpreted (e.g., "when a user has zero sessions, the dashboard shows X, not an empty state")
- Use consistent terminology throughout — define key terms once and reuse them

## How to Work With Me
- Treat me as the product owner. I make the decisions, you make them happen.
- Don't overwhelm me with technical jargon. Translate everything.
- Push back if I'm overcomplicating things or going down a bad path.
- Be honest about limitations. I'd rather adjust my expectations than be disappointed.
- Batch your questions using AskUserQuestionTool — don't pepper me one at a time.

## Note on Tooling

Beads task tracking is not yet initialized at this stage — that happens later (Beads Setup prompt). This prompt produces documentation only. Do not attempt to create Beads tasks.

## What This Document Should NOT Be
- A technical specification — that comes later in the tech stack and implementation plan
- Vague — "user-friendly interface" means nothing. Be specific about what the user sees and does.
- A wishlist — everything in v1 scope must be justified and achievable

I don't just want something that works. I want something I'm proud to show people.

## After This Step

When this step is complete, tell the user:

---
**Phase 1 complete** — `docs/plan.md` created.

**Next:** Run `/scaffold:prd-gap-analysis` — Analyze the PRD for gaps, then innovate before it drives everything else.

**Pipeline reference:** `/scaffold:prompt-pipeline`

---

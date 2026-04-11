---
name: ideation-craft
description: Questioning techniques, research methodology, lightweight expansion patterns, and brief synthesis for early-stage idea exploration
topics: [ideation, questioning, research, competitive-analysis, brief-synthesis, socratic-method]
---

# Ideation Craft

Ideation craft covers the questioning, research, and synthesis techniques used during early-stage idea exploration. It guides a conversational flow from a raw idea through competitive research to a structured idea brief.

## Summary

### Key Techniques
- **Questioning**: Socratic method (what → who → why → why not), 5 Whys for root cause, "What would have to be true?" for assumptions. Batch 2-3 questions per turn.
- **Research**: Scan direct competitors, indirect alternatives, and the "do nothing" option. Capture strengths, weaknesses, positioning per competitor. Check adjacent markets and market timing.
- **Expansion**: Lightweight one-liner prompts — adjacent markets, ecosystem plays, contrarian angles, tech enablers, AI-native rethinking. These are conversation starters, not full strategic methodology.
- **Synthesis**: 2-4 sentences per brief section. Tag confidence: validated, hypothesized, or speculative. Never fabricate — write "None identified" for empty sections.

## Deep Guidance

### Questioning Techniques

- **Socratic method**: Ask progressively deeper questions. Start with "what" (the idea), move to "who" (the audience), then "why" (the problem), then "why not" (the assumptions).
- **The 5 Whys**: When the user states a problem, ask "why?" five times to reach the root cause. Surface-level problems hide deeper opportunities.
- **"What would have to be true?"**: For every assumption, ask what conditions must hold for it to work. This surfaces hidden dependencies and risks.
- **Batching**: Group 2-3 related questions per turn. Don't pepper the user with single questions (wastes turns) or overwhelm with 10 at once (causes shallow answers).

### Progressive Questioning Framework

**Turn 1 — Capture the spark**: What are you building? Who is it for? What problem does it solve?

**Turn 2 — Dig into the problem**: How do people solve this today? What's painful about the current approach? How often do they experience this pain?

**Turn 3 — Understand the audience**: Describe the person who needs this most. What are they doing the moment before they reach for your product? What does "success" look like from their perspective?

**Turn 4 — Challenge assumptions**: You said [X] — what evidence do you have? What would have to be true for [Y] to work? If [Z] turned out to be wrong, would the idea still make sense?

**Turn 5+ — Deepen based on gaps**: Follow the thread. If the audience is unclear, keep pulling on that. If the problem is well-defined but the solution is vague, focus there. Don't follow a script — follow the gaps.

### Research Methodology

- **Competitor scan**: Search for direct competitors (same problem, same audience), indirect alternatives (different approach, same problem), and the "do nothing" option (how users cope today).
- **What to capture per competitor**: Name, what they do well (be specific), where they fall short (be honest), pricing model, target audience, and why a user might choose them over the idea.
- **Adjacent markets**: Look for products solving related problems for the same audience, or the same problem for a different audience. These are expansion opportunities.
- **Market timing**: Why now? What changed (technology, regulation, culture, behavior) that makes this idea viable today when it wasn't before?

### Expansion Patterns (Lightweight)

- **Adjacent market**: "Your users also need X — have you considered expanding into that?"
- **Ecosystem play**: "If you solve A, you become the natural place to also solve B and C."
- **Contrarian angle**: "Everyone in this space does X. What if you deliberately did the opposite?"
- **Technology enabler**: "A new capability (API, model, platform) makes Y possible now — could that reshape your approach?"
- **AI-native rethinking**: "If you assumed AI could handle Z, how would that change the product?"

These are conversation starters for Phase 3 (Expand), not full strategic methodology. The pipeline's `innovate-vision` step covers comprehensive strategic expansion later.

### Brief Synthesis

- A good directional hypothesis names a specific audience, problem, and approach — not vague aspirations.
- Bad: "This app will help people be more productive." Good: "Freelance designers who lose 5+ hours/week to invoice tracking — a tool that auto-generates invoices from their time-tracking data."
- Tag confidence levels: "validated" (user confirmed + research supports), "hypothesized" (user stated but unresearched), "speculative" (surfaced during expansion, unconfirmed).
- Each brief section should be 2-4 sentences or concise bullet points. If a section has nothing, write "None identified" — don't fabricate.

### Competitive Research Process

1. **Start with the obvious**: Search for "[problem] app" or "[problem] tool." The first 5-10 results are the landscape the user will compete against.
2. **Check review sites**: App Store reviews, G2, Capterra, ProductHunt comments. Users complain about exactly the gaps a new product can fill.
3. **Look for failures**: Search "[category] startup failed" or "[competitor] shutdown." Failed attempts tell you what didn't work and why.
4. **Find the "do nothing" option**: How do people cope without any tool? Spreadsheets, manual processes, asking friends? This is often the biggest competitor.
5. **Assess timing**: Search for recent news, funding rounds, regulatory changes, or technology launches in the space. Timing explains why an idea works now when it didn't before.

### Framing Research for External Model Dispatch

When dispatching to an external model for competitive research (depth 4+), frame the prompt as:

> "Research the competitive landscape for [idea summary]. Identify: (1) Direct competitors solving the same problem for the same audience, (2) Indirect alternatives — different approaches to the same problem, (3) The 'do nothing' option — how users cope today, (4) Recent market signals — funding, launches, shutdowns, regulatory changes. For each competitor, note what they do well and where they fall short. Be honest — acknowledge genuine strengths."

### Brief Section Guidance

| Section | Source Phase | What to write | Common mistakes |
|---------|-------------|---------------|-----------------|
| Idea & Problem Space | Phase 1 (Seed) | Core idea, specific problem, target audience, why they need it | Too vague ("helps people"), no audience specificity |
| Landscape | Phase 2 (Research) | 2-5 competitors with strengths/weaknesses, positioning | Dismissing competitors, listing without analysis |
| Expansion Ideas | Phase 3 (Expand) | Accepted ideas tagged as preliminary, deferred ideas noted | Treating preliminary as committed scope |
| Constraints & Scope | Phase 4 (Challenge) | Confirmed assumptions, what's in/out, locked decisions | Scope too broad, no explicit "out" list |
| Technology Opportunities | Phase 2-3 | Tech enablers discovered during research/expansion | Listing technologies without explaining why they matter |
| Open Questions | All phases | Unresolved items that need answers before building | Ignoring questions that feel uncomfortable |
| Risks | Phase 4 (Challenge) | Market, technical, feasibility risks with severity | Only listing technical risks, ignoring market risks |

### Audience Definition Techniques

Avoid demographic-only definitions ("18-35 year old professionals"). Instead, define audiences by behavior and motivation:

**Behavior-based**: "People who currently track expenses in a spreadsheet because existing apps are too complex."
**Motivation-based**: "Freelancers who want to spend less than 10 minutes per week on invoicing so they can focus on client work."
**Context-based**: "The moment someone finishes a client project and thinks 'now I have to figure out the invoice' — that's when they need this."

**Questions to sharpen audience definition:**
- What is this person doing the moment before they reach for your product?
- What is the last thing they tried? Why did it fail them?
- How would they describe their problem to a friend (not in your language — in theirs)?
- If you could only serve ONE type of user, who would it be and why?

### Problem Validation Framework

Before accepting a problem statement, test it:

1. **Specificity test**: Can you name a real person (or type of person) who has this problem? If "everyone has this problem," it's too vague.
2. **Frequency test**: How often does this problem occur? Daily problems are more valuable than annual ones.
3. **Severity test**: When this problem occurs, how painful is it? Mild inconvenience or hair-on-fire emergency?
4. **Workaround test**: How do people cope today? If they have a workable (even if imperfect) solution, your product must be dramatically better.
5. **Willingness test**: Would someone pay money / change habits / switch tools to solve this? If not, the problem may not be valuable enough.

### Scope Sharpening Techniques

When the idea is too broad, use these techniques to find the core:

- **The one-feature test**: "If your product could only do ONE thing, what would it be?" This reveals the core value proposition.
- **The removal test**: "If you removed [feature X], would anyone still use the product?" If yes, X is not core.
- **The first-user test**: "Who is the first person who would use this, and what exactly would they do with it?" This grounds abstract ideas in concrete behavior.
- **The MVP boundary**: "What is the smallest thing you could build that would make one person's life measurably better?" This defines the initial scope.
- **The anti-scope list**: Explicitly list what the product does NOT do. This is as important as what it does.

### Positioning Against Competitors

When the landscape is crowded, help the user find genuine differentiation:

- **Head-to-head**: "Competitor X does this well. You would need to be 10x better at this specific thing to win users away. Can you be?"
- **Underserved segment**: "Competitor X serves enterprise. Is there an underserved segment (freelancers, students, non-profits) that you could own?"
- **Different job**: "Competitor X solves problem A. Could you solve a related but different problem B for the same audience?"
- **Channel advantage**: "Competitor X requires a desktop app. Could you win by being mobile-first, browser-based, or embedded in an existing workflow?"
- **Timing advantage**: "What has changed (new technology, regulation, cultural shift) that makes your approach viable now when it wasn't when competitors launched?"

### Ideation Anti-Patterns

| Anti-pattern | What it sounds like | Why it's dangerous | How to challenge |
|-------------|--------------------|--------------------|-----------------|
| Solution-first | "I want to build an app that..." | Skips the problem entirely | "What problem does this solve? For whom?" |
| Everyone-needs-this | "Everyone could use this" | No target audience = no product | "Who needs this MOST? Who would pay?" |
| Feature soup | "It'll do X and Y and Z and..." | No core value proposition | "Remove one feature. Does it still work?" |
| Competitor blindness | "Nobody else does this" | Almost certainly false | "How do people solve this today?" |
| Technology hammer | "I learned [tech] and want to use it" | Technology seeking a problem | "Forget the tech. What problem exists?" |
| Scale fantasy | "Once we have millions of users..." | Ignores the path to the first user | "How do you get user #1? User #10?" |
| Uniqueness obsession | "We need a totally new idea" | Execution beats novelty almost always | "What existing idea could you execute 10x better?" |

### Worked Example: From Vague to Sharp

**Vague starting point**: "An app for recipes"

**After Phase 1 (Seed):**
- Who: Home cooks who meal prep on weekends but waste food because they buy ingredients for recipes they never make.
- Problem: Planning meals for the week takes 45+ minutes, and existing apps have 50,000 recipes but no help deciding which ones to cook together.
- Core idea: A meal planning tool that suggests complementary recipes sharing ingredients, minimizing waste and shopping time.

**After Phase 2 (Research):**
- Competitors: Mealime (good UI but no ingredient overlap), Paprika (great for saving recipes but no planning), Eat This Much (calorie-focused, not taste-focused).
- Gap: No tool optimizes for ingredient reuse across a week of meals.

**After Phase 3 (Expand):**
- Accepted: Grocery list auto-generation from the meal plan (directly supports core value).
- Deferred: Social sharing of meal plans (not core, revisit later).
- Rejected: Calorie tracking (different problem, different audience).

**After Phase 4 (Challenge):**
- Confirmed: The ingredient-overlap algorithm is the differentiator.
- Revised: Scope down from "all cuisines" to "weeknight dinners, 30 min or less" for MVP.
- Locked out: No restaurant recommendations, no diet tracking, no social features for v1.

This progression from "an app for recipes" to a tightly scoped meal planning tool with a clear differentiator is what a good spark session produces.

### Confidence Tagging Guide

Every claim in the spark brief should carry an implicit confidence level. This helps `create-vision` know what to validate vs. what to build on.

**Validated** (highest confidence):
- User stated it AND research supports it.
- Example: "3 competitors exist in this space" (user said, you verified via search).
- create-vision can build on this without re-exploring.

**Hypothesized** (medium confidence):
- User stated it but it hasn't been independently verified.
- Example: "Target users are freelance designers" (user's claim, no research to confirm market size).
- create-vision should probe deeper on these — targeted follow-up questions.

**Speculative** (lowest confidence):
- Surfaced during expansion or challenge, not yet confirmed by user.
- Example: "Meal planning apps retain 3x better than recipe apps" (research finding, user hasn't decided whether to pivot).
- create-vision should present these as open questions, not assumptions.

**How to apply in the brief:**
- Don't tag every sentence explicitly (clutters the document).
- Tag at the section level: "This section is largely validated — user confirmed the audience and research supports the competitive gap."
- Call out speculative items explicitly: "Note: the social sharing angle is speculative — surfaced during expansion, not yet confirmed."

### Market Timing Analysis

When assessing "why now?", look for these signals:

**Technology shifts**: A new API, platform, or capability that makes something possible (or dramatically cheaper) that wasn't before. Example: LLMs making personalized recommendation affordable for indie tools.

**Regulatory changes**: New laws or standards that create demand or remove barriers. Example: GDPR creating demand for privacy-first alternatives.

**Behavioral changes**: Shifts in how people work, communicate, or consume. Example: Remote work increasing demand for async collaboration tools.

**Market failures**: Recent shutdowns, pivots, or public failures that leave an underserved audience. Example: A popular tool raising prices 10x, driving users to seek alternatives.

**Cultural shifts**: Changing attitudes that make new products viable. Example: Growing sustainability awareness creating demand for waste-reduction tools.

Each timing signal should be specific and verifiable — not "AI is trending" but "GPT-4's function calling API, launched in June 2023, makes it possible to build structured data extraction at 1/100th the cost of custom NLP pipelines."

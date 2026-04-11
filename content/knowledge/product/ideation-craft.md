---
name: ideation-craft
description: Questioning techniques, research methodology, lightweight expansion patterns, and brief synthesis for early-stage idea exploration
topics: [ideation, questioning, research, competitive-analysis, brief-synthesis, socratic-method]
---

# Ideation Craft

## Summary

### Questioning Techniques
- **Socratic method**: Ask progressively deeper questions. Start with "what" (the idea), move to "who" (the audience), then "why" (the problem), then "why not" (the assumptions).
- **The 5 Whys**: When the user states a problem, ask "why?" five times to reach the root cause. Surface-level problems hide deeper opportunities.
- **"What would have to be true?"**: For every assumption, ask what conditions must hold for it to work. This surfaces hidden dependencies and risks.
- **Batching**: Group 2-3 related questions per turn. Don't pepper the user with single questions (wastes turns) or overwhelm with 10 at once (causes shallow answers).

### Research Methodology
- **Competitor scan**: Search for direct competitors (same problem, same audience), indirect alternatives (different approach, same problem), and the "do nothing" option (how users cope today).
- **What to capture per competitor**: Name, what they do well (be specific), where they fall short (be honest), pricing model, target audience, and why a user might choose them over the spark idea.
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

## Deep Guidance

### Progressive Questioning Framework

**Turn 1 — Capture the spark**: What are you building? Who is it for? What problem does it solve?

**Turn 2 — Dig into the problem**: How do people solve this today? What's painful about the current approach? How often do they experience this pain?

**Turn 3 — Understand the audience**: Describe the person who needs this most. What are they doing the moment before they reach for your product? What does "success" look like from their perspective?

**Turn 4 — Challenge assumptions**: You said [X] — what evidence do you have? What would have to be true for [Y] to work? If [Z] turned out to be wrong, would the idea still make sense?

**Turn 5+ — Deepen based on gaps**: Follow the thread. If the audience is unclear, keep pulling on that. If the problem is well-defined but the solution is vague, focus there. Don't follow a script — follow the gaps.

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

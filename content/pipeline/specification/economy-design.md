---
name: economy-design
description: Design virtual currencies, faucet/sink balancing, loot tables, progression economy, and monetization with legal compliance
summary: "Defines the game economy separating progression economy (currencies, faucet/sink balance, loot tables, crafting costs) from monetization (store, pricing, ethical guidelines). Includes legal compliance per target market for loot boxes, probability disclosure, and spending limits."
phase: "specification"
order: 868
dependencies: [game-design-document]
outputs: [docs/economy-design.md]
conditional: "if-needed"
reads: []
knowledge-base: [game-economy-design]
---

## Purpose
Design the complete game economy — the system of virtual currencies, resource
flows, reward structures, and (optionally) real-money transactions that govern
player progression and engagement. This document explicitly separates two
concerns that are often conflated:

1. **Progression economy**: How players earn, spend, and value in-game resources
   through gameplay. This exists in every game with resources, upgrades, or
   unlockables — including premium single-player titles with no monetization.
2. **Monetization economy**: How the studio generates revenue through the
   economy. This only applies to games with in-app purchases, premium currency,
   or real-money trading.

Separating these concerns matters because progression economy must be
intrinsically satisfying regardless of monetization. If removing all real-money
paths leaves an economy that feels grindy or punishing, the progression design
is fundamentally broken.

Legal compliance adds a third dimension. Loot boxes, gacha mechanics, and
real-money randomized rewards face different regulations per market (China,
Belgium, Netherlands, US state laws, Australia). Compliance requirements must
be designed in — not patched after launch — because they affect UI flows,
backend systems, and content structures.

## Conditional Evaluation
Enable when: the GDD describes any of the following — virtual currencies,
resource crafting/spending systems, loot tables, progression unlocks tied to
resource accumulation, in-app purchases, premium currency, battle passes,
seasonal stores, or any economy-like mechanic beyond simple score tracking.

Skip when: the game has no resource economy — e.g., pure arcade games with
score-only progression, narrative adventures with no inventory or currency,
puzzle games with no unlock systems. Simple XP/level systems that only gate
content (no spending decisions) do not require a full economy design.

## Inputs
- docs/game-design.md (required) — core loop, progression mechanics, monetization model (if any), resource types
- docs/plan.md (required) — target markets informing legal compliance requirements, business model (premium, F2P, hybrid)

## Expected Outputs
- docs/economy-design.md — currency definitions, faucet/sink models, loot table
  design, progression economy, monetization design (if applicable), and legal
  compliance checklist

## Quality Criteria
- (mvp) All virtual currencies defined with earn rates, spend sinks, and target time-to-purchase for key items
- (mvp) Faucet/sink balance modeled: currency generation and removal rates per player-hour with steady-state analysis
- (mvp) Progression economy operates independently of monetization — removing real-money paths does not break the core loop
- (mvp) If loot tables exist: drop rate ranges defined, pity/mercy mechanics specified, duplicate handling documented
- (mvp) If monetization exists: store structure, pricing tiers, and ethical guidelines documented (no pay-to-win in PvP, spending limit awareness)
- (deep) Inflation/deflation trajectory modeled over player lifecycle (early game, mid game, end game, live service)
- (deep) Exploit vectors identified at design level: duplication, overflow, conversion rate manipulation, timing exploits
- (deep) Legal compliance checklist per target market: probability disclosure requirements, age-gating, spending limits, loot box classification
- (deep) Economy simulation spreadsheet or formula reference with tunable parameters for balance testing
- (deep) Seasonal/live-service economy plan: event currencies, battle pass reward tracks, limited-time offers, FOMO management

## Methodology Scaling
- **deep**: Full economy design with multi-currency architecture, faucet/sink
  mathematical model, loot table probability design with pity systems,
  progression economy with milestone analysis, monetization design with
  ethical framework, legal compliance per market, exploit vector analysis,
  economy simulation reference, and live-service economy plan. 15-25 pages.
- **mvp**: Currency definitions, basic faucet/sink balance, progression
  economy structure, and monetization overview (if applicable). 4-8 pages.
- **custom:depth(1-5)**:
  - Depth 1: currency definitions and basic earn/spend rates only.
  - Depth 2: add faucet/sink balance model and progression-monetization separation analysis.
  - Depth 3: add loot table design, exploit vector identification, and legal compliance checklist.
  - Depth 4: add inflation trajectory modeling, economy simulation formulas, and ethical monetization framework.
  - Depth 5: full specification with live-service economy plan, seasonal event economics, A/B testing strategy for economy tuning, and economy health KPIs.

## Mode Detection
Check for docs/economy-design.md. If it exists, operate in update mode: read
existing economy design and diff against current GDD progression and
monetization mechanics. Preserve existing currency definitions, faucet/sink
models, and legal compliance decisions. Update economy parameters if GDD
changed progression pacing or added new resource types.

## Update Mode Specifics
- **Detect prior artifact**: docs/economy-design.md exists
- **Preserve**: currency definitions, faucet/sink ratios, loot table
  probabilities, legal compliance decisions, monetization pricing structure,
  ethical guidelines
- **Triggers for update**: GDD changed progression mechanics or added new
  resource types, target markets changed (affects legal compliance), business
  model changed (premium to F2P or vice versa), live-service plan added
  seasonal economy elements
- **Conflict resolution**: if GDD changes require rebalancing the economy,
  document the ripple effects across all currency tiers and progression
  milestones; never adjust a single faucet or sink without analyzing the
  system-wide impact on time-to-purchase and inflation trajectory

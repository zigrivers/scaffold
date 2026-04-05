---
name: review-game-design
description: Failure modes and review passes specific to Game Design Documents — pillar coherence, core loop closure, mechanic clarity, and scope feasibility
topics: [game-dev, review, gdd, pillars, mechanics, scope]
---

# Review: Game Design Document

A Game Design Document must translate creative vision into implementable specifications. It must be coherent (design pillars actually constrain decisions), complete (core loops close without gaps), unambiguous (an engineer can implement without guessing), and feasible (scope matches team size and timeline). This review uses 7 passes targeting the specific ways GDDs fail.

Follows the review process defined in `review-methodology.md`.

## Summary

- **Pass 1 — Pillar Coherence**: Design pillars actually constrain decisions; every mechanic traces to a pillar; no pillar is decorative.
- **Pass 2 — Core Loop Closure**: The moment-to-moment, session, and meta loops all close; no dead ends where the player has nothing meaningful to do next.
- **Pass 3 — Mechanic Ambiguity Detection**: Every mechanic is specified precisely enough for an engineer to implement without guessing; numeric ranges, state transitions, and edge cases are defined.
- **Pass 4 — Progression Curve Feasibility**: Power curves, unlock pacing, and difficulty ramps are mathematically grounded; no implicit assumptions about player behavior.
- **Pass 5 — Scope vs Reality Check**: Feature count, mechanic complexity, and content volume are achievable within the stated team size, timeline, and budget.
- **Pass 6 — Competitive Differentiation**: The design articulates what makes this game worth playing over alternatives; differentiation is structural, not cosmetic.
- **Pass 7 — Systems Interaction Audit**: Mechanics that interact are identified and their interactions are specified; emergent behavior is anticipated rather than accidental.

## Deep Guidance

---

## Pass 1: Pillar Coherence

### What to Check

Design pillars actually function as decision-making constraints. Every significant mechanic traces back to at least one pillar. No pillar is purely aspirational ("fun" is not a pillar). When a mechanic conflicts with a pillar, the GDD acknowledges the tension and explains why the trade-off is acceptable.

### Why This Matters

Pillars that do not constrain decisions are decorative — they describe the desired feeling but do not help an engineer or designer decide between two implementation approaches. When pillars are vague ("accessible yet deep"), every mechanic can claim alignment and the pillars provide zero filtering power. The result is scope creep because nothing is cut — everything "aligns with the pillars."

### How to Check

1. List each design pillar and its definition
2. For each pillar, find at least one mechanic that was **excluded** because of that pillar — if nothing was cut, the pillar is not constraining
3. For each major mechanic, trace it to at least one pillar — orphan mechanics indicate scope creep or missing pillars
4. Check for contradictory pillars: "fast-paced action" and "deep tactical planning" require explicit prioritization
5. Verify pillars are falsifiable — could a mechanic violate this pillar? If every possible mechanic aligns, the pillar is too vague
6. Cross-reference pillars with the vision document — do they support or contradict the stated player experience?

### What a Finding Looks Like

- P0: "Pillar 'Meaningful Choices' is stated but no mechanic in the GDD has branching outcomes. The pillar exists as aspiration with zero implementation."
- P1: "Crafting system has no pillar trace. It adds 40+ hours of content but does not connect to any of the three stated pillars."
- P2: "Pillars 'Accessible' and 'Deep Mastery Curve' are both listed without prioritization. When they conflict (e.g., tutorial length), which wins?"

---

## Pass 2: Core Loop Closure

### What to Check

Every gameplay loop — moment-to-moment, session-level, and metagame — closes without dead ends. The player always has a clear, motivated next action. Resources earned in one loop feed into the next. No loop requires content that does not exist.

### Why This Matters

An open loop means the player reaches a state where there is nothing meaningful to do next. In a session loop, this manifests as "I finished the quest but there is nothing to spend the reward on." In the metagame loop, it manifests as endgame content drought. Open loops are the primary cause of player churn — the game literally runs out of things to offer.

### How to Check

1. Map each loop: what is the trigger, what are the actions, what is the reward, what does the reward feed into?
2. For the moment-to-moment loop: does combat/interaction resolve in a clear outcome that motivates the next action?
3. For the session loop: does completing a session-level goal (quest, match, level) provide resources that unlock new session-level content?
4. For the metagame loop: what keeps the player engaged after 100 hours? Is there a clear answer or does the GDD go silent?
5. Check resource flow: every resource produced by one loop must be consumed by another; orphan resources indicate a broken connection
6. Verify that loops do not require systems described as "future content" — if the endgame loop depends on a feature marked TBD, the loop is open

### What a Finding Looks Like

- P0: "The session loop produces gold from quests, but nothing in the GDD specifies what gold purchases. The economy section is marked 'TBD.' The session loop does not close."
- P1: "The metagame loop relies on seasonal content, but no seasonal content cadence is specified. After the main campaign, the metagame loop is undefined."
- P2: "Moment-to-moment combat resolves in XP gains, but the XP-to-level curve is not documented. It is unclear how many combat encounters are needed per level."

---

## Pass 3: Mechanic Ambiguity Detection

### What to Check

Every mechanic is specified precisely enough that an engineer can implement it without making design decisions. Numeric values have ranges or exact targets. State machines have all states and transitions defined. Edge cases (what happens when the player does X during Y?) are addressed.

### Why This Matters

Ambiguous mechanics force engineers to become designers. When the GDD says "enemies get harder as the player progresses" without defining the scaling formula, the engineer must invent one. Their invention may not match the designer's intent, leading to rework. At scale, hundreds of micro-decisions by engineers accumulate into a game that feels different from what was designed.

### How to Check

1. For each mechanic, attempt to write pseudocode from the GDD description alone — where you get stuck is where the ambiguity is
2. Check for numeric specifications: damage ranges, cooldown timers, resource costs, probability distributions
3. Verify state machines are complete: for any entity with states (alive/dead, idle/attacking/stunned), are all transitions and conditions defined?
4. Look for weasel words: "appropriate," "reasonable," "balanced," "fun amount of" — these are not specifications
5. Check edge cases: what happens at zero resources? What happens when two effects trigger simultaneously? What happens when the player disconnects mid-action?
6. Verify that difficulty scaling has a formula or at minimum a reference curve, not just "enemies get harder"

### What a Finding Looks Like

- P0: "Combat damage formula is described as 'based on weapon power and enemy armor' with no formula. An engineer cannot implement this without inventing the math."
- P0: "The stealth system says 'enemies detect the player based on proximity and noise' but defines no detection radius, no noise levels, and no line-of-sight rules."
- P1: "Respawn timer is 'a few seconds' — specify the exact value or a range (3-5 seconds) so engineers and QA have a target."
- P2: "Item rarity tiers are named (Common, Rare, Epic, Legendary) but drop probability per tier is not specified."

---

## Pass 4: Progression Curve Feasibility

### What to Check

Leveling curves, power scaling, unlock pacing, and difficulty ramps are backed by math. Implicit assumptions about player behavior (session length, skill level, content consumption rate) are stated explicitly. The progression does not break at extremes (level 1, max level, 1000 hours played).

### Why This Matters

Progression curves that feel right on paper often break in implementation because implicit assumptions are wrong. "Players will reach level 10 after about 5 hours" assumes a session length, a combat encounter rate, and a success rate that may not match reality. When the curve breaks, it manifests as either a brick wall (players stuck at a difficulty spike) or a trivial coast (players over-leveled because the curve was too generous). Both kill retention.

### How to Check

1. Find the XP/level curve (or equivalent progression system) — is there a formula or table?
2. Calculate expected time-to-max-level given stated assumptions — is it achievable and desirable?
3. Check power scaling: does the player's power growth outpace enemy difficulty growth? (Power fantasy vs. challenge maintenance)
4. Verify unlock pacing: are new mechanics introduced at a rate the player can absorb? (Cognitive load)
5. Check for dead zones: level ranges with no new unlocks, abilities, or content
6. Test extremes: what does the game look like at level 1? At max level? After 1000 hours? After 10 minutes? Does the GDD address each?
7. If there is a skill-based component, verify that player skill growth is modeled (not just character power growth)

### What a Finding Looks Like

- P0: "XP curve is exponential but reward XP is flat. By level 30, a player needs 47 hours of grinding per level with no new content. The curve is not sustainable."
- P1: "Levels 15-25 introduce zero new abilities or mechanics. This 10-level dead zone will feel like a content drought."
- P2: "Session length assumption is not stated. The 5-hour-to-level-10 estimate could be 5 one-hour sessions or 1 five-hour session — the pacing implications differ significantly."

---

## Pass 5: Scope vs Reality Check

### What to Check

The total feature set, content volume, and mechanical complexity are achievable within the stated team size, timeline, and budget. Priorities are explicit — if scope must be cut, the GDD identifies what goes first.

### Why This Matters

Scope is the most common GDD failure mode. A document that describes 200 hours of content for a team of 5 with a 12-month timeline is fiction. When scope exceeds capacity, the result is either crunch (unsustainable), cut features (unplanned, reactive), or a delayed launch (budget overrun). Honest scope assessment at GDD stage prevents all three.

### How to Check

1. Count distinct mechanics, systems, and content types — each requires engineering, art, design, and QA time
2. Estimate content volume: how many levels, quests, items, enemies, abilities? Multiply by production time per unit
3. Compare total estimated effort against team size × timeline — is there a 2x+ gap?
4. Check for priority tiers (must-have, should-have, nice-to-have) — are they defined?
5. Identify the minimum viable game: what is the smallest set of features that delivers the core experience?
6. Look for scope traps: procedural generation promises (still requires content authoring tools), multiplayer (2-5x complexity multiplier), user-generated content (requires moderation tools)
7. Check for hidden dependencies: feature A requires feature B which requires feature C — the actual scope is triple the apparent scope

### What a Finding Looks Like

- P0: "GDD describes 12 biomes, 200 enemy types, 500 items, and a 40-hour campaign for a team of 4 in 18 months. Conservative estimates suggest this is 4-6x the available capacity."
- P1: "No priority tiers exist. If scope must be cut, there is no guidance on what goes first."
- P1: "Multiplayer is listed as a core feature but the scope estimate does not account for netcode, matchmaking, anti-cheat, or server infrastructure."
- P2: "Procedural level generation is described as 'reducing content creation costs' but the tool to author generation rules is not scoped."

---

## Pass 6: Competitive Differentiation

### What to Check

The GDD articulates what makes this game worth playing over existing alternatives. The differentiation is structural (different mechanics, novel combinations, underserved audience) rather than cosmetic (better art, more polish). Competitive analysis references specific titles and explains the positioning.

### Why This Matters

A game that is "like X but better" needs to be dramatically better to overcome X's existing audience, content library, and network effects. Structural differentiation — doing something competitors cannot easily copy — is the only sustainable advantage. If the GDD cannot articulate the differentiation clearly, the game will struggle to find its audience.

### How to Check

1. Find the competitive analysis or positioning section — does it exist?
2. Check that specific competitor titles are named (not "other games in the genre")
3. For each competitor, verify the GDD explains: what they do well, what they do poorly, and how this game occupies a different position
4. Verify the differentiation is mechanical or systemic, not just "better graphics" or "more content"
5. Check for audience definition: who is this game for that existing games are not serving?
6. Assess whether the differentiation survives competitor response — if a competitor can add this feature in a patch, it is not structural

### What a Finding Looks Like

- P0: "No competitive analysis section exists. The GDD does not explain why a player would choose this over the 5 existing games in the genre."
- P1: "Differentiation is described as 'better combat feel' — this is subjective and non-structural. Competitors can improve their combat feel in patches."
- P2: "Competitive analysis names genres but not specific titles. 'Unlike other roguelikes' should name Hades, Dead Cells, Slay the Spire and explain the specific positioning."

---

## Pass 7: Systems Interaction Audit

### What to Check

Mechanics that interact are identified. Their interactions are specified — not just "these systems connect" but exactly how changes in one propagate to another. Emergent behavior from system combinations is anticipated and either encouraged or constrained.

### Why This Matters

Unspecified system interactions are where exploits, balance-breaking combos, and undefined behavior live. When the combat system and the crafting system both modify the same stats without knowing about each other, the result is a 10,000-damage weapon that trivializes all content. Emergent behavior is desirable when designed for — and catastrophic when accidental.

### How to Check

1. Build an interaction matrix: list all systems on both axes, mark cells where they share state (health, currency, stats, items)
2. For each interaction, verify the GDD specifies: which system has priority? How do stacking effects resolve? Are there caps?
3. Check for buff/debuff stacking rules — what happens when 5 damage buffs are active simultaneously?
4. Look for economy interactions: can the player convert between resource types? Is there an arbitrage loop?
5. Check for state conflicts: what if the player is simultaneously stunned and invulnerable? Which takes precedence?
6. Verify that AI systems interact correctly with player systems — enemies should respect the same rules

### What a Finding Looks Like

- P0: "Crafting and combat both modify weapon damage but the GDD does not specify how crafted bonuses and combat buffs stack. Additive vs. multiplicative stacking produces wildly different outcomes."
- P1: "Five buff sources exist (gear, skills, consumables, environment, party auras) but no stacking cap is defined. Theoretical max damage is 50x base, which would one-shot any boss."
- P2: "The AI section does not specify whether enemies are subject to the same status effect rules as players. If enemies can be stunlocked, encounter design breaks."

---

## Finding Template

Use this template for all GDD review findings:

```markdown
### Finding: [Short description of the issue]

**Pass:** [Pass number] — [Pass name]
**Priority:** P0 | P1 | P2
**Location:** [GDD section and subsection]

**Issue:** [Specific description of what is wrong, with references to the GDD text.
Avoid subjective language — state the structural problem.]

**Evidence:** [Quote or reference the specific GDD content that demonstrates the issue.
For ambiguity findings, show what an engineer would need to know vs. what the GDD provides.
For scope findings, show the math.]

**Impact:** [What goes wrong during implementation if this is not fixed.
Be specific: "engineers will guess" or "the loop does not close" or "scope exceeds capacity by 3x."]

**Recommendation:** [Concrete action to resolve the finding. Not "add more detail" but
"specify the damage formula as: base_damage * weapon_multiplier * (1 - armor_reduction),
where armor_reduction = armor / (armor + 100)."]

**Trace:** [Which downstream artifacts or systems are affected by this finding]
```

### Example Finding

```markdown
### Finding: Combat damage formula is unspecified — engineers must invent the math

**Pass:** 3 — Mechanic Ambiguity Detection
**Priority:** P0
**Location:** GDD Section 4.2 "Combat Mechanics"

**Issue:** The combat section describes damage as "based on the weapon's power stat and
the enemy's armor stat" but provides no formula. Three different interpretations are
possible: subtractive (power - armor), multiplicative reduction (power * (1 - armor%)),
or threshold-based (power must exceed armor to deal damage). Each produces a
fundamentally different combat feel and balance curve.

**Evidence:** GDD Section 4.2: "When a player attacks, damage is calculated based on
the weapon's power and the target's armor. Critical hits deal bonus damage."
No formula, no numeric ranges for power/armor values, no critical hit multiplier.

**Impact:** The implementing engineer must choose a damage formula, which determines
the entire balance curve. If they choose subtractive, armor becomes a hard counter
at high values. If they choose multiplicative, armor provides diminishing returns.
This decision cascades into enemy design, item balance, and progression pacing.

**Recommendation:** Specify the formula explicitly:
  damage = (base_power * weapon_multiplier) * (100 / (100 + target_armor))
  critical_damage = damage * 1.5
  min_damage = 1 (attacks always deal at least 1 damage)
Provide reference values: starter weapon power ~10, endgame weapon power ~500,
starter enemy armor ~5, endgame enemy armor ~200.

**Trace:** GDD 4.2 → blocks enemy-design.md stat tables, items.md weapon balance,
progression.md difficulty curve
```

---

## Common Review Anti-Patterns

### 1. Pillar-Washing

Every mechanic claims pillar alignment by reinterpreting the pillar broadly enough to cover anything. "Strategic Depth" is claimed by the inventory sort button because "organizing items requires strategy." When every mechanic aligns, the pillars constrain nothing.

**How to spot it:** Ask "what mechanic was cut because of this pillar?" If the answer is "nothing," the pillar is not functioning as a constraint.

### 2. Describing Feelings Instead of Mechanics

The GDD spends paragraphs on how combat "should feel" (visceral, impactful, responsive) without specifying what the game actually does (hit-stop frames, screen shake intensity, input buffer window). Feelings are outcomes of mechanics, not specifications.

**How to spot it:** Highlight every adjective in the mechanic description. If removing the adjectives leaves no implementable detail, the section is aspirational, not specifying.

### 3. Assuming the Reader Shares Context

The GDD references "standard roguelike progression" or "Soulslike difficulty" without defining what those terms mean for this specific game. Genre conventions vary — one designer's "roguelike" includes permadeath while another's does not.

**How to spot it:** Look for genre labels used as specifications. Each genre reference should be expanded into specific mechanic decisions for this game.

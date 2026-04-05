<!-- eval-wip -->
---
name: game-design-document
description: GDD structure, game pillars, core loop design, mechanics documentation, and progression archetypes
topics: [game-dev, design, gdd, mechanics, progression]
---

A Game Design Document (GDD) is the authoritative source of truth for what a game is, how it plays, and why its systems exist. Unlike traditional software requirements docs, a GDD must capture the feel and fantasy of the experience alongside its mechanical specifications. A well-structured GDD prevents scope creep, aligns the team on creative vision, and serves as the contract between design, engineering, and art.

## Summary

### Game Pillars

Game pillars are the 3-5 non-negotiable design principles that guide every decision in development. They are phrased as "X over Y" tradeoffs to force clarity about what the game prioritizes when conflicts arise.

**Pillar craft rules:**

- Each pillar must be falsifiable — if its opposite is nonsensical, the pillar is too vague
- Pillars resolve conflicts: when two features compete for resources, the one aligned with more pillars wins
- Pillars are not features — "multiplayer" is a feature, "social connection over solo mastery" is a pillar
- Limit to 3-5; more than 5 means nothing is truly prioritized
- Revisit pillars only at major milestones, never mid-sprint

**Example pillar sets:**

- Dark Souls: "Challenge over accessibility," "Discovery over instruction," "Atmosphere over narrative"
- Stardew Valley: "Player expression over optimization," "Relaxation over challenge," "Community over competition"
- XCOM: "Consequence over convenience," "Tactical depth over action speed," "Emergent stories over scripted narrative"

### Core Loop

The core loop is the fundamental cycle of actions the player repeats most frequently. Every game has a primary loop (seconds-to-minutes), a secondary loop (minutes-to-hours), and often a tertiary loop (hours-to-sessions). Each loop feeds into the next.

**Core loop anatomy:**

1. **Input** — What the player does (move, shoot, place, select)
2. **Rules** — How the system processes the input (physics, damage calc, economy)
3. **Outcome** — What changes in the game state (enemy dies, resource gained, territory claimed)
4. **Feedback** — How the player perceives the outcome (animation, sound, UI change, screen shake)

A core loop is healthy when: every action has visible feedback within 200ms, outcomes feel proportional to skill/effort, and the loop itself is satisfying even without meta-progression.

### Mechanics Documentation

Every mechanic in the GDD must be documented with four components: inputs (what the player controls), rules (how the system resolves actions), outputs (what changes), and feedback (how the player perceives the change). Mechanics without all four components are incomplete and will be implemented inconsistently.

### Progression Archetypes

Games use one or more progression models to structure player advancement:

- **Linear** — Fixed sequence of levels/stages (e.g., Mario, Uncharted). Low design cost, high replayability risk.
- **Branching** — Player choices create divergent paths (e.g., Witcher, Mass Effect). Exponential content cost, high narrative agency.
- **Open-World** — Player chooses order and pacing (e.g., Breath of the Wild, Elden Ring). Requires careful gating and scaling.
- **Prestige/Ascension** — Player resets progress for permanent bonuses (e.g., Rogue Legacy, Cookie Clicker). Extends longevity cheaply.
- **Emergent** — No designed progression; player creates own goals (e.g., Minecraft, Dwarf Fortress). Requires rich systemic depth.

## Deep Guidance

### GDD Document Structure

A complete GDD follows a hierarchical structure that mirrors the game's design from vision down to individual mechanics. The document should be modular — each section can be read independently by the relevant discipline (art reads the aesthetic section, engineering reads the systems section).

```markdown
# [Game Title] — Game Design Document

## 1. Vision
### 1.1 Elevator Pitch
One paragraph. What is this game? Who is it for? Why will they care?

### 1.2 Game Pillars
- **[Pillar 1 Name]**: [X] over [Y] — [one sentence explanation]
- **[Pillar 2 Name]**: [X] over [Y] — [one sentence explanation]
- **[Pillar 3 Name]**: [X] over [Y] — [one sentence explanation]

### 1.3 Target Experience
What emotion or state should the player feel during a typical session?
Reference games, films, or other media that evoke similar feelings.

### 1.4 Unique Selling Proposition
What makes this game different from competitors? Be specific — not
"innovative gameplay" but "real-time base building inside turn-based combat."

## 2. Core Gameplay
### 2.1 Core Loop Diagram
[Visual or textual description of primary, secondary, and tertiary loops]

### 2.2 Player Actions
For each action: input method, rules governing resolution, possible
outcomes, feedback delivered to the player.

### 2.3 Win/Loss Conditions
How does the player succeed? How do they fail? Are there partial
success states?

## 3. Systems Design
### 3.1 Economy
Resources, currencies, sinks, faucets, exchange rates, inflation
controls.

### 3.2 Progression
Level structure, unlock trees, gating mechanics, difficulty curves.

### 3.3 Combat / Interaction
Damage model, stat interactions, ability system, AI behavior tiers.

### 3.4 Social Systems
Multiplayer modes, matchmaking rules, communication tools, anti-cheat.

## 4. Content
### 4.1 World / Setting
Lore, geography, factions, timeline.

### 4.2 Characters
Protagonist, antagonist, NPCs — motivations, arcs, gameplay roles.

### 4.3 Level / Mission Design
Level count, pacing chart, difficulty ramp, estimated play time.

### 4.4 Narrative Structure
Story beats, branching points, cutscene inventory.

## 5. Aesthetic Direction
### 5.1 Art Style
Reference images, color palette, proportions, silhouette rules.

### 5.2 Audio Direction
Music style, adaptive audio triggers, SFX priorities, voice acting scope.

### 5.3 UI/UX Philosophy
HUD philosophy (minimal vs. data-rich), menu flow, accessibility targets.

## 6. Technical Constraints
### 6.1 Target Platforms
Hardware, OS, minimum specs, performance budgets.

### 6.2 Engine & Middleware
Engine choice rationale, key middleware dependencies.

### 6.3 Networking Model
Client-server vs. P2P, tick rate, rollback vs. lockstep.

## 7. Scope & Milestones
### 7.1 Feature Priority Matrix
Must-have, should-have, nice-to-have for each milestone.

### 7.2 Content Budget
Asset counts by type, estimated production time per asset category.

### 7.3 Risk Register
Top 5 risks with likelihood, impact, and mitigation strategies.
```

### Writing Effective Mechanics Specifications

Each mechanic should be documented as a self-contained spec that any engineer can implement without ambiguity.

**Mechanic spec template:**

- **Name**: Clear, consistent label used across all documentation
- **Purpose**: Why this mechanic exists — which pillar does it serve?
- **Inputs**: Player actions that trigger this mechanic (button presses, gestures, selections)
- **Rules**: The exact processing logic
  - Formulas with named variables (e.g., `damage = base_attack * weapon_multiplier - target_armor`)
  - Edge cases explicitly called out (what happens at zero health? at max stack?)
  - Randomness specified with distribution type and range (e.g., "uniform random between 0.8 and 1.2")
- **Outputs**: State changes that result (HP reduced, item added, flag set)
- **Feedback**: Exactly what the player sees, hears, and feels
  - Visual: animation name, particle effect, UI indicator
  - Audio: sound effect trigger, music state change
  - Haptic: vibration pattern and duration (if applicable)
  - Camera: shake intensity, zoom, slow-motion duration
- **Interactions**: How this mechanic combines with or is modified by other mechanics
- **Tuning Parameters**: Variables designers will tweak post-implementation, with initial values and expected ranges

### Core Loop Worksheet

When designing a core loop, work through these questions for each loop tier:

**Primary loop (moment-to-moment):**
- What is the single most frequent player action? Can you describe it in 3 words or fewer?
- Is the action itself satisfying with no rewards attached? (If not, the loop will feel like a grind.)
- What is the feedback latency? (Target: under 100ms for primary actions.)
- How many distinct outcomes can a single action produce? (Too few = boring, too many = confusing.)

**Secondary loop (session-level):**
- What goal does the player pursue across multiple primary loop cycles?
- How does the player measure progress toward this goal?
- What is the average session length this loop implies? Does that match the target platform? (Mobile: 3-5 min, PC: 30-60 min, console: 20-45 min)
- What decision does the player make between secondary loop cycles? (Build order, loadout, path choice)

**Tertiary loop (meta-progression):**
- What persists between sessions?
- What new options does the player unlock over time?
- Is there a reset/prestige mechanic? At what threshold?
- How do you prevent power creep from trivializing early content?

### Progression Design Patterns

**Linear progression pitfalls:**
- Difficulty spikes from untested level ordering — playtest the sequence, not just individual levels
- No reason to replay — add scoring systems, time trials, or collectibles
- Content bottleneck — each level is a unique asset, making this the most expensive progression type per hour of gameplay

**Branching progression pitfalls:**
- Combinatorial explosion — if 3 choices each have 3 outcomes, you have 27 end states by level 3
- Meaningful choice illusion — if branches reconverge immediately, players feel cheated
- QA coverage gaps — rare paths get less testing and more bugs
- Mitigation: use a "wide funnel" — many choices early, converging to fewer late-game states

**Open-world progression pitfalls:**
- Level scaling paradox — if everything scales to the player, progression feels meaningless
- Content gating — hard gates feel artificial, soft gates (enemies too strong) feel punishing
- Waypoint fatigue — too many markers overwhelm; too few leave players aimless
- Mitigation: use "interest curves" — alternate dense and sparse areas, vary encounter types

**Prestige progression pitfalls:**
- The first reset is the hardest sell — the initial run must be long enough to invest, short enough to not resent losing progress
- Permanent bonuses must feel worth the reset — "+2% damage" is not compelling; "unlock a new character class" is
- Late-game prestige runs become trivially fast — this is a feature, not a bug (it creates the power fantasy)

### GDD Anti-Patterns

**The Novel** — A 200-page document that nobody reads. GDDs should be reference documents, not prose. Use tables, bullet points, and diagrams. If a section exceeds 3 pages, split it into a sub-document.

**The Wishlist** — Every cool idea makes the cut. A GDD without a "Rejected Ideas" section has no discipline. Document what you chose not to do and why.

**The Fossil** — Written once, never updated. A GDD that diverges from the actual game is worse than no GDD — it actively misleads. Assign a GDD owner who updates it weekly.

**The Ambiguity** — "Combat should feel satisfying." What does that mean? Every adjective in the GDD must be operationalized: "satisfying" means "hit feedback plays within 50ms, enemies stagger on every hit, damage numbers appear with screen shake proportional to damage dealt."

**The Island** — A GDD disconnected from production reality. Include technical constraints, asset budgets, and milestone targets directly in the GDD so design decisions account for production capacity.

### Pillar Validation Checklist

Use this checklist at every design review to verify features align with declared pillars:

1. For each proposed feature, identify which pillar(s) it serves
2. If a feature serves zero pillars, it does not belong in this game — cut it or revise a pillar
3. If two features conflict, the one aligned with more pillars wins
4. If a feature actively contradicts a pillar, it must be reworked or removed
5. Track pillar coverage: if one pillar has no features serving it, either the pillar is wrong or the feature set is incomplete
6. During playtesting, ask players to describe their experience — map their words to your pillars; misalignment means the implementation is not delivering on the pillar's promise

### Scoping the GDD by Project Size

**Game jam (48-72 hours):**
- Vision + Core Loop only. One page maximum.
- No progression system — the game is one session long.
- Pillars: 1-2 at most.

**Indie (3-18 months, 1-10 people):**
- Full GDD but concise. Target 10-20 pages.
- Focus on core loop and one progression system.
- Aesthetic direction can be a mood board, not a style guide.
- Technical constraints section is critical — small teams cannot afford bad tech choices.

**AA/AAA (1-5 years, 20-500+ people):**
- Full GDD becomes a living wiki, not a single document.
- Each system gets its own detailed design document (combat design doc, economy design doc, etc.).
- GDD serves as the index and the source of pillars, loops, and high-level vision.
- Requires a dedicated design owner per major system and a design director maintaining coherence.

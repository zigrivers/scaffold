---
name: game-ideation
description: Game-specific ideation techniques for spark — core loop, player fantasy, retention, session design, monetization
topics: [game-dev, ideation, core-loop, player-fantasy, retention, monetization, session-design]
---

Game ideation applies game-specific lenses — core loop, player fantasy, retention mechanics, session design, and monetization — to the spark tool's ideation flow. It supplements the general ideation-craft entry when a user is exploring a game idea.

## Summary

### Game Ideation Lenses
Five lenses to apply during idea exploration: **Core loop** (what the player does every 30 seconds), **Player fantasy** (the emotional experience, not mechanics), **Retention** (what brings players back), **Session design** (how long and how satisfying), **Monetization** (how the game sustains itself).

### Quick Tests
- **Core loop**: Can you describe it in one sentence without "and"?
- **Player fantasy**: Does every major mechanic reinforce it?
- **Retention**: What happens if the player leaves for a week?

## Deep Guidance

### Core Loop Identification
- **What is the core loop?** The repeating cycle of actions the player performs most often. In a shooter: aim → shoot → loot → repeat. In a puzzle game: observe → plan → execute → evaluate → repeat.
- **Ask the user**: "What does the player do every 30 seconds? Every 5 minutes? Every session?"
- **Test**: Can you describe the core loop in one sentence without using the word "and"? If not, it's too complex or undefined.

### Player Fantasy
- **What fantasy does the player live out?** Not the game mechanics — the emotional experience. "I am a powerful wizard" not "I cast spells with mana."
- **Ask the user**: "When the player tells their friend about your game, what do they say it feels like?"
- **Test**: Does every major mechanic reinforce the fantasy? If a mechanic exists but doesn't serve the fantasy, question why it's there.

### Retention Mechanics
- **Session hooks**: What brings the player back tomorrow? (Daily rewards, story cliffhangers, social obligations, unfinished goals)
- **Progression**: What does the player invest that makes leaving costly? (Character levels, base building, collection progress, social reputation)
- **Ask the user**: "What happens if the player doesn't open the game for a week? Do they lose anything? Miss anything?"

### Session Design
- **Session length**: How long is a typical play session? (Mobile: 3-5 min. PC: 30-90 min. Console: 60+ min.)
- **Session arc**: Does each session have a beginning, middle, and satisfying end? Can the player stop mid-session without frustration?
- **Ask the user**: "Where and when does your player play? Commute? Couch? Desk? This determines session length."

### Monetization Models
- **Premium**: Pay once, play forever. Best for narrative, creative, or skill-based games.
- **Free-to-play**: Free entry, monetize through cosmetics, battle pass, or convenience. Best for multiplayer/social games.
- **Subscription**: Recurring payment for ongoing content. Best for live-service games.
- **Ask the user**: "How does your player feel about spending money in your game? What would they pay for? What would feel unfair?"

### Applying Game Lenses During Spark Phases

**Phase 1 (Seed)**: Ask about the core loop and player fantasy early. These are the foundation — if they're unclear, everything else is built on sand.

**Phase 2 (Research)**: Research competitors through a game lens. For each competitor: What's their core loop? What fantasy do they deliver? How do they monetize? What's their session design? Where do player reviews complain?

**Phase 3 (Expand)**: Use game-specific expansion angles:
- "What if the core loop had a social/multiplayer dimension?"
- "What if you added a metagame layer on top of the core loop?"
- "What platform would change the experience most? (Mobile → PC, or vice versa)"
- "What if monetization was through player-created content?"

**Phase 4 (Challenge)**: Challenge through game-specific risk lenses:
- "Core loop fatigue — will this still be fun after 100 hours?"
- "Monetization pressure — does the business model conflict with the player fantasy?"
- "Scope vs. team — can a [team size] team build this in [timeline]?"
- "Platform expectations — does the session design match the platform's usage patterns?"

### Game-Specific Brief Sections

When writing the spark brief for a game idea, adapt sections:
- **Idea & Problem Space** → Include the core loop and player fantasy
- **Landscape** → Frame competitors by core loop and fantasy, not just features
- **Expansion Ideas** → Tag which ideas affect the core loop vs. metagame vs. content
- **Risks** → Include core loop fatigue, monetization/fantasy tension, and scope risks

### Scoping by Project Scale

| Scale | Core loop | Content depth | Monetization | Session design |
|-------|-----------|---------------|-------------|----------------|
| Game jam (48-72h) | One mechanic, tight loop | Minimal — procedural or template | None (free) | 5-15 min total |
| Indie (solo/small team) | 1-2 mechanics, polished | Handcrafted, limited scope | Premium or F2P with cosmetics | 15-60 min sessions |
| AA/studio | Multiple interlocking systems | Extensive content pipeline | Any model, balanced | Platform-appropriate |

### Common Game Ideation Anti-Patterns

- **The Kitchen Sink**: Trying to combine too many mechanics before any one is fun. Focus the core loop first.
- **Fantasy Mismatch**: The monetization model undermines the player fantasy. (Pay-to-win in a skill-based competitive game.)
- **Platform Blindness**: Designing a 90-minute session game for mobile, or a 3-minute session for PC/console.
- **Retention Treadmill**: Relying on FOMO and daily login rewards instead of intrinsic motivation. Players resent obligation.
- **Scope Denial**: "We'll just add multiplayer later." Multiplayer is an architecture decision, not a feature toggle.
- **Clone Trap**: "Like [popular game] but with [small twist]." The twist must be fundamental enough to justify switching costs.

### Core Loop Evaluation Worksheet

When evaluating a proposed core loop, walk through these questions:

1. **Primary loop**: What does the player do every 30 seconds? Is it inherently satisfying?
2. **Secondary loop**: What does the player do every 5 minutes? Does it give meaning to the primary loop?
3. **Tertiary loop**: What does the player do every session? Does it create a sense of progress?
4. **Friction test**: Remove one mechanic from the loop. Does the game still work? If yes, that mechanic may be unnecessary.
5. **Fantasy alignment**: Does every step in the loop reinforce the player fantasy? If a step breaks immersion, redesign it.
6. **Depth test**: Can a skilled player execute the loop differently than a novice? If not, the loop may lack depth.
7. **Social test**: Would watching someone else do this loop be entertaining? If not, the loop may lack spectacle or surprise.

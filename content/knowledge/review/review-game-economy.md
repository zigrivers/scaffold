---
name: review-game-economy
description: Failure modes and review passes specific to game economy design — inflation trajectories, exploit vectors, monetization ethics, and legal compliance
topics: [game-dev, review, economy, balance, monetization, legal]
---

# Review: Game Economy

A game economy document must define sustainable resource flows, prevent exploitable states, maintain fair monetization, and comply with legal requirements per target market. It must be mathematically grounded — not "we will balance in testing" — because economy bugs discovered in live service cost orders of magnitude more to fix than those caught at design time. This review uses 7 passes targeting the specific ways game economies fail.

Follows the review process defined in `review-methodology.md`.

## Summary

- **Pass 1 — Inflation/Deflation Trajectory**: Currency generation and removal rates are modeled over time; the economy has a steady-state or managed inflation plan, not unchecked growth.
- **Pass 2 — Exploit Vector Identification**: Duplication, overflow, timing, and conversion exploits are identified and mitigated at design level; no reliance on "we will detect it in production."
- **Pass 3 — Ethical Monetization Compliance**: Real-money transactions are transparent, non-predatory, and do not create pay-to-win advantages; vulnerable player protections exist.
- **Pass 4 — Pay-to-Win Detection**: Purchased items/boosts are analyzed for competitive impact; no real-money path provides an advantage unobtainable through gameplay within reasonable time.
- **Pass 5 — Legal Compliance Per Market**: Probability disclosure, age-gating, spending limits, and loot box regulations are addressed for every target market.
- **Pass 6 — Earn Rate vs Engagement Projection**: Time-to-earn for desirable items is modeled against target session length and retention curves; no "1000-hour grind wall" that kills retention.
- **Pass 7 — Sink Effectiveness Analysis**: Currency and item sinks are sufficient, desirable, and do not feel punitive; the economy does not rely on a single fragile sink.

## Deep Guidance

---

## Pass 1: Inflation/Deflation Trajectory

### What to Check

The economy document models currency generation (faucets) and removal (sinks) over the player lifecycle. Faucet rates, sink rates, and the resulting currency stock trajectory are quantified. The economy has either a designed steady-state or a managed inflation plan with explicit milestones.

### Why This Matters

Unchecked inflation makes all rewards feel worthless — when every player has millions of gold, a 10,000 gold quest reward means nothing. Unchecked deflation makes the game feel stingy — players cannot afford the items they need to progress. Both kill engagement. The economy document must model the trajectory over months (not just the first 10 hours) because inflation is a cumulative problem that compounds over time.

### How to Check

1. Identify all faucets (sources of currency/resources): quest rewards, enemy drops, daily login bonuses, achievement rewards, trading income
2. Identify all sinks (removals of currency/resources): item purchases, upgrade costs, repair costs, consumables, trading fees, taxes
3. Calculate net flow: total faucet rate minus total sink rate per unit time (per hour, per day, per week)
4. Model the trajectory over 30 days, 90 days, 365 days — does the currency stock grow unboundedly?
5. Check for endgame faucets: do high-level players continue earning at the same rate without corresponding endgame sinks?
6. Verify that the document explicitly addresses inflation management: progressive sink costs, currency resets (seasons), or deflationary mechanisms
7. Check for multi-currency interactions: if soft currency converts to hard currency, inflation in one propagates to both

### What a Finding Looks Like

- P0: "Daily quest rewards generate 5,000 gold/day at endgame. The most expensive sink is a 50,000 gold weapon upgrade. After 10 days, a player has purchased every sink and gold accumulates without bound."
- P1: "Currency generation rates are defined but no sink costs are documented. Without sinks, the economy inflates from day one."
- P1: "Seasonal resets are mentioned as an inflation control but no reset mechanism is specified. Does the player lose currency? Items? Both?"
- P2: "Free-to-play currency and premium currency are separately modeled but their exchange rate is not analyzed for inflation propagation."

---

## Pass 2: Exploit Vector Identification

### What to Check

The economy design is analyzed for exploit vectors: duplication bugs, integer overflow, timing exploits (race conditions in trades), conversion loops (buy item A with currency X, sell for currency Y at a profit), and edge case abuse (zero-cost transactions, negative quantities). Mitigations are designed into the system, not added post-launch.

### Why This Matters

Economy exploits in live games cause catastrophic damage. A duplication bug can flood the economy with items in hours, destroying the value of every legitimate player's inventory. Unlike gameplay bugs (which affect one player at a time), economy exploits have network effects — one exploiter damages every player's experience. Design-level mitigations (server-authoritative transactions, atomic operations, rate limits) are dramatically cheaper than post-launch remediation.

### How to Check

1. For every transaction type, verify it is server-authoritative (client cannot dictate transaction outcome)
2. Check for duplication vectors: can an item exist in two locations simultaneously during a trade? Can a disconnect during a transaction leave both parties with the item?
3. Verify integer bounds: what happens when currency reaches MAX_INT? When quantity is set to -1? When price is 0?
4. Check for timing exploits: can two transactions on the same resource execute simultaneously (double-spend)?
5. Identify conversion loops: map every A→B currency/item conversion and check for profitable cycles (A→B→C→A where the player ends with more A than they started)
6. Check for refund exploits: can a player buy, use, and then refund for full value?
7. Verify rate limits on: trades per hour, purchases per day, gifts per account, currency generation per session

```markdown
## Exploit Vector Audit Template

### Transaction: [Name of transaction type]

**Flow:** [Step-by-step transaction sequence]

| Vector              | Risk   | Mitigation in Design | Status    |
|---------------------|--------|----------------------|-----------|
| Duplication         | High   | [Mitigation or NONE] | ✅ / ❌   |
| Integer overflow    | Medium | [Mitigation or NONE] | ✅ / ❌   |
| Race condition      | High   | [Mitigation or NONE] | ✅ / ❌   |
| Conversion loop     | Medium | [Mitigation or NONE] | ✅ / ❌   |
| Negative quantity   | Low    | [Mitigation or NONE] | ✅ / ❌   |
| Refund abuse        | Medium | [Mitigation or NONE] | ✅ / ❌   |
| Rate limit bypass   | Medium | [Mitigation or NONE] | ✅ / ❌   |

**Unmitigated vectors:** [List any ❌ items]
**Residual risk:** [Assessment]
```

### What a Finding Looks Like

- P0: "Player-to-player trading is described but no atomicity guarantee is specified. If one player disconnects mid-trade, both players could retain their original items AND receive the traded items — classic duplication bug."
- P0: "Currency is stored as a 32-bit integer with no overflow check. A player accumulating 2,147,483,647 gold who earns 1 more gold wraps to -2,147,483,648, losing their entire balance."
- P1: "Items can be listed on the marketplace and simultaneously equipped. No lock prevents the item from being in two states, enabling sell-then-use exploits."
- P2: "Gift system has no rate limit. An automated account could gift currency to a main account at 1000 transactions per second."

---

## Pass 3: Ethical Monetization Compliance

### What to Check

Real-money transactions are transparent in their outcomes, do not exploit psychological vulnerabilities, do not create compulsive spending patterns, and include protections for vulnerable players (minors, players with gambling disorders). Monetization design follows industry ethical guidelines and avoids dark patterns.

### Why This Matters

Predatory monetization damages players and invites regulatory action. Games targeting minors with loot boxes face legislation in Belgium, Netherlands, and increasingly worldwide. Even in unregulated markets, predatory monetization erodes player trust, generates negative press, and reduces lifetime value as players leave or refund. Ethical monetization is both the right thing to do and the commercially sustainable approach.

### How to Check

1. For every real-money purchase, verify the player knows exactly what they get before buying (no surprise mechanics)
2. Check for dark patterns: artificial urgency (limited-time offers with countdown timers), artificial scarcity ("only 3 left!"), sunk cost exploitation ("you have already spent $50, spend $10 more to complete the set")
3. Verify that spending limits exist: daily, weekly, or monthly caps with opt-in override
4. Check for minor protections: parental controls, age-gating on purchases, spending limits for minor accounts
5. Verify that randomized purchases (loot boxes, gacha) disclose exact probabilities
6. Check for "whale" mechanics: purchases that provide escalating value to high spenders without bounds (spend $10,000 to be the strongest player)
7. Verify that the game is fully playable without spending money — monetization enhances but does not gate core content

### What a Finding Looks Like

- P0: "Loot boxes exist with no probability disclosure. Players spend real money without knowing the odds of receiving desired items."
- P0: "No spending limit mechanism exists. A player (potentially a minor) can spend unlimited money in a single session."
- P1: "Battle pass includes a 'buy levels' option with no cap. A player could spend $500 to skip the entire pass on launch day."
- P2: "Limited-time offers use countdown timers and 'last chance' language — these are artificial urgency dark patterns."

---

## Pass 4: Pay-to-Win Detection

### What to Check

Every item, boost, or advantage available for real money is analyzed for its competitive impact. No purchase provides a meaningful advantage in PvP or competitive contexts that cannot be earned through gameplay within a reasonable timeframe.

### Why This Matters

Pay-to-win destroys competitive integrity and drives away non-paying players. When a $20 weapon is 50% stronger than the best farmable weapon, competitive outcomes are determined by spending, not skill. Non-paying players leave, paying players have no one to compete against, and the game enters a death spiral. Even in PvE games, excessive pay-to-win erodes the sense of accomplishment.

### How to Check

1. List every item/boost purchasable with real money (directly or via premium currency)
2. For each, find its closest free-to-play equivalent — what is the stat difference?
3. If the purchased item has no free equivalent, flag as pay-to-win
4. For items with free equivalents, calculate the time-to-earn — if it exceeds 100 hours for a single item, the free path is effectively gated
5. Check for PvP impact: do purchased items appear in PvP contexts? If yes, is matchmaking separated by gear score/spending level?
6. Check for "soft pay-to-win": items that provide convenience advantages (faster travel, inventory expansion, energy refills) that compound into meaningful competitive edges
7. Verify that seasonal/competitive rankings are not influenced by purchased advantages

### What a Finding Looks Like

- P0: "Premium weapon deals 2x damage of the best farmable weapon and is usable in PvP. Competitive outcomes are determined by spending."
- P1: "XP boost purchasable for $5 provides 2x XP for 24 hours. In competitive PvP with level-based matchmaking, paying players reach maximum level weeks earlier and dominate lower-level lobbies."
- P1: "Energy system gates gameplay to 30 minutes per session unless the player purchases energy refills. Competitive events require hours of play, making refills effectively mandatory."
- P2: "Inventory expansion is purchasable. Players with more inventory can carry more consumables into competitive modes — investigate if this creates a meaningful advantage."

---

## Pass 5: Legal Compliance Per Market

### What to Check

The economy design complies with legal requirements in every target market. Probability disclosure for randomized purchases, age-gating, spending limits for minors, refund policies, and specific national regulations (Belgium loot box ban, China probability disclosure, Japan kompu gacha ban) are addressed.

### Why This Matters

Non-compliance with gambling and consumer protection laws results in platform delisting (Apple/Google removing the game), regulatory fines (up to millions of dollars), and forced game modifications that may require redesigning the economy mid-live-service. Legal compliance must be designed in, not patched in — an economy built around loot boxes that is later forced to disclose probabilities or ban them entirely requires a fundamental redesign.

### How to Check

1. List all target markets from the publishing plan
2. For each market, verify relevant regulations are addressed:
   - **EU/Belgium/Netherlands**: Loot boxes may be classified as gambling; paid randomized mechanics may be banned outright
   - **China**: Probability disclosure mandatory for all randomized purchases; real-name authentication required; minor playtime limits
   - **Japan**: Kompu gacha (complete gacha) banned; individual gacha requires probability disclosure
   - **South Korea**: Probability disclosure mandatory; refund requirements for minors
   - **US (state-level)**: Evolving legislation on loot boxes; FTC scrutiny on deceptive monetization
   - **Australia**: Loot boxes under gambling law scrutiny; ACCC consumer protection applies
3. Verify that probability disclosure is present for ALL randomized purchases, regardless of current market requirements (defensive compliance)
4. Check minor protections per market: age verification, parental consent, spending caps
5. Verify that the economy can function if loot boxes are removed entirely (contingency for regulatory changes)
6. Check content rating alignment: monetization mechanics that trigger higher age ratings (simulated gambling)

### What a Finding Looks Like

- P0: "Game targets Belgium but includes paid loot boxes. Belgium classifies these as gambling — the game cannot ship in this market without redesign or market exclusion."
- P0: "China is a target market but no probability disclosure exists for gacha mechanics. This is a legal requirement, not optional."
- P1: "Game targets South Korea but no minor refund mechanism is documented. Korean law requires refunds for minors' purchases under certain conditions."
- P2: "Probability disclosure exists for character gacha but not for cosmetic gacha. All randomized purchases need disclosure, not just the primary system."

---

## Pass 6: Earn Rate vs Engagement Projection

### What to Check

Time-to-earn for desirable items/upgrades is modeled against target session length and expected retention curves. The earn rate creates a satisfying progression pace — not so fast that content is exhausted, not so slow that players hit a "grind wall" and quit.

### Why This Matters

Earn rate is the primary lever for player retention. Too generous and players exhaust content in a week, reducing long-term engagement. Too stingy and players feel the game respects their time less than competitors. The sweet spot depends on session length (mobile: 5-15 min, PC/console: 30-120 min) and competitive earn rates in the genre. An earn rate designed without engagement modeling is a guess.

### How to Check

1. For the top 10 most desirable items/upgrades, calculate time-to-earn assuming average gameplay
2. Map time-to-earn against target session length: how many sessions to earn each item?
3. Verify that earn rate creates regular "reward moments" — at least one meaningful reward per session
4. Check for grind walls: points where time-to-earn spikes dramatically without new content to sustain engagement
5. Compare earn rates to genre competitors: is this game more or less generous? Is the delta intentional and justified?
6. Verify that earn rates are modeled for different player segments: casual (1 session/day), regular (3 sessions/day), hardcore (8+ hours/day)
7. Check that endgame earn rates do not crater — reaching max level should not make earning feel pointless

### What a Finding Looks Like

- P0: "The legendary weapon requires 200 hours of farming a single activity. Average session length is 45 minutes. This is 267 sessions — nearly a year of daily play for one item."
- P1: "Earn rate for the first 20 hours is generous (new item every 30 minutes) but drops to one item per 10 hours at midgame. The cliff will cause a retention drop."
- P2: "Earn rate modeling assumes 2-hour sessions but the target audience is mobile with 15-minute sessions. Per-session reward frequency needs recalculation."

---

## Pass 7: Sink Effectiveness Analysis

### What to Check

Currency and item sinks are sufficient to control inflation, desirable enough that players use them voluntarily, and distributed so the economy does not depend on a single fragile sink. Sinks that feel punitive (arbitrary taxes, forced item degradation) are identified and reconsidered.

### Why This Matters

Sinks that players avoid are not sinks — they are design fiction. If the primary gold sink is a 10% auction house tax that players circumvent by trading directly, the sink does not function and inflation continues unchecked. Effective sinks provide value to the player (upgrades, cosmetics, convenience) so that spending currency feels like a reward, not a penalty. The economy should never depend on a single sink — if that sink fails (players stop using it), the entire economy inflates.

### How to Check

1. List all sinks: upgrade costs, repair costs, consumables, cosmetic purchases, trading fees, respec costs, housing/customization, event entries
2. For each sink, estimate the percentage of generated currency it absorbs — does the total absorption match generation?
3. Check for sink desirability: does the player want to spend, or are they forced to? Forced sinks create resentment
4. Verify sink diversity: no single sink should absorb more than 40% of total currency generation
5. Check for sink bypass: can players avoid the sink without meaningful cost? (Direct trading to avoid auction house fees)
6. Verify that sinks scale with progression — early-game sinks that become trivially cheap at endgame do not control endgame inflation
7. Check for "feels bad" sinks: durability loss, death penalties, random item destruction — these need careful justification

### What a Finding Looks Like

- P0: "The only meaningful sink is equipment repair (70% of all gold removal). If players find a way to avoid repair (or if repair costs are reduced in a balance patch), the economy inflates immediately."
- P1: "Cosmetic shop is listed as a gold sink but prices are not specified. Without prices, it is impossible to model whether this sink absorbs meaningful currency."
- P2: "Item destruction on failed upgrade is listed as a sink. While effective for inflation control, this is a 'feels bad' mechanic that needs a player sentiment assessment."

---

## Common Review Anti-Patterns

### 1. Spreadsheet Economy Without Player Psychology

The economy document presents a mathematically balanced spreadsheet — faucets equal sinks, inflation is zero — but ignores player behavior. Players do not behave like rational economic agents. They hoard currency "just in case," avoid sinks they perceive as unfair, and exploit any conversion path that is even slightly profitable. An economy that balances on paper but ignores behavioral economics will fail in practice.

**How to spot it:** The economy document has extensive math but no references to player psychology, hoarding behavior, loss aversion, or behavioral economics. The model assumes players spend currency as fast as they earn it.

### 2. Monetization Section Separate from Economy Section

The economy document models the free-to-play economy in isolation, and the monetization plan exists in a separate document. The interaction between purchased currency injection and the free economy is unanalyzed. Premium currency creates inflation in the free economy when it converts to gold, but this is not modeled.

**How to spot it:** The economy document does not mention real-money purchases. The monetization document does not model impact on the free economy. No cross-reference between the two documents exists.

### 3. "We Will Balance in Beta"

The economy document defers all numeric values to "balancing during beta testing." While tuning in beta is essential, it requires a starting point. Without initial values grounded in math and genre benchmarks, beta testing starts from random values and requires many more iterations to converge. Design-time modeling reduces beta iteration cycles from months to weeks.

**How to spot it:** Numeric fields in the economy document contain "TBD," "to be determined during testing," or "placeholder." More than 30% of critical values are unspecified.

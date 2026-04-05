<!-- eval-wip -->
---
name: game-economy-design
description: Virtual currency design, faucet/sink balancing, loot table probability, monetization models, and ethical monetization patterns
topics: [game-dev, economy, monetization, loot-tables, balance, f2p]
---

Game economy design governs how players earn, spend, and value in-game resources and how the studio monetizes those systems. A well-designed economy creates meaningful choices — players decide what to spend resources on, creating engagement. A poorly designed economy either trivializes resources (inflation makes everything cheap) or frustrates players (everything feels unattainable). Monetization layers add a second dimension: real money must integrate with virtual economies without destroying the earned-value perception that makes the economy work.

## Summary

### Virtual Currency Design

Most games with economies use at least two currency tiers:

- **Soft currency**: Earned freely through gameplay (gold, coins, credits). Abundant faucets, many sinks. Players should never feel completely starved of soft currency.
- **Hard currency** (premium): Purchased with real money or earned in small quantities through milestones. Fewer faucets, high-value sinks (cosmetics, time-skips, premium items). This is the monetization lever.

Separating currencies prevents direct dollar-to-gameplay equivalence, which regulators and players scrutinize. Never allow hard currency to purchase competitive advantages in PvP contexts — this crosses into pay-to-win territory.

### Faucet/Sink Balancing

Every economy has faucets (sources of currency entering the system) and sinks (drains removing currency). When faucets exceed sinks, inflation occurs and currency becomes worthless. When sinks exceed faucets, deflation makes the game feel punishing. The goal is a steady state where players always have meaningful spending decisions.

Track currency generation and consumption per player-hour. A healthy economy has a target "time to purchase" for key items: if the best sword costs 10,000 gold and players earn 500 gold/hour, the time-to-purchase is 20 hours. Adjust faucets and sinks to hit target purchase timelines.

### Loot Table Probability

Loot tables define drop rates for items from enemies, chests, or gacha pulls. Transparency matters: China requires probability disclosure by law, and player trust erodes quickly when drop rates feel manipulated. Use weighted random selection with published rates for any monetized loot mechanic.

### Monetization Models

- **Premium (buy-to-play)**: One-time purchase, all content included. DLC/expansions sold separately. No predatory pressure. Revenue is front-loaded.
- **Free-to-play (F2P)**: Free entry, monetized through cosmetics, convenience, or content gates. Revenue is ongoing but depends on conversion rates (typically 2-5% of players spend money).
- **Hybrid**: Premium purchase with optional cosmetic microtransactions. Increasingly common (e.g., Helldivers 2, Diablo IV).

### Legal Landscape

- **China**: Probability disclosure is mandatory for any randomized paid mechanic. Published rates must match actual implementation.
- **Belgium/Netherlands**: Post-2022 FIFA loot box ruling nuanced the landscape. Belgium's Gaming Commission targeted specific implementations (FIFA Ultimate Team) rather than issuing a blanket loot box ban. The Netherlands situation shifted after court rulings; enforcement depends on whether the mechanic meets gambling criteria (prize, chance, stake). Neither country has a simple "loot boxes are banned" law — the legal test is whether the specific implementation constitutes gambling under existing frameworks.
- **COPPA (US)**: Games directed at children under 13 face strict data collection and monetization rules. Purchases require verifiable parental consent. Aggressive monetization targeting children invites FTC scrutiny regardless of COPPA technical compliance.

## Deep Guidance

### Faucet/Sink Math

A game economy is a system of flows. Model it as a spreadsheet before implementing it in code.

```typescript
// Economy simulation framework
// Model faucets and sinks as rates per player-hour

interface EconomyConfig {
  currencies: CurrencyConfig[];
  faucets: Faucet[];
  sinks: Sink[];
}

interface CurrencyConfig {
  id: string;
  name: string;
  startingBalance: number;
  maxBalance: number;        // Soft cap — excess goes to overflow or is lost
  decimalPlaces: 0 | 2;     // 0 for integer currencies, 2 for float
}

interface Faucet {
  id: string;
  currencyId: string;
  amountPerEvent: number;
  eventsPerHour: number;     // Average occurrences per player-hour
  variance: number;          // 0-1, randomness factor
  description: string;
}

interface Sink {
  id: string;
  currencyId: string;
  cost: number;
  purchasesPerHour: number;  // Average purchases per player-hour
  required: boolean;         // Is this sink mandatory (repair) or optional (cosmetic)?
  description: string;
}

// --- Simulation ---

function simulateEconomy(
  config: EconomyConfig,
  hoursToSimulate: number,
  playerCount: number
): SimulationResult {
  const results: SimulationResult = {
    hourlySnapshots: [],
    inflationRate: 0,
    medianBalance: 0,
    timeToPurchase: new Map(),
  };

  for (const currency of config.currencies) {
    let totalGenerated = 0;
    let totalSpent = 0;

    for (const faucet of config.faucets.filter(f => f.currencyId === currency.id)) {
      const hourlyGeneration = faucet.amountPerEvent * faucet.eventsPerHour;
      totalGenerated += hourlyGeneration * hoursToSimulate;
    }

    for (const sink of config.sinks.filter(s => s.currencyId === currency.id)) {
      const hourlySpend = sink.cost * sink.purchasesPerHour;
      totalSpent += hourlySpend * hoursToSimulate;
    }

    const netFlow = totalGenerated - totalSpent;
    const inflationRate = netFlow / Math.max(totalGenerated, 1);

    // HEALTHY: inflation rate between -0.1 and 0.1 (10% either direction)
    // WARNING: inflation rate between 0.1 and 0.3 or -0.1 and -0.3
    // CRITICAL: inflation rate beyond +-0.3
    results.inflationRate = inflationRate;
    results.medianBalance = currency.startingBalance + netFlow / playerCount;

    // Calculate time-to-purchase for each sink
    for (const sink of config.sinks.filter(s => s.currencyId === currency.id)) {
      const hourlyNet = (totalGenerated - totalSpent) / hoursToSimulate;
      const hourlyEarnings = totalGenerated / hoursToSimulate;
      const ttp = sink.cost / hourlyEarnings;
      results.timeToPurchase.set(sink.id, ttp);
    }
  }

  return results;
}

interface SimulationResult {
  hourlySnapshots: number[];
  inflationRate: number;
  medianBalance: number;
  timeToPurchase: Map<string, number>;
}

// --- Example: RPG economy ---

const rpgEconomy: EconomyConfig = {
  currencies: [
    { id: "gold", name: "Gold", startingBalance: 100, maxBalance: 999999, decimalPlaces: 0 },
  ],
  faucets: [
    { id: "quest-rewards", currencyId: "gold", amountPerEvent: 200, eventsPerHour: 1.5, variance: 0.2, description: "Quest completion rewards" },
    { id: "enemy-drops", currencyId: "gold", amountPerEvent: 15, eventsPerHour: 30, variance: 0.5, description: "Gold dropped by defeated enemies" },
    { id: "item-sales", currencyId: "gold", amountPerEvent: 50, eventsPerHour: 3, variance: 0.3, description: "Selling loot to vendors" },
    { id: "daily-login", currencyId: "gold", amountPerEvent: 100, eventsPerHour: 0.5, variance: 0, description: "Daily login bonus (prorated per hour assuming 2hr sessions)" },
  ],
  sinks: [
    { id: "equipment", currencyId: "gold", cost: 500, purchasesPerHour: 0.2, required: false, description: "Buying weapons and armor" },
    { id: "consumables", currencyId: "gold", cost: 30, purchasesPerHour: 5, required: true, description: "Health potions, ammo, etc." },
    { id: "repairs", currencyId: "gold", cost: 75, purchasesPerHour: 0.5, required: true, description: "Equipment repair costs" },
    { id: "upgrades", currencyId: "gold", cost: 1000, purchasesPerHour: 0.05, required: false, description: "Upgrade slots on equipment" },
    { id: "fast-travel", currencyId: "gold", cost: 25, purchasesPerHour: 1, required: false, description: "Fast travel between locations" },
  ],
};

// Hourly faucet total: (200*1.5) + (15*30) + (50*3) + (100*0.5) = 300 + 450 + 150 + 50 = 950 gold/hr
// Hourly sink total: (500*0.2) + (30*5) + (75*0.5) + (1000*0.05) + (25*1) = 100 + 150 + 37.5 + 50 + 25 = 362.5 gold/hr
// Net flow: +587.5 gold/hr — INFLATIONARY, needs stronger sinks or weaker faucets
```

### Loot Table Design

Loot tables use weighted random selection. Each item has a weight, and the probability of dropping is its weight divided by the total weight of all items in the table.

```typescript
// Loot table with weighted random selection and pity system

interface LootTableEntry {
  itemId: string;
  weight: number;          // Relative weight (NOT percentage)
  rarity: "common" | "uncommon" | "rare" | "epic" | "legendary";
  maxPerDrop: number;      // Maximum times this item can appear in one drop
}

interface LootTable {
  id: string;
  entries: LootTableEntry[];
  guaranteedDrops: number; // Minimum items per roll
  bonusDropChance: number; // Probability of additional items (0-1)
  maxDrops: number;        // Maximum total items per roll
  pityCounter?: PityConfig;
}

interface PityConfig {
  // After N rolls without a rare+ item, guarantee one
  rareThreshold: number;   // Rolls without rare → guarantee rare
  epicThreshold: number;   // Rolls without epic → guarantee epic
  legendaryThreshold: number;
}

function rollLootTable(table: LootTable, playerPity: PityState): LootDrop[] {
  const drops: LootDrop[] = [];
  const totalWeight = table.entries.reduce((sum, e) => sum + e.weight, 0);

  // Check pity system first
  if (table.pityCounter && playerPity.rollsSinceLastLegendary >= table.pityCounter.legendaryThreshold) {
    const legendaries = table.entries.filter(e => e.rarity === "legendary");
    if (legendaries.length > 0) {
      drops.push(selectWeightedFrom(legendaries));
      playerPity.rollsSinceLastLegendary = 0;
    }
  }

  // Guaranteed drops
  for (let i = drops.length; i < table.guaranteedDrops; i++) {
    drops.push(selectWeighted(table.entries, totalWeight));
  }

  // Bonus drops
  while (drops.length < table.maxDrops && Math.random() < table.bonusDropChance) {
    drops.push(selectWeighted(table.entries, totalWeight));
  }

  // Update pity counters
  const hasRare = drops.some(d => ["rare", "epic", "legendary"].includes(d.rarity));
  const hasLegendary = drops.some(d => d.rarity === "legendary");
  playerPity.rollsSinceLastRare = hasRare ? 0 : playerPity.rollsSinceLastRare + 1;
  playerPity.rollsSinceLastLegendary = hasLegendary ? 0 : playerPity.rollsSinceLastLegendary + 1;

  return drops;
}

function selectWeighted(entries: LootTableEntry[], totalWeight: number): LootDrop {
  let roll = Math.random() * totalWeight;
  for (const entry of entries) {
    roll -= entry.weight;
    if (roll <= 0) {
      return { itemId: entry.itemId, rarity: entry.rarity };
    }
  }
  // Fallback (should never reach due to floating point)
  const last = entries[entries.length - 1];
  return { itemId: last.itemId, rarity: last.rarity };
}

function selectWeightedFrom(subset: LootTableEntry[]): LootDrop {
  const total = subset.reduce((s, e) => s + e.weight, 0);
  return selectWeighted(subset, total);
}

interface PityState {
  rollsSinceLastRare: number;
  rollsSinceLastLegendary: number;
}

interface LootDrop {
  itemId: string;
  rarity: string;
}

// Published probability disclosure (required in China, good practice everywhere)
// Given a table with weights: common=700, uncommon=200, rare=70, epic=25, legendary=5
// Total weight: 1000
// Probabilities: common=70%, uncommon=20%, rare=7%, epic=2.5%, legendary=0.5%
// With pity at 200 rolls: effective legendary rate is higher than 0.5%
```

### Battle Pass Structure

Battle passes are a retention mechanic: players purchase a pass and unlock rewards by playing over a defined season. The design must balance accessibility (casual players can complete it) with aspiration (dedicated players feel rewarded).

**Key design parameters:**
- **Season length**: 8-12 weeks is standard. Shorter seasons feel rushed; longer seasons lose urgency.
- **Total XP required**: Calculate backwards from target playtime. If the goal is 1 hour/day for 80% of the season, total XP = (daily XP rate) * (season days * 0.8).
- **Free vs premium tiers**: Free track gets meaningful rewards (not just scraps). Premium track gets exclusive cosmetics. Never gate gameplay-affecting items behind premium.
- **Catch-up mechanics**: Players who start late or miss days need a path to completion. Weekly challenges that award large XP chunks, bonus XP weekends, or purchasable tier skips (with limits).

### Monetization Models in Depth

**Premium (buy-to-play):**

Revenue is front-loaded at launch. Post-launch revenue comes from DLC and expansions. No daily engagement pressure on the economy. The economy can be generous because there is no monetization tension. This is the safest model for player trust but the hardest to sustain financially for live-service games.

**Free-to-play (F2P):**

Revenue depends on a small percentage of paying players. The economy must create desire without creating frustration. Common F2P revenue sources:
- Cosmetics (skins, emotes, effects) — safest; no gameplay impact
- Convenience (XP boosts, fast-travel, inventory expansion) — moderate; time-vs-money tradeoff
- Energy systems (limited plays per day, replenished with premium currency) — aggressive; feels exploitative
- Gacha/loot boxes (randomized rewards) — most profitable, most controversial, most regulated

**Conversion funnel:**
- 100% of players install for free
- ~30% reach meaningful engagement (play more than 1 hour)
- ~5% make any purchase ever
- ~1% become recurring spenders
- ~0.1% are "whales" (high spenders)

Designing for whales is ethically fraught. The industry is moving toward broader, lower-cost monetization that converts more of the 5% rather than extracting more from the 0.1%.

### Predatory Pattern Avoidance

These patterns damage player trust and invite regulatory action:

- **Artificial scarcity timers**: "Buy now or it's gone forever!" creates FOMO-driven purchasing. If used, ensure items genuinely return in future rotations.
- **Obfuscated pricing**: Converting real money to gems to coins to items makes it hard for players to understand what they are spending. Keep the money-to-value chain as short as possible.
- **Pay-to-win**: Any monetization that grants competitive advantage in PvP destroys game integrity and player trust. Even perceived pay-to-win (stat boosts, faster progression in competitive contexts) is toxic.
- **Undisclosed odds manipulation**: Adjusting loot table probabilities based on player spending patterns (giving better drops to new spenders to "hook" them) is deceptive and potentially illegal.
- **Dark patterns in purchase UI**: Making the "buy" button prominent and the "earn through gameplay" option hidden, using confusing currency bundles (1100 gems when items cost 1000, forcing leftover currency), or auto-selecting the most expensive option.

### Ethical Monetization Checklist

```yaml
ethical_monetization_checklist:
  transparency:
    - All purchasable items have clear real-money cost visible
    - Loot box / gacha probabilities are published and accurate
    - Currency conversion rates are simple and visible
    - No hidden fees, auto-renewals without clear disclosure

  fairness:
    - No competitive advantage from spending money (PvP contexts)
    - Free players can access all gameplay content (F2P model)
    - Battle pass is completable with reasonable playtime
    - No artificial throttling to pressure purchases

  player_respect:
    - Purchase confirmations prevent accidental spending
    - Refund policy is clear and accessible
    - No targeting of spending prompts based on loss/frustration
    - Children and minors have spending protections
    - No manipulative urgency ("limited time!" when it returns regularly)

  legal_compliance:
    - China: probability disclosure for all randomized paid mechanics
    - Belgium/Netherlands: legal review of loot box implementation
    - COPPA: parental consent for under-13 purchases
    - Platform TOS: compliance with each platform's monetization rules
    - GDPR: spending data handled per data protection regulations

  economy_health:
    - Inflation/deflation tracked with automated monitoring
    - Economy simulation run before every balance change
    - New faucets/sinks analyzed for impact before deployment
    - Player wealth distribution monitored (Gini coefficient)
    - Exploit detection for currency duplication or manipulation
```

### Economy Monitoring in Production

Once live, an economy requires ongoing monitoring. Key metrics:

- **Currency velocity**: How fast currency moves through the system (earned and spent per player-hour)
- **Median and mean balance**: Median is more informative than mean (whales skew the mean)
- **Gini coefficient**: Measures wealth inequality among players (0 = perfect equality, 1 = one player has everything). A healthy game economy typically targets 0.3-0.5.
- **Time-to-purchase drift**: If the time to buy a key item increases over time, the economy is deflating. If it decreases, it is inflating.
- **Sink utilization**: What percentage of players use each sink? Underused sinks need to be made more attractive or replaced.
- **Exploit detection**: Monitor for outlier currency gains (players earning 10x the average may have found a dupe exploit or farming bot)

Run economy simulations before every balance patch. A change that looks small ("increase quest rewards by 20%") can compound dramatically when millions of players execute it daily.

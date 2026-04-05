---
name: game-narrative-design
description: Dialogue tree patterns, branching narrative frameworks, lore bible structure, environmental storytelling, and localization hooks
topics: [game-dev, narrative, dialogue, branching, lore, worldbuilding]
---

Game narrative design is the discipline of telling stories through interactive systems. Unlike film or literature, game narrative must account for player agency — the story adapts to player choices, pacing varies with player skill, and narrative is delivered through gameplay mechanics as much as through dialogue. The narrative designer's job is to create systems that deliver story, not just write scripts. This requires understanding dialogue tree architectures, branching frameworks, environmental storytelling techniques, and the technical infrastructure that supports narrative at scale.

## Summary

### Dialogue Trees

Dialogue trees are the most common narrative delivery mechanism in games. A dialogue tree is a directed graph where nodes are lines of dialogue or narration and edges are player choices or conditions. The complexity spectrum ranges from simple linear sequences (visual novels) to deeply branching graphs with state-dependent paths (RPGs).

**Key concepts:**
- **Nodes**: Individual dialogue lines, narration blocks, or action beats
- **Choices**: Player-selectable options that branch the conversation
- **Conditions**: Logic gates that show/hide choices or redirect flow based on game state (quest progress, reputation, inventory)
- **Hub-and-spoke**: A central node with multiple conversation topics the player can explore in any order, converging back to the hub — the dominant pattern in modern RPGs
- **Barks**: Short, contextual lines triggered by gameplay events (combat, discovery, idle) rather than conversation — technically distinct from dialogue trees but managed by the same systems

### Branching Narrative Frameworks

The technical infrastructure for branching narrative has matured significantly. Three dominant authoring tools exist:

- **ink (Inkle Studios)**: A scripting language for interactive narrative. Text-first with inline logic. Compiles to a runtime that integrates with any engine. Used in 80 Days, Heaven's Vault, Slay the Spire (narrative events).
- **Yarn Spinner**: A dialogue scripting tool designed for Unity (with Godot and Unreal ports). Node-based visual editor plus text scripting. Used in Night in the Woods, A Short Hike.
- **Twine**: A hypertext-based tool for branching stories. Exports to HTML or integrates via custom formats. More suited to prototyping and narrative design than production game integration.

### Lore Bible Structure

A lore bible is the single source of truth for a game's world, history, characters, and rules. It prevents continuity errors, enables consistent writing across a team, and serves as a reference for localization teams.

### Environmental Storytelling

Environmental storytelling conveys narrative through the game world itself: architecture, object placement, visual details, and ambient audio. It respects player agency because it rewards observation without interrupting gameplay. Players who explore find richer story; players who do not are not blocked.

### Localization Hooks

Narrative content must be localization-ready from the start. Retrofitting localization into a narrative system is extremely expensive. Key requirements: externalized strings (never hardcode text), context annotations for translators, gendered/pluralized text support, and cultural adaptation flags for content that may need regional changes.

## Deep Guidance

### Dialogue System Architecture

A production dialogue system needs more than just a tree. It needs state tracking, condition evaluation, variable management, and integration points with the game's other systems.

```typescript
// Dialogue system core architecture

interface DialogueNode {
  id: string;
  speaker: string;             // Character ID, maps to portrait/voice
  text: string;                // Localization key, NOT raw text
  voiceClip?: string;          // Audio asset reference
  animation?: string;          // Character animation to play during line
  duration?: number;           // Auto-advance after N seconds (for barks)
  onEnter?: GameAction[];      // Actions triggered when this node displays
  onExit?: GameAction[];       // Actions triggered when leaving this node
  choices?: DialogueChoice[];  // Player options (empty = auto-advance)
  next?: string;               // Next node if no choices (linear flow)
  tags?: string[];             // Metadata: "main_quest", "humor", "lore"
}

interface DialogueChoice {
  text: string;                // Localization key for choice label
  targetNodeId: string;        // Where this choice leads
  conditions?: Condition[];    // Show only if ALL conditions are true
  consequences?: GameAction[]; // Immediate effects of choosing this
  skillCheck?: SkillCheck;     // Optional skill gate
  tone?: string;               // UI hint: "friendly", "aggressive", "sarcastic"
}

interface Condition {
  type: "quest_state" | "has_item" | "reputation" | "stat_check" | "flag";
  key: string;                 // Quest ID, item ID, faction name, flag name
  operator: "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "has" | "not_has";
  value: string | number | boolean;
}

interface SkillCheck {
  skill: string;               // "persuasion", "intimidation", "lockpick"
  difficulty: number;          // Target value
  showDifficulty: boolean;     // Show the DC to the player?
  failNodeId?: string;         // Where to go if the check fails
}

interface GameAction {
  type: "set_flag" | "add_item" | "remove_item" | "change_reputation"
      | "start_quest" | "advance_quest" | "play_animation" | "trigger_event";
  parameters: Record<string, string | number | boolean>;
}

// --- Dialogue Runner ---

class DialogueRunner {
  private currentNode: DialogueNode | null = null;
  private variables: Map<string, string | number | boolean> = new Map();
  private visitedNodes: Set<string> = new Set();

  startConversation(startNodeId: string, graph: Map<string, DialogueNode>): void {
    this.currentNode = graph.get(startNodeId) ?? null;
    if (!this.currentNode) return;

    this.visitedNodes.add(startNodeId);
    this.executeActions(this.currentNode.onEnter);
    this.displayNode(this.currentNode);
  }

  getAvailableChoices(): DialogueChoice[] {
    if (!this.currentNode?.choices) return [];

    return this.currentNode.choices.filter(choice => {
      if (!choice.conditions) return true;
      return choice.conditions.every(cond => this.evaluateCondition(cond));
    });
  }

  selectChoice(choiceIndex: number, graph: Map<string, DialogueNode>): void {
    const choices = this.getAvailableChoices();
    const choice = choices[choiceIndex];
    if (!choice) return;

    this.executeActions(this.currentNode?.onExit);
    this.executeActions(choice.consequences);

    // Handle skill check
    if (choice.skillCheck) {
      const passed = this.performSkillCheck(choice.skillCheck);
      const targetId = passed ? choice.targetNodeId : choice.skillCheck.failNodeId;
      if (targetId) {
        this.currentNode = graph.get(targetId) ?? null;
      }
    } else {
      this.currentNode = graph.get(choice.targetNodeId) ?? null;
    }

    if (this.currentNode) {
      this.visitedNodes.add(this.currentNode.id);
      this.executeActions(this.currentNode.onEnter);
      this.displayNode(this.currentNode);
    }
  }

  private evaluateCondition(cond: Condition): boolean {
    // Delegate to game state manager
    return true; // Placeholder
  }

  private performSkillCheck(check: SkillCheck): boolean {
    // Roll against player stat
    return true; // Placeholder
  }

  private executeActions(actions?: GameAction[]): void {
    if (!actions) return;
    for (const action of actions) {
      // Dispatch to game systems
    }
  }

  private displayNode(node: DialogueNode): void {
    // Send to UI system for rendering
  }
}
```

### Bark Systems

Barks are short, contextual dialogue lines triggered by gameplay events rather than conversations. They are critical for making NPCs and companions feel alive.

**Bark trigger categories:**
- **Combat**: Taking damage, defeating an enemy, low health, ally down, using ability
- **Exploration**: Entering a new area, discovering a secret, idle too long, seeing a landmark
- **Reaction**: Witnessing an explosion, hearing a sound, noticing the weather change
- **Relationship**: Reacting to player choices, commenting on another NPC's action, responding to player gift
- **Contextual**: Near a quest objective, carrying a relevant item, time of day

**Bark management rules:**
- Barks have cooldowns per category — prevent the same line from playing repeatedly
- Priority system: combat barks override idle barks; story barks override ambient barks
- Track which barks have been heard — avoid repetition across a session
- Barks should be short (under 5 seconds of audio) — they must not interrupt gameplay flow
- Companion barks should reference game state: "That door is locked — maybe there's a key nearby" only triggers when the player has interacted with a locked door

### Lore Bible Structure

```yaml
# Lore bible document structure
lore_bible:
  world:
    overview: "One-page world summary (elevator pitch for the setting)"
    history:
      - era: "Age of Foundation"
        period: "0-500"
        key_events: ["Event A", "Event B"]
        tone: "Hope and expansion"
      - era: "Age of Fracture"
        period: "500-800"
        key_events: ["Event C", "Event D"]
        tone: "Conflict and division"
    geography:
      regions:
        - name: "The Ashlands"
          climate: "Volcanic, arid"
          inhabitants: ["Faction X", "Creature Y"]
          narrative_role: "Mid-game conflict zone"
    rules_of_the_world:
      magic_system: "Description of magic rules and limitations"
      technology_level: "What tech exists, what does not"
      social_structures: "How societies are organized"

  factions:
    - name: "The Iron Covenant"
      alignment: "Lawful, authoritarian"
      goals: "Unify the continent under one government"
      key_figures: ["Commander Hale", "Archivist Venn"]
      player_relationship: "Starts neutral, can become ally or enemy"
      reputation_thresholds:
        hostile: -50
        neutral: [-49, 49]
        friendly: 50
        allied: 80

  characters:
    - name: "Elena Vasquez"
      role: "Companion, quest giver"
      personality: "Pragmatic, dry humor, fiercely loyal once trusted"
      arc: "From cynical mercenary to committed idealist"
      voice_direction: "Mid-30s, confident, slight fatigue"
      key_relationships:
        - character: "Commander Hale"
          nature: "Former mentor, now adversary"
      dialogue_rules:
        - "Never uses contractions when angry (formal speech = danger sign)"
        - "Deflects emotional topics with humor"
        - "Refers to the player by callsign, not name, until reputation > 60"

  terminology:
    glossary:
      - term: "The Fracture"
        definition: "The cataclysmic event that split the continent"
        usage: "Always capitalized; characters reference it with reverence or fear"
      - term: "Aetherweaving"
        definition: "The practice of manipulating ambient magical energy"
        usage: "A skill, not an innate ability; requires training"
```

### Branching Narrative Patterns

**The Funnel Pattern:**
Branches diverge at choice points and reconverge at key story beats. This is the most practical pattern for production games because it limits the exponential content growth of true branching. Players feel agency at choice points, but the story returns to shared narrative infrastructure.

**The Waterfall Pattern:**
Branches separate permanently, creating distinct story paths that do not rejoin. Produces maximum replayability but requires writing and implementing multiple complete story threads. Only viable for shorter games or games with small narrative scope per path.

**The Modular Pattern:**
Self-contained narrative modules can be encountered in any order. Each module is complete on its own but references shared world state. Used in open-world games where the player can discover stories in any sequence. Modules can check prerequisites (quest state, level, items) to control availability.

**The State-Driven Pattern:**
Rather than explicit branches, the narrative adapts based on accumulated game state. The same conversation might have different dialogue depending on 20 different flags and variables. This creates the illusion of deep branching with fewer distinct paths. Used heavily in immersive sims (Deus Ex, Dishonored).

### Environmental Storytelling Techniques

Environmental storytelling is narrative delivered through the game world without explicit dialogue or text.

**Visual narrative:**
- Object placement tells a story: a table set for two with only one chair used, a child's toy next to a broken window, medicine bottles on a nightstand
- Graffiti and signs convey faction presence, social dynamics, or warnings
- Architecture tells history: a cathedral converted to a fortress, a skyscraper reclaimed by nature

**Audio narrative:**
- Ambient audio sets mood and implies events: distant explosions, birdsong in a peaceful area, industrial noise
- Environmental audio logs (when diegetic — a recording device the player finds) deliver exposition without breaking immersion
- Music shifts to signal narrative transitions (entering enemy territory, approaching a revelation)

**Spatial narrative:**
- Level layout guides the player's attention: sight lines to important objects, lighting that draws the eye, paths that lead to discoveries
- Locked doors and blocked paths imply what happened before the player arrived
- Progression through spaces mirrors narrative arcs: tight corridors opening to vistas for revelations, descending into darkness for tension

### Narrative-Level Design Integration

Narrative designers and level designers must collaborate early. Story beats need physical spaces, and spaces need narrative justification.

**Integration points:**
- Every major story beat needs a "stage" — a location designed for that moment (sightlines, acoustics, player positioning)
- Quest objective locations should be interesting spaces, not generic rooms
- Critical path encounters should teach the player through the environment before demanding skill
- Optional content (lore items, audio logs, environmental puzzles) should be placed along natural exploration paths, not hidden behind obscure routes

### Localization Infrastructure

```typescript
// Localization-ready dialogue string structure

interface LocalizedString {
  key: string;                  // Unique identifier: "quest_01_elena_greeting_01"
  source: string;               // English source text (for translator reference)
  context: string;              // Translator context: "Elena greets player at camp, 
                                // tone is friendly but tired. 'Commander' is a rank."
  maxLength?: number;           // Character limit for UI constraints
  gender?: GenderVariants;      // For languages with grammatical gender
  plural?: PluralVariants;      // For countable nouns
  voiceActed: boolean;          // If true, text changes require re-recording
  tags: string[];               // "main_quest", "humor", "formal"
}

interface GenderVariants {
  masculine: string;
  feminine: string;
  neutral?: string;
}

interface PluralVariants {
  zero?: string;
  one: string;
  few?: string;                 // Used in Slavic languages (2-4)
  many?: string;                // Used in Slavic languages (5+)
  other: string;                // General plural
}

// BAD: Hardcoded concatenation
function badApproach(name: string, count: number): string {
  return `${name} found ${count} item${count === 1 ? "" : "s"}`;
  // Breaks in: German (word order), Japanese (no plurals), 
  // Arabic (dual form), Russian (complex plural rules)
}

// GOOD: Externalized with ICU MessageFormat
const goodApproach: LocalizedString = {
  key: "ui_items_found",
  source: "{playerName} found {count, plural, one {# item} other {# items}}",
  context: "Displayed when player picks up items. {playerName} is the player's character name.",
  maxLength: 60,
  voiceActed: false,
  tags: ["ui", "gameplay"],
};

// --- Localization pipeline rules ---
// 1. All player-visible text goes through the localization system — no exceptions
// 2. Never concatenate translated strings — use template parameters
// 3. Provide context for every string — translators need to understand usage
// 4. Account for text expansion: German is ~30% longer than English, 
//    Japanese/Chinese can be 50% shorter
// 5. Flag cultural adaptation needs early: jokes, idioms, gestures, 
//    colors with cultural significance
// 6. Voice-acted lines are expensive to change — lock script early for VO languages
// 7. Test with pseudo-localization during development (replace all text 
//    with accented versions to catch hardcoded strings)
```

### Narrative Tooling Patterns

**ink example (branching with state):**

```
=== elena_greeting ===
{met_elena_before:
    Elena glances up from her map. "Back again? I was starting to think you'd gotten yourself killed."
- else:
    A woman in battered armor looks up from a map spread across a crate. She sizes you up in a single glance.
    "You must be the new recruit. I'm Elena. Try not to die on your first mission."
    ~ met_elena_before = true
}

+ [Ask about the mission] -> mission_briefing
+ {has_item("iron_medal")} [Show the Iron Medal] -> iron_medal_reaction
+ [Leave] -> elena_farewell
```

ink's strength is inline conditional logic. The `{met_elena_before:}` block shows different text based on whether the player has met Elena before. The `{has_item("iron_medal")}` guard on a choice means that option only appears if the player has the item. This compiles to a compact runtime that any engine can embed.

**Yarn Spinner example (Unity-native):**

```
title: ElenaGreeting
tags: companion camp
---
<<if $met_elena_before>>
    Elena: Back again? I was starting to think you'd gotten yourself killed.
<<else>>
    Elena: You must be the new recruit. I'm Elena. Try not to die.
    <<set $met_elena_before to true>>
<<endif>>

-> Ask about the mission
    <<jump MissionBriefing>>
-> Show the Iron Medal <<if $has_iron_medal>>
    <<jump IronMedalReaction>>
-> Leave
    Elena: Watch your back out there.
===
```

Yarn Spinner's syntax is more accessible to non-programmers. It integrates directly with Unity's editor, showing nodes as a visual graph. The `<<if>>` blocks and `<<set>>` commands handle state. Custom commands (like `<<jump>>`) map to C# functions in the game.

### Common Narrative Design Pitfalls

- **Ludo-narrative dissonance**: The story says one thing, gameplay says another (cutscene shows character devastated by violence; gameplay rewards mass violence). Design mechanics that reinforce narrative themes.
- **Choice without consequence**: Giving players choices that change nothing feels worse than no choice at all. If you present a choice, it must have visible consequences — even if the long-term path converges.
- **Info dumps**: Long exposition delivered through dialogue is exhausting. Distribute lore across environmental storytelling, optional conversations, and collectibles. Let curious players find depth; do not force it on everyone.
- **Orphaned content**: Branching narratives create content most players never see. Budget accordingly — the "hidden" branch still needs writing, voice acting, testing, and localization. If the branch is too expensive, it should not exist.
- **Late localization**: Starting localization after the script is "done" guarantees painful rework. Build localization infrastructure in month one, send text batches continuously, and lock voice scripts as early as possible.

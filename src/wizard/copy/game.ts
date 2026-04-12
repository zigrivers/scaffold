import type { GameCopy } from './types.js'

export const gameCopy: GameCopy = {
  engine: {
    short: 'The game engine or framework powering the project.',
    long: 'Each engine has different strengths — Unity for broad platform support, '
      + 'Unreal for high-fidelity 3D, Godot for open-source flexibility.',
    options: {
      unity:  { label: 'Unity',  short: 'Cross-platform engine with C# scripting — strong 2D and 3D support.' },
      unreal: { label: 'Unreal', short: 'High-fidelity 3D engine with C++ and Blueprints visual scripting.' },
      godot:  { label: 'Godot',  short: 'Open-source engine with GDScript — lightweight and beginner-friendly.' },
      custom: { label: 'Custom', short: 'A custom or niche engine — you\'ll configure the toolchain yourself.' },
    },
  },
  multiplayerMode: {
    short: 'Whether and how multiple players interact.',
    long: 'Local shares one device or LAN; online connects over the internet; hybrid supports both.',
    options: {
      none:   { label: 'None',   short: 'Single-player only — no multiplayer features.' },
      local:  { label: 'Local',  short: 'Same-device or LAN multiplayer (couch co-op, split screen).' },
      online: { label: 'Online', short: 'Internet-based multiplayer with server infrastructure.' },
      hybrid: { label: 'Hybrid', short: 'Supports both local and online multiplayer.' },
    },
  },
  narrative: {
    short: 'How much story and dialogue the game includes.',
    long: 'Light means flavor text and brief cutscenes; '
      + 'heavy means branching dialogue, quest logs, and narrative systems.',
    options: {
      none:  { label: 'None',  short: 'No story — gameplay-driven experience.' },
      light: { label: 'Light', short: 'Flavor text, brief cutscenes, or contextual lore.' },
      heavy: { label: 'Heavy', short: 'Branching dialogue, quest systems, and deep narrative.' },
    },
  },
  contentStructure: {
    short: 'How game content is organized and delivered to the player.',
    options: {
      discrete:        { label: 'Discrete levels', short: 'Self-contained stages or levels loaded one at a time.' },
      'open-world':    { label: 'Open world',      short: 'Large continuous world the player explores freely.' },
      procedural: {
        label: 'Procedural',
        short: 'Content generated algorithmically at runtime.',
      },
      endless: {
        label: 'Endless',
        short: 'Infinite or repeating gameplay with increasing difficulty.',
      },
      'mission-based': { label: 'Mission-based',   short: 'Structured objectives within a larger game world.' },
    },
  },
  economy: {
    short: 'Whether the game has an in-game economy or monetization.',
    long: 'Progression uses earned currency for upgrades; monetized adds real-money purchases; both combines the two.',
    options: {
      none:        { label: 'None',        short: 'No in-game currency or economy.' },
      progression: { label: 'Progression', short: 'Earned currency and rewards for player upgrades.' },
      monetized:   { label: 'Monetized',   short: 'Real-money transactions (in-app purchases, DLC).' },
      both:        { label: 'Both',        short: 'Earned progression plus real-money purchases.' },
    },
  },
  onlineServices: {
    short: 'Backend services the game connects to.',
    long: 'Select any that apply. Each adds integration scaffolding for the corresponding service.',
    options: {
      leaderboards: { label: 'Leaderboards',  short: 'Global or friends-list score rankings.' },
      accounts:     { label: 'Accounts',       short: 'Player identity, profiles, and authentication.' },
      matchmaking:  { label: 'Matchmaking',    short: 'Automated pairing of players for online sessions.' },
      'live-ops': {
        label: 'Live Ops',
        short: 'Seasonal events, daily challenges, and remote content updates.',
      },
    },
  },
  persistence: {
    short: 'What player data is saved between sessions.',
    long: 'Settings-only saves preferences; profile adds player identity; '
      + 'progression tracks unlocks and progress; cloud syncs across devices.',
    options: {
      none:            { label: 'None',          short: 'Nothing persists — each session starts fresh.' },
      'settings-only': { label: 'Settings only', short: 'Only user preferences (volume, controls) are saved.' },
      profile:         { label: 'Profile',       short: 'Player name, avatar, and basic identity data.' },
      progression:     { label: 'Progression',   short: 'Save files, unlocked content, and player progress.' },
      cloud:           { label: 'Cloud',         short: 'Progress synced to the cloud for cross-device play.' },
    },
  },
  targetPlatforms: {
    short: 'Which platforms the game will ship on.',
    long: 'Select all target platforms. Each adds platform-specific build configuration and SDK setup.',
    options: {
      pc:      { label: 'PC',               short: 'Windows, macOS, or Linux desktop.' },
      web:     { label: 'Web',              short: 'Browser-based via WebGL or WebGPU.' },
      ios:     { label: 'iOS',              short: 'iPhone and iPad via the App Store.' },
      android: { label: 'Android',          short: 'Android phones and tablets via Google Play.' },
      ps5:     { label: 'PlayStation 5',    short: 'Sony PS5 — requires a developer license.' },
      xbox:    { label: 'Xbox',             short: 'Xbox Series X|S — requires ID@Xbox or a publisher.' },
      switch:  { label: 'Nintendo Switch',  short: 'Nintendo Switch — requires a developer agreement.' },
      vr:      { label: 'VR',              short: 'Virtual reality headsets (Meta Quest, PCVR, etc.).' },
      ar:      { label: 'AR',              short: 'Augmented reality devices (ARKit, ARCore, HoloLens).' },
    },
  },
  supportedLocales: {
    short: 'Locale codes for languages the game will support (e.g. "en", "ja", "fr-FR").',
  },
  hasModding: {
    short: 'Expose modding APIs so players can create and share custom content.',
  },
  npcAiComplexity: {
    short: 'How sophisticated NPC behavior needs to be.',
    long: 'Simple covers basic state machines; complex adds behavior trees, pathfinding, and dynamic decision-making.',
    options: {
      none:    { label: 'None',    short: 'No NPCs or no autonomous behavior needed.' },
      simple:  { label: 'Simple',  short: 'Basic state machines and scripted behavior patterns.' },
      complex: { label: 'Complex', short: 'Behavior trees, advanced pathfinding, and dynamic decision-making.' },
    },
  },
}

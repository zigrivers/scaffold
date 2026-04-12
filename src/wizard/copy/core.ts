import type { CoreCopy } from './types.js'

export const coreCopy: CoreCopy = {
  projectType: {
    short: 'Picks the question set and scaffolding template for the rest of init.',
    long: 'Each type unlocks follow-up questions tailored to that domain.',
    options: {
      'web-app':           { label: 'Web app',            short: 'Browser-rendered app served over HTTP.' },
      'backend':           { label: 'Backend service',    short: 'API or service with no built-in UI.' },
      'cli':               { label: 'CLI tool',           short: 'Command-line program run from a terminal.' },
      'library':           { label: 'Library / package',  short: 'Reusable code published for other projects.' },
      'mobile-app':        { label: 'Mobile app',         short: 'Native or cross-platform app for phones and tablets.' },
      'data-pipeline':     { label: 'Data pipeline',      short: 'ETL or streaming system that moves and transforms data.' },
      'ml':                { label: 'ML project',         short: 'Machine-learning training, inference, or both.' },
      'browser-extension': { label: 'Browser extension',  short: 'Add-on that runs inside Chrome, Firefox, or similar.' },
      'game':              { label: 'Game',               short: 'Interactive entertainment with a game loop.' },
    },
  },
  methodology: {
    short: 'Controls how thorough the scaffolding process is.',
    long: 'Deep produces comprehensive docs; MVP skips optional steps; Custom lets you toggle each step.',
    options: {
      deep:   { label: 'Deep',   short: 'Every step enabled — full architecture, docs, and tests.' },
      mvp:    { label: 'MVP',    short: 'Minimum viable pipeline — ship fast, fill in later.' },
      custom: { label: 'Custom', short: 'Hand-pick which steps run and at what depth.' },
    },
  },
  depth: {
    short: 'Sets the default detail level (1 = minimal, 5 = comprehensive) for all steps.',
  },
  codexAdapter: {
    short: 'Generates an OpenAI Codex adapter alongside the Claude Code output.',
  },
  geminiAdapter: {
    short: 'Generates a Google Gemini adapter alongside the Claude Code output.',
  },
  webTrait: {
    short: 'Adds web-platform questions (rendering strategy, deploy target, etc.).',
  },
  mobileTrait: {
    short: 'Adds mobile-platform questions (iOS/Android, offline support, etc.).',
  },
  advancedGameGate: {
    short: 'Unlocks advanced game-design questions (economy, modding, NPC AI, etc.).',
  },
}

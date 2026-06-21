#!/usr/bin/env node
// Codegen: render the canonical agent-skill sources (content/agent-skills/<name>/
// SKILL.md) into every per-platform form, using the shared renderers in
// @zigrivers/agent-integration. This is a DEV/BUILD tool — it is not shipped;
// only the generated files are committed. Run `node scripts/generate-agent-skills.mjs`
// to (re)generate, or `--check` to fail when a committed file is stale (the drift
// gate). One canonical source = one source of truth, so the per-platform files
// can no longer drift apart.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  parseCanonicalSkill,
  renderSkillMd,
  renderCursorMdc,
} from '../packages/agent-integration/dist/index.js'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/**
 * Each canonical source fans out to targets in each consumer's existing format:
 *  - the full SKILL.md (scaffold installs it for Claude Code / OpenCode),
 *  - the raw lean BODY for the mmr AGENTS.md template (mmr skill-install wraps it
 *    in its own managed block, so we emit the body, not renderAgentsBlock),
 *  - the Cursor .mdc (mmr skill-install writes it verbatim).
 */
const SKILLS = [
  {
    source: 'content/agent-skills/mmr/SKILL.md',
    targets: [
      { path: 'content/skills/mmr/SKILL.md', render: (s) => renderSkillMd(s) },
      { path: 'packages/mmr/templates/skills/agents/mmr-review.md', render: (s) => `${s.lean}\n` },
      { path: 'packages/mmr/templates/skills/cursor/mmr-review.mdc', render: (s) => renderCursorMdc(s) },
    ],
  },
]

const check = process.argv.includes('--check')
const generated = []
const stale = []

for (const skill of SKILLS) {
  const parsed = parseCanonicalSkill(readFileSync(resolve(ROOT, skill.source), 'utf8'))
  for (const target of skill.targets) {
    const out = target.render(parsed)
    const abs = resolve(ROOT, target.path)
    const current = existsSync(abs) ? readFileSync(abs, 'utf8') : null
    if (current === out) continue
    if (check) stale.push(target.path)
    else {
      writeFileSync(abs, out)
      generated.push(target.path)
    }
  }
}

if (check) {
  if (stale.length > 0) {
    console.error(`Agent skills out of date — run \`node scripts/generate-agent-skills.mjs\`:`)
    for (const p of stale) console.error(`  ${p}`)
    process.exit(1)
  }
  console.log('Agent skills up to date.')
} else {
  console.log(generated.length > 0 ? `Generated:\n  ${generated.join('\n  ')}` : 'Agent skills already up to date.')
}

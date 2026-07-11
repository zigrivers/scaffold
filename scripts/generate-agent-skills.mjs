#!/usr/bin/env node
// Codegen: render the canonical agent-skill sources (content/agent-skills/<name>/
// SKILL.md) into every per-platform form, using the shared renderers in
// @zigrivers/agent-integration. This is a DEV/BUILD tool — it is not shipped;
// only the generated files are committed. Run `node scripts/generate-agent-skills.mjs`
// to (re)generate, or `--check` to fail when a committed file is stale (the drift
// gate). One canonical source = one source of truth, so the per-platform files
// can no longer drift apart.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
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
      // OpenCode auto-discovers full Agent Skills under .opencode/skills/<name>/;
      // this template is the full SKILL.md that mmr skill-install drops there.
      { path: 'packages/mmr/templates/skills/opencode/mmr.md', render: (s) => renderSkillMd(s) },
    ],
  },
  // Scaffold's own skills. The full SKILL.md is what skill-sync installs to
  // .claude/skills + .agents/skills; the agents-block (raw lean body) and
  // cursor.mdc are what `scaffold skill install --platform` writes for
  // Codex/Antigravity (AGENTS.md) and Cursor (.cursor/rules).
  //
  // work-beads forces alwaysApply: true in its cursor.mdc — Cursor's
  // description-matching only re-runs on a fresh, on-topic user message, and
  // the observed failure mode is agents stopping after the draft PR instead
  // of continuing the ship loop. Always-applying keeps the loop contract
  // loaded across that gap. Other skills default to alwaysApply: false.
  ...['scaffold-runner', 'scaffold-pipeline', 'work-beads'].map((name) => ({
    source: `content/agent-skills/${name}/SKILL.md`,
    targets: [
      { path: `content/skills/${name}/SKILL.md`, render: (s) => renderSkillMd(s) },
      { path: `content/skills/${name}/agents-block.md`, render: (s) => `${s.lean}\n` },
      {
        path: `content/skills/${name}/cursor.mdc`,
        render: (s) => renderCursorMdc(s, { alwaysApply: name === 'work-beads' }),
      },
    ],
  })),
]

const check = process.argv.includes('--check')
const generated = []
const stale = []

// Compare on normalized newlines so a CRLF checkout (git autocrlf on Windows)
// is not reported as drift; generated files are always written with LF.
const normalize = (text) => text.replace(/\r\n/g, '\n')

for (const skill of SKILLS) {
  const parsed = parseCanonicalSkill(readFileSync(resolve(ROOT, skill.source), 'utf8'))
  for (const target of skill.targets) {
    const out = target.render(parsed)
    const abs = resolve(ROOT, target.path)
    const current = existsSync(abs) ? readFileSync(abs, 'utf8') : null
    if (current !== null && normalize(current) === normalize(out)) continue
    if (check) stale.push(target.path)
    else {
      mkdirSync(dirname(abs), { recursive: true })
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

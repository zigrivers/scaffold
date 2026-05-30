#!/usr/bin/env node
// Regenerate the live-data blocks of the knowledge-freshness GUIDE
// (content/guides/knowledge-freshness/index.md) from the knowledge base and the
// source allowlist. Only the content between `<!-- gen:NAME -->` /
// `<!-- /gen:NAME -->` markers is rewritten; the surrounding prose is the
// author's source of truth.
//
// DETERMINISTIC by design: output depends only on content/knowledge/** and the
// allowlist YAML — never on the wall clock or HEAD sha. That keeps the citation
// gate's rebake-noop check stable (the previous HTML generator baked today's
// date + current HEAD, which drifted every day/commit).
//
// After running this, rebuild the HTML with `scaffold guides --build`.

import fs from 'node:fs'
import path from 'node:path'

const REPO_ROOT = path.resolve(new URL('.', import.meta.url).pathname, '..')
const KB_ROOT = path.join(REPO_ROOT, 'content/knowledge')
const ALLOWLIST_PATH = path.join(REPO_ROOT, 'docs/knowledge-freshness/authoritative-sources.yaml')
const GUIDE_MD = path.join(REPO_ROOT, 'content/guides/knowledge-freshness/index.md')

// ─── KB inventory ──────────────────────────────────────────────
function extractFrontmatter(text) {
  const m = /^---\n([\s\S]*?)\n---/.exec(text)
  if (!m) return null
  const out = {}
  for (const line of m[1].split('\n')) {
    const kv = /^([a-zA-Z0-9_-]+):\s*(.*)$/.exec(line)
    if (kv && out[kv[1]] === undefined) out[kv[1]] = kv[2].trim()
  }
  return out
}
function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) walk(p, out)
    else if (e.name.endsWith('.md') && e.name !== 'README.md') out.push(p)
  }
  return out
}

const kbFiles = walk(KB_ROOT)
const categoryCount = {}
let totalEntries = 0
const hostCount = {}
for (const f of kbFiles) {
  const text = fs.readFileSync(f, 'utf8')
  const fm = extractFrontmatter(text)
  if (!fm || !fm.name) continue
  totalEntries++
  const category = path.dirname(path.relative(KB_ROOT, f)) || '.'
  categoryCount[category] = (categoryCount[category] || 0) + 1
  const fmBlock = /^---\n([\s\S]*?)\n---/.exec(text)?.[1] ?? ''
  for (const um of fmBlock.matchAll(/url:\s*['"]?(https?:\/\/[^'"\s]+)/g)) {
    try {
      const h = new URL(um[1]).hostname.replace(/^www\./, '')
      hostCount[h] = (hostCount[h] || 0) + 1
    } catch { /* skip malformed URL */ }
  }
}

// ─── Allowlist + categories ────────────────────────────────────
const CATEGORY_MAP = {
  'owasp.org': 'security', 'nist.gov': 'security', 'ietf.org/rfc': 'standards',
  'www.rfc-editor.org': 'standards', 'openid.net': 'security',
  'modelcontextprotocol.io': 'ai-ml', 'anthropic.com': 'ai-ml',
  'platform.openai.com': 'ai-ml', 'ai.google.dev': 'ai-ml',
  'mlflow.org': 'ai-ml', 'docs.wandb.ai': 'ai-ml',
  'spec.openapis.org': 'api', 'spec.graphql.org': 'api',
  'www.w3.org': 'web-standards', 'tr.designtokens.org': 'web-standards',
  'opentelemetry.io': 'cloud-ops', 'sre.google': 'cloud-ops',
  'docs.aws.amazon.com': 'cloud-ops',
  'git-scm.com': 'tooling', 'peps.python.org': 'tooling',
  'docs.astral.sh': 'tooling', 'www.postgresql.org': 'tooling', 'www.iso.org': 'standards',
  'martinfowler.com': 'patterns', 'microservices.io': 'patterns',
  'conventionalcommits.org': 'patterns', 'agilealliance.org': 'patterns',
  'adr.github.io': 'patterns', 'google.github.io': 'patterns', 'thoughtworks.com': 'patterns',
  'docs.openzeppelin.com': 'smart-contracts', 'docs.safe.global': 'smart-contracts',
  'swcregistry.io': 'smart-contracts', 'consensys.github.io': 'smart-contracts',
  'ethereum.org': 'smart-contracts',
  'docs.pact.io': 'testing',
  'pcisecuritystandards.org': 'compliance', 'aicpa.org': 'compliance',
  'aicpa-cima.com': 'compliance', 'www.sec.gov': 'compliance',
  'www.finra.org': 'compliance', 'eur-lex.europa.eu': 'compliance',
  'the-turing-way.netlify.app': 'research',
  'developer.apple.com': 'mobile', 'developer.android.com': 'mobile',
  'developer.chrome.com': 'browser-ext', 'developer.mozilla.org': 'web-standards',
}
const yamlRaw = fs.readFileSync(ALLOWLIST_PATH, 'utf8')
const allowHosts = []
const allowRepos = []
let inHosts = false, inRepos = false
for (const line of yamlRaw.split('\n')) {
  if (line.startsWith('hosts:')) { inHosts = true; inRepos = false; continue }
  if (line.startsWith('github_repos:')) { inHosts = false; inRepos = true; continue }
  const m = /^\s+-\s+(\S+)/.exec(line)
  if (!m) continue
  if (inHosts) allowHosts.push(m[1])
  if (inRepos) allowRepos.push(m[1])
}

// ─── Build the three generated blocks ──────────────────────────
const mdEsc = (s) => String(s).replace(/\|/g, '\\|')

function hostCitationsBlock() {
  const rows = Object.entries(hostCount)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 15)
  const body = [
    `:::chart{type=bar}`,
    ``,
    `| Host | Citations |`,
    `| --- | --- |`,
    ...rows.map(([h, c]) => `| ${mdEsc(h)} | ${c} |`),
    `:::`,
  ]
  return body.join('\n')
}

function allowlistBlock() {
  const hosts = allowHosts
    .map((h) => ({ entry: h, category: CATEGORY_MAP[h] || 'other' }))
    .sort((a, b) => a.category.localeCompare(b.category) || a.entry.localeCompare(b.entry))
  const body = [
    `${allowHosts.length} allowlisted hosts and ${allowRepos.length} GitHub repos. Out-of-list sources warn (they do not block).`,
    ``,
    `:::filter-table`,
    `| Host | Category |`,
    `| --- | --- |`,
    ...hosts.map((h) => `| \`${mdEsc(h.entry)}\` | ${h.category} |`),
    `:::`,
    ``,
    `**GitHub repos:** ${allowRepos.map((r) => `\`${mdEsc(r)}\``).join(', ')}`,
  ]
  return body.join('\n')
}

function kbInventoryBlock() {
  const cats = Object.entries(categoryCount).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  const body = [
    `**${totalEntries} entries** across ${cats.length} categories:`,
    ``,
    `| Category | Entries |`,
    `| --- | --- |`,
    ...cats.map(([c, n]) => `| ${mdEsc(c)} | ${n} |`),
  ]
  return body.join('\n')
}

const BLOCKS = {
  'host-citations': hostCitationsBlock(),
  allowlist: allowlistBlock(),
  'kb-inventory': kbInventoryBlock(),
}

// ─── Splice into the guide markdown ────────────────────────────
let md = fs.readFileSync(GUIDE_MD, 'utf8')
for (const [name, body] of Object.entries(BLOCKS)) {
  const open = `<!-- gen:${name} -->`
  const close = `<!-- /gen:${name} -->`
  const reEsc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re = new RegExp(reEsc(open) + '[\\s\\S]*?' + reEsc(close))
  if (!re.test(md)) {
    console.error(`ERROR: marker block "${name}" not found in ${path.relative(REPO_ROOT, GUIDE_MD)}`)
    process.exit(1)
  }
  md = md.replace(re, `${open}\n${body}\n${close}`)
}
fs.writeFileSync(GUIDE_MD, md)
console.log(
  `Regenerated knowledge-freshness guide data blocks: ${totalEntries} entries, ` +
    `${allowHosts.length} hosts, ${Object.keys(hostCount).length} cited hosts.`,
)

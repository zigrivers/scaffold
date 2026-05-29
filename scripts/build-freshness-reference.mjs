#!/usr/bin/env node
// Bake structured data into docs/knowledge-freshness/reference.html
// in place of the __PLACEHOLDER__ tokens.

import fs from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'

const REPO_ROOT = path.resolve(new URL('.', import.meta.url).pathname, '..')
const HTML_PATH = path.join(REPO_ROOT, 'docs/knowledge-freshness/reference.html')
const KB_ROOT = path.join(REPO_ROOT, 'content/knowledge')
const ALLOWLIST_PATH = path.join(REPO_ROOT, 'docs/knowledge-freshness/authoritative-sources.yaml')

// ─── KB inventory ──────────────────────────────────────────────
// F-003 fix: convert YAML literal `null` / `~` / empty to real JS null so the
// in-page JS treats unfilled review dates correctly. Strings that contain
// the word "null" inside quotes still come through as the string "null".
function coerceYamlScalar(raw) {
  const v = raw.trim()
  if (v === '' || v === 'null' || v === '~' || v === 'Null' || v === 'NULL') return null
  // Strip a single layer of surrounding quotes; preserves embedded "null" string.
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith('\'') && v.endsWith('\''))) {
    return v.slice(1, -1)
  }
  return v
}
function parseFrontmatterValue(line) {
  const m = /^([a-zA-Z0-9_-]+):\s*(.*)$/.exec(line)
  if (!m) return null
  return { key: m[1], value: coerceYamlScalar(m[2]) }
}
function extractFm(text) {
  const m = /^---\n([\s\S]*?)\n---/.exec(text)
  if (!m) return {}
  const out = {}
  for (const line of m[1].split('\n')) {
    const kv = parseFrontmatterValue(line)
    if (!kv) continue
    if (out[kv.key] === undefined) out[kv.key] = kv.value
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
// F-003 part 2: when every entry's `last-reviewed` is null (the current state
// — Phase 4 backfilled volatility + sources but not review dates), the cadence
// slider has nothing to scrub. We synthesize a deterministic demo date keyed
// off the slug so the chart is meaningful even before the cron has run. The
// page surfaces this with an explicit caveat above the chart.
function djb2(s) {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h) ^ s.charCodeAt(i)
  return h >>> 0
}
const DEMO_WINDOW_START = Date.UTC(2025, 9, 1)   // 2025-10-01
const DEMO_WINDOW_END   = Date.UTC(2026, 4, 1)   // 2026-05-01
function synthesizeReviewDate(slug) {
  const span = DEMO_WINDOW_END - DEMO_WINDOW_START
  const ts = DEMO_WINDOW_START + (djb2(slug) % span)
  return new Date(ts).toISOString().slice(0, 10)
}
const kbFiles = walk(KB_ROOT)
const kbEntries = []
let realReviewedCount = 0
for (const f of kbFiles) {
  const fm = extractFm(fs.readFileSync(f, 'utf8'))
  if (!fm.name) continue
  const rel = path.relative(KB_ROOT, f)
  const realLast = fm['last-reviewed']
  if (realLast) realReviewedCount++
  kbEntries.push({
    slug: fm.name,
    category: path.dirname(rel),
    volatility: fm.volatility || null,
    lastReviewed: realLast || null,
    // demoLastReviewed is what the cadence chart uses; lastReviewed is the
    // ground truth from disk (may be null). The page is explicit about this.
    demoLastReviewed: realLast || synthesizeReviewDate(fm.name),
    versionPin: fm['version-pin'] || null,
  })
}
const KB_INVENTORY = {
  total: kbEntries.length,
  entries: kbEntries,
  // Surfaced in the cadence caveat so the page can say
  // "N of M entries have a real last-reviewed; the rest are synthesized for demo".
  realReviewedCount,
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
  if (line.startsWith('hosts:'))  { inHosts = true; inRepos = false; continue }
  if (line.startsWith('github_repos:')) { inHosts = false; inRepos = true; continue }
  const m = /^\s+-\s+(\S+)/.exec(line)
  if (!m) continue
  if (inHosts)  allowHosts.push(m[1])
  if (inRepos)  allowRepos.push(m[1])
}
const ALLOWLIST = {
  hosts: allowHosts.map(h => {
    const bareHost = h.split('/')[0].replace(/^www\./, '')
    return { entry: h, bareHost, category: CATEGORY_MAP[h] || 'other' }
  }),
  github_repos: allowRepos,
}

// ─── Top hosts by citations ────────────────────────────────────
const hostCount = {}
for (const f of kbFiles) {
  const text = fs.readFileSync(f, 'utf8')
  const fmMatch = /^---\n([\s\S]*?)\n---/.exec(text)
  if (!fmMatch) continue
  const urls = [...fmMatch[1].matchAll(/url:\s*['"]?(https?:\/\/[^'"\s]+)/g)].map(x => x[1])
  for (const u of urls) {
    try {
      const h = new URL(u).hostname.replace(/^www\./, '')
      hostCount[h] = (hostCount[h] || 0) + 1
    } catch {}
  }
}
const TOP_HOSTS = hostCount

// ─── Decisions ─────────────────────────────────────────────────
const PARENT_DECISIONS = [
  { n: 1, t: 'System name', c: 'knowledge-freshness', r: 'Names the goal not the mechanism. Avoids collision with scaffold observe audit / Lens A–H. Used in CLI subcommands, branch prefixes, GHA filename, docs directory, and the new lens.' },
  { n: 2, t: 'PR target', c: 'Direct to main, one PR per entry', r: "Matches Scaffold's existing workflow; provenance per-entry; small reviewable diffs; trivial reverts. Accepts more PR noise as the cost." },
  { n: 3, t: 'MMR channel timing', c: '<code>mmr review --diff</code> against existing channels; native channel deferred to Phase 5', r: "Phase 1 stays inside this repo and doesn't block on a sibling-package release. Native channel waits until we know what behavior is worth standardizing." },
  { n: 4, t: 'Source-authority allowlist seed', c: 'Locked seed: 7 hosts (OWASP, NIST, IETF/RFC, MCP, anthropic.com/docs, OpenAI, ai.google.dev) + curated GitHub repos. Current state: 47 hosts + 3 repos after Phase 4 backfill.', r: 'Covers security/architecture (OWASP/NIST/RFCs) and the AI/MCP fast-moving cluster (vendor docs). Out-of-list sources warn, not block. Expand per-PR; the original 7-host seed grew to 47 as Phase 4 backfilled the rest of the KB and accumulated host citations.' },
  { n: 5, t: 'Initial backfill list', c: '10 entries exercising both 14-day and 60-day cadence', r: 'Validates the system in real conditions; security-best-practices.md is the primary validation target. Phase 4 then backfilled all 266 entries.' },
  { n: 6, t: 'Knowledge-base SemVer', c: 'Single number at <code>content/knowledge/VERSION</code>, bumped per Conventional Commits', r: 'Simple for downstream pinning; one number to watch. Per-entry versioning deferred as unjustified complexity at current scale.' },
  { n: 7, t: 'LLM dispatcher', c: 'Reuse <code>src/observability/engine/llm-dispatcher.ts</code>', r: 'One subprocess-injection-defense code path to harden. Hardcoded <code>claude -p</code> (and hardcoded DeepSeek URL in providers/deepseek.ts); the project-config override surface is intentionally not extended. <strong>Threat model:</strong> an untrusted project\'s <code>.scaffold/observability.yaml</code> could otherwise (a) substitute an attacker-controlled command for <code>claude -p</code> (RCE in the maintainer\'s shell), or (b) redirect the LLM endpoint URL to capture API keys from request headers. Hardcoding closes both paths at the project-config boundary.' },
  { n: 8, t: 'Daily audit ceiling', c: '10 grounded audits per day; configurable via .scaffold/observability.yaml', r: '~10 audits + ~30 MMR runs daily worst case. Steady state 2–4/day. Comfortable headroom; safety valve against pre-filter bugs.' },
  { n: 9, t: 'Gap-signal emission', c: 'Always-on; <code>SCAFFOLD_GAP_SIGNAL_QUIET=1</code> silences for tests/CI', r: 'Catches gaps everywhere they occur. Small token bloat per prompt accepted in exchange for not missing signals in forgetfully-configured steps.' },
  { n: 10, t: 'CLAUDE.md drift fix', c: 'Standalone Task 0 PR off main before Phase 1 Task 1', r: 'Keeps the freshness work focused; takes ~5 minutes; removes a misleading reference for everyone.' },
]
const GAP_DECISIONS = [
  { n: 1, t: 'Project distinctness axis', c: 'Explicit <code>project_id</code> payload field (sha256 of <code>git remote get-url origin</code> or cwd realpath)', r: 'Other axes (worktree_id, branch, no-axis) either conflate or omit the right unit of analysis. Project identity is what "≥2 distinct projects" needs to mean.' },
  { n: 2, t: 'Topic clustering', c: 'Strict slug match after light normalization', r: 'Predictable, fast, no LLM dependency. False negatives are reversible later via stemmed/LLM clustering. False positives would be worse.' },
  { n: 3, t: 'lessons.md scanner shape', c: 'Inline at lens time, no ledger writes; treated as a separate signal set merged by topic', r: 'No dedup risk between scanner runs and agent events. lessons.md is the source of truth (current contents at audit time). Synthetic <code>project_id="lessons"</code> keeps lessons-only topics off the P2 threshold.' },
  { n: 4, t: 'Tail injection mechanism', c: 'Assembly-time injection via shared <code>gap-signal-tail.ts</code> helper', r: 'One source of truth (the helper template). Reword once → both emission paths update for all 89 steps. Zero file-churn cost.' },
  { n: 5, t: 'Phase 3 severity rules', c: 'Ship both P2 (≥3 signals, ≥2 projects) AND P1 (≥5 signals, ≥3 projects)', r: 'Same plumbing; the P1 escalation lives in the same lens evaluator. Avoids a churn follow-up PR.' },
  { n: 6, t: 'lessons mentions excluded from distinct_project_count', c: "Aggregator's <code>delete('lessons')</code> rule", r: "Without the explicit exclusion, a single project's own lessons mention plus its 2 CLI signals would manufacture a gap. Preserves diversity-gate intent." },
]
const KROOT_DECISIONS = [
  { n: 1, t: 'Suppression policy when topic is covered', c: 'Skip the bucket entirely; emit no finding', r: "Matches operator mental model ('gap = missing thing'). Lower-severity-emit and new-finding-type alternatives add noise without signal." },
  { n: 2, t: 'KB lookup mechanism', c: 'Auto-detect + --knowledge-root flag + yaml escape hatches', r: 'Auto-detect handles common case (npm-global, Homebrew, local, dev worktree). Flag/yaml handle testing, pinning, air-gapped installs. Bundled static index rejected (adds build step and drift).' },
  { n: 3, t: 'Match rule', c: 'Exact slug match against entry <code>name:</code> field', r: 'Deterministic. Matches how the assembly engine identifies entries. Substring/topics-array matching introduces false-positive suppression of real gaps.' },
  { n: 4, t: 'Auto-detect-fails fallback', c: 'Soft-fail with one-line warning emitted from Lens I only when the lens runs; suppression disabled, lens runs as today', r: 'Suppression is an enhancement, not a contract. Emitting from the lens prevents spurious warnings when Lens I is disabled.' },
  { n: 5, t: 'CLI-override-points-at-nothing behavior', c: 'Hard error at the resolver, before any lens runs', r: 'Operator-typed contracts get sharp errors; yaml entries get soft-fail. Validation = exists + is-directory + has VERSION marker + loader runs cleanly. Empty index NOT rejected — freshly-initialized KB is valid.' },
  { n: 6, t: 'Index refresh cadence', c: 'Once per audit run, no caching across runs', r: 'Walk is fast in practice on the current ~270-file KB; cross-run cache would add invalidation complexity for no measurable gain at present scale. (Claim is unmeasured; if the KB grows past O(10k) files a benchmark would be needed.)' },
  { n: 7, t: 'Match against <code>topics:</code> array (in addition to name:)', c: 'No', r: '<code>topics:</code> is broad-keyword soup; would suppress real gaps. Out of scope.' },
  { n: 8, t: 'Bundle a static index', c: 'No', r: 'Adds a build step + drift risk between the live tree and the bundle. Direct walk is cheaper than maintenance cost.' },
  { n: 9, t: 'Semantics of knowledgeRoot (install root vs knowledge directory)', c: 'The knowledge directory itself', r: "Removes the implicit '+ /content/knowledge' append; matches what operators naturally type; eliminates double-append failure mode." },
  { n: 10, t: 'Auto-detect install signature', c: '<code>package.json#name === "@zigrivers/scaffold"</code>', r: 'The homedir boundary breaks npm-global/Homebrew installs. Matching on the package name is precise.' },
  { n: 11, t: 'Warn-once mechanism', c: 'Caller-provided per-audit <code>warnedKeys: Set&lt;string&gt;</code> threaded via LensContext', r: "Module-global Set would dedup across --fix flow's multiple runAudit calls. Per-audit Set fixes both. Resolver-doesn't-warn prevents spurious noise when Lens I is disabled." },
  { n: 12, t: 'Per-file console.warn for malformed entries in the loader', c: 'No', r: "Matches the assembly loader's silent-skip. The freshness validator already surfaces malformed entries; duplicating would leak into JSON or confuse operators." },
  { n: 13, t: 'Where the 3-tier resolution lives', c: '<code>resolveKnowledgeRoot</code> in knowledge-index.ts, called by runAudit (not handleAudit)', r: 'Every runAudit caller benefits — CLI, phase-audit, fix-flow, MMR doc-conformance channel — without each having to re-implement yaml + auto-detect.' },
  { n: 14, t: 'Validator slug-rule alignment with the loader', c: 'Index loader uses <code>js-yaml</code>; accepts any non-empty trimmed <code>name:</code>; slug regex stays in the freshness validator only', r: "Plan review R1 caught that hand-rolled regex couldn't reliably handle YAML comments, nested structures, or unclosed frontmatter. js-yaml is already a project dep." },
  { n: 15, t: 'Validator strictness for "is this actually a knowledge directory?"', c: 'Require <code>&lt;path&gt;/VERSION</code> marker file; do NOT require non-empty index', r: 'VERSION exists only at content/knowledge/VERSION. An empty index is a legitimate state for a freshly-initialized scaffold install.' },
  { n: 16, t: 'Where the index is loaded (resolver vs lens)', c: 'Resolver loads it during validation and returns the Set in <code>KnowledgeRootResolution.index</code>; Lens I uses pre-loaded index without re-walking', r: 'Eliminates redundant filesystem walk and removes dead lens-i:index-load-failed code path.' },
  { n: 17, t: 'LensContext field optionality + test migration', c: 'All four new fields optional', r: 'Existing test literals keep compiling without changes. Optional fields + lens treating undefined === null makes the migration zero-cost.' },
  { n: 18, t: 'Operator-visible warning string hygiene', c: 'All interpolated path/reason fragments pass through <code>formatForStderr()</code>', r: "A path or reason containing unbalanced quotes or newlines would produce ragged or multiline stderr that's hard to parse in CI logs and audit sidecars." },
  { n: 19, t: 'Yaml tier read mechanism', c: '<code>resolveKnowledgeRoot</code> reuses <code>loadObservabilityConfig(cwd)</code>', r: 'One yaml-reader code path across the whole observability surface. Extends ObservabilityConfig with typed <code>I-knowledge-gaps?: { knowledge_root?: string }</code>.' },
  { n: 20, t: '--fix flow inherits the CLI override', c: '<code>runFixFlow</code> threads <code>knowledgeRootOverride</code> into verifier and postfix runAudit calls', r: 'Without this, only the initial audit would see the override; verifier and postfix audits would auto-detect a different KB, producing inconsistent Lens I suppression across audits in one fix run.' },
]
// R2-F-010 fix: decision search vocabulary often diverges from operator
// search terms (e.g. searching "normalize" finds nothing because GAP-DET-2
// is titled "Topic clustering"). Add a keywords map so the renderer can
// include operator-vocabulary search terms in the match surface.
// R2-F-010 + R3-F-004: search vocabulary expansion. Each decision's
// `keywords` is appended to the search haystack so operator-vocabulary
// terms find the right decision regardless of canonical wording.
// R3-F-004 added: "spec", "cron", "check", "ssrf" coverage where missing.
const DECISION_KEYWORDS = {
  // spec-keyed: { specId, n: keywords }
  'parent-spec': {
    1: 'naming branding spec specification',
    2: 'pull request strategy merge target cron',
    3: 'multi-model review corroboration timing mmr',
    4: 'allowlist hosts authoritative sources approve check gate',
    5: 'backfill seed initial entries cron',
    6: 'semver version pin downstream',
    7: 'subprocess security injection llm dispatch hardcoded ssrf adjacent',
    8: 'max-audits daily-ceiling rate limit throughput throttle cron audit ceiling',
    9: 'env var quiet silence suppress tests ci',
    10: 'documentation drift cleanup spec',
  },
  'gap-detection-spec': {
    1: 'projects project-id sha256 distinctness diversity check',
    2: 'normalize normalization slug kebab-case bucketing clustering check',
    3: 'lessons.md scanner synthetic markers heuristics check',
    4: 'assembly engine tail injection pipeline steps',
    5: 'thresholds severity p1 p2 escalation check gate',
    6: 'distinct projects count diversity gate aggregator check',
  },
  'knowledge-root-spec': {
    1: 'suppression skip emit cover existing entry check',
    2: 'auto-detect override flag yaml escape hatch ssrf',
    3: 'name field exact match assembly engine slug check',
    4: 'soft-fail warn warning fallback check',
    5: 'cli override invalid hard error exit code throw check ssrf adjacent path validation',
    6: 'cache invalidation refresh walk cadence',
    7: 'topics array broad keyword soup rejected',
    8: 'static index bundle build step drift',
    9: 'install root knowledge directory path semantics double-append',
    10: 'package json signature npm homebrew install global homedir',
    11: 'warn-once dedup set fix-flow per-audit module-global',
    12: 'console warn malformed entry loader silent skip check',
    13: 'resolver placement runAudit handleAudit api spec',
    14: 'js-yaml parser validator slug regex check',
    15: 'version marker validator strict empty index check',
    16: 'index pre-loaded resolver walk redundant',
    17: 'lens context optional fields tests migration backwards-compatible',
    18: 'stderr formatting quotes newlines escape ci logs',
    19: 'yaml tier load observability config reuse spec',
    20: 'fix flow override propagation verifier postfix consistency',
  },
}
function attachKeywords(d, specId) {
  return {
    number: d.n, title: d.t, choice: d.c, rationale: d.r,
    keywords: (DECISION_KEYWORDS[specId] && DECISION_KEYWORDS[specId][d.n]) || '',
    specId,
    specShort: { 'parent-spec': 'PARENT', 'gap-detection-spec': 'GAP-DET', 'knowledge-root-spec': 'KROOT' }[specId],
  }
}
const DECISIONS = [
  ...PARENT_DECISIONS.map(d => attachKeywords(d, 'parent-spec')),
  ...GAP_DECISIONS.map(d => attachKeywords(d, 'gap-detection-spec')),
  ...KROOT_DECISIONS.map(d => attachKeywords(d, 'knowledge-root-spec')),
]

// ─── Deferred findings ─────────────────────────────────────────
const DEFERRED = [
  { id: 'P3-www-prefix-inconsistency', title: '<code>www.</code> prefix inconsistency in allowlist hosts', sev: 'p3', phase: 'Phase 4', summary: 'Mixed use of <code>www.</code> prefix. Bare hostnames auto-match subdomains; www.-prefixed entries are unnecessarily restrictive. Defer to a follow-up allowlist-hygiene PR.' },
  { id: 'F-001', title: 'core/ entries classified <code>fast-moving</code> are internal Scaffold patterns, not vendor SDKs', sev: 'p2', phase: 'Phase 4', summary: '8 core/ entries (claude-md-patterns, multi-model-research-dispatch, etc.) may not fit the narrow fast-moving definition. Verified pre-existing on origin/main (Phase 1-2 decisions). Out of Phase 4 scope; revisit in a separate Phase 1-revisit PR.' },
  { id: 'F-002', title: '<code>thoughtworks.com</code> allowlist entry isn\'t a primary spec/RFC', sev: 'p2', phase: 'Phase 4', summary: 'ThoughtWorks Technology Radar is a twice-yearly consultancy opinion. Phase 4 added the allowlist entry only to clear a pre-existing citation in tech-stack-selection.md. Revisit as Phase 1-revisit PR.' },
]

// ─── Architecture callouts ─────────────────────────────────────
const ARCH_CALLOUTS = {
  cron: { title: 'Daily cron (Knowledge Freshness Audit)', file: '.github/workflows/knowledge-freshness-audit.yml:24-31', summary: 'Runs at 09:00 UTC daily. Workflow_dispatch allowed for ad-hoc runs. Concurrency-guarded so two scheduled runs never race (e.g. a manual dispatch firing while cron is still working).', bullets: ['Permissions: contents: write, pull-requests: write', 'Checks out main with fetch-depth: 0 (full history for branching)', 'Builds the CLI then enters the per-candidate loop'] },
  prefilter: { title: 'audit-prefilter', file: 'src/knowledge-freshness/audit-prefilter.ts:14-72', summary: 'Walks content/knowledge, applies cadence + hash check, emits JSON candidate array. Empty sources are skipped (no audit possible); fetch errors are swallowed and the entry waits for the next window.', code: '// 14/60/180 days per tier (fast-moving / evolving / stable)\nif (ageDays > window) { select = true; priority = 50 + ageDays }\nelse if (anyHashChanged) { select = true; priority = 75 }\nelse if (!lastReviewed) { select = true; priority = 100 }\ncandidates.sort((a,b) => b.priority - a.priority)\nreturn candidates.slice(0, max)' },
  'audit-runner': { title: 'audit-run-entry (grounded LLM)', file: 'src/knowledge-freshness/audit-runner.ts + content/tools/knowledge-audit-entry.md', summary: 'Pre-fetches each source through SSRF guards (no file://, no localhost, no private IPs), embeds the bodies in the prompt, dispatches via the resolved provider. The LLM has NO web-fetch tool — all evidence must come from the prefetched bodies.', bullets: ['Verdicts: current | minor-drift | major-drift | superseded', 'Source bodies capped at 96 KiB; truncation flagged in preserve_warnings', 'Output: JSON-only, no prose'] },
  'audit-apply': { title: 'audit-apply (verdict → diff)', file: 'src/knowledge-freshness/audit-apply.ts', summary: 'Patches frontmatter (last-reviewed, hash, retrieved) and applies proposed_changes by H2 heading match. With --open-pr, creates branch knowledge-freshness/<entry>-<date> and opens a PR via gh.' },
  gates: { title: '5 PR gates', file: '.github/workflows/knowledge-freshness-gates.yml', summary: 'Fires on PRs touching content/knowledge/**. Same gate code is also run inline by the cron (GITHUB_TOKEN-opened PRs do NOT trigger workflows, so the workflow alone would skip cron PRs).', bullets: ['Gate 1: validate-knowledge', 'Gate 2: link-check', 'Gate 3: lint-unsourced (advisory)', 'Gate 4: anti-over-rewrite (blocking on stable + >20% churn)', 'Gate 5: Deep Guidance heading preserved'] },
  merge: {
    title: 'Human merge → VERSION bump',
    file: '.github/workflows/knowledge-freshness-version-bump.yml + src/knowledge-freshness/bump-version.ts',
    summary: 'A dedicated workflow fires on PR closed (merged-only) when the source branch starts with `knowledge-freshness/` OR the PR carries the `knowledge-freshness` label. It computes the next SemVer via the CLI, writes content/knowledge/VERSION, commits with `chore(knowledge):` prefix (to avoid retriggering itself), then `git pull --rebase` before pushing.',
    bullets: [
      'BREAKING CHANGE: anywhere in title or body → major',
      'feat(knowledge): or feat(knowledge-freshness): title prefix → minor',
      'chore(knowledge): or chore(knowledge-freshness): title prefix → patch',
      'Anything else (including fix(knowledge):) → patch (with ::notice:: in log)',
    ],
  },
  tail: { title: 'gap-signal-tail', file: 'src/core/assembly/gap-signal-tail.ts', summary: 'Assembly-time helper that appends a short emission template to each pipeline step\'s knowledge section. One source of truth, used by both AssemblyEngine.buildKnowledgeBaseSection and buildKnowledgeSection. SCAFFOLD_GAP_SIGNAL_QUIET=1 suppresses.' },
  event: { title: 'scaffold observe event knowledge_gap_signal', file: 'src/cli/commands/observe.ts + src/observability/engine/event-schemas.ts:191-220', summary: 'CLI wrapper that validates the payload (kebab-case topic ≤80 chars, source enum, 64-char sha256 project_id) and appends one event to .scaffold/activity.jsonl.' },
  ledger: { title: 'ledger (activity.jsonl)', file: '.scaffold/activity.jsonl', summary: 'Append-only JSONL of all observability events. Lens I reads the last 90 days of knowledge_gap_signal entries, plus synthetic signals from tasks/lessons.md scanned at audit time.' },
  'lens-i': { title: 'Lens I — gap aggregator', file: 'src/observability/checks/lens-i-knowledge-gaps.ts', summary: 'Buckets signals by normalized topic, applies threshold matrix, suppresses buckets covered by an existing entry. Runs under --scope=docs and --scope=all.', code: "// thresholds\nif (signalCount >= 5 && distinctProjectCount >= 3) severity = 'P1'\nelse if (signalCount >= 3 && distinctProjectCount >= 2) severity = 'P2'\n// suppression\nif (index && index.has(bucket.topic)) continue" },
  finding: { title: 'Finding (P1 / P2)', file: 'src/observability/engine/types.ts', summary: 'Standard Finding shape emitted by every lens. Surfaced in the audit report; routable into MMR via the doc-conformance channel.', bullets: ['evidence.kind = "knowledge_gap"', 'evidence.signal_count, distinct_project_count, distinct_projects (sampled)', 'evidence.example_excerpts (deduped, capped at 3)', 'fix_hint.target = "content/knowledge/<category>/<slug>.md"'] },
  resolver: { title: '3-tier --knowledge-root resolver', file: 'src/observability/knowledge-index.ts:326-379', summary: 'Returns KnowledgeRootResolution { root, index, attempts }. Tier 1 (CLI) hard-errors on bad path; tier 2 (yaml) soft-fails; tier 3 (auto-detect) returns null if no scaffold install is above selfLocation.', bullets: ['Tier 1: input.override (resolved against process.cwd())', 'Tier 2: lenses["I-knowledge-gaps"].knowledge_root (resolved against input.cwd)', 'Tier 3: findScaffoldKnowledgeRoot(input.selfLocation ?? input.cwd ?? process.cwd())'] },
  // R3-F-010: three real components that don't fit either arm of the main diagram
  'phase-audit': {
    title: 'phase-audit hook (StateManager.markCompleted)',
    file: 'src/observability/engine/phase-audit.ts:63-116',
    summary: 'Fires at every phase boundary (user-stories → tech-stack → implementation-plan → …). Runs ONLY Lens H-cross-doc (lensIds: [\'H-cross-doc\']). Phase audits do NOT trigger Lens I — see §6 "Phase audits don\'t trigger Lens I".',
    bullets: [
      'Trigger: StateManager.markCompleted() at end of any pipeline phase',
      'Lens scope: Lens H only (one-line config in phase-audit.ts:77)',
      'Implication: a downstream project\'s phase-audit showing zero findings does NOT mean Lens I is happy — Lens I never ran.',
    ],
  },
  'doc-conformance-mmr': {
    title: 'doc-conformance MMR channel',
    file: 'src/observability/engine/api.ts (via --output-mode=mmr-findings)',
    summary: 'Built-in MMR channel that ingests Lens I (and other --scope=docs lenses\') findings via the `mmr-findings` output mode. Disabled by default; enable per-PR with `mmr review --channels=doc-conformance`. This is the existing partial implementation of what Phase 5 will turn into a native knowledge-freshness MMR channel.',
    bullets: [
      'Activation: `mmr review --channels=doc-conformance`',
      'Routes Lens I (P1/P2) gap findings into MMR reconciliation alongside Codex/Gemini/Claude',
      'Not Phase 5 yet — Phase 5 will be a dedicated knowledge-freshness channel; doc-conformance is the interim path.',
    ],
  },
  'fix-flow': {
    title: '--fix flow (runFixFlow at fix-flow.ts:71-119)',
    file: 'src/observability/engine/fix-flow.ts:71-119',
    summary: 'Three-audit loop: (1) initial audit produces a fix plan; (2) for each blocking finding, dispatch a fix agent then re-audit just that finding (verifier); (3) one postfix audit runs everything for the final report. The --knowledge-root override threads into all three so Lens I suppression behavior is consistent.',
    bullets: [
      'Invoked via `scaffold observe audit --fix`',
      'Each blocking finding gets up to 3 fix attempts (configurable in observability.yaml fix.per_finding_max_attempts)',
      '--knowledge-root override (Workstream B decision #20) propagates to verifier + postfix',
    ],
  },
}

// ─── Gates ────────────────────────────────────────────────────
const GATES = [
  { num: '01', name: 'Frontmatter validator', desc: 'Zod schema parse over every entry (excludes README.md). Strict calendar-date refinement on last-reviewed and retrieved; SSRF guard on source URLs.', ref: 'src/validation/knowledge-frontmatter-validator.ts:42-50', mode: 'blocking' },
  { num: '02', name: 'Source link-check', desc: 'Every sources[*].url returns 2xx. Operates on the changed-files list passed via --files-from JSON (no bash interpolation of paths).', ref: '.github/workflows/knowledge-freshness-gates.yml:117-123', mode: 'blocking' },
  { num: '03', name: 'Unsourced-claims lint', desc: 'Heuristic check that new normative claims have a sources[] entry. Runs even when gates 1/2 failed (advisory feedback alongside blockers).', ref: '.github/workflows/knowledge-freshness-gates.yml:126-135', mode: 'advisory' },
  { num: '04', name: 'Anti-over-rewrite', desc: 'Stable entries reject diffs that delete >20% of lines unless the override:anti-over-rewrite label is applied. Only runs on cron-opened freshness/* branches (human PRs gated by review).', ref: '.github/workflows/knowledge-freshness-gates.yml:137-152', mode: 'blocking', label: 'override:anti-over-rewrite' },
  { num: '05', name: 'Deep Guidance preserved', desc: 'Literal <code>## Deep Guidance</code> heading must survive. The assembly engine pulls just that section for downstream prompts; losing it breaks every downstream that depends on the entry.', ref: '.github/workflows/knowledge-freshness-gates.yml:154-160', mode: 'blocking' },
]

// ─── Test pyramid ─────────────────────────────────────────────
const PYRAMID = {
  unit: {
    name: 'Unit tests',
    count: '~40 files',
    tone: 'chip-info',
    summary: 'Vitest coverage of every public function. Pure functions like normalizeTopic, formatForStderr, resolveProvider, selectAuditCandidates have direct table-driven tests.',
    files: ['src/observability/knowledge-index.test.ts', 'src/observability/checks/lens-i-knowledge-gaps.test.ts', 'src/observability/checks/lens-i-lessons-scanner.test.ts', 'src/observability/engine/event-schemas.test.ts', 'src/observability/engine/checks/runner.test.ts', 'src/knowledge-freshness/audit-prefilter.test.ts', 'src/knowledge-freshness/audit-runner.test.ts', 'src/knowledge-freshness/audit-apply.test.ts', 'src/knowledge-freshness/providers/anthropic.test.ts', 'src/knowledge-freshness/providers/deepseek.test.ts', 'src/knowledge-freshness/providers/index.test.ts', 'src/validation/knowledge-frontmatter-validator.test.ts'],
  },
  integration: {
    name: 'Integration tests',
    count: '~5 files',
    tone: 'chip-evol',
    summary: 'Exercises resolver against fixture KBs; runs the full audit lifecycle against an in-memory ledger; threads warnedKeys across runAudit invocations.',
    files: ['src/observability/__tests__/knowledge-root-integration.test.ts', 'src/observability/engine/api.test.ts', 'src/observability/engine/fix-flow.test.ts', 'src/cli/commands/observe.test.ts', 'src/cli/commands/knowledge.test.ts'],
  },
  ci: {
    name: 'CI gates',
    count: '4 workflows',
    tone: 'chip-fast',
    summary: 'Three knowledge-freshness-specific workflows plus the repo-wide ci.yml. The cron also runs the 5 gates inline because GITHUB_TOKEN-opened PRs do NOT trigger downstream workflows. The repo-wide bats-core suite (~100 tests at tests/*.bats) runs as part of `make check-all` and on the pre-push hook — validates frontmatter, pipeline-prompt invariants, and CLI smoke paths.',
    files: [
      '.github/workflows/knowledge-freshness-audit.yml — daily cron',
      '.github/workflows/knowledge-freshness-gates.yml — 5 PR gates (paths-filtered)',
      '.github/workflows/knowledge-freshness-version-bump.yml — auto-bump on merge',
      '.github/workflows/ci.yml — repo-wide check job (make check-all)',
      'tests/*.bats — bash suite (runs in ci.yml)',
    ],
  },
}

// ─── File map (clickable tree) ────────────────────────────────
// R3 follow-up: store REPO-RELATIVE paths (not absolute), so the baked
// page is byte-identical across machines (CI vs local). The page's JS
// renderer can prepend a configurable root for the vscode:// deep-links
// (defaults to `/your/repo/path/here` if not configured; the operator
// sets `data-repo-root` on <html> or via DevTools to make the links
// resolve on their machine). Without this, the baked FILE_MAP carries
// the machine of whoever last baked — useless for everyone else, and
// the cause of CI failing when its absolute paths differ from the
// developer's.
const ABS = ''
const FILE_MAP = [
  {
    kind: 'dir', name: 'src/observability', children: [
      { kind: 'file', name: 'knowledge-index.ts', absPath: `${ABS}/src/observability/knowledge-index.ts`, line: 326, purpose: 'resolveKnowledgeRoot, validateKnowledgeRoot, loadKnowledgeIndex, emitOnceForAudit, formatForStderr' },
      { kind: 'dir', name: 'checks', children: [
        { kind: 'file', name: 'lens-i-knowledge-gaps.ts', absPath: `${ABS}/src/observability/checks/lens-i-knowledge-gaps.ts`, line: 43, purpose: 'gap aggregator + suppression' },
        { kind: 'file', name: 'lens-i-lessons-scanner.ts', absPath: `${ABS}/src/observability/checks/lens-i-lessons-scanner.ts`, line: 32, purpose: 'normalizeTopic + scanLessonsForGaps' },
      ]},
      { kind: 'dir', name: 'engine', children: [
        { kind: 'file', name: 'api.ts', absPath: `${ABS}/src/observability/engine/api.ts`, line: 109, purpose: 'runAudit; threads resolver + warnedKeys into LensContext' },
        { kind: 'file', name: 'fix-flow.ts', absPath: `${ABS}/src/observability/engine/fix-flow.ts`, line: 71, purpose: 'runFixFlow; propagates knowledgeRootOverride to verifier + postfix' },
        { kind: 'file', name: 'event-schemas.ts', absPath: `${ABS}/src/observability/engine/event-schemas.ts`, line: 191, purpose: 'validateEvent; knowledge_gap_signal payload validator' },
        { kind: 'file', name: 'phase-audit.ts', absPath: `${ABS}/src/observability/engine/phase-audit.ts`, purpose: 'StateManager.markCompleted phase-boundary audit hook' },
        { kind: 'dir', name: 'checks', children: [
          { kind: 'file', name: 'runner.ts', absPath: `${ABS}/src/observability/engine/checks/runner.ts`, purpose: 'runChecks; lens registry; LensContext construction' },
          { kind: 'file', name: 'observability-config.ts', absPath: `${ABS}/src/observability/engine/checks/observability-config.ts`, purpose: 'loadObservabilityConfig; lenses["I-knowledge-gaps"].knowledge_root type slot' },
        ]},
      ]},
    ],
  },
  {
    kind: 'dir', name: 'src/knowledge-freshness', children: [
      { kind: 'file', name: 'audit-prefilter.ts', absPath: `${ABS}/src/knowledge-freshness/audit-prefilter.ts`, line: 14, purpose: 'cadence + hash candidate selection' },
      { kind: 'file', name: 'audit-runner.ts', absPath: `${ABS}/src/knowledge-freshness/audit-runner.ts`, purpose: 'pre-fetch + dispatch grounded audit' },
      { kind: 'file', name: 'audit-apply.ts', absPath: `${ABS}/src/knowledge-freshness/audit-apply.ts`, purpose: 'verdict → diff; --open-pr' },
      { kind: 'file', name: 'bump-version.ts', absPath: `${ABS}/src/knowledge-freshness/bump-version.ts`, purpose: 'Conventional Commits → SemVer bump' },
      { kind: 'file', name: 'source-url-validator.ts', absPath: `${ABS}/src/knowledge-freshness/source-url-validator.ts`, purpose: 'SSRF guard + allowlist check' },
      { kind: 'file', name: 'source-hash.ts', absPath: `${ABS}/src/knowledge-freshness/source-hash.ts`, purpose: 'fetch + sha256 hash' },
      { kind: 'dir', name: 'providers', children: [
        { kind: 'file', name: 'anthropic.ts', absPath: `${ABS}/src/knowledge-freshness/providers/anthropic.ts`, purpose: 'claude -p subprocess' },
        { kind: 'file', name: 'deepseek.ts', absPath: `${ABS}/src/knowledge-freshness/providers/deepseek.ts`, purpose: 'HTTP dispatch' },
        { kind: 'file', name: 'index.ts', absPath: `${ABS}/src/knowledge-freshness/providers/index.ts`, line: 36, purpose: 'resolveProvider + buildDispatcher factory' },
      ]},
    ],
  },
  {
    kind: 'dir', name: 'src/cli/commands', children: [
      { kind: 'file', name: 'observe.ts', absPath: `${ABS}/src/cli/commands/observe.ts`, line: 503, purpose: 'observe audit / event / ack; --knowledge-root flag wiring' },
      { kind: 'file', name: 'knowledge-freshness.ts', absPath: `${ABS}/src/cli/commands/knowledge-freshness.ts`, purpose: 'subcommand group: audit-prefilter, audit-run-entry, audit-apply, link-check, anti-over-rewrite, deep-guidance-check, lint-unsourced, bump-version' },
      { kind: 'file', name: 'validate-knowledge.ts', absPath: `${ABS}/src/cli/commands/validate-knowledge.ts`, purpose: 'Gate 1 entrypoint' },
    ],
  },
  {
    kind: 'dir', name: '.github/workflows', children: [
      { kind: 'file', name: 'knowledge-freshness-audit.yml', absPath: `${ABS}/.github/workflows/knowledge-freshness-audit.yml`, line: 23, purpose: 'daily cron at 09:00 UTC' },
      { kind: 'file', name: 'knowledge-freshness-gates.yml', absPath: `${ABS}/.github/workflows/knowledge-freshness-gates.yml`, line: 17, purpose: '5 gates fired on PRs touching content/knowledge/**' },
      { kind: 'file', name: 'knowledge-freshness-version-bump.yml', absPath: `${ABS}/.github/workflows/knowledge-freshness-version-bump.yml`, line: 16, purpose: 'PR-closed (merged) → SemVer bump' },
    ],
  },
  {
    kind: 'dir', name: 'content', children: [
      { kind: 'file', name: 'knowledge/VERSION', absPath: `${ABS}/content/knowledge/VERSION`, purpose: 'KB SemVer (used as resolver validation marker)' },
      { kind: 'file', name: 'tools/knowledge-audit-entry.md', absPath: `${ABS}/content/tools/knowledge-audit-entry.md`, purpose: 'grounded audit meta-prompt' },
    ],
  },
  {
    kind: 'dir', name: 'docs/knowledge-freshness', children: [
      { kind: 'file', name: 'operations.md', absPath: `${ABS}/docs/knowledge-freshness/operations.md`, purpose: 'operator-facing playbooks' },
      { kind: 'file', name: 'authoritative-sources.yaml', absPath: `${ABS}/docs/knowledge-freshness/authoritative-sources.yaml`, purpose: 'allowlist (47 hosts + 3 GitHub repos)' },
      { kind: 'file', name: 'reference.html', absPath: `${ABS}/docs/knowledge-freshness/reference.html`, purpose: 'this page' },
      { kind: 'file', name: 'REFERENCE-AUDIT.md', absPath: `${ABS}/docs/knowledge-freshness/REFERENCE-AUDIT.md`, purpose: 'R1 audit report (31 findings, shipped in PR #414)' },
      { kind: 'file', name: 'REFERENCE-AUDIT-R2.md', absPath: `${ABS}/docs/knowledge-freshness/REFERENCE-AUDIT-R2.md`, purpose: 'R2 audit report (14 findings, shipped in PR #415)' },
      { kind: 'file', name: 'REFERENCE-AUDIT-R3.md', absPath: `${ABS}/docs/knowledge-freshness/REFERENCE-AUDIT-R3.md`, purpose: 'R3 audit report (12 findings, fixed in this commit)' },
    ],
  },
  {
    kind: 'dir', name: 'docs/superpowers/specs', children: [
      { kind: 'file', name: '2026-05-24-knowledge-freshness-design.md', absPath: `${ABS}/docs/superpowers/specs/2026-05-24-knowledge-freshness-design.md`, purpose: 'parent spec (10 decisions)' },
      { kind: 'file', name: '2026-05-26-knowledge-freshness-gap-detection-design.md', absPath: `${ABS}/docs/superpowers/specs/2026-05-26-knowledge-freshness-gap-detection-design.md`, purpose: 'Phase 3 spec (6 decisions)' },
      { kind: 'file', name: '2026-05-26-lens-i-knowledge-root-design.md', absPath: `${ABS}/docs/superpowers/specs/2026-05-26-lens-i-knowledge-root-design.md`, purpose: 'Workstream B spec (20 decisions)' },
      { kind: 'file', name: '2026-05-26-knowledge-freshness-deepseek-provider-design.md', absPath: `${ABS}/docs/superpowers/specs/2026-05-26-knowledge-freshness-deepseek-provider-design.md`, purpose: 'DeepSeek provider design' },
    ],
  },
]

// ─── Stamp git SHA + date ─────────────────────────────────────
const gitSha = execSync('git rev-parse --short HEAD', { cwd: REPO_ROOT }).toString().trim()
const today = new Date().toISOString().slice(0, 10)
const kbVersion = fs.readFileSync(path.join(KB_ROOT, 'VERSION'), 'utf8').trim()

// ─── Substitute placeholders ──────────────────────────────────
// Each baked constant is bounded by /*BAKE:KEY_START*/ … /*BAKE:KEY_END*/
// sentinels so the build script is idempotent across re-runs (the prior
// __PLACEHOLDER__ split-and-join approach silently no-op'd on the second
// run because the placeholders were already consumed in the first bake).
let html = fs.readFileSync(HTML_PATH, 'utf8')
const subs = {
  KB_INVENTORY: JSON.stringify(KB_INVENTORY),
  ALLOWLIST: JSON.stringify(ALLOWLIST),
  TOP_HOSTS: JSON.stringify(TOP_HOSTS),
  DECISIONS: JSON.stringify(DECISIONS),
  DEFERRED: JSON.stringify(DEFERRED),
  ARCH_CALLOUTS: JSON.stringify(ARCH_CALLOUTS),
  FILE_MAP: JSON.stringify(FILE_MAP),
  GATES: JSON.stringify(GATES),
  PYRAMID: JSON.stringify(PYRAMID),
}
function escRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') }
for (const [k, v] of Object.entries(subs)) {
  const startTok = `/*BAKE:${k}_START*/`
  const endTok = `/*BAKE:${k}_END*/`
  // First-time: the file still has the legacy __PLACEHOLDER__ token; convert
  // it into a sentinel-bounded slot so subsequent re-bakes hit the regex path.
  if (html.includes(`__${k}__`)) {
    html = html.split(`__${k}__`).join(`${startTok}${v}${endTok}`)
    continue
  }
  // Subsequent re-bakes: regex-replace whatever is currently between sentinels
  // with the freshly-stringified JSON. Function form avoids $&/$1 interp.
  const re = new RegExp(escRe(startTok) + '[\\s\\S]*?' + escRe(endTok), 'g')
  if (!re.test(html)) {
    throw new Error(`bake slot for ${k} missing — page must contain ${startTok}…${endTok}. Re-create the slot or revert to placeholder __${k}__.`)
  }
  html = html.replace(re, () => `${startTok}${v}${endTok}`)
}
// Stamp git/date/version in the rail footer and hero. Each replacement targets
// the id="..." anchor (idempotent across re-bakes) — the previous form
// hardcoded the prior literal (e.g. "b4bb627f") and only worked on the first
// run after that literal was baked, silently no-op'ing on subsequent runs as
// the literal changed. (Gemini review finding.)
function stampById(html, id, value) {
  // Match an element with id="<id>" followed (after any number of other
  // attributes) by `>`, then capture the textContent up to the closing `<`.
  // Order-independent so we don't have to keep `id` last on the tag.
  // (Grok + Gemini both flagged the previous attr-order-brittle form.)
  const re = new RegExp(`(<[a-zA-Z]+[^>]*\\bid="${id}"[^>]*>)([^<]*)(<)`, 'g')
  if (!re.test(html)) {
    throw new Error(`stamp target id="${id}" not found in HTML`)
  }
  return html.replace(re, (_m, open, _old, close) => `${open}${value}${close}`)
}
// In CI, skip the date+SHA stamps so re-bakes don't diverge from the
// committed page just because git HEAD is a synthetic merge commit
// (PR builds) or the build runs on a different day than the bake.
// Local bakes still stamp normally; the drift CI's "rebake-must-be-no-op"
// check below depends on this so PR checks can pass deterministically.
// The page's actual SHA + date are set when a maintainer rebakes locally
// before pushing (or, in future, by a post-merge auto-rebake workflow).
const CI = !!process.env.CI
if (!CI) {
  html = stampById(html, 'genDate', today)
  html = stampById(html, 'genSha', gitSha)
}
html = stampById(html, 'kbVersion', kbVersion)
html = stampById(html, 'statEntries', String(KB_INVENTORY.entries.length))
// R2-F-014: stamp every literal-number-in-prose so adding entries / specs /
// hosts only requires re-running the build (not hand-editing the page).
html = stampById(html, 'metaEntries', String(KB_INVENTORY.entries.length))
html = stampById(html, 'metaHosts', String(ALLOWLIST.hosts.length))
html = stampById(html, 'metaRepos', String(ALLOWLIST.github_repos.length))
html = stampById(html, 'metaDecisions', String(DECISIONS.length))
// R3-F-009: surface the real cron-audit count alongside audit-eligible.
// Today realReviewedCount === 0; over time this will rise as the cron runs.
html = stampById(html, 'metaRealReviewed', String(KB_INVENTORY.realReviewedCount ?? 0))
html = stampById(html, 'statRealReviewed', String(KB_INVENTORY.realReviewedCount ?? 0))
const specCount = new Set(DECISIONS.map((d) => d.specId)).size
const specNames = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten']
html = stampById(html, 'metaSpecs', specNames[specCount - 1] || String(specCount))
html = stampById(html, 'allowlistHostCount', String(ALLOWLIST.hosts.length))
html = stampById(html, 'allowlistRepoCount', String(ALLOWLIST.github_repos.length))
html = stampById(html, 'statHosts', String(ALLOWLIST.hosts.length))
html = stampById(html, 'statRepos', String(ALLOWLIST.github_repos.length))
const totalCites = Object.values(TOP_HOSTS).reduce((a, b) => a + b, 0)
html = stampById(html, 'statCites', String(totalCites))
html = stampById(html, 'statUniqueHosts', String(Object.keys(TOP_HOSTS).length))
// The cadence-date input's initial value uses today's date so the page opens
// on a useful state. Guarded by !CI for the same reason as genDate/genSha
// above: a wall-clock stamp would otherwise re-drift the committed page in PR
// builds and fail the rebake-must-be-no-op drift check on any day after the
// local bake. Local bakes still set it; the maintainer rebakes before pushing.
if (!CI) {
  html = html.replace(/(id="cadenceDate"[^>]*value=")[^"]*(")/g, `$1${today}$2`)
}

fs.writeFileSync(HTML_PATH, html)
console.log(`Baked reference.html: ${KB_INVENTORY.entries.length} entries, ${ALLOWLIST.hosts.length} hosts, ${DECISIONS.length} decisions. SHA=${gitSha}.`)

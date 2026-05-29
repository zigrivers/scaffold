import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { findProjectRoot } from './project-root.js'

export type TrustMode = 'base-ref' | 'untrusted-head' | 'non-git'

export interface TrustModeArgs {
  diff?: string
  pr?: number
  staged?: boolean
  base?: string
  'config-base-ref'?: string
}

export interface ClassifyOptions {
  cwd: string
  args: TrustModeArgs
  /** Hook for tests to stub gh; defaults to live gh CLI. */
  resolvePrBase?: (pr: number, cwd: string) => string | undefined
  /** Whether we're in CI; defaults to env detection. Injectable for tests. */
  isCI?: boolean
}

/**
 * Discriminated so a `base-ref` result always carries a `base_ref` and the
 * other modes never do — consumers get this for free from the union.
 */
export type ClassifyResult =
  | { trust_mode: 'base-ref'; base_ref: string }
  | { trust_mode: 'untrusted-head' | 'non-git'; base_ref?: undefined }

// Conservative git refname allow-list: letters, digits, and . _ - / only, and
// none of the constructs that could smuggle surprising rev syntax into a later
// `git show <ref>:.mmr.yaml` (':' separator, '..' ranges, '@{' reflog, leading
// '-'/'/'). An unsafe ref fails closed to untrusted-head.
const SAFE_REF_RE = /^[A-Za-z0-9._/~^-]+$/
function isSafeRef(ref: string): boolean {
  return (
    SAFE_REF_RE.test(ref) &&
    !ref.includes('..') &&
    !ref.includes('@{') &&
    !ref.startsWith('-') &&
    !ref.startsWith('/') &&
    !ref.endsWith('/')
  )
}

function asBaseRef(ref: string): ClassifyResult {
  return isSafeRef(ref) ? { trust_mode: 'base-ref', base_ref: ref } : { trust_mode: 'untrusted-head' }
}

/**
 * Broad CI detection — must err toward "yes" because misdetecting CI as local
 * re-opens the self-trust hole. Almost every CI sets CI to a truthy value
 * (GitHub/GitLab/CircleCI/Travis/Buildkite/Vercel/Netlify set CI=true; some use
 * CI=1); a few that don't are covered by their own markers.
 */
function detectCI(): boolean {
  const ci = process.env.CI
  if (ci !== undefined && ci !== '' && ci.toLowerCase() !== 'false' && ci !== '0') return true
  return Boolean(
    process.env.GITHUB_ACTIONS ||
      process.env.GITLAB_CI ||
      process.env.BUILDKITE ||
      process.env.TF_BUILD || // Azure Pipelines
      process.env.JENKINS_URL ||
      process.env.TEAMCITY_VERSION,
  )
}

function isGitRepo(cwd: string): boolean {
  // Authoritative check first: handles worktrees, submodules, monorepo
  // subdirs, and bare-repo edge cases correctly.
  try {
    const out = execFileSync('git', ['rev-parse', '--is-inside-work-tree'], {
      cwd,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 5000,
    })
    if (out.trim() === 'true') return true
  } catch {
    // git missing or not a work tree → fall through to the advisory FS check.
  }
  // Advisory fallback (also what the .git-fixture tests exercise). NOT the
  // security boundary: a git repo with no explicit trusted ref classifies as
  // 'untrusted-head', and base-ref modes resolve through real git/gh which fail
  // on a planted/fake .git — so a forged .git only ever yields untrusted-head.
  return fs.existsSync(path.join(findProjectRoot(cwd), '.git'))
}

function defaultResolvePrBase(pr: number, cwd: string): string | undefined {
  try {
    const raw = execFileSync('gh', ['pr', 'view', String(pr), '--json', 'baseRefName'], {
      cwd,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 10000,
    })
    const parsed = JSON.parse(raw) as { baseRefName?: string }
    if (parsed.baseRefName && parsed.baseRefName.length > 0) return parsed.baseRefName
  } catch {
    return undefined
  }
  return undefined
}

export function classifyTrustMode(opts: ClassifyOptions): ClassifyResult {
  const { cwd, args } = opts
  const resolvePrBase = opts.resolvePrBase ?? defaultResolvePrBase
  const isCI = opts.isCI ?? detectCI()

  // Explicit operator override always wins.
  if (args['config-base-ref']) return asBaseRef(args['config-base-ref'])

  if (!isGitRepo(cwd)) return { trust_mode: 'non-git' }

  // --pr resolves the PR's UPSTREAM base branch via gh, so it determines trust
  // even when a (possibly malicious) --base is also present — matching
  // resolveDiff, which reviews the PR diff. Resolution failure fails closed.
  if (args.pr !== undefined) {
    const resolved = resolvePrBase(args.pr, cwd)
    return resolved ? asBaseRef(resolved) : { trust_mode: 'untrusted-head' }
  }

  if (args.base) return asBaseRef(args.base)

  // --staged reviews the index against HEAD. HEAD is a trusted base locally,
  // but in CI it may be an attacker's PR checkout, so fail closed there too —
  // consistent with the no-flag default below.
  if (args.staged) return isCI ? { trust_mode: 'untrusted-head' } : asBaseRef('HEAD')

  // Default (plain `mmr review` working tree, or `--diff`): trusting HEAD is
  // safe locally (HEAD is your committed history) but NOT in CI, where the
  // working tree may be an attacker's PR checkout. So `--diff` is always
  // untrusted, and the no-flags default trusts HEAD only outside CI; in CI it
  // fails closed and requires an explicit trusted ref (--pr/--base/
  // --config-base-ref). NOTE: this is stricter than the original plan, which
  // returned base-ref:HEAD unconditionally — changed to close a CI
  // self-trust hole (see Group H note).
  if (args.diff !== undefined || isCI) return { trust_mode: 'untrusted-head' }
  return asBaseRef('HEAD')
}

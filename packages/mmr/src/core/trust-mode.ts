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
  head?: string
  'config-base-ref'?: string
}

export interface ClassifyOptions {
  cwd: string
  args: TrustModeArgs
  /** Hook for tests to stub gh; defaults to live gh CLI. */
  resolvePrBase?: (pr: number, cwd: string) => string | undefined
}

export interface ClassifyResult {
  trust_mode: TrustMode
  /** When trust_mode === 'base-ref', the resolved trusted ref. */
  base_ref?: string
}

function isGitRepo(cwd: string): boolean {
  // findProjectRoot walks up for .git and falls back to cwd; this is a Git repo
  // only when the resolved root actually contains a .git entry.
  return fs.existsSync(path.join(findProjectRoot(cwd), '.git'))
}

function defaultResolvePrBase(pr: number, cwd: string): string | undefined {
  try {
    const raw = execFileSync('gh', ['pr', 'view', String(pr), '--json', 'baseRefName'], {
      cwd,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
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

  // Explicit caller override always wins.
  if (args['config-base-ref']) {
    return { trust_mode: 'base-ref', base_ref: args['config-base-ref'] }
  }

  if (!isGitRepo(cwd)) {
    return { trust_mode: 'non-git' }
  }

  if (args.base) {
    return { trust_mode: 'base-ref', base_ref: args.base }
  }

  if (args.staged) {
    return { trust_mode: 'base-ref', base_ref: 'HEAD' }
  }

  if (args.pr !== undefined) {
    const baseRef = resolvePrBase(args.pr, cwd)
    if (baseRef) return { trust_mode: 'base-ref', base_ref: baseRef }
    return { trust_mode: 'untrusted-head' }
  }

  // --diff (file or stdin) with no --base in a Git repo → untrusted-head.
  if (args.diff !== undefined) {
    return { trust_mode: 'untrusted-head' }
  }

  // Default: `mmr review` with no flags reviews working-tree unstaged changes
  // against HEAD — HEAD is the trust base.
  return { trust_mode: 'base-ref', base_ref: 'HEAD' }
}

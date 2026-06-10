// Knowledge-base VERSION bump logic.
//
// Pure functions only — no I/O, no git, no GH. The workflow in
// .github/workflows/knowledge-freshness-version-bump.yml reads
// content/knowledge/VERSION, calls `deriveBumpKind` from the PR title/body,
// calls `bumpSemver` to compute the next version, and writes it back.
//
// We intentionally do not depend on a SemVer library — the bump rules here
// are a tiny subset (major/minor/patch on `X.Y.Z` with no prerelease tags).

export type BumpKind = 'major' | 'minor' | 'patch'

/**
 * Derive the bump kind from a Conventional Commits-flavored PR title and body.
 *
 * Rules (first match wins):
 *   1. `BREAKING CHANGE:` token anywhere in title or body → major
 *   2. `feat(knowledge):` or `feat(knowledge-freshness):` title prefix → minor
 *   3. `chore(knowledge):` or `chore(knowledge-freshness):` title prefix → patch
 *   4. Anything else → patch (the workflow logs a `::notice::` for this case)
 *
 * Title matching is case-sensitive against the literal prefix (Conventional
 * Commits canonicalizes to lowercase). The BREAKING CHANGE token is matched
 * case-sensitively as well — that's the canonical form.
 */
export function deriveBumpKind(prTitle: string, prBody: string): BumpKind {
  // BREAKING CHANGE wins over everything else, even if title is `feat(...)`.
  //
  // Round-2 F-002: the body match MUST be anchored to start-of-line. A
  // freshness PR's body contains an LLM-generated findings table where an
  // evidence URL or excerpt that happens to mention "BREAKING CHANGE:"
  // would otherwise trigger an accidental major bump. The canonical
  // Conventional Commits "BREAKING CHANGE:" footer lives on its own line.
  const breakingInBody = /^BREAKING CHANGE:/m.test(prBody)
  if (prTitle.includes('BREAKING CHANGE:') || breakingInBody) {
    return 'major'
  }
  if (prTitle.startsWith('feat(knowledge):') || prTitle.startsWith('feat(knowledge-freshness):')) {
    return 'minor'
  }
  if (prTitle.startsWith('chore(knowledge):') || prTitle.startsWith('chore(knowledge-freshness):')) {
    return 'patch'
  }
  return 'patch'
}

/**
 * Bump a `X.Y.Z` SemVer string by the given kind. Throws on invalid input.
 *
 *  - `major`: `X.Y.Z` → `(X+1).0.0`
 *  - `minor`: `X.Y.Z` → `X.(Y+1).0`
 *  - `patch`: `X.Y.Z` → `X.Y.(Z+count)`
 *
 * `count` is a CATCH-UP multiplier for patch bumps: when several
 * `chore(knowledge): refresh` PRs merge in a rapid batch, the version-bump
 * workflow's single concurrency group cancels the intermediate runs, so a
 * surviving run must advance VERSION by all the patch bumps it owes (one per
 * un-bumped refresh commit) instead of just one. `count` applies ONLY to
 * `patch` — `minor`/`major` are deliberate, single, and reset the lower fields,
 * so a catch-up count is meaningless for them and is ignored. Defaults to 1,
 * preserving the original single-bump behavior.
 */
export function bumpSemver(current: string, kind: BumpKind, count = 1): string {
  // Trim because VERSION files routinely have a trailing newline.
  const trimmed = current.trim()
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(trimmed)
  if (!match) {
    throw new Error(`bumpSemver: invalid SemVer "${current}" (expected X.Y.Z)`)
  }
  const major = Number(match[1])
  const minor = Number(match[2])
  const patch = Number(match[3])
  switch (kind) {
  case 'major':
    return `${major + 1}.0.0`
  case 'minor':
    return `${major}.${minor + 1}.0`
  case 'patch':
    // count is only meaningful for patch — validate it here so a minor/major
    // bump with an unused/invalid count is ignored rather than throwing.
    if (!Number.isInteger(count) || count < 1) {
      throw new Error(`bumpSemver: count must be a positive integer (got ${count})`)
    }
    return `${major}.${minor}.${patch + count}`
  }
}

/**
 * Replay a sequence of bump kinds against a starting version, in order.
 *
 * This is the catch-up primitive when several knowledge PRs merged in a rapid
 * batch and the version-bump workflow's single concurrency group cancelled the
 * intermediate runs: a surviving run replays the per-commit kind of EVERY
 * un-bumped commit (oldest→newest), so a mixed batch is handled correctly — a
 * `feat` (minor) in the middle resets the patch field, a later `chore` (patch)
 * adds to it. Replaying N patch bumps is equivalent to `bumpSemver(_, 'patch',
 * N)`, so this subsumes the count multiplier. An empty list returns the
 * (trimmed) input unchanged.
 */
export function bumpSemverReplay(current: string, kinds: BumpKind[]): string {
  return kinds.reduce((version, kind) => bumpSemver(version, kind), current.trim())
}

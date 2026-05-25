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
  if (prTitle.includes('BREAKING CHANGE:') || prBody.includes('BREAKING CHANGE:')) {
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
 *  - `patch`: `X.Y.Z` → `X.Y.(Z+1)`
 */
export function bumpSemver(current: string, kind: BumpKind): string {
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
    return `${major}.${minor}.${patch + 1}`
  }
}

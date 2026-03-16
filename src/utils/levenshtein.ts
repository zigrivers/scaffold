/**
 * Compute the Levenshtein (edit) distance between two strings.
 * Used for fuzzy matching in error suggestions ("Did you mean...?").
 */
export function levenshteinDistance(a: string, b: string): number {
  const m = a.length
  const n = b.length

  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  )

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1]
      } else {
        dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1])
      }
    }
  }

  return dp[m][n]
}

/**
 * Find the closest match to target from candidates within maxDistance.
 * Returns null if no candidate is within maxDistance.
 */
export function findClosestMatch(
  target: string,
  candidates: string[],
  maxDistance = 2,
): string | null {
  let bestMatch: string | null = null
  let bestDistance = maxDistance + 1

  for (const candidate of candidates) {
    const distance = levenshteinDistance(target, candidate)
    if (distance < bestDistance) {
      bestDistance = distance
      bestMatch = candidate
    }
  }

  return bestMatch
}

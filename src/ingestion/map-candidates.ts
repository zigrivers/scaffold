import { resolveContainedArtifactPath } from '../utils/artifact-path.js'
import { fileExists } from '../utils/fs.js'

/** A proposed step→incumbent mapping (D10a), rendered as a plan disposition. */
export interface MapCandidate {
  step: string
  target: string
  evidence: string
}

/**
 * Incumbent files that can plausibly satisfy a pipeline step (D10a).
 * Deliberately small and evidence-based. README.md is NEVER a candidate:
 * "a README exists" is exactly the any-output-exists false-positive class
 * this design removes (spec §1 — the beads/CLAUDE.md lesson).
 */
export const CANDIDATE_SOURCES: ReadonlyArray<{ step: string; paths: readonly string[] }> = [
  {
    step: 'coding-standards',
    paths: ['CONTRIBUTING.md', 'docs/CONTRIBUTING.md', 'STYLEGUIDE.md', 'docs/STYLEGUIDE.md'],
  },
  {
    step: 'system-architecture',
    paths: ['ARCHITECTURE.md', 'docs/ARCHITECTURE.md', 'docs/architecture.md'],
  },
  {
    step: 'security',
    paths: ['SECURITY.md', 'docs/SECURITY.md'],
  },
  {
    step: 'dev-env-setup',
    paths: ['DEVELOPMENT.md', 'docs/DEVELOPMENT.md'],
  },
  {
    step: 'tdd',
    paths: ['TESTING.md', 'docs/TESTING.md'],
  },
]

/**
 * True when `rel` resolves to an existing file that stays within
 * `projectRoot` — symlink escapes are rejected. Mirrors the
 * resolveContainedArtifactPath + fileExists pattern already used by
 * src/state/completion.ts for artifact_map lookups. This is what keeps a
 * proposed `target` from ever pointing outside the project root.
 */
function isContainedAndPresent(projectRoot: string, rel: string): boolean {
  const full = resolveContainedArtifactPath(projectRoot, rel)
  return full !== null && fileExists(full)
}

/**
 * Propose artifact_map candidates for the adoption plan. A candidate is
 * proposed only when the step is in the resolved pipeline, is not already
 * satisfied (verified/declared complete), has no existing mapping, and the
 * incumbent file exists and stays within the project root. First matching
 * path wins — one proposal per step. Proposals are rendered in the plan and
 * applied only on approval (D1).
 */
export function proposeMapCandidates(options: {
  projectRoot: string
  resolvedSteps: readonly string[]
  satisfiedSteps: ReadonlySet<string>
  existingMap: Readonly<Record<string, string>>
}): MapCandidate[] {
  const { projectRoot, resolvedSteps, satisfiedSteps, existingMap } = options
  const resolved = new Set(resolvedSteps)
  const out: MapCandidate[] = []
  for (const { step, paths: candidatePaths } of CANDIDATE_SOURCES) {
    if (!resolved.has(step)) continue
    if (satisfiedSteps.has(step)) continue
    if (existingMap[step] !== undefined) continue
    for (const rel of candidatePaths) {
      if (isContainedAndPresent(projectRoot, rel)) {
        out.push({ step, target: rel, evidence: `${rel} exists` })
        break
      }
    }
  }
  return out
}

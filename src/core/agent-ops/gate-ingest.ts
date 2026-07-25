import fs from 'node:fs'
import path from 'node:path'
import yaml from 'js-yaml'

/** Ingestion-lite (spec D7 / D10-lite): seed the generated gate from what the
 *  project already runs — package.json scripts and CI workflow run: lines.
 *  Never invent; what cannot be classified is left out and the seed fails loud. */
export interface GateSeed {
  /** Commands the merge gate runs (lint, typecheck, unit — ordered). */
  gateCommands: string[]
  /** Test-runner startup probes for GATE_PROBE mode (no suite execution). */
  probeCommands: string[]
  /** Functional runtime checks that always run (node, java-not-stub). */
  runtimeProbes: string[]
  /** The affected-selection line for gate-check-affected.sh (or its full fallback). */
  affectedInvocation: string
  /** The TIA-selection invocation line (receives $TIA_TESTS) or its full fallback. */
  tiaInvocation: string
  /** Environment-sensitive suites — EXCLUDED from the queue gate (rumble lesson). */
  visualCommands: string[]
  /** Self-contained dependency install ('[ -d node_modules ] || npm ci' or ':'). */
  ensureDeps: string
  /** Provenance lines, e.g. "package.json:scripts.test". */
  sources: string[]
}

const ENV_SENSITIVE_RE = /playwright|cypress|screenshot|visual|storybook|percy|chromatic|\be2e\b|end-to-end/i
const GATE_SCRIPT_ORDER = ['lint', 'typecheck', 'check', 'test'] as const
const WORKFLOW_CMD_RE = /^(npm|npx|yarn|pnpm|make|pytest|go test|cargo|bats)\b/
const WORKFLOW_TESTISH_RE = /test|lint|check|tsc|vitest|pytest|bats/i
const JAVA_RE = /\bjava\b|emulators:exec|firebase.*emulators/i

interface PackageJson {
  scripts?: Record<string, string>
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
}

function readPackageJson(projectRoot: string): PackageJson | null {
  const p = path.join(projectRoot, 'package.json')
  if (!fs.existsSync(p)) return null
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8')) as PackageJson
  } catch {
    return null
  }
}

function workflowRunLines(projectRoot: string): { file: string; run: string }[] {
  const dir = path.join(projectRoot, '.github', 'workflows')
  // isDirectory guards the pathological case where .github/workflows exists as a
  // FILE — a bare existsSync would let readdirSync below throw ENOTDIR.
  if (!fs.statSync(dir, { throwIfNoEntry: false })?.isDirectory()) return []
  const out: { file: string; run: string }[] = []
  for (const name of fs.readdirSync(dir).filter(f => /\.ya?ml$/.test(f)).sort()) {
    const rel = path.posix.join('.github/workflows', name)
    let doc: unknown
    try {
      doc = yaml.load(fs.readFileSync(path.join(dir, name), 'utf8'))
    } catch {
      continue // unparseable workflow — skip, never guess
    }
    const jobs = (doc as { jobs?: Record<string, { steps?: { run?: unknown }[] }> } | null)?.jobs
    if (!jobs || typeof jobs !== 'object') continue
    for (const job of Object.values(jobs)) {
      for (const step of job?.steps ?? []) {
        if (typeof step?.run !== 'string') continue
        for (const line of step.run.split('\n')) {
          const cmd = line.trim()
          if (cmd !== '') out.push({ file: rel, run: cmd })
        }
      }
    }
  }
  return out
}

export function ingestGateSeed(projectRoot: string): GateSeed {
  const pkg = readPackageJson(projectRoot)
  const gateCommands: string[] = []
  const visualCommands: string[] = []
  const sources: string[] = []
  let mentionsJava = false

  const scripts = pkg?.scripts ?? {}
  const scriptNames = Object.keys(scripts)
  // Priority scripts (lint/typecheck/check/test) come first in that fixed order;
  // everything else follows in package.json declaration order (not re-sorted —
  // re-sorting alphabetically would separate related pairs like test/test:visual).
  const ordered = [
    ...GATE_SCRIPT_ORDER.filter(n => scriptNames.includes(n)),
    ...scriptNames.filter(n => !(GATE_SCRIPT_ORDER as readonly string[]).includes(n)),
  ]
  for (const name of ordered) {
    const body = scripts[name]
    if (JAVA_RE.test(body)) mentionsJava = true
    const testish = /test|lint|typecheck|check|e2e/i.test(name)
    if (!testish) continue
    if (ENV_SENSITIVE_RE.test(name) || ENV_SENSITIVE_RE.test(body)) {
      visualCommands.push(`npm run ${name}`)
      sources.push(`package.json:scripts.${name} (environment-sensitive — excluded from the queue gate)`)
    } else {
      gateCommands.push(`npm run ${name}`)
      sources.push(`package.json:scripts.${name}`)
    }
  }

  for (const { file, run } of workflowRunLines(projectRoot)) {
    if (!WORKFLOW_CMD_RE.test(run) || !WORKFLOW_TESTISH_RE.test(run)) continue
    if (JAVA_RE.test(run)) mentionsJava = true
    if (ENV_SENSITIVE_RE.test(run)) {
      if (!visualCommands.includes(run)) {
        visualCommands.push(run)
        sources.push(`${file}: ${run} (environment-sensitive — excluded from the queue gate)`)
      }
    } else if (!gateCommands.includes(run)) {
      gateCommands.push(run)
      sources.push(`${file}: ${run}`)
    }
  }

  const hasVitest =
    pkg !== null &&
    (pkg.devDependencies?.vitest !== undefined || pkg.dependencies?.vitest !== undefined)

  const runtimeProbes: string[] = []
  if (pkg !== null) {
    runtimeProbes.push(
      'node --version >/dev/null 2>&1 || { echo "gate-check: node is not on PATH" >&2; exit 1; }',
    )
  }
  if (mentionsJava) {
    runtimeProbes.push(
      'java -version >/dev/null 2>&1 || { echo "gate-check: java is not functional ' +
        '(macOS stub?) — brew install openjdk" >&2; exit 1; }',
    )
  }

  return {
    gateCommands,
    probeCommands: hasVitest ? ['npx vitest --version >/dev/null'] : [],
    runtimeProbes,
    affectedInvocation: hasVitest
      ? 'npx vitest run --changed "$BASE" ${EXCLUDE_ARGS[@]+"${EXCLUDE_ARGS[@]}"}'
      : 'full "no affected-selection runner detected at seed time"',
    tiaInvocation: hasVitest
      ? 'printf \'%s\\n\' "$TIA_TESTS" | xargs npx vitest run "${EXCLUDE_ARGS[@]+"${EXCLUDE_ARGS[@]}"}"'
      : 'full "no TIA invocation configured for this stack"',
    visualCommands,
    ensureDeps: pkg !== null ? '[ -d node_modules ] || npm ci' : ':',
    sources,
  }
}

/** Marker map for the two gate templates (Task 7 + Task 8). */
export function gateTemplateVars(seed: GateSeed): Record<string, string> {
  return {
    GATE_ENSURE_DEPS: seed.ensureDeps,
    GATE_RUNTIME_PROBES: seed.runtimeProbes.length > 0 ? seed.runtimeProbes.join('\n') : ':',
    GATE_PROBE_COMMANDS: seed.probeCommands.length > 0 ? seed.probeCommands.join('\n') : ':',
    GATE_FULL_COMMANDS:
      seed.gateCommands.length > 0
        ? seed.gateCommands.join('\n')
        : 'echo "gate-check: no gate commands were detected at seed time — add your ' +
          'test/lint commands here" >&2; exit 1',
    GATE_AFFECTED_INVOCATION: seed.affectedInvocation,
    GATE_TIA_INVOCATION: seed.tiaInvocation,
  }
}

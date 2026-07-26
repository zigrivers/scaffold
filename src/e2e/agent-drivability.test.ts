import { describe, it, expect, beforeAll } from 'vitest'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const CLI = fileURLToPath(new URL('../../dist/index.js', import.meta.url))

/**
 * The timeout is load-bearing, not defensive.
 *
 * This suite's headline property is "no invocation hangs". Without a bound, a
 * regression that waits on input would hang CI forever instead of failing a
 * test — the very thing being asserted would be the thing preventing the
 * assertion from running.
 */
const RUN_TIMEOUT_MS = 60_000

/** Run the CLI exactly as an agent would: no TTY, stdin closed, JSON out. */
function run(args: string[], cwd: string): { code: number; stdout: string; stderr: string } {
  try {
    const stdout = execFileSync(process.execPath, [CLI, ...args], {
      cwd, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'], timeout: RUN_TIMEOUT_MS,
    })
    return { code: 0, stdout, stderr: '' }
  } catch (e) {
    const err = e as {
      status: number | null; stdout: string; stderr: string
      killed?: boolean; signal?: string; code?: string
    }
    if (err.killed || err.signal === 'SIGTERM' || err.code === 'ETIMEDOUT') {
      throw new Error(
        `scaffold ${args.join(' ')} did not exit within ${RUN_TIMEOUT_MS}ms. `
        + 'A command waited for input an agent cannot supply, which is the exact '
        + 'failure this suite exists to catch.',
      )
    }
    return { code: err.status ?? 1, stdout: err.stdout ?? '', stderr: err.stderr ?? '' }
  }
}

function tmpRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scaffold-agent-'))
  execFileSync('git', ['init', '-q'], { cwd: dir })
  return dir
}

function brownfieldRepo(): string {
  const dir = tmpRepo()
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({
    name: 'acme-api', type: 'module',
    dependencies: { express: '^4.19.0', pg: '^8.11.0' },
  }))
  fs.mkdirSync(path.join(dir, 'src'))
  fs.writeFileSync(path.join(dir, 'src', 'server.js'), 'export default {}\n')
  fs.writeFileSync(path.join(dir, 'README.md'), '# Acme API\n')
  execFileSync('git', ['add', '-A'], { cwd: dir })
  execFileSync('git', [
    '-c', 'user.email=t@t.co', '-c', 'user.name=t', 'commit', '-qm', 'init',
  ], { cwd: dir })
  return dir
}

// This suite drives the COMPILED CLI, so it needs dist/. `make check-all` runs
// `npm run build` before `npm test` (Makefile ts-check), but a bare
// `npx vitest run` does not. Skip with a clear reason rather than failing every
// case, so a partial gate run is unambiguous about what was and was not checked.
const DIST_BUILT = fs.existsSync(CLI)

beforeAll(() => {
  if (!DIST_BUILT) {
    console.warn('[agent-drivability] dist/ is absent — run `npm run build`. Suite skipped.')
  }
})

// ---------------------------------------------------------------------------
// Property 2: no unparseable failure
// ---------------------------------------------------------------------------

describe.skipIf(!DIST_BUILT)('agent-drivability: every failure is parseable', () => {
  // Table-driven on purpose. Sampling three invocations and calling it "never
  // exits non-zero with empty stdout" would leave whole families free to
  // regress while the advertised criterion stayed green.
  const FAILURE_CASES: Array<{ name: string; args: string[]; setup?: (dir: string) => void }> = [
    { name: 'init: no project type', args: ['init', '--auto', '--format', 'json'] },
    {
      name: 'init: missing discriminator',
      args: ['init', '--auto', '--format', 'json', '--project-type', 'web-app'],
    },
    { name: 'init: unknown flag', args: ['init', '--format', 'json', '--nonexistent-flag'] },
    {
      name: 'init: mixed flag families (.check path)',
      args: ['init', '--format', 'json', '--web-rendering', 'ssr', '--backend-api-style', 'rest'],
    },
    {
      name: 'init --from: unreadable path',
      args: ['init', '--format', 'json', '--from', 'does-not-exist.yml'],
    },
    {
      name: 'init --from: invalid yaml',
      args: ['init', '--format', 'json', '--from', 'bad.yml'],
      setup: dir => fs.writeFileSync(path.join(dir, 'bad.yml'), 'methodology: [unclosed\n'),
    },
    {
      name: 'init --from: already initialized',
      args: ['init', '--format', 'json', '--from', 'ok.yml'],
      setup: dir => {
        fs.writeFileSync(
          path.join(dir, 'ok.yml'),
          'version: 2\nmethodology: mvp\nplatforms:\n  - claude-code\n',
        )
        run(['init', '--auto', '--format', 'json', '--cli-interactivity', 'args-only'], dir)
      },
    },
    { name: 'adopt: bare --apply', args: ['adopt', '--auto', '--format', 'json', '--apply'] },
    {
      name: 'adopt: plan drift',
      args: ['adopt', '--auto', '--format', 'json', '--apply', '--plan-key', 'deadbeef'],
    },
    { name: 'status: not initialized', args: ['status', '--format', 'json'] },
  ]

  it.each(FAILURE_CASES)('$name exits non-zero with a parseable envelope', ({ args, setup }) => {
    const dir = args[0] === 'adopt' ? brownfieldRepo() : tmpRepo()
    setup?.(dir)
    const r = run(args, dir)
    expect(r.code, `${args.join(' ')} unexpectedly succeeded`).not.toBe(0)
    expect(r.stdout.trim(), `${args.join(' ')} produced empty stdout`).not.toBe('')
    const parsed = JSON.parse(r.stdout)
    expect(parsed.success).toBe(false)
    expect(parsed.errors.length, 'errors must not be empty').toBeGreaterThan(0)
    expect(parsed.exit_code, 'envelope exit_code must match process status').toBe(r.code)
    // Property 4: the failure names its own fix.
    expect(parsed.errors[0].code, 'error must carry a code').toBeTruthy()
    expect(parsed.errors[0].message, 'error must carry a message').toBeTruthy()
    expect(parsed.errors[0].recovery, 'error must carry actionable recovery').toBeTruthy()
  }, RUN_TIMEOUT_MS)

  it('preserves the SPECIFIC recovery text through the init handler', () => {
    // The handler wraps a carried ScaffoldError in withRecovery(..., generic
    // fallback). withRecovery uses `e.recovery ?? fallback`, so the specific
    // text should survive — but asserting only that recovery is "truthy"
    // could not tell the difference between the real hint and the fallback.
    const dir = tmpRepo()
    const r = run(['init', '--auto', '--format', 'json', '--project-type', 'web-app'], dir)
    expect(r.code).toBe(1)
    const recovery = JSON.parse(r.stdout).errors[0].recovery
    expect(recovery).toContain('--web-rendering')
    expect(recovery).toContain('spa')
    expect(recovery).not.toContain('See the message above')
  }, RUN_TIMEOUT_MS)

  it('never prints the usage block on an argument error', () => {
    const r = run(['init', '--format', 'json', '--nonexistent-flag'], tmpRepo())
    expect(r.stderr).not.toContain('Web-App Configuration:')
    expect(r.stderr).not.toContain('Game Configuration:')
  }, RUN_TIMEOUT_MS)
})

// ---------------------------------------------------------------------------
// Property 3: no silent misconfiguration
// ---------------------------------------------------------------------------

describe.skipIf(!DIST_BUILT)('agent-drivability: nothing is invented', () => {
  it('refuses to guess when a piped invocation omits --auto', () => {
    // The config assertion is the load-bearing one. An implementation that
    // changes only the output context fails here while passing on exit code.
    const dir = tmpRepo()
    const r = run(['init', '--project-type', 'web-app'], dir)
    expect(r.code).toBe(1)
    expect(fs.existsSync(path.join(dir, '.scaffold', 'config.yml'))).toBe(false)
  }, RUN_TIMEOUT_MS)

  it('requires a discriminator under --format json', () => {
    const dir = tmpRepo()
    const r = run(['init', '--format', 'json', '--project-type', 'web-app'], dir)
    expect(r.code).toBe(1)
    expect(JSON.parse(r.stdout).errors[0].code).toBe('INIT_AUTO_FLAG_REQUIRED')
    expect(fs.existsSync(path.join(dir, '.scaffold', 'config.yml'))).toBe(false)
  }, RUN_TIMEOUT_MS)

  it('records a project type whenever it writes a config', () => {
    const dir = tmpRepo()
    const r = run(
      ['init', '--auto', '--format', 'json', '--project-type', 'cli', '--cli-interactivity', 'args-only'],
      dir,
    )
    expect(r.code).toBe(0)
    const config = fs.readFileSync(path.join(dir, '.scaffold', 'config.yml'), 'utf-8')
    expect(config).toContain('projectType: cli')
  }, RUN_TIMEOUT_MS)

  it('infers the project type from a type-specific flag alone', () => {
    const dir = tmpRepo()
    const r = run(['init', '--auto', '--format', 'json', '--cli-interactivity', 'args-only'], dir)
    expect(r.code).toBe(0)
    expect(JSON.parse(r.stdout).success).toBe(true)
    expect(fs.readFileSync(path.join(dir, '.scaffold', 'config.yml'), 'utf-8'))
      .toContain('projectType: cli')
  }, RUN_TIMEOUT_MS)
})

// ---------------------------------------------------------------------------
// Properties 1 and 5: path (a) new project
// ---------------------------------------------------------------------------

describe.skipIf(!DIST_BUILT)('agent-drivability: path (a) new project', () => {
  it('drives init through the pipeline loop with no human input', () => {
    const dir = tmpRepo()

    const init = run(
      ['init', '--auto', '--format', 'json', '--project-type', 'cli', '--cli-interactivity', 'args-only'],
      dir,
    )
    expect(init.code).toBe(0)
    const initData = JSON.parse(init.stdout)
    expect(initData.success).toBe(true)
    expect(initData.data.configPath).toContain('.scaffold')

    const next = run(['next', '--format', 'json'], dir)
    expect(next.code).toBe(0)
    const nextData = JSON.parse(next.stdout)
    expect(nextData.data.eligible.length).toBeGreaterThan(0)
    expect(nextData.data.eligible[0].command).toMatch(/^scaffold run /)
    expect(nextData.data.pipeline_complete).toBe(false)

    const slug = nextData.data.eligible[0].slug
    const step = run(['run', slug], dir)
    expect(step.code).toBe(0)
    expect(step.stdout.length).toBeGreaterThan(100)

    const complete = run(['complete', slug, '--format', 'json'], dir)
    expect(complete.code).toBe(0)
    expect(JSON.parse(complete.stdout).success).toBe(true)
  }, RUN_TIMEOUT_MS * 2)
})

// ---------------------------------------------------------------------------
// Properties 1 and 5: path (b) brownfield
// ---------------------------------------------------------------------------

describe.skipIf(!DIST_BUILT)('agent-drivability: path (b) brownfield', () => {
  it('plans without writing, then applies by key, with no prior init', () => {
    const dir = brownfieldRepo()

    const plan = run(['adopt', '--auto', '--format', 'json'], dir)
    expect(plan.code).toBe(0)
    const planData = JSON.parse(plan.stdout)
    expect(planData.data.plan_key).toMatch(/^[0-9a-f]{64}$/)
    expect(planData.data.mode).toBe('brownfield')

    // Plan mode writes nothing.
    const dirty = execFileSync('git', ['status', '--porcelain'], { cwd: dir, encoding: 'utf-8' })
    expect(dirty.trim()).toBe('')

    const apply = run(
      ['adopt', '--auto', '--format', 'json', '--apply', '--plan-key', planData.data.plan_key],
      dir,
    )
    expect(apply.code).toBe(0)
    const applyData = JSON.parse(apply.stdout)
    expect(applyData.data.applied).toBe(true)
    expect(applyData.data.initialized).toBe(true)

    const next = run(['next', '--format', 'json'], dir)
    expect(next.code).toBe(0)
    expect(JSON.parse(next.stdout).data.eligible[0].command).toMatch(/^scaffold run /)
  }, RUN_TIMEOUT_MS * 2)

  it('is idempotent on re-apply', () => {
    const dir = brownfieldRepo()
    const k1 = JSON.parse(run(['adopt', '--auto', '--format', 'json'], dir).stdout).data.plan_key
    run(['adopt', '--auto', '--format', 'json', '--apply', '--plan-key', k1], dir)
    const k2 = JSON.parse(run(['adopt', '--auto', '--format', 'json'], dir).stdout).data.plan_key
    const again = run(['adopt', '--auto', '--format', 'json', '--apply', '--plan-key', k2], dir)
    expect(again.code).toBe(0)
    expect(JSON.parse(again.stdout).data.initialized).toBe(false)
  }, RUN_TIMEOUT_MS * 2)
})

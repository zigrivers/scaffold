import { describe, it, expect, beforeEach } from 'vitest'
import { spawnSync } from 'node:child_process'
import { CodexAdapter } from './codex.js'
import type { AdapterContext, AdapterStepInput, AdapterFinalizeInput, AdapterStepOutput } from './adapter.js'

const makeContext = (overrides?: Partial<AdapterContext>): AdapterContext => ({
  projectRoot: '/projects/myapp',
  methodology: 'standard',
  allSteps: ['define-goals', 'design-arch', 'create-spec'],
  ...overrides,
})

const makeStepInput = (overrides?: Partial<AdapterStepInput>): AdapterStepInput => ({
  slug: 'define-goals',
  description: 'Define project goals',
  phase: 'pre',
  dependsOn: [],
  produces: ['docs/goals.md'],
  pipelineIndex: 0,
  body: '## Purpose\nDefine the project goals.',
  sections: { Purpose: 'Define the project goals.' },
  knowledgeEntries: [],
  conditional: null,
  longDescription: 'Define the project goals.',
  ...overrides,
})

const makeFinalizeInput = (steps: AdapterStepOutput[]): AdapterFinalizeInput => ({
  results: steps,
})

describe('CodexAdapter', () => {
  let adapter: CodexAdapter

  beforeEach(() => {
    adapter = new CodexAdapter()
  })

  // T-041 test 1: initialize() returns success
  it('initialize() returns success', () => {
    const result = adapter.initialize(makeContext())
    expect(result.success).toBe(true)
    expect(result.errors).toEqual([])
  })

  // T-041 test 2: generateStepWrapper returns empty files (no per-step files)
  it('generateStepWrapper returns empty files array', () => {
    adapter.initialize(makeContext())
    const output = adapter.generateStepWrapper(makeStepInput())
    expect(output.files).toEqual([])
  })

  // T-041 test 3: generateStepWrapper collects step data
  it('generateStepWrapper collects step data for finalize', () => {
    adapter.initialize(makeContext())
    adapter.generateStepWrapper(makeStepInput({ slug: 'step-a' }))
    adapter.generateStepWrapper(makeStepInput({ slug: 'step-b' }))
    // Confirm they show up in finalize output
    const result = adapter.finalize(makeFinalizeInput([]))
    expect(result.files[0].content).toContain('scaffold run step-a')
    expect(result.files[0].content).toContain('scaffold run step-b')
  })

  // T-041 test 4: finalize() generates single hidden AGENTS.md
  it('finalize() generates a single hidden AGENTS.md file', () => {
    adapter.initialize(makeContext())
    const result = adapter.finalize(makeFinalizeInput([]))
    expect(result.files).toHaveLength(1)
    expect(result.files[0].relativePath).toBe('.scaffold/generated/codex/AGENTS.md')
  })

  // T-041 test 5: AGENTS.md groups steps by phase
  it('AGENTS.md groups steps by phase', () => {
    adapter.initialize(makeContext())
    adapter.generateStepWrapper(makeStepInput({ slug: 'step-pre', phase: 'pre' }))
    adapter.generateStepWrapper(makeStepInput({ slug: 'step-arch', phase: 'architecture' }))
    const result = adapter.finalize(makeFinalizeInput([]))
    expect(result.files[0].content).toContain('Phase: pre')
    expect(result.files[0].content).toContain('Phase: architecture')
  })

  // T-041 test 6: Each step has description and run command
  it('each step in AGENTS.md has description and scaffold run command', () => {
    adapter.initialize(makeContext())
    adapter.generateStepWrapper(makeStepInput({
      slug: 'define-goals',
      description: 'Define project goals',
      phase: 'pre',
    }))
    const result = adapter.finalize(makeFinalizeInput([]))
    expect(result.files[0].content).toContain('Define project goals')
    expect(result.files[0].content).toContain('scaffold run define-goals')
  })

  // T-041 test 7: Output is deterministic
  it('output is deterministic — same steps produce same AGENTS.md', () => {
    adapter.initialize(makeContext())
    adapter.generateStepWrapper(makeStepInput())
    const result1 = adapter.finalize(makeFinalizeInput([]))

    const adapter2 = new CodexAdapter()
    adapter2.initialize(makeContext())
    adapter2.generateStepWrapper(makeStepInput())
    const result2 = adapter2.finalize(makeFinalizeInput([]))

    expect(result1.files[0].content).toBe(result2.files[0].content)
  })

  // Additional: returns no errors
  it('finalize() returns empty errors array', () => {
    adapter.initialize(makeContext())
    const result = adapter.finalize(makeFinalizeInput([]))
    expect(result.errors).toEqual([])
  })

  // Additional: platformId is 'codex'
  it('platformId is "codex"', () => {
    expect(adapter.platformId).toBe('codex')
  })

  // Additional: generateStepWrapper success is true
  it('generateStepWrapper returns success true', () => {
    adapter.initialize(makeContext())
    const output = adapter.generateStepWrapper(makeStepInput())
    expect(output.success).toBe(true)
    expect(output.platformId).toBe('codex')
  })

  // Additional: null phase falls back to 'general' group
  it('steps with null phase are grouped under "general"', () => {
    adapter.initialize(makeContext())
    adapter.generateStepWrapper(makeStepInput({ slug: 'optional-step', phase: null }))
    const result = adapter.finalize(makeFinalizeInput([]))
    expect(result.files[0].content).toContain('Phase: general')
    expect(result.files[0].content).toContain('scaffold run optional-step')
  })

  // Additional: initialize() resets collected steps
  it('initialize() resets previously collected steps', () => {
    adapter.initialize(makeContext())
    adapter.generateStepWrapper(makeStepInput({ slug: 'old-step' }))
    // Re-initialize clears old steps
    adapter.initialize(makeContext())
    const result = adapter.finalize(makeFinalizeInput([]))
    expect(result.files[0].content).not.toContain('old-step')
  })

  // Codex-incompatible tools: `scaffold run <step>` emits a meta-prompt to
  // stdout intended for harnesses that re-inject it as instructions (Claude
  // Code slash commands). Codex executes it as a shell command and treats
  // stdout as a result, so the embedded bash never runs. For review-code
  // and review-pr, emit direct `mmr review` recipes inline. The 4th-channel
  // Superpowers reconcile is intentionally NOT included — Codex cannot
  // dispatch agent skills, so the recipes ship 3-channel coverage and point
  // users at the Claude Code path when they need 4-channel.
  describe('codex-incompatible executor tools', () => {
    it('review-code emits direct mmr review recipe with full BASE_REF ladder + empty-diff guard', () => {
      adapter.initialize(makeContext())
      adapter.generateStepWrapper(makeStepInput({
        slug: 'review-code',
        description: 'Pre-commit multi-model review',
        phase: null,
      }))
      const result = adapter.finalize(makeFinalizeInput([]))
      const content = result.files[0].content

      // No leftover `Run \`scaffold run review-code\`` shim line. The recipe
      // may still reference `scaffold run review-code` in the 4th-channel
      // note (pointing Codex users at the Claude Code path), but the shim
      // form must not be the primary instruction.
      expect(content).not.toMatch(/Run `scaffold run review-code`/)

      // Direct mmr review invocations are present
      expect(content).toContain('mmr review --staged')
      expect(content).toContain('mmr review --diff -')
      expect(content).not.toContain('CYCLE="${CYCLE:-1}"')
      expect(content).toContain('--session "$SESSION_ID-cycle-$CYCLE"')
      expect(content).toContain('--round "$ROUND" --max-rounds 3')
      expect(content).toContain('mmr sessions list')
      expect(content).toContain('mmr sessions show')
      expect(content).toMatch(/latest cycle reached round 3/i)
      expect(content).toMatch(/set both CYCLE and ROUND/i)
      expect(content).toContain('SESSION_ID="local-full-')
      expect(content).toContain('SESSION_ID="local-staged-')
      expect(content).toContain('SESSION_ID="local-range-')
      expect(content.match(/BRANCH_HASH=.*git hash-object --stdin/g)).toHaveLength(3)
      expect(content).toContain('local-full-$REPO_ID-$BRANCH_ID')
      expect(content).toContain('local-staged-$REPO_ID-$BRANCH_ID')
      expect(content).toContain('local-range-$BASE_ID-$REPO_ID-$BRANCH_ID')
      expect(content).toContain('REPO_ID=$(')
      expect(content).toContain('local-full-$REPO_ID-')
      expect(content).toContain('BASE_ID=')
      expect(content).toContain('local-range-$BASE_ID-$REPO_ID-')
      expect(content).toMatch(/new exact head/i)

      // BASE_REF resolution mirrors content/tools/review-code.md (7-level ladder)
      expect(content).toContain('git symbolic-ref refs/remotes/origin/HEAD')
      expect(content).toContain('origin/main')
      expect(content).toContain('origin/master')
      expect(content).toContain('HEAD~1')

      // Empty-diff guard prevents 'no diff content' failure on clean trees;
      // uses --quiet to avoid buffering the entire diff into a shell variable
      expect(content).toContain('git diff --quiet "$MERGE_BASE"')

      // Modes are split into separate fenced code blocks so an agent
      // executing one block doesn't run all three reviews in sequence.
      expect(content).toMatch(/\*\*Mode 1\b/)
      expect(content).toMatch(/\*\*Mode 2\b/)
      expect(content).toMatch(/\*\*Mode 3\b/)
      expect(content).toContain('printf \'%s\' "$BRANCH_NAME"')
      expect(content).toContain('--head "$BRANCH_NAME"')
      expect(content).not.toContain('printf \'%s\' BRANCH_NAME')
      expect(content.match(/\[ "\$BRANCH" = "HEAD" \]/g)).toHaveLength(2)

      // No reconcile claim — Codex can't dispatch the Superpowers skill
      expect(content).not.toContain('mmr reconcile')
      expect(content).not.toContain('--channel superpowers')

      // 4-channel guidance points at the Claude Code path
      expect(content).toMatch(/4-channel coverage.*Claude Code/i)
    })

    it('review-pr emits direct mmr review --pr recipe with PR_NUMBER detection', () => {
      adapter.initialize(makeContext())
      adapter.generateStepWrapper(makeStepInput({
        slug: 'review-pr',
        description: 'PR multi-model review',
        phase: null,
      }))
      const result = adapter.finalize(makeFinalizeInput([]))
      const content = result.files[0].content

      expect(content).not.toMatch(/Run `scaffold run review-pr`/)
      expect(content).toContain('mmr review --pr')

      // PR_NUMBER detection is shown so agents don't run with an empty value
      expect(content).toContain('gh pr view --json number')

      // Each remediation cycle keeps MMR's native three-round cap while a
      // verified in-scope repair can restart at round one on the same PR.
      expect(content).not.toContain('CYCLE="${CYCLE:-1}"')
      expect(content).toContain('--session "$SESSION_ID-cycle-$CYCLE"')
      expect(content).toContain('REPO_ID=$(')
      expect(content).toMatch(/already has an MMR ledger entry/i)
      expect(content).toContain('gh api user')
      expect(content).toContain('user.login')
      expect(content).toContain('--paginate')
      expect(content).toContain('gh pr comment')
      expect(content).toContain('[0-9a-f]{40,64}')
      expect(content).toContain('--round "$ROUND" --max-rounds 3')
      expect(content).toContain('REVIEW_TARGET=')
      expect(content).toContain('review_target')
      expect(content).toContain('REVIEWED_HEAD=')
      expect(content).toContain('mmr sessions list')
      expect(content).toContain('mmr sessions show')
      expect(content).toMatch(/latest cycle reached round 3/i)
      expect(content).toMatch(/set both CYCLE and ROUND/i)
      expect(content).toMatch(/concrete repair.*focused\s+regression.*required\s+gate/is)
      expect(content).toMatch(/Duplicate, stale, hypothetical, speculative,\s+cosmetic, or already-dispositioned/)

      // No reconcile claim
      expect(content).not.toContain('mmr reconcile')
    })

    it('review-pr resumes the latest bounded session and fails closed after round three', () => {
      adapter.initialize(makeContext())
      adapter.generateStepWrapper(makeStepInput({ slug: 'review-pr', phase: null }))
      const content = adapter.finalize(makeFinalizeInput([])).files[0].content
      const recipe = content.match(/```bash\n([\s\S]*?)\n```/)?.[1]
      expect(recipe).toBeDefined()

      const script = `
mmr() {
  if [ "$1 $2" = "sessions list" ]; then
    printf '%s' "$MMR_SESSIONS" | sed "s/__REPO_ID__/$REPO_ID/g"
    [ "$MMR_LIST_FAIL" != "true" ]
  elif [ "$1 $2" = "sessions show" ]; then printf '%s' "$MMR_SESSION" | sed "s/__REPO_ID__/$REPO_ID/g"
  elif [ "$1" = "review" ]; then
    printf '{"job_id":"mmr-test","review_target":"https://x/pr/42@%s",' "$CURRENT_HEAD"
    printf '"command":"REVIEW %s"}\\n' "$*"
  else return 1
  fi
}
gh() {
  if [[ "$*" == "api user --jq .login" ]]; then printf '%s\\n' 'review-actor'
  elif [[ "$*" == *"--json headRefOid"* ]]; then printf '%s\\n' "$CURRENT_HEAD"
  elif [[ "$*" == *"/issues/42/comments"* && "$*" == *"--paginate"* ]]; then
    printf '%s\\n' "$LEDGER_COMMENTS"
  elif [[ "$*" == *"--json comments"* && "$REQUIRE_PAGINATED_COMMENTS" != "true" ]]; then
    printf '%s\\n' "$LEDGER_COMMENTS"
  else return 1
  fi
}
${recipe}
`
      const run = (sessions: string, session: string, extraEnv: Record<string, string> = {}) =>
        spawnSync('/bin/bash', ['-c', script], {
          encoding: 'utf8',
          env: {
            ...process.env,
            PR_NUMBER: '42',
            CURRENT_HEAD: '1111111111111111111111111111111111111111',
            LEDGER_COMMENTS: '',
            MMR_SESSIONS: sessions,
            MMR_SESSION: session,
            ...extraEnv,
          },
        })

      const resumed = run(
        JSON.stringify([{ session_id: 'pr-__REPO_ID__-42-cycle-2', rounds: 1, jobs: ['mmr-prev'] }]),
        JSON.stringify({ session_id: 'pr-__REPO_ID__-42-cycle-2', rounds: 1, jobs: ['mmr-prev'] }),
        { LEDGER_COMMENTS:
          '<!-- mmr-cycle-ledger cycle=2 round=1 ' +
          'head=0000000000000000000000000000000000000000 job=mmr-prev ' +
          'verdict=blocked next_cycle=2 next_round=2 -->' },
      )
      expect(resumed.status, resumed.stderr).toBe(0)
      expect(resumed.stdout).toMatch(/--session pr-[0-9a-f]{12}-42-cycle-2 --round 2 --max-rounds 3/)

      const capped = run(
        JSON.stringify([{ session_id: 'pr-__REPO_ID__-42-cycle-2', rounds: 3, jobs: ['mmr-prev'] }]),
        JSON.stringify({ session_id: 'pr-__REPO_ID__-42-cycle-2', rounds: 3, jobs: ['mmr-prev'] }),
      )
      expect(capped.status).toBe(1)
      expect(capped.stderr).toMatch(/latest cycle reached round 3/i)
      expect(capped.stdout).not.toContain('REVIEW')

      const restarted = run(
        JSON.stringify([{ session_id: 'pr-__REPO_ID__-42-cycle-2', rounds: 3, jobs: ['mmr-prev'] }]),
        JSON.stringify({ session_id: 'pr-__REPO_ID__-42-cycle-2', rounds: 3, jobs: ['mmr-prev'] }),
        {
          CYCLE: '3', ROUND: '1',
          LEDGER_COMMENTS:
            '<!-- mmr-cycle-ledger cycle=2 round=3 ' +
            'head=0000000000000000000000000000000000000000 job=mmr-prev ' +
            'verdict=blocked next_cycle=3 next_round=1 -->',
        },
      )
      expect(restarted.status).toBe(0)
      expect(restarted.stdout).toMatch(/--session pr-[0-9a-f]{12}-42-cycle-3 --round 1 --max-rounds 3/)

      const staleOverride = run(
        JSON.stringify([{ session_id: 'pr-__REPO_ID__-42-cycle-2', rounds: 1, jobs: ['mmr-prev'] }]),
        JSON.stringify({ session_id: 'pr-__REPO_ID__-42-cycle-2', rounds: 1, jobs: ['mmr-prev'] }),
        {
          CYCLE: '1', ROUND: '1',
          LEDGER_COMMENTS:
            '<!-- mmr-cycle-ledger cycle=2 round=1 ' +
            'head=0000000000000000000000000000000000000000 job=mmr-prev ' +
            'verdict=blocked next_cycle=2 next_round=2 -->',
        },
      )
      expect(staleOverride.status).toBe(1)
      expect(staleOverride.stderr).toMatch(/disagree with the PR ledger marker/i)
      expect(staleOverride.stdout).not.toContain('REVIEW')

      const duplicateHead = run('[]', '{}', {
        LEDGER_COMMENTS:
          '<!-- mmr-cycle-ledger cycle=1 round=1 ' +
          'head=1111111111111111111111111111111111111111 job=mmr-example ' +
          'verdict=pass next_cycle=1 next_round=2 -->',
      })
      expect(duplicateHead.status).toBe(1)
      expect(duplicateHead.stderr).toMatch(/already has an MMR ledger entry/i)
      expect(duplicateHead.stdout).not.toContain('REVIEW')

      const revisitedHead = run(
        JSON.stringify([{
          session_id: 'pr-__REPO_ID__-42-cycle-1', rounds: 2,
          jobs: ['mmr-example', 'mmr-latest'],
        }]),
        JSON.stringify({
          session_id: 'pr-__REPO_ID__-42-cycle-1', rounds: 2,
          jobs: ['mmr-example', 'mmr-latest'],
        }),
        {
          LEDGER_COMMENTS:
            '<!-- mmr-cycle-ledger cycle=1 round=1 ' +
            'head=1111111111111111111111111111111111111111 job=mmr-example ' +
            'verdict=pass next_cycle=1 next_round=2 -->\n' +
            '<!-- mmr-cycle-ledger cycle=1 round=2 ' +
            'head=2222222222222222222222222222222222222222 job=mmr-latest ' +
            'verdict=blocked next_cycle=1 next_round=3 -->',
        },
      )
      expect(revisitedHead.status).toBe(1)
      expect(revisitedHead.stderr).toMatch(/already has an MMR ledger entry/i)
      expect(revisitedHead.stdout).not.toContain('REVIEW')

      const recoverableHead = run(
        JSON.stringify([{ session_id: 'pr-__REPO_ID__-42-cycle-1', rounds: 1, jobs: ['mmr-example'] }]),
        JSON.stringify({ session_id: 'pr-__REPO_ID__-42-cycle-1', rounds: 1, jobs: ['mmr-example'] }),
        {
          LEDGER_COMMENTS:
            '<!-- mmr-cycle-ledger cycle=1 round=1 ' +
            'head=1111111111111111111111111111111111111111 job=mmr-example ' +
            'verdict=needs-user-decision next_cycle=1 next_round=1 -->',
        },
      )
      expect(recoverableHead.status).toBe(0)
      expect(recoverableHead.stdout).toMatch(/REVIEW .*--round 1 --max-rounds 3/)

      const failedSessionList = run('[]', '{}', { MMR_LIST_FAIL: 'true' })
      expect(failedSessionList.status).toBe(1)
      expect(failedSessionList.stdout).not.toContain('REVIEW')

      const paginatedLedger = run('[]', '{}', { REQUIRE_PAGINATED_COMMENTS: 'true' })
      expect(paginatedLedger.status).toBe(0)
      expect(paginatedLedger.stdout).toContain('REVIEW')

      const ledgerMismatch = run(
        JSON.stringify([{ session_id: 'pr-__REPO_ID__-42-cycle-1', rounds: 1, jobs: ['mmr-other'] }]),
        JSON.stringify({ session_id: 'pr-__REPO_ID__-42-cycle-1', rounds: 1, jobs: ['mmr-other'] }),
        {
          LEDGER_COMMENTS:
            '<!-- mmr-cycle-ledger cycle=1 round=1 ' +
            'head=0000000000000000000000000000000000000000 job=mmr-example ' +
            'verdict=blocked next_cycle=1 next_round=2 -->',
        },
      )
      expect(ledgerMismatch.status).toBe(1)
      expect(ledgerMismatch.stderr).toMatch(/ledger and MMR session history disagree/i)
      expect(ledgerMismatch.stdout).not.toContain('REVIEW')
    })

    it('review-code retries an inconclusive unchanged target at the recorded round', () => {
      adapter.initialize(makeContext())
      adapter.generateStepWrapper(makeStepInput({ slug: 'review-code', phase: null }))
      const content = adapter.finalize(makeFinalizeInput([])).files[0].content
      const modeTwo = content.match(/\*\*Mode 2[^`]*```bash\n([\s\S]*?)\n```/)?.[1]
      expect(modeTwo).toBeDefined()

      const script = `
mmr() {
  if [ "$1 $2" = "sessions list" ]; then
    printf '%s' "$MMR_SESSIONS" | sed "s/__REPO_ID__/$REPO_ID/g; s/__BRANCH_ID__/$BRANCH_ID/g"
  elif [ "$1 $2" = "sessions show" ]; then
    printf '%s' "$MMR_SESSION" | sed "s/__REPO_ID__/$REPO_ID/g; s/__BRANCH_ID__/$BRANCH_ID/g"
  elif [ "$1" = "results" ]; then
    printf '%s' '{"verdict":"needs-user-decision"}'
    return 3
  elif [ "$1" = "review" ]; then printf 'REVIEW %s\\n' "$*"
  else return 1
  fi
}
${modeTwo}
`
      const result = spawnSync('/bin/bash', ['-c', script], {
        encoding: 'utf8',
        cwd: process.cwd(),
        env: {
          ...process.env,
          MMR_SESSIONS: JSON.stringify([{
            session_id: 'local-staged-__REPO_ID__-__BRANCH_ID__-cycle-1',
            rounds: 1,
            jobs: ['mmr-prior'],
          }]),
          MMR_SESSION: JSON.stringify({
            session_id: 'local-staged-__REPO_ID__-__BRANCH_ID__-cycle-1',
            rounds: 1,
            jobs: ['mmr-prior'],
          }),
        },
      })

      expect(result.status, result.stderr).toBe(0)
      expect(result.stdout).toMatch(/REVIEW .*--round 1 --max-rounds 3/)
    })

    it('non-executor tools still use `scaffold run <slug>`', () => {
      adapter.initialize(makeContext())
      adapter.generateStepWrapper(makeStepInput({
        slug: 'automated-pr-review',
        description: 'Configure automated PR review',
        phase: 'environment',
      }))
      const result = adapter.finalize(makeFinalizeInput([]))
      expect(result.files[0].content).toContain('scaffold run automated-pr-review')
    })

    it('executor recipes are deterministic across runs', () => {
      const run = () => {
        const a = new CodexAdapter()
        a.initialize(makeContext())
        a.generateStepWrapper(makeStepInput({ slug: 'review-code', phase: null }))
        a.generateStepWrapper(makeStepInput({ slug: 'review-pr', phase: null }))
        return a.finalize(makeFinalizeInput([])).files[0].content
      }
      expect(run()).toBe(run())
    })
  })
})

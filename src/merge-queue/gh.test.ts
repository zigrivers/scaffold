import { afterEach, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createGhClient } from './gh.js'

let stubDir: string

function writeStub(script: string): string {
  stubDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mq-gh-'))
  const stub = path.join(stubDir, 'gh-stub.sh')
  fs.writeFileSync(
    stub,
    `#!/usr/bin/env bash\nset -eu\n${script}`,
  )
  fs.chmodSync(stub, 0o755)
  return stub
}

afterEach(() => {
  delete process.env.MQ_GH_CMD
})

describe('createGhClient', () => {
  it('parses viewPr JSON', () => {
    const json = '{"number":7,"state":"OPEN","headRefOid":"abc123","mergedAt":null,' +
      '"additions":3,"deletions":1,"title":"t","body":"Closes prj-x"}'
    process.env.MQ_GH_CMD = writeStub(`echo '${json}'`)
    const pr = createGhClient(stubDir).viewPr(7)
    expect(pr).toEqual({
      number: 7, state: 'OPEN', headSha: 'abc123', mergedAt: null,
      additions: 3, deletions: 1, title: 't', body: 'Closes prj-x',
    })
  })

  it('records the args gh was invoked with for squashMerge', () => {
    process.env.MQ_GH_CMD = writeStub(`echo "$@" >> '${os.tmpdir()}/mq-gh-args.txt'`)
    fs.rmSync(path.join(os.tmpdir(), 'mq-gh-args.txt'), { force: true })
    createGhClient(stubDir).squashMerge(12)
    const args = fs.readFileSync(path.join(os.tmpdir(), 'mq-gh-args.txt'), 'utf8')
    expect(args).toContain('pr merge 12 --squash --delete-branch')
  })

  it('binds squashMerge to the tested head with --match-head-commit', () => {
    process.env.MQ_GH_CMD = writeStub(`echo "$@" >> '${os.tmpdir()}/mq-gh-args.txt'`)
    fs.rmSync(path.join(os.tmpdir(), 'mq-gh-args.txt'), { force: true })
    createGhClient(stubDir).squashMerge(12, 'deadbeef')
    const args = fs.readFileSync(path.join(os.tmpdir(), 'mq-gh-args.txt'), 'utf8')
    expect(args).toContain('pr merge 12 --squash --delete-branch --match-head-commit deadbeef')
  })

  it('parses listLabeled numbers', () => {
    process.env.MQ_GH_CMD = writeStub('echo \'[{"number":4},{"number":9}]\'')
    expect(createGhClient(stubDir).listLabeled('mq:ready')).toEqual([4, 9])
  })

  it('postMergeRed returns false when the gh call fails (workflow absent)', () => {
    process.env.MQ_GH_CMD = writeStub('exit 1')
    expect(createGhClient(stubDir).postMergeRed('main')).toBe(false)
  })

  it('postMergeRed returns true on a failed latest run', () => {
    process.env.MQ_GH_CMD = writeStub('echo \'[{"conclusion":"failure"}]\'')
    expect(createGhClient(stubDir).postMergeRed('main')).toBe(true)
  })

  it('postMergeRed treats a non-failure bad conclusion (timed_out) as red', () => {
    process.env.MQ_GH_CMD = writeStub('echo \'[{"conclusion":"timed_out"}]\'')
    expect(createGhClient(stubDir).postMergeRed('main')).toBe(true)
  })

  it('postMergeRed treats success as not red', () => {
    process.env.MQ_GH_CMD = writeStub('echo \'[{"conclusion":"success"}]\'')
    expect(createGhClient(stubDir).postMergeRed('main')).toBe(false)
  })

  it('postMergeRed treats an in-progress (null conclusion) run as not red', () => {
    process.env.MQ_GH_CMD = writeStub('echo \'[{"conclusion":null}]\'')
    expect(createGhClient(stubDir).postMergeRed('main')).toBe(false)
  })

  it('throws a clear error when the gh binary is missing', () => {
    process.env.MQ_GH_CMD = '/nonexistent/gh-binary'
    expect(() => createGhClient(stubDir)).toThrow(/gh CLI/)
  })

  it('constructs correct viewPr arguments', () => {
    const json = '{"number":7,"state":"OPEN","headRefOid":"abc123","mergedAt":null,' +
      '"additions":3,"deletions":1,"title":"t","body":"Closes prj-x"}'
    process.env.MQ_GH_CMD = writeStub(
      `echo '${json}'; echo "$@" >> '${os.tmpdir()}/mq-gh-args.txt'`,
    )
    fs.rmSync(path.join(os.tmpdir(), 'mq-gh-args.txt'), { force: true })
    createGhClient(stubDir).viewPr(7)
    const args = fs.readFileSync(path.join(os.tmpdir(), 'mq-gh-args.txt'), 'utf8')
    expect(args).toContain('pr view 7 --json')
    expect(args).toContain('number,state,headRefOid,mergedAt,additions,deletions,title,body')
  })

  it('constructs correct listLabeled arguments', () => {
    process.env.MQ_GH_CMD = writeStub(
      `echo '[{"number":4},{"number":9}]'; echo "$@" >> '${os.tmpdir()}/mq-gh-args.txt'`,
    )
    fs.rmSync(path.join(os.tmpdir(), 'mq-gh-args.txt'), { force: true })
    createGhClient(stubDir).listLabeled('mq:ready')
    const args = fs.readFileSync(path.join(os.tmpdir(), 'mq-gh-args.txt'), 'utf8')
    expect(args).toContain('pr list --label mq:ready --state open --json number')
  })

  it('constructs correct postMergeRed arguments', () => {
    process.env.MQ_GH_CMD = writeStub(
      `echo '[{"conclusion":"failure"}]'; echo "$@" >> '${os.tmpdir()}/mq-gh-args.txt'`,
    )
    fs.rmSync(path.join(os.tmpdir(), 'mq-gh-args.txt'), { force: true })
    createGhClient(stubDir).postMergeRed('main')
    const args = fs.readFileSync(path.join(os.tmpdir(), 'mq-gh-args.txt'), 'utf8')
    expect(args).toContain('run list --workflow post-merge.yml --branch main --limit 1 --json conclusion')
  })

  it('records the args gh was invoked with for comment', () => {
    process.env.MQ_GH_CMD = writeStub(`echo "$@" >> '${os.tmpdir()}/mq-gh-args.txt'`)
    fs.rmSync(path.join(os.tmpdir(), 'mq-gh-args.txt'), { force: true })
    createGhClient(stubDir).comment(9, 'hello there')
    const args = fs.readFileSync(path.join(os.tmpdir(), 'mq-gh-args.txt'), 'utf8')
    expect(args).toContain('pr comment 9 --body hello there')
  })
})

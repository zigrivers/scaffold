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

  it('throws a clear error when the gh binary is missing', () => {
    process.env.MQ_GH_CMD = '/nonexistent/gh-binary'
    expect(() => createGhClient(stubDir)).toThrow(/gh CLI/)
  })
})

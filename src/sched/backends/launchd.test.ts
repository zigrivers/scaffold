import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { renderPlist } from './launchd.js'
import type { SchedJob } from '../types.js'

const FIXTURE = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..', '..', '..', 'tests', 'fixtures', 'sched', 'rumble-merge-poller.plist',
)

/** The rumble plist — dogfood evidence from the 2026-07-19 adoption (spec §7:
 *  "The rumble plist becomes the golden test fixture"). */
export function rumbleJob(): SchedJob {
  return {
    name: 'post-merge-poller',
    label: 'com.rumble.merge-poller',
    unitBase: 'scaffold-rumble-merge-poller',
    programArguments: ['/Users/ken/rumble-pickleball/scripts/ops/post-merge-poller.sh'],
    intervalSeconds: 600,
    workingDirectory: '/Users/ken/rumble-pickleball',
    stdoutPath: '/Users/ken/rumble-pickleball/.mq/logs/post-merge-poller.out.log',
    stderrPath: '/Users/ken/rumble-pickleball/.mq/logs/post-merge-poller.err.log',
    environment: {
      PATH: [
        '/Users/ken/.local/share/fnm/aliases/default/bin',
        '/opt/homebrew/opt/openjdk/bin',
        '/opt/homebrew/bin',
        '/usr/bin',
        '/bin',
        '/usr/sbin',
        '/sbin',
      ].join(':'),
    },
  }
}

describe('renderPlist', () => {
  it('reproduces the rumble golden fixture byte-for-byte', () => {
    expect(renderPlist(rumbleJob())).toBe(fs.readFileSync(FIXTURE, 'utf8'))
  })
  it('escapes XML special characters in strings', () => {
    const job = { ...rumbleJob(), label: 'com.a&b.<x>' }
    const out = renderPlist(job)
    expect(out).toContain('com.a&amp;b.&lt;x&gt;')
    expect(out).not.toContain('com.a&b.<x>')
  })
  it('renders StartInterval as an integer element', () => {
    expect(renderPlist(rumbleJob())).toContain('<key>StartInterval</key>\n  <integer>600</integer>')
  })
})

import type { SchedJob } from '../types.js'

function xmlEscape(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** Pure plist rendering — golden-fixture-tested against the rumble plist.
 *  Key order is fixed; environment keys are sorted for determinism. */
export function renderPlist(job: SchedJob): string {
  const args = job.programArguments
    .map(a => `    <string>${xmlEscape(a)}</string>`)
    .join('\n')
  const env = Object.keys(job.environment)
    .sort()
    .map(k => `    <key>${xmlEscape(k)}</key>\n    <string>${xmlEscape(job.environment[k])}</string>`)
    .join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${xmlEscape(job.label)}</string>
  <key>ProgramArguments</key>
  <array>
${args}
  </array>
  <key>StartInterval</key>
  <integer>${job.intervalSeconds}</integer>
  <key>WorkingDirectory</key>
  <string>${xmlEscape(job.workingDirectory)}</string>
  <key>EnvironmentVariables</key>
  <dict>
${env}
  </dict>
  <key>StandardOutPath</key>
  <string>${xmlEscape(job.stdoutPath)}</string>
  <key>StandardErrorPath</key>
  <string>${xmlEscape(job.stderrPath)}</string>
  <key>RunAtLoad</key>
  <true/>
</dict>
</plist>
`
}

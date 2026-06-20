import { checkInstalled, checkAuth, checkHttpAuth } from './auth.js'
import { redactCommandString } from './redact.js'
import type { MmrConfigParsed } from '../config/schema.js'

export type ChannelHealthStatus =
  | 'ok'
  | 'auth_failed'
  | 'not_installed'
  | 'disabled'
  | 'abstract'
  | 'missing_command'

export interface ChannelHealth {
  name: string
  /** Classified health (structural vs transient vs intentional). */
  status: ChannelHealthStatus
  /** True only when the CLI is installed (or the channel is reachable HTTP). */
  installed: boolean
  /** Remediation hint. Already redacted — safe to print/serialize. */
  recovery?: string
}

const redact = (s: string | undefined): string | undefined => redactCommandString(s) as string | undefined

/**
 * Probe every channel's health: install + auth for subprocess channels, an
 * over-the-wire auth probe for HTTP channels. Recovery strings are redacted at
 * the source. Shared by `mmr doctor`; `not_installed` channels carry a
 * remediation pointing at install-or-disable.
 */
export async function probeChannels(config: MmrConfigParsed): Promise<ChannelHealth[]> {
  const out: ChannelHealth[] = []
  for (const [name, ch] of Object.entries(config.channels)) {
    if (ch.abstract) { out.push({ name, status: 'abstract', installed: false }); continue }
    if (!ch.enabled) { out.push({ name, status: 'disabled', installed: false }); continue }

    if (ch.kind === 'http') {
      const a = await checkHttpAuth(ch)
      out.push({
        name,
        status: a.status === 'ok' ? 'ok' : 'auth_failed',
        installed: true,
        recovery: a.status === 'ok' ? undefined : redact(a.recovery),
      })
      continue
    }

    if (!ch.command) { out.push({ name, status: 'missing_command', installed: false }); continue }
    const cmd = ch.command.split(' ')[0]
    const installed = await checkInstalled(cmd)
    if (!installed) {
      out.push({
        name,
        status: 'not_installed',
        installed: false,
        recovery: `install ${cmd}, or stop dispatching it: mmr config disable ${name}`,
      })
      continue
    }
    const a = await checkAuth(ch)
    out.push({
      name,
      status: a.status === 'ok' ? 'ok' : 'auth_failed',
      installed: true,
      recovery: a.status === 'ok' ? undefined : redact(a.recovery),
    })
  }
  return out
}

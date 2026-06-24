import { execSync } from 'node:child_process'
import type { Argv, CommandModule } from 'yargs'
import { runEntryAudit } from '../../knowledge-freshness/audit-runner.js'
import {
  resolveProvider,
  buildDispatcher,
  type Provider,
} from '../../knowledge-freshness/providers/index.js'
import { SourceUnusableError } from '../../knowledge-freshness/redirect-classifier.js'

interface AuditRunEntryArgs {
  entryPath: string
  timeout: number
  provider?: string
}

/**
 * Probe whether the `claude` CLI is on PATH. Used only for rule 5 of the
 * provider precedence chain (the "local dev with keychain auth" case).
 *
 * Platform-aware: POSIX systems use `command -v` (POSIX builtin, exits
 * non-zero when the binary is missing); Windows uses `where`, which has
 * the same exit-code semantics. The existing llm-dispatcher already
 * special-cases Windows via `cmd.exe`, so we follow the same convention
 * to keep rule-5 fallback working for Windows operators with Claude Code
 * installed.
 */
function probeClaudeOnPath(): boolean {
  const probe = process.platform === 'win32' ? 'where claude' : 'command -v claude'
  try {
    execSync(probe, { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

const auditRunEntryCommand: CommandModule<Record<string, unknown>, AuditRunEntryArgs> = {
  command: 'audit-run-entry <entryPath>',
  describe: 'Run a grounded freshness audit on a single knowledge entry',
  builder: (y) => y
    .positional('entryPath', {
      type: 'string',
      describe: 'Path to the knowledge entry .md file to audit',
      demandOption: true,
    })
    .option('timeout', {
      type: 'number',
      default: 600,
      describe: 'Subprocess / HTTP timeout in seconds (default 600s for grounded audits)',
    })
    .option('provider', {
      type: 'string',
      choices: ['anthropic', 'deepseek', 'zai'],
      describe:
        'Force a specific LLM provider. Overrides KNOWLEDGE_FRESHNESS_PROVIDER and ' +
        'auto-detection from env vars. Default: resolved from env (see ' +
        'docs/knowledge-freshness/operations.md §4).',
    }) as Argv<AuditRunEntryArgs>,
  handler: async (argv) => {
    // Resolve the provider FIRST so a misconfiguration fails before we
    // do any other work (entry-file reading, frontmatter parsing, etc.).
    const claudeOnPath = probeClaudeOnPath()
    const provider: Provider = resolveProvider({
      env: process.env,
      args: { provider: argv.provider },
      claudeOnPath,
    })
    const dispatcher = buildDispatcher(provider, {
      timeoutSec: argv.timeout,
      env: process.env,
      // Pass the PATH probe so an anthropic primary OR fallback fails fast at
      // construction if the `claude` CLI is missing, rather than at dispatch.
      claudeOnPath,
    })
    try {
      const verdict = await runEntryAudit(argv.entryPath, dispatcher)
      process.stdout.write(JSON.stringify(verdict, null, 2) + '\n')
    } catch (err) {
      if (err instanceof SourceUnusableError) {
        // Fail closed: emit a skip envelope on stdout (valid JSON, exit 0).
        // Diagnostics go to stderr so stdout stays jq-parseable.
        process.stderr.write(`[skip] source unusable for ${argv.entryPath}: ${err.detail}\n`)
        process.stdout.write(
          JSON.stringify({ skipped: true, reason: 'source-unusable', url: err.url, detail: err.detail }) + '\n',
        )
        return
      }
      throw err // transient/infra → non-zero exit (workflow surfaces it)
    }
  },
}

export default auditRunEntryCommand

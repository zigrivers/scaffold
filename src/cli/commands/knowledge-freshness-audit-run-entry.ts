import type { Argv, CommandModule } from 'yargs'
import { dispatchLlm } from '../../observability/engine/llm-dispatcher.js'
import { runEntryAudit, type Dispatcher } from '../../knowledge-freshness/audit-runner.js'

interface AuditRunEntryArgs {
  entryPath: string
  timeout: number
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
      describe: 'Subprocess timeout in seconds (default 600s for grounded audits)',
    }) as Argv<AuditRunEntryArgs>,
  handler: async (argv) => {
    // SECURITY: the dispatcher command is hardcoded to `claude -p`, never loaded
    // from project-local config — executing a repo-controlled command string
    // would allow arbitrary code execution when auditing untrusted repositories.
    // Only the timeout is exposed as a flag (performance only, not code execution).
    // Matches the security stance of src/observability/checks/lens-h-cross-doc.ts.
    //
    // SECURITY (round-6 F-001): the model runs with NO tools. The audit
    // runner pre-fetches source bodies in Node (where the SSRF / DNS /
    // redirect / timeout guards apply) and embeds them in the prompt as
    // `{{prefetched_sources}}`. If we instead granted WebFetch here, a
    // prompt-injection attack from the author-controlled entry body could
    // direct WebFetch at arbitrary URLs — bypassing every Node-side URL
    // guard. Disabling tools eliminates that class of attack at the cost
    // of larger prompts.
    const command = 'claude -p --tools ""'
    const timeoutMs = argv.timeout * 1000

    const dispatcher: Dispatcher = async (prompt) => {
      const result = await dispatchLlm({ prompt, command, timeoutMs })
      if (!result.ok) {
        // Surface the dispatcher's failure reason verbatim — it already carries
        // useful detail (subprocess exit code, stderr hint, timeout).
        throw new Error(`audit dispatcher failed: ${result.reason}`)
      }
      // Use raw stdout (not parsed) so the runner's schema-aware extractor
      // can walk the full response. The dispatcher's last→first extractor
      // is schema-unaware and would short-circuit on stray JSON.
      return result.raw
    }

    const verdict = await runEntryAudit(argv.entryPath, dispatcher)
    process.stdout.write(JSON.stringify(verdict, null, 2) + '\n')
  },
}

export default auditRunEntryCommand

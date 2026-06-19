import fs from 'node:fs'
import { spawnSync } from 'node:child_process'
import type { Argv, CommandModule } from 'yargs'
import yaml from 'js-yaml'
import { applyVerdictToEntry, normalizeUrl } from '../../knowledge-freshness/audit-apply.js'
import { fetchAndHash } from '../../knowledge-freshness/source-hash.js'
import { openFreshnessPr, readVolatility } from '../../knowledge-freshness/audit-apply-pr.js'
import type { AuditVerdict } from '../../knowledge-freshness/audit-runner.js'

interface AuditApplyArgs {
  entryPath: string
  verdictPath: string
}

const auditApplyCommand: CommandModule<Record<string, unknown>, AuditApplyArgs> = {
  command: 'audit-apply <entryPath> <verdictPath>',
  describe: 'Apply a freshness audit verdict to a knowledge entry (use --open-pr to push a branch and open a PR)',
  builder: (y) => y
    .positional('entryPath', {
      type: 'string',
      describe: 'Path to the knowledge entry .md file to modify',
      demandOption: true,
    })
    .positional('verdictPath', {
      type: 'string',
      describe: 'Path to the verdict JSON file produced by audit-run-entry',
      demandOption: true,
    })
    .option('open-pr', {
      type: 'boolean',
      default: false,
      describe: 'Create a branch, commit, push, and open a PR via gh (default: edit file only)',
    })
    .option('mmr-job-id', {
      type: 'string',
      describe: 'MMR corroboration job ID to reference in the PR body (optional)',
    }) as unknown as Argv<AuditApplyArgs>,
  handler: async (argv) => {
    const verdictRaw = fs.readFileSync(argv.verdictPath, 'utf8')
    const verdict = JSON.parse(verdictRaw) as AuditVerdict

    // Short-circuit: source_unverifiable verdicts carry no actionable diff —
    // the entry file is unchanged and no PR should be opened.
    if ((verdict as unknown as Record<string, unknown>).source_unverifiable === true) {
      process.stderr.write(
        `audit-apply: no-op — source_unverifiable for entry "${verdict.entry_name}" ` +
        `(${argv.entryPath}); skipping fetch, apply, and PR\n`,
      )
      return
    }

    const content = fs.readFileSync(argv.entryPath, 'utf8')

    // Sanity-check: the verdict and the on-disk entry must agree on `name`.
    // The verdict schema intentionally doesn't carry a filesystem path (so the
    // LLM can't redirect writes), which means operator must pair them — catch
    // a mismatched pair early with a clear message.
    const fmMatch = content.match(/^---\n([\s\S]*?)\n---/)
    if (!fmMatch) {
      throw new Error(`could not parse frontmatter at ${argv.entryPath}`)
    }
    const fm = yaml.load(fmMatch[1], { schema: yaml.JSON_SCHEMA }) as { name?: string }
    if (fm.name !== verdict.entry_name) {
      throw new Error(
        `verdict/entry mismatch: verdict.entry_name="${verdict.entry_name}" but ` +
        `${argv.entryPath} has name="${fm.name}". Did you pair the wrong files?`,
      )
    }

    // Compute deterministic hashes for every URL the verdict checked. We
    // re-fetch in Node rather than trust the LLM's `content_hash` because an
    // LLM-emitted sha256 is not verifiable — the model could fabricate one.
    // The same normalizeUrl logic that audit-apply uses for source-matching
    // is used here as the map key so the two stay in sync (strict mode in
    // applyVerdictToEntry throws if any URL is missing).
    const trustedHashes = new Map<string, string>()
    for (const source of verdict.sources_checked) {
      const key = normalizeUrl(source.url)
      // De-dupe: if two verdict sources differ only by anchor, the fetch
      // and hash is the same. Skip the second fetch.
      if (trustedHashes.has(key)) continue
      const { hash } = await fetchAndHash(key)
      trustedHashes.set(key, hash)
    }

    const updated = applyVerdictToEntry(content, verdict, { trustedHashes })
    fs.writeFileSync(argv.entryPath, updated)

    // yargs exposes kebab options under both kebab and camelCase keys. Read
    // both forms so we don't rely on a single normalization path
    // (matches the pattern in src/cli/commands/observe.ts for --stall-check).
    const argvAny = argv as unknown as Record<string, unknown>
    const openPr = (argvAny['open-pr'] ?? argvAny.openPr) === true
    const mmrJobId = (argvAny['mmr-job-id'] ?? argvAny.mmrJobId) as string | undefined

    if (openPr) {
      // Re-read the updated entry so we pull `volatility` from the post-apply
      // frontmatter (apply never changes volatility, but reading once-after is
      // a tidy invariant — single source of truth).
      const updatedContent = fs.readFileSync(argv.entryPath, 'utf8')
      const volatility = readVolatility(updatedContent)
      const { branch, prUrl } = openFreshnessPr(verdict, {
        entryPath: argv.entryPath,
        volatility,
        mmrJobId,
      })
      process.stdout.write(`branch: ${branch}\npr: ${prUrl}\n`)
    } else {
      // Show the operator what changed. Without --open-pr we stop here and let
      // the human open the PR manually (Phase 1 behavior).
      const diff = spawnSync('git', ['diff', '--', argv.entryPath], { encoding: 'utf8' })
      if (diff.stdout) process.stdout.write(diff.stdout)
      if (diff.stderr) process.stderr.write(diff.stderr)
    }
  },
}

export default auditApplyCommand

import fs from 'node:fs'
import { spawnSync } from 'node:child_process'
import type { Argv, CommandModule } from 'yargs'
import yaml from 'js-yaml'
import { applyVerdictToEntry, normalizeUrl } from '../../knowledge-freshness/audit-apply.js'
import { fetchAndHash } from '../../knowledge-freshness/source-hash.js'
import type { AuditVerdict } from '../../knowledge-freshness/audit-runner.js'

interface AuditApplyArgs {
  entryPath: string
  verdictPath: string
}

const auditApplyCommand: CommandModule<Record<string, unknown>, AuditApplyArgs> = {
  command: 'audit-apply <entryPath> <verdictPath>',
  describe: 'Apply a freshness audit verdict to a knowledge entry (Phase 1: no PR — operator opens it manually)',
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
    }) as Argv<AuditApplyArgs>,
  handler: async (argv) => {
    const content = fs.readFileSync(argv.entryPath, 'utf8')
    const verdictRaw = fs.readFileSync(argv.verdictPath, 'utf8')
    const verdict = JSON.parse(verdictRaw) as AuditVerdict

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

    // Show the operator what changed. Phase 1 stops here — the human opens
    // the PR manually after reviewing the diff (Task 9 of the plan).
    const diff = spawnSync('git', ['diff', '--', argv.entryPath], { encoding: 'utf8' })
    if (diff.stdout) process.stdout.write(diff.stdout)
    if (diff.stderr) process.stderr.write(diff.stderr)
  },
}

export default auditApplyCommand

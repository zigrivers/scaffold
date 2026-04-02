<!-- scaffold:security-practices v3 2026-03-14 -->

# Scaffold v2 — Security Practices

**Related documents**:
- [operations-runbook.md](operations-runbook.md) §6 — operational security (npm tokens, CI hardening, supply chain basics)
- [testing-strategy.md](testing-strategy.md) §10 — quality gates (pre-commit, CI, pre-merge, periodic)
- [scaffold-v2-prd.md](scaffold-v2-prd.md) §18 — NFRs (no credential storage, no network access, file permissions)

---

## 1. Overview & Security Posture

Scaffold v2 is a TypeScript CLI tool distributed via npm. It assembles tailored prompts from meta-prompts, knowledge base files, user instructions, and project context, then tracks pipeline execution state on the local file system.

**What scaffold is NOT**:
- Not a server — no HTTP endpoints, no ports, no listeners
- Not a database application — no SQL, no ORM, no stored data beyond flat JSON/YAML/JSONL files
- Not an authenticated system — no users, no sessions, no tokens, no passwords
- Not a network client — no API calls, no webhooks, no telemetry (except `scaffold update` checking the npm registry)
- Not a credential store — no API keys, no secrets, no `.env` files (PRD §18)

**What the actual threat surface is**:
1. **npm supply chain** — compromised dependencies, typosquatting, account takeover
2. **Content assembly pipeline** — user-provided instruction files and project context flow into assembled prompts
3. **Local file system access** — reads project files, writes state files within the project directory
4. **CLI argument handling** — user-provided paths, step names, and flags parsed by yargs

For operational security (npm token management, CI hardening, provenance attestation, account compromise recovery), see operations-runbook.md §6.

---

## 2. Threat Model

### STRIDE Analysis for a CLI Tool

**Spoofing**

| Threat | Likelihood | Impact | Mitigation |
|--------|-----------|--------|------------|
| Typosquatting — malicious package with a similar name on npm | Medium | High | Monitor npm for similar names. Document the canonical package name (`@scaffold-cli/scaffold`) in all installation docs. npm provenance attestation links packages to the source repo. |
| Compromised npm account publishes a trojanized version | Low | Critical | 2FA required on npm account. Granular publish token scoped to this package only. Provenance attestation flags unsigned publishes. See operations-runbook.md §6.3 for recovery. |
| Modified Homebrew formula pointing to a malicious tarball | Low | High | Homebrew tap has its own CI. SHA256 verification against the npm registry tarball. |

**Tampering**

| Threat | Likelihood | Impact | Mitigation |
|--------|-----------|--------|------------|
| Malicious content in shipped `pipeline/` or `knowledge/` directories | Very Low | High | These ship in the npm package and are verified by provenance. Users who modify local copies accept responsibility for those changes. |
| Malicious user instruction files in `.scaffold/instructions/` | Medium | Medium | User instructions are committed to git (visible in diffs) and are the user's own content — scaffold includes them verbatim. This is by design. See §3 for the trust model. |
| Corrupted `state.json` or `config.yml` causing unexpected behavior | Low | Low | Atomic writes (temp + rename) prevent partial writes. Schema validation on load catches malformed files. |

**Information Disclosure**

| Threat | Likelihood | Impact | Mitigation |
|--------|-----------|--------|------------|
| Assembled prompts include sensitive project files (`.env`, credentials) | Medium | Medium | The assembly engine reads only files explicitly referenced in meta-prompt frontmatter and `.scaffold/` configuration. It does not glob or walk the project tree. See §3 for details. |
| `scaffold update` leaks project information to the npm registry | Very Low | Low | The update check sends only the package name and current version — standard `npm view` behavior. No project data is transmitted. |

**Denial of Service**

| Threat | Likelihood | Impact | Mitigation |
|--------|-----------|--------|------------|
| Malformed YAML config causes crash | Low | Low | YAML parsing catches syntax errors and reports them as `CONFIG_PARSE_ERROR` (ADR-040). The CLI exits with a clear error, not an unhandled exception. |
| Circular dependencies in pipeline cause infinite loop | Low | Medium | Dependency resolution uses Kahn's algorithm (ADR-009), which detects cycles and reports `DEP_CYCLE_DETECTED`. |
| Extremely large knowledge base file exhausts memory | Very Low | Low | Knowledge base files ship in the npm package at known sizes. User-modified files could theoretically be large, but this is a self-inflicted scenario. No mitigation needed beyond Node's default memory limits. |

**Repudiation**

Not applicable in the traditional sense — scaffold has no multi-user system where one party would deny performing an action. The `decisions.jsonl` log records which decisions were made during each step, but it serves as project context for subsequent steps, not as a non-repudiation audit trail. The log is an append-only local file with no integrity protection (no signing, no tamper detection). This is acceptable because scaffold operates in a single-user or trusted-team context where repudiation is not a meaningful threat.

**Elevation of Privilege**

Not applicable. Scaffold has no privilege levels, no user roles, no admin mode. The CLI runs with the permissions of the invoking user. It does not use `sudo`, `chmod`, or `setuid`. Noted explicitly for completeness.

### Trust Boundary Diagram

```
┌─────────────────────────────────────────────────────────┐
│                    UNTRUSTED INPUT                       │
│                                                         │
│  CLI arguments ──────────┐                              │
│  --instructions flag ────┤                              │
│  .scaffold/config.yml ───┤   Validation occurs here     │
│  .scaffold/instructions/ ┤   (yargs, schema validation, │
│  Project files (init, ───┘    path checks)              │
│    adopt: package.json,                                 │
│    README, docs/, CI)                                   │
└────────────────────────────┬────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────┐
│                   SCAFFOLD CLI                          │
│                                                         │
│  Assembly Engine ─── reads meta-prompts + KB (trusted)  │
│  State Manager ───── reads/writes state.json            │
│  Config Loader ───── validates then uses config.yml     │
│  Lock Manager ────── advisory file locks                │
│  Project Detector ── scans project dir (init, adopt)    │
│  CLAUDE.md Manager ─ reads/writes CLAUDE.md             │
└────────────────────────────┬────────────────────────────┘
                             │
              ┌──────────────┼──────────────┐
              ▼              ▼              ▼
┌──────────────────┐ ┌──────────────┐ ┌──────────────────┐
│  TRUSTED CONTENT │ │ STATE (R/W)  │ │     OUTPUT       │
│                  │ │              │ │                  │
│  pipeline/*.md   │ │ state.json   │ │ Assembled prompt │
│  knowledge/*.md  │ │ decisions.   │ │  ──► AI tool     │
│  methodology/    │ │   jsonl      │ │ CLAUDE.md        │
│    *.yml         │ │ lock.json    │ │ commands/*.md    │
│                  │ │              │ │ AGENTS.md        │
│ (shipped in npm  │ │ (written by  │ │                  │
│  package)        │ │  scaffold,   │ │ (generated       │
│                  │ │  read back   │ │  artifacts)      │
│                  │ │  as context) │ │                  │
└──────────────────┘ └──────────────┘ └──────────────────┘
```

Validation occurs at the boundary between untrusted input and the scaffold CLI. Trusted content (shipped in the npm package) is not re-validated at runtime — its integrity is established at publish time via provenance attestation.

---

## 3. Content Assembly Security

The assembly engine is scaffold's core — it reads meta-prompts, knowledge base files, user instructions, and project context, then combines them into a 7-section assembled prompt. This section documents the trust model.

### User Instruction Files

`.scaffold/instructions/` contains arbitrary markdown committed to the project's git repository. These files are included **verbatim** in assembled prompts. The `--instructions` CLI flag provides the same capability inline — its value is concatenated into the assembled prompt without sanitization.

**Risk**: A user instruction file (or `--instructions` flag value) could contain prompt injection targeting the AI (e.g., "Ignore all previous instructions and...").

**Trust model**: User instructions are the user's own content, committed to their own repository, visible in git diffs. Scaffold treats them as trusted-by-the-user. This is equivalent to a developer writing code in their own repo — the tool includes it as requested. Scaffold does not sanitize, filter, or validate instruction content. The same trust model applies to `--instructions` flag values — they are provided directly by the invoking user.

**Implementation guidance**: Document this trust model clearly in user-facing docs. If scaffold is used in a team setting, instruction files should be reviewed in PRs like any other code.

### Knowledge Base and Meta-Prompt Files

These ship in the npm package. They are trusted content — their integrity is verified by npm's lockfile checksums and provenance attestation.

**Risk**: A user who modifies local copies of `pipeline/` or `knowledge/` files changes the content that flows into assembled prompts.

**Trust model**: Local modifications are the user's choice. Scaffold does not prevent or detect them. The `scaffold update` command replaces these files with the published version, restoring canonical content.

### Project Context Gathering

The assembly engine includes project context (completed artifacts, config values) in assembled prompts.

**What the engine reads**:
- `.scaffold/state.json` — pipeline state (step completion, timestamps)
- `.scaffold/config.yml` — project configuration (methodology, depth levels, platform)
- `.scaffold/decisions.jsonl` — decision log entries from prior steps
- Completed artifacts referenced by step dependencies — the specific files listed in meta-prompt `outputs` frontmatter fields

**What the engine does NOT read**:
- Arbitrary project source files (no tree walking, no globbing)
- `.env` files, credential files, or secrets
- Files outside the project root directory

**Implementation guidance**: The assembly engine must never read files by user-provided path without validating that the path is within the project root. See §4 for path validation rules.

### Symlink Handling

**Risk**: A symlink in `pipeline/` or `knowledge/` could point outside the project root (e.g., to `/etc/passwd`).

**Mitigation**: The assembly engine should resolve symlinks and verify the resolved path is within the expected directory (`pipeline/`, `knowledge/`, or the project root for user instructions). If a resolved path escapes the expected directory, the engine should reject it with a clear error.

**Implementation guidance**: Use `fs.realpath()` to resolve symlinks before reading. Compare the resolved path against the expected base directory. This is a defense-in-depth measure — shipped npm packages do not contain symlinks (npm strips them during `npm pack`).

---

## 4. Input Validation & Injection

### CLI Argument Handling

yargs handles argument parsing, type coercion, and basic validation (required arguments, type checks, `choices` constraints). Scaffold adds validation beyond yargs defaults:

- **Step names**: Validated against the set of known step IDs from meta-prompt frontmatter. Unknown step names produce `STEP_NOT_FOUND`.
- **Depth values**: Validated as integers in the 1-5 range. Out-of-range values produce `FIELD_INVALID_DEPTH`.
- **Methodology names**: Validated against the set of known methodology presets. Unknown names produce `FIELD_INVALID_METHODOLOGY`.

### File Path Validation

Any user-provided file path (e.g., `--config ./custom.yml`, `--instructions ./extra.md`) must be validated:

1. Resolve the path to an absolute path using `path.resolve()`
2. Verify the resolved path starts with the project root directory
3. Reject paths that traverse outside the project root (e.g., `../../etc/passwd`)
4. Reject paths containing null bytes (`\0`)

Scaffold does not accept arbitrary paths for reading — only paths within the project directory and its `.scaffold/` subdirectory.

### YAML/JSON Parsing Safety

- **`js-yaml`** (v4+): Used for `config.yml` and `methodology/*.yml` preset files. Uses `yaml.load()` which is safe by default — it does not support custom YAML tags that could trigger code execution (the dangerous `yaml.load()` with custom schemas is opt-in). Scaffold does not use custom schemas.
- **`JSON.parse()`**: Native Node.js JSON parsing. Cannot execute code. Throws `SyntaxError` on malformed input, caught and reported as `CONFIG_PARSE_ERROR` or `STATE_PARSE_ERROR`.
- **JSONL parsing** (`decisions.jsonl`): Each line is parsed independently with `JSON.parse()`. A malformed line is skipped with a warning, not a crash.

### Content Files Are Data, Not Code

Meta-prompt and knowledge base files are read as UTF-8 strings. They are never:
- Passed to `eval()`, `new Function()`, or `vm.runInContext()`
- Used as template strings with `${}` interpolation
- Processed through any template engine that could execute embedded code
- Passed to `child_process.exec()` or `child_process.spawn()`
- Loaded as modules via `require()` or dynamic `import()`

Content files are concatenated into the assembled prompt as plain text. This is a hard architectural constraint.

---

## 5. Dependency Security

Operations-runbook.md §6.4-6.5 covers supply chain basics (lockfile discipline, `npm ci`, provenance). This section goes deeper.

### Vulnerability Audit Policy

| Severity | CI Gate | Response SLA | Action |
|----------|---------|-------------|--------|
| Critical | Block merge | Immediate | Fix or replace dependency before any other work |
| High | Block merge | 24 hours | Fix in next PR. If no upstream fix exists, evaluate alternatives |
| Medium | Warning | Within sprint | Track in a GitHub issue or release follow-up list, fix when touching the affected module |
| Low | None | Best effort | Fix when convenient, bundle with other dependency updates |

`npm audit --audit-level=high` runs in CI (see operations-runbook.md §3.2, `security-audit` job). Critical and high vulnerabilities fail the build.

**Exception process**: If a critical or high vulnerability has no upstream fix available: (1) evaluate whether the vulnerable code path is actually reachable in scaffold's usage, (2) if not reachable, add an `npm audit` override in `package.json` with a comment explaining the exception and a link to the upstream issue, (3) if reachable, replace the dependency or vendor a patched fork, (4) file a follow-up GitHub issue to remove the override when an upstream fix ships.

### Dependency Selection Criteria

Before adding a new dependency, evaluate:

1. **Is a Node built-in sufficient?** Prefer `fs`, `path`, `url`, `crypto`, `util` over external packages with equivalent functionality.
2. **Maintenance activity**: Last publish date, open issue count, commit frequency. Avoid packages with no commits in 12+ months.
3. **Transitive dependency count**: Run `npm ls <package>` to check the dependency tree depth. A package that pulls in 50 transitives adds 50 potential vulnerability points.
4. **Bundle size**: `npm pack --dry-run` after adding the dependency — is the size increase justified?
5. **License compatibility**: See license requirements below.

### Current Runtime Dependencies (Justified)

| Package | Why It's Needed | Built-in Alternative? |
|---------|----------------|----------------------|
| `yargs` | CLI framework — argument parsing, subcommands, help generation, completions (ADR-001) | No. Building this from scratch is unwarranted. |
| `js-yaml` | YAML parsing for `config.yml` and methodology presets | No. Node has no built-in YAML parser. |
| `@inquirer/prompts` | Interactive terminal prompts for the init wizard (ADR-001) | No. `readline` is too primitive for select menus and adaptive flows. |

Utility libraries like `lodash` are **not** acceptable — use native JavaScript methods. If a single lodash function is needed, extract the implementation.

### Lock File Discipline

- **CI always uses `npm ci`** — installs exactly what's in `package-lock.json`, fails if the lockfile is out of sync with `package.json`
- **Review `package-lock.json` diffs in PRs** — new transitive dependencies should be noted and understood
- **Never commit with unexplained lockfile changes** — if `package-lock.json` changes without a corresponding `package.json` change, investigate (npm version drift, platform differences)
- **Run `npm ci` locally to reproduce CI** — if tests pass with `npm install` but fail with `npm ci`, the lockfile is out of sync

### License Compliance

| License | Status | Notes |
|---------|--------|-------|
| MIT, ISC, BSD-2-Clause, BSD-3-Clause | Acceptable | No restrictions |
| Apache-2.0 | Acceptable | Patent grant clause — acceptable for CLI tools |
| LGPL-2.1, LGPL-3.0 | Review required | Linking restrictions may apply — evaluate per dependency |
| MPL-2.0 | Review required | File-level copyleft — modifications to the dependency's source must be shared |
| GPL-2.0, GPL-3.0 | Not acceptable | Copyleft would require scaffold to be GPL |
| AGPL-3.0 | Not acceptable | Network copyleft — even more restrictive than GPL |
| Unlicensed / no license | Not acceptable | Treat as all rights reserved |

Run `npx license-checker --summary` periodically to audit the dependency tree.

---

## 6. npm Distribution Security

Operations-runbook.md §6.3 covers npm token management, 2FA, provenance attestation, and account compromise recovery. This section adds package-level security.

### Package Integrity Verification

Users can verify a published scaffold package:

```bash
# Verify npm signatures (npm 8.15+)
npm audit signatures

# Check provenance attestation
npm view @scaffold-cli/scaffold --json | jq '.dist.attestations'

# Verify tarball checksum
npm pack @scaffold-cli/scaffold@<version>
shasum -a 256 scaffold-cli-scaffold-<version>.tgz
```

Provenance attestation (enabled via `--provenance` in the release workflow) links each published version to its source commit and build environment. A package published without provenance indicates it was published manually or from an untrusted environment.

### Typosquatting Defense

The canonical package name is `@scaffold-cli/scaffold`. Common misspellings and attack patterns to monitor:

- `scaffold-cli` (without scope)
- `@scaffold/cli` (different scope)
- `scaffoldd`, `scaffol`, `scafold` (typos)
- `scaffold-v2`, `scaffold2` (version confusion)

Periodically search npm for packages with similar names. If a suspicious package is found, report it to npm via the package reporting form.

### `.npmignore` Security

The `.npmignore` file (or `files` field in `package.json`) controls what ships in the tarball. Sensitive files that must NEVER be published:

- `.env`, `.env.*` — environment variables (scaffold doesn't use these, but defense in depth)
- `.scaffold/` — project-specific state
- `tests/fixtures/` — test data that might contain realistic-looking credentials
- `.github/` — CI workflows (may reference secret names)
- `docs/` — internal documentation

Verify before every release: `npm pack --dry-run` lists exactly what will be published. The CI `build-verify` job (operations-runbook.md §3.2) automates this check.

---

## 7. File System Security

### What Scaffold Reads

| Location | Content | When |
|----------|---------|------|
| `pipeline/*.md` | Meta-prompt files | `scaffold run` |
| `knowledge/**/*.md` | Knowledge base entries | `scaffold run` |
| `methodology/*.yml` | Methodology preset definitions | `scaffold init`, `scaffold run` |
| `.scaffold/config.yml` | Project configuration | Every command |
| `.scaffold/state.json` | Pipeline state | Every command |
| `.scaffold/decisions.jsonl` | Decision log | `scaffold run` (for context) |
| `.scaffold/instructions/` | User instruction files | `scaffold run` |
| Completed artifacts | Prior step outputs (by path from meta-prompt `outputs` field) | `scaffold run` (update mode, context gathering) |
| Project directory files | Package manifests, README, docs/, test configs, CI configs (signal scanning) | `scaffold init`, `scaffold adopt` |
| `CLAUDE.md` | Project agent instruction file (section registry) | `scaffold run` (post-completion hook) |

### What Scaffold Writes

| Location | Content | Mechanism |
|----------|---------|-----------|
| `.scaffold/state.json` | Pipeline state updates | Atomic write (temp file + `fs.rename`) |
| `.scaffold/decisions.jsonl` | New decision entries | Append (`fs.appendFile`) |
| `.scaffold/config.yml` | Initial config | `scaffold init` only |
| `.scaffold/lock.json` | Advisory lock | Create on lock acquire, delete on release |
| `commands/*.md` | Platform wrappers (Claude Code) | `scaffold build` |
| `AGENTS.md` | Platform wrapper (Codex) | `scaffold build` |
| `codex-prompts/*.md` | Platform wrappers (Codex) | `scaffold build` |
| `prompts/*.md` | Platform wrappers (Universal) | `scaffold build` |
| `scaffold-pipeline.md` | Pipeline reference (Universal) | `scaffold build` |
| `CLAUDE.md` | Agent instructions (managed sections) | `scaffold build`, `scaffold run` |

### Security Constraints

- **No writes outside project root**: Scaffold never writes to directories above the current working directory. All write paths are constructed relative to the project root.
- **Atomic writes**: `state.json` uses temp-file-then-rename (`fs.writeFile` to `state.json.tmp`, then `fs.rename` to `state.json`). This prevents corruption from crashes during write. See PRD §18.
- **Default file permissions**: Scaffold uses Node's default `fs.writeFile` permissions (typically `0o666` masked by `umask`). No `chmod`, no elevated permissions, no `setuid`.
- **No shell execution from file content**: Content read from the file system is never passed to `child_process.exec()` or evaluated as code. See §4.
- **Lock file cleanup**: The advisory lock (`lock.json`) is deleted on process exit (including `SIGTERM` and `SIGINT` handlers). Stale locks from crashed processes are detected by checking the PID recorded in the lock file.

---

## 8. Architectural Constraint Enforcement

Two PRD constraints (NF-012, NF-013) are enforced by design but benefit from automated verification to catch accidental violations during development.

### NF-012: No Credential Storage

Scaffold must never store credentials, API keys, or secrets. This is an architectural constraint — no module should write to common credential paths or handle secret material.

**CI enforcement**: A lightweight shell script (`scripts/check-no-credentials.sh`) or ESLint rule that scans `src/` for patterns indicating credential handling:

```bash
# Fail if any source file references credential-related paths or APIs
grep -rn --include='*.ts' \
  -e 'credentials' -e 'apiKey' -e 'api_key' -e 'secret' \
  -e '\.env' -e 'dotenv' -e 'keychain' -e 'keytar' \
  src/ && echo "FAIL: Credential-related code found in src/" && exit 1 || exit 0
```

**Exceptions**: The word "credential" appearing in error messages, comments, or documentation strings is acceptable. The grep pattern should be tuned to minimize false positives — flag only imports, variable declarations, and function calls.

### NF-013: No Network Access (Except `scaffold update`)

Scaffold must not make network requests except in the `scaffold update` command. This prevents telemetry, phone-home behavior, and accidental external dependencies.

**CI enforcement**: A shell script (`scripts/check-no-network.sh`) that scans for network imports outside the update command:

```bash
# Allowed: src/cli/commands/update.ts may use network APIs
# Forbidden: all other src/ files
grep -rn --include='*.ts' \
  -e "from 'http'" -e "from 'https'" -e "from 'net'" \
  -e "from 'node:http'" -e "from 'node:https'" -e "from 'node:net'" \
  -e 'require.*http' -e 'require.*https' -e 'require.*net' \
  -e 'globalThis.fetch' -e 'global.fetch' \
  --exclude='update.ts' \
  src/ && echo "FAIL: Network imports found outside update command" && exit 1 || exit 0
```

**Implementation notes**:
- These scripts run in CI alongside lint and test (< 1s each).
- False positives from string literals or comments can be excluded with `--exclude` patterns or `# no-network-check` inline comments.
- If ESLint custom rules are preferred over shell scripts, use `no-restricted-imports` with the same patterns.

---

## 9. Security Review Checklist for Contributors

Before submitting a PR, review these questions for any new or modified feature:

- [ ] **New dependency?** Review against the selection criteria in §5. Run `npm ls <package>` to check transitive count. Verify license is acceptable.

- [ ] **Reads new files from the user's project?** Could the file contain secrets (`.env`, credentials, private keys)? If yes, reconsider whether reading this file is necessary. If it is, document what is read and why.

- [ ] **Writes files?** Does the write use atomic writes (temp + rename) for state files? Does the write stay within the project root? Never write to `~`, `/tmp`, or any directory outside the project.

- [ ] **Accepts new user input?** Is the input validated at the boundary (CLI argument validation, schema validation for config files)? Are file paths checked against the project root?

- [ ] **Makes network requests?** The answer should be "no" (PRD §18). The only exception is `scaffold update`. If your feature requires network access, this is an architectural decision that needs an ADR.

- [ ] **Changes npm package contents?** Run `npm pack --dry-run` and verify no sensitive files are included. Check that required content directories (`dist/`, `pipeline/`, `knowledge/`, `methodology/`) are still present.

- [ ] **Passes user input to a shell command?** Use `child_process.execFile()` or `child_process.spawn()` with argument arrays — never `child_process.exec()` with string concatenation. Better yet, use a Node.js library instead of shelling out.

- [ ] **Modifies the assembly engine's file reading?** Ensure symlinks are resolved and validated against the expected base directory (§3). Ensure no new tree-walking or globbing reads files the user didn't intend to include.

- [ ] **Could this commit contain secrets?** Never commit `.env` files, API keys, tokens, or credentials. If a secret is accidentally committed: rotate it immediately (assume compromised even after removing from git history), then clean history with `git filter-repo` or BFG Repo Cleaner. Consider adding `git-secrets` or `gitleaks` as a pre-commit hook to catch secrets before they reach the repository.

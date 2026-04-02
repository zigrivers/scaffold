# Gemini Runner Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add first-class project-local Gemini CLI integration so downstream projects can use plain prompts like `scaffold status` and `scaffold create-prd`, plus explicit `/scaffold:*` Gemini commands, through the Scaffold runner workflow.

**Architecture:** Add `gemini` as a first-class Scaffold platform, introduce a packaged `agent-skills/` source for shared runner/pipeline instructions, add a `GeminiMdManager` that preserves user content while maintaining a Scaffold-managed import block, and implement a new Gemini adapter that generates `.agents/skills/`, `GEMINI.md`, and `.gemini/commands/scaffold/*.toml`. Keep Claude Code, Codex, and Universal flows intact, and extend `scaffold skill` so it installs both Claude-specific and shared agent skills into the project.

**Tech Stack:** TypeScript, Vitest, Zod, yargs, Node `fs`/`path`, Markdown `SKILL.md` files, Gemini CLI TOML custom commands.

**Execution constraint:** Do not commit or push during implementation unless the user explicitly asks for it. Treat each former commit boundary below as a review checkpoint instead.

---

## File Map

### New files

- `agent-skills/scaffold-runner/SKILL.md` — packaged shared runner instructions used for Gemini/Codex-style project-local installs
- `agent-skills/scaffold-pipeline/SKILL.md` — packaged shared pipeline reference instructions used for Gemini/Codex-style project-local installs
- `src/project/gemini-md.ts` — managed-root `GEMINI.md` writer that preserves user content and updates only the Scaffold block
- `src/project/gemini-md.test.ts` — regression coverage for `GEMINI.md` creation, replacement, and preservation behavior
- `src/core/adapters/gemini.ts` — Gemini adapter that generates `.agents/skills/`, `.gemini/commands/scaffold/*.toml`, and merged `GEMINI.md`
- `src/core/adapters/gemini.test.ts` — Gemini adapter coverage for generated files and command content
- `src/wizard/questions.test.ts` — direct tests for interactive platform selection including Gemini

### Modified files

- `package.json` — include `agent-skills/` in the published package
- `.npmignore` — avoid excluding packaged skill sources by accident
- `src/utils/fs.ts` — shared package-root helpers for `skills/` and `agent-skills/`
- `src/utils/fs.test.ts` — coverage for new package-directory helpers
- `src/config/schema.ts` — allow `gemini` in `platforms`
- `src/config/schema.test.ts` — schema coverage for Gemini platform
- `src/types/config.ts` — add `gemini` to `ScaffoldConfig.platforms`
- `src/types/wizard.ts` — add `gemini` to wizard platform answers
- `src/config/migration.ts` — preserve `gemini` during v1 migration and keep default behavior unchanged
- `src/config/migration.test.ts` — migration coverage for mixed platform arrays including Gemini
- `src/wizard/questions.ts` — ask about Gemini alongside Codex in interactive mode
- `src/wizard/wizard.ts` — stop narrowing platform arrays to Claude/Codex only
- `src/wizard/wizard.test.ts` — init coverage for Gemini-capable platform arrays if needed
- `src/core/adapters/adapter.ts` — register `gemini` in the adapter factory and `KNOWN_PLATFORMS`
- `src/core/adapters/adapter.test.ts` — adapter-factory coverage for `gemini`
- `src/cli/commands/build.test.ts` — verify build writes Gemini files when configured
- `src/cli/commands/skill.ts` — install/list/remove both `.claude/skills/` and `.agents/skills/`
- `src/cli/commands/skill.test.ts` — coverage for cross-agent install/list/remove behavior
- `src/e2e/init.test.ts` — generated-project coverage for Gemini build output
- `README.md` — explain Gemini plain-text support, slash commands, and refresh commands
- `docs/scaffold-overview.md` — update active overview text to include Gemini project-local integration
- `docs/v2/reference/scaffold-overview.md` — same as above for v2 active reference
- `docs/project-structure.md` — include `GEMINI.md`, `.gemini/commands/`, and `.agents/skills/`
- `docs/v2/reference/project-structure.md` — same as above for v2 active reference

---

### Task 1: Extend the platform model to recognize Gemini

**Files:**
- Create: `src/wizard/questions.test.ts`
- Modify: `src/config/schema.ts`
- Modify: `src/config/schema.test.ts`
- Modify: `src/types/config.ts`
- Modify: `src/types/wizard.ts`
- Modify: `src/config/migration.ts`
- Modify: `src/config/migration.test.ts`
- Modify: `src/wizard/questions.ts`
- Modify: `src/wizard/wizard.ts`

- [ ] **Step 1: Write the failing tests for Gemini platform acceptance**

Add a schema test case in `src/config/schema.test.ts`:

```ts
it('accepts gemini as a configured platform', () => {
  const result = ConfigSchema.safeParse({
    version: 2,
    methodology: 'deep',
    platforms: ['claude-code', 'gemini'],
  })
  expect(result.success).toBe(true)
})
```

Create `src/wizard/questions.test.ts` with a direct interactive-selection test:

```ts
it('adds gemini when the user confirms it', async () => {
  const output = {
    prompt: vi.fn().mockResolvedValue('deep'),
    confirm: vi.fn()
      .mockResolvedValueOnce(false) // add codex
      .mockResolvedValueOnce(true), // add gemini
  } as unknown as OutputContext

  const answers = await askWizardQuestions({
    output,
    suggestion: 'deep',
    auto: false,
  })

  expect(answers.platforms).toEqual(['claude-code', 'gemini'])
})
```

Add a migration regression in `src/config/migration.test.ts`:

```ts
it('preserves gemini when already present', () => {
  const result = migrateV1({
    version: 1,
    methodology: 'classic',
    platforms: ['claude-code', 'gemini'],
  })
  expect(result.platforms).toEqual(['claude-code', 'gemini'])
})
```

- [ ] **Step 2: Run the targeted tests and watch them fail**

Run:

```bash
npx vitest run src/config/schema.test.ts src/config/migration.test.ts src/wizard/questions.test.ts src/wizard/wizard.test.ts
```

Expected:

```text
FAIL src/config/schema.test.ts
FAIL src/wizard/questions.test.ts
```

with enum/type errors because `gemini` is not yet allowed.

- [ ] **Step 3: Implement Gemini in config, migration, and wizard types**

Apply these code changes:

```ts
// src/config/schema.ts
platforms: z.array(z.enum(['claude-code', 'codex', 'gemini'])).min(1),
```

```ts
// src/types/config.ts
platforms: Array<'claude-code' | 'codex' | 'gemini'>
```

```ts
// src/types/wizard.ts
platforms: Array<'claude-code' | 'codex' | 'gemini'>
```

```ts
// src/config/migration.ts
const migratedPlatforms =
  (platforms as Array<'claude-code' | 'codex' | 'gemini'> | undefined)
  ?? ['claude-code']
```

Update `src/wizard/questions.ts` to ask Gemini explicitly after Codex:

```ts
const platforms = ['claude-code']
if (!auto) {
  const addCodex = await output.confirm('Include Codex adapter?', false)
  if (addCodex) platforms.push('codex')

  const addGemini = await output.confirm('Include Gemini adapter?', false)
  if (addGemini) platforms.push('gemini')
}
```

Update `src/wizard/wizard.ts` to stop narrowing the array to Claude/Codex only:

```ts
platforms: answers.platforms as Array<'claude-code' | 'codex' | 'gemini'>,
```

- [ ] **Step 4: Re-run the targeted tests**

Run:

```bash
npx vitest run src/config/schema.test.ts src/config/migration.test.ts src/wizard/questions.test.ts src/wizard/wizard.test.ts
```

Expected:

```text
PASS src/config/schema.test.ts
PASS src/config/migration.test.ts
PASS src/wizard/questions.test.ts
PASS src/wizard/wizard.test.ts
```

- [ ] **Step 5: Review checkpoint for the platform-model changes**

Capture the diff and targeted test results for review:

```bash
git diff -- src/config/schema.ts src/config/schema.test.ts src/types/config.ts src/types/wizard.ts src/config/migration.ts src/config/migration.test.ts src/wizard/questions.ts src/wizard/questions.test.ts src/wizard/wizard.ts
```

---

### Task 2: Add packaged shared skill sources and managed `GEMINI.md`

**Files:**
- Create: `agent-skills/scaffold-runner/SKILL.md`
- Create: `agent-skills/scaffold-pipeline/SKILL.md`
- Create: `src/project/gemini-md.ts`
- Create: `src/project/gemini-md.test.ts`
- Modify: `.agents/skills/scaffold-runner/SKILL.md`
- Modify: `.agents/skills/scaffold-pipeline/SKILL.md`
- Modify: `src/utils/fs.ts`
- Modify: `src/utils/fs.test.ts`

- [ ] **Step 1: Write the failing tests for managed `GEMINI.md` behavior**

Create `src/project/gemini-md.test.ts` with these first cases:

```ts
it('creates GEMINI.md if it does not exist', () => {
  const root = makeTmpDir()
  const manager = new GeminiMdManager(root)
  manager.sync()
  expect(fs.existsSync(path.join(root, 'GEMINI.md'))).toBe(true)
})

it('preserves unmanaged content while replacing the Scaffold block', () => {
  const root = makeTmpDir()
  fs.writeFileSync(
    path.join(root, 'GEMINI.md'),
    '# Team Notes\n\nDo not remove this.\n',
    'utf8',
  )

  const manager = new GeminiMdManager(root)
  manager.sync()
  manager.sync()

  const content = fs.readFileSync(path.join(root, 'GEMINI.md'), 'utf8')
  expect(content).toContain('Do not remove this.')
  expect(content.match(/scaffold:managed gemini/g)?.length).toBe(1)
  expect(content).toContain('@./.agents/skills/scaffold-runner/SKILL.md')
  expect(content).toContain('@./.agents/skills/scaffold-pipeline/SKILL.md')
})
```

Add helper tests in `src/utils/fs.test.ts`:

```ts
it('getPackageAgentSkillsDir resolves bundled agent-skills directory', () => {
  expect(getPackageAgentSkillsDir().endsWith(path.join('agent-skills'))).toBe(true)
})
```

- [ ] **Step 2: Run the new tests and confirm they fail**

Run:

```bash
npx vitest run src/project/gemini-md.test.ts src/utils/fs.test.ts
```

Expected:

```text
FAIL src/project/gemini-md.test.ts
```

because `GeminiMdManager` and the new fs helper do not exist yet.

- [ ] **Step 3: Create the shared skill source and `GeminiMdManager`**

Create the packaged source by copying the current shared agent skills, then keep the repo-local `.agents` copies identical:

```bash
mkdir -p agent-skills
cp -R .agents/skills/scaffold-runner agent-skills/scaffold-runner
cp -R .agents/skills/scaffold-pipeline agent-skills/scaffold-pipeline
cp agent-skills/scaffold-runner/SKILL.md .agents/skills/scaffold-runner/SKILL.md
cp agent-skills/scaffold-pipeline/SKILL.md .agents/skills/scaffold-pipeline/SKILL.md
```

Add reusable package-directory helpers:

```ts
// src/utils/fs.ts
export function getPackageSkillsDir(projectRoot?: string): string {
  if (projectRoot) {
    const local = path.join(projectRoot, 'skills')
    if (fs.existsSync(local)) return local
  }
  return path.join(getPackageRoot(), 'skills')
}

export function getPackageAgentSkillsDir(projectRoot?: string): string {
  if (projectRoot) {
    const local = path.join(projectRoot, 'agent-skills')
    if (fs.existsSync(local)) return local
  }
  return path.join(getPackageRoot(), 'agent-skills')
}
```

Implement `GeminiMdManager` as a focused block manager:

```ts
const OPEN_MARKER = '<!-- scaffold:managed gemini -->'
const CLOSE_MARKER = '<!-- /scaffold:managed gemini -->'

const MANAGED_BLOCK = [
  OPEN_MARKER,
  '## Scaffold Integration',
  '',
  '@./.agents/skills/scaffold-runner/SKILL.md',
  '@./.agents/skills/scaffold-pipeline/SKILL.md',
  '',
  CLOSE_MARKER,
].join('\n')

export class GeminiMdManager {
  constructor(private readonly projectRoot: string) {}

  sync(): void {
    const geminiMdPath = path.join(this.projectRoot, 'GEMINI.md')
    const existing = fs.existsSync(geminiMdPath)
      ? fs.readFileSync(geminiMdPath, 'utf8')
      : ''

    const next = existing.match(new RegExp(`${escapeRegex(OPEN_MARKER)}[\\s\\S]*?${escapeRegex(CLOSE_MARKER)}`))
      ? existing.replace(new RegExp(`${escapeRegex(OPEN_MARKER)}[\\s\\S]*?${escapeRegex(CLOSE_MARKER)}`, 'g'), MANAGED_BLOCK)
      : `${existing}${existing.endsWith('\n') || existing.length === 0 ? '' : '\n'}\n${MANAGED_BLOCK}\n`

    atomicWriteFile(geminiMdPath, next)
  }
}
```

- [ ] **Step 4: Re-run the targeted tests**

Run:

```bash
npx vitest run src/project/gemini-md.test.ts src/utils/fs.test.ts
```

Expected:

```text
PASS src/project/gemini-md.test.ts
PASS src/utils/fs.test.ts
```

- [ ] **Step 5: Review checkpoint for the shared-skill and `GEMINI.md` foundation**

Capture the diff and targeted test results for review:

```bash
git diff -- agent-skills .agents/skills src/project/gemini-md.ts src/project/gemini-md.test.ts src/utils/fs.ts src/utils/fs.test.ts
```

---

### Task 3: Implement the Gemini adapter and register it

**Files:**
- Create: `src/core/adapters/gemini.ts`
- Create: `src/core/adapters/gemini.test.ts`
- Modify: `src/core/adapters/adapter.ts`
- Modify: `src/core/adapters/adapter.test.ts`

- [ ] **Step 1: Write failing adapter tests for Gemini outputs**

Create `src/core/adapters/gemini.test.ts` with these cases:

```ts
it('generateStepWrapper creates a Gemini command for a pipeline step', () => {
  const adapter = new GeminiAdapter()
  adapter.initialize({
    projectRoot: '/tmp/project',
    methodology: 'deep',
    allSteps: ['create-prd'],
  })

  const output = adapter.generateStepWrapper({
    slug: 'create-prd',
    description: 'Create the PRD',
    phase: 'pre',
    dependsOn: [],
    produces: [],
    pipelineIndex: 0,
    body: '',
    sections: {},
    knowledgeEntries: [],
    conditional: null,
    longDescription: 'Create the PRD',
  })

  expect(output.files[0].relativePath).toBe('.gemini/commands/scaffold/create-prd.toml')
  expect(output.files[0].content).toContain('User request: scaffold create-prd')
})

it('finalize emits shared skills, GEMINI.md, and status helpers', () => {
  const adapter = new GeminiAdapter()
  adapter.initialize({
    projectRoot: tempRoot,
    methodology: 'deep',
    allSteps: ['create-prd'],
  })

  const result = adapter.finalize({ results: [] })
  const paths = result.files.map(f => f.relativePath)

  expect(paths).toContain('.agents/skills/scaffold-runner/SKILL.md')
  expect(paths).toContain('.agents/skills/scaffold-pipeline/SKILL.md')
  expect(paths).toContain('GEMINI.md')
  expect(paths).toContain('.gemini/commands/scaffold/status.toml')
  expect(paths).toContain('.gemini/commands/scaffold/next.toml')
})
```

Update `src/core/adapters/adapter.test.ts` expectations:

```ts
it('includes "gemini"', () => {
  expect(KNOWN_PLATFORMS).toContain('gemini')
})

it('has exactly 4 entries', () => {
  expect(KNOWN_PLATFORMS).toHaveLength(4)
})
```

- [ ] **Step 2: Run the adapter tests and confirm failure**

Run:

```bash
npx vitest run src/core/adapters/adapter.test.ts src/core/adapters/gemini.test.ts
```

Expected:

```text
FAIL src/core/adapters/adapter.test.ts
FAIL src/core/adapters/gemini.test.ts
```

because `gemini` is not registered and the adapter file does not exist.

- [ ] **Step 3: Implement `GeminiAdapter` and register it**

Register the adapter in `src/core/adapters/adapter.ts`:

```ts
import { GeminiAdapter } from './gemini.js'

// ...
case 'gemini':
  return new GeminiAdapter()

export const KNOWN_PLATFORMS = ['claude-code', 'codex', 'gemini', 'universal'] as const
```

Implement `GeminiAdapter` with thin TOML wrappers and finalize-time support files:

```ts
generateStepWrapper(input: AdapterStepInput): AdapterStepOutput {
  const content = [
    `description = ${JSON.stringify(`Run scaffold ${input.slug} through the Scaffold runner workflow.`)}`,
    'prompt = """',
    'Use the Scaffold runner workflow already loaded from GEMINI.md.',
    '',
    `User request: scaffold ${input.slug}`,
    '"""',
    '',
  ].join('\n')

  return {
    slug: input.slug,
    platformId: this.platformId,
    files: [{
      relativePath: `.gemini/commands/scaffold/${input.slug}.toml`,
      content,
      writeMode: 'create',
    }],
    success: true,
  }
}
```

In `finalize`, add:

```ts
const geminiMdManager = new GeminiMdManager(this.context!.projectRoot)
geminiMdManager.sync()
const geminiMd = fs.readFileSync(path.join(this.context!.projectRoot, 'GEMINI.md'), 'utf8')

files.push({ relativePath: 'GEMINI.md', content: geminiMd, writeMode: 'create' })
files.push({ relativePath: '.agents/skills/scaffold-runner/SKILL.md', content: runnerSkill, writeMode: 'create' })
files.push({ relativePath: '.agents/skills/scaffold-pipeline/SKILL.md', content: pipelineSkill, writeMode: 'create' })
files.push({ relativePath: '.gemini/commands/scaffold/status.toml', content: statusToml, writeMode: 'create' })
files.push({ relativePath: '.gemini/commands/scaffold/next.toml', content: nextToml, writeMode: 'create' })
```

Use the same pattern for utility tools and build-phase commands so every generated Gemini command is a thin wrapper over the plain-text request Scaffold already understands.

- [ ] **Step 4: Re-run the adapter tests**

Run:

```bash
npx vitest run src/core/adapters/adapter.test.ts src/core/adapters/gemini.test.ts
```

Expected:

```text
PASS src/core/adapters/adapter.test.ts
PASS src/core/adapters/gemini.test.ts
```

- [ ] **Step 5: Review checkpoint for the Gemini adapter**

Capture the diff and targeted test results for review:

```bash
git diff -- src/core/adapters/adapter.ts src/core/adapters/adapter.test.ts src/core/adapters/gemini.ts src/core/adapters/gemini.test.ts
```

---

### Task 4: Integrate Gemini into build output and `scaffold skill`

**Files:**
- Modify: `src/cli/commands/build.test.ts`
- Modify: `src/cli/commands/skill.ts`
- Modify: `src/cli/commands/skill.test.ts`
- Modify: `src/e2e/init.test.ts`

- [ ] **Step 1: Add failing build and skill-command tests**

In `src/cli/commands/build.test.ts`, add a Gemini build expectation:

```ts
it('builds gemini output when gemini is configured', async () => {
  mockLoadConfig.mockReturnValue({
    config: makeConfig({ platforms: ['claude-code', 'gemini'] }) as ReturnType<typeof loadConfig>['config'],
    errors: [],
    warnings: [],
  })

  mockCreateAdapter.mockImplementation((platformId: string) => ({
    platformId,
    initialize: vi.fn(() => ({ success: true, errors: [] })),
    generateStepWrapper: vi.fn((input: { slug: string }) => ({
      slug: input.slug,
      platformId,
      files: platformId === 'gemini'
        ? [{
          relativePath: `.gemini/commands/scaffold/${input.slug}.toml`,
          content: `User request: scaffold ${input.slug}`,
          writeMode: 'create',
        }]
        : [],
      success: true,
    })),
    finalize: vi.fn(() => ({
      files: platformId === 'gemini'
        ? [{
          relativePath: 'GEMINI.md',
          content: '# Gemini',
          writeMode: 'create',
        }]
        : [],
      errors: [],
    })),
  }) as never)

  await buildCommand.handler({
    'validate-only': false,
    force: false,
    root: '/fake/project',
    $0: 'scaffold',
    _: ['build'],
  } as never)

  expect(mockCreateAdapter).toHaveBeenCalledWith('gemini')
  expect(mockAtomicWriteFile).toHaveBeenCalledWith(
    '/fake/project/.gemini/commands/scaffold/step-a.toml',
    expect.stringContaining('scaffold step-a'),
  )
})
```

In `src/cli/commands/skill.test.ts`, add install assertions for `.agents/skills/`:

```ts
expect(fs.existsSync(path.join(tmpDir, '.agents', 'skills', 'scaffold-runner', 'SKILL.md'))).toBe(true)
expect(fs.existsSync(path.join(tmpDir, '.agents', 'skills', 'scaffold-pipeline', 'SKILL.md'))).toBe(true)
```

Add a remove assertion:

```ts
expect(fs.existsSync(path.join(tmpDir, '.agents', 'skills', 'scaffold-runner'))).toBe(false)
```

- [ ] **Step 2: Run the targeted tests and confirm failure**

Run:

```bash
npx vitest run src/cli/commands/build.test.ts src/cli/commands/skill.test.ts src/e2e/init.test.ts
```

Expected:

```text
FAIL src/cli/commands/build.test.ts
FAIL src/cli/commands/skill.test.ts
```

because the build mock and skill command do not yet support Gemini/shared-agent outputs.

- [ ] **Step 3: Implement cross-agent skill install/list/remove and adjust build tests**

Refactor `src/cli/commands/skill.ts` around install targets:

```ts
const INSTALL_TARGETS = [
  {
    label: 'claude',
    destination: (root: string) => path.join(root, '.claude', 'skills'),
    sourceRoot: () => getPackageSkillsDir(),
  },
  {
    label: 'agents',
    destination: (root: string) => path.join(root, '.agents', 'skills'),
    sourceRoot: () => getPackageAgentSkillsDir(),
  },
]
```

Then install both locations by default:

```ts
for (const target of INSTALL_TARGETS) {
  const skillsDir = target.destination(projectRoot)
  fs.mkdirSync(skillsDir, { recursive: true })
  // copy scaffold-runner + scaffold-pipeline from the target sourceRoot()
}
```

Update the command description:

```ts
describe: 'Manage scaffold skills for Claude Code and shared agent environments',
```

Keep `build.ts` generic; only adjust the mocked Gemini adapter in `src/cli/commands/build.test.ts` so the build command verifies Gemini writes end-to-end.

- [ ] **Step 4: Re-run the targeted tests**

Run:

```bash
npx vitest run src/cli/commands/build.test.ts src/cli/commands/skill.test.ts src/e2e/init.test.ts
```

Expected:

```text
PASS src/cli/commands/build.test.ts
PASS src/cli/commands/skill.test.ts
PASS src/e2e/init.test.ts
```

- [ ] **Step 5: Review checkpoint for the integration-surface changes**

Capture the diff and targeted test results for review:

```bash
git diff -- src/cli/commands/build.test.ts src/cli/commands/skill.ts src/cli/commands/skill.test.ts src/e2e/init.test.ts
```

---

### Task 5: Update package metadata and active documentation

**Files:**
- Modify: `package.json`
- Modify: `.npmignore`
- Modify: `README.md`
- Modify: `docs/scaffold-overview.md`
- Modify: `docs/v2/reference/scaffold-overview.md`
- Modify: `docs/project-structure.md`
- Modify: `docs/v2/reference/project-structure.md`

- [ ] **Step 1: Update package metadata so shared skills ship in npm**

Add `agent-skills/` to the published package list:

```json
"files": [
  "dist/",
  "pipeline/",
  "tools/",
  "knowledge/",
  "methodology/",
  "skills/",
  "agent-skills/",
  "README.md",
  "LICENSE"
]
```

Remove the misleading `skills/` exclusion from `.npmignore` and do not add `agent-skills/` there.

- [ ] **Step 2: Document the Gemini workflow in active docs**

Update `README.md` with a Gemini-specific usage section that says:

```md
Gemini CLI projects get two integration paths:

- Plain prompts like `scaffold status` and `scaffold create-prd` work because Scaffold manages a root `GEMINI.md` import block.
- Explicit Gemini commands are generated under `.gemini/commands/scaffold/`, so you can run `/scaffold:status`, `/scaffold:create-prd`, and other Scaffold commands directly.

After rebuilding Scaffold files, run `/memory reload` and `/commands reload` in Gemini CLI.
```

Update both overview docs so they no longer read as Claude-only. Add the project-structure entries:

```md
| Gemini context | `GEMINI.md` | Project-local Gemini CLI instructions with a Scaffold-managed import block |
| Gemini commands | `.gemini/commands/` | Project-local Gemini slash commands |
| Shared agent skills | `.agents/skills/` | Project-local runner and pipeline skills shared across non-Claude agent environments |
```

- [ ] **Step 3: Verify package contents with a dry run**

Run:

```bash
npm pack --dry-run | tee /tmp/scaffold-pack.txt
rg "agent-skills/scaffold-runner/SKILL.md|agent-skills/scaffold-pipeline/SKILL.md" /tmp/scaffold-pack.txt
```

Expected:

```text
agent-skills/scaffold-runner/SKILL.md
agent-skills/scaffold-pipeline/SKILL.md
```

- [ ] **Step 4: Review checkpoint for the metadata and doc updates**

Capture the diff and packaging results for review:

```bash
git diff -- package.json .npmignore README.md docs/scaffold-overview.md docs/v2/reference/scaffold-overview.md docs/project-structure.md docs/v2/reference/project-structure.md
```

---

### Task 6: Run final verification and a generated-project smoke check

**Files:**
- Verify only: no new files required

- [ ] **Step 1: Run the focused Gemini regression suite**

Run:

```bash
npx vitest run \
  src/config/schema.test.ts \
  src/config/migration.test.ts \
  src/wizard/questions.test.ts \
  src/project/gemini-md.test.ts \
  src/core/adapters/gemini.test.ts \
  src/core/adapters/adapter.test.ts \
  src/cli/commands/build.test.ts \
  src/cli/commands/skill.test.ts \
  src/e2e/init.test.ts
```

Expected:

```text
PASS
```

for every listed file.

- [ ] **Step 2: Run the full repository gate**

Run:

```bash
make check-all
```

Expected:

```text
1102 tests, 0 failures
```

or the updated all-green count if other tests were added in this feature.

- [ ] **Step 3: Smoke-test generated Gemini output in a temp project**

Run:

```bash
TMP_DIR="$(mktemp -d)"
mkdir -p "$TMP_DIR/.scaffold"
cat > "$TMP_DIR/.scaffold/config.yml" <<'YAML'
version: 2
methodology: deep
platforms:
  - claude-code
  - gemini
YAML

node dist/index.js build --root "$TMP_DIR"

test -f "$TMP_DIR/GEMINI.md"
test -f "$TMP_DIR/.agents/skills/scaffold-runner/SKILL.md"
test -f "$TMP_DIR/.agents/skills/scaffold-pipeline/SKILL.md"
test -f "$TMP_DIR/.gemini/commands/scaffold/status.toml"
test -f "$TMP_DIR/.gemini/commands/scaffold/create-prd.toml"
```

Expected: all `test -f` checks succeed with exit code `0`.

- [ ] **Step 4: Prepare the finished feature for optional commit/push later**

Capture the final diff and status without committing:

```bash
git status --short
git diff --stat
```

- [ ] **Step 5: Summarize user-facing behavior before handoff**

Report these points explicitly:

```text
- Gemini support was previously missing project-local runner wiring.
- Scaffold now generates shared agent skills, a managed GEMINI.md block, and .gemini/commands/scaffold/*.toml.
- Gemini users can type plain requests like "scaffold status" or explicit slash commands like /scaffold:status.
- Claude Code and Codex behavior is unchanged apart from shared-skill packaging and install updates.
```

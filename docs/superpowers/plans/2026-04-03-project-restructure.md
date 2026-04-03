# Project Directory Restructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure the Scaffold project to group build inputs under `content/`, consolidate skills with templating, remove dead code, and archive legacy artifacts.

**Architecture:** Move `pipeline/`, `tools/`, `knowledge/`, `methodology/` into `content/`. Merge `skills/` and `agent-skills/` into `content/skills/` with `{{INSTRUCTIONS_FILE}}` template markers. Root `skills/` becomes generated output for plugin discovery. Delete `commands/`, dead scripts, and `.beads/`. Archive `prompts.md`. Reorganize `docs/`.

**Tech Stack:** TypeScript (vitest), bash (bats), GNU Make

**Spec:** `docs/superpowers/specs/2026-04-03-project-restructure-design.md`

---

### Task 1: Create `content/` and move build inputs

**Files:**
- Move: `pipeline/` → `content/pipeline/`
- Move: `tools/` → `content/tools/`
- Move: `knowledge/` → `content/knowledge/`
- Move: `methodology/` → `content/methodology/`

- [ ] **Step 1: Create content/ and git mv all four directories**

```bash
mkdir -p content
git mv pipeline content/pipeline
git mv tools content/tools
git mv knowledge content/knowledge
git mv methodology content/methodology
```

- [ ] **Step 2: Verify the moves**

```bash
ls content/
```

Expected: `knowledge  methodology  pipeline  tools`

```bash
ls content/pipeline/ | head -5
```

Expected: Phase subdirectories (architecture, build, consolidation, ...)

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "refactor: move pipeline/, tools/, knowledge/, methodology/ into content/"
```

---

### Task 2: Consolidate skills into `content/skills/` with template markers

**Files:**
- Create: `content/skills/scaffold-pipeline/SKILL.md` (template from `skills/scaffold-pipeline/SKILL.md`)
- Create: `content/skills/scaffold-runner/SKILL.md` (template from `skills/scaffold-runner/SKILL.md`)
- Create: `content/skills/multi-model-dispatch/SKILL.md` (copy from `skills/multi-model-dispatch/SKILL.md`)
- Delete: `agent-skills/` (consolidated)
- Delete: `skills/` contents (will become generated output)

The Claude Code `skills/` versions are the canonical source — they're complete and correct. The `agent-skills/` versions have bugs (`Codex-md-optimization`, `.Codex/rules/`) and missing sections. The template uses the Claude Code version with `{{INSTRUCTIONS_FILE}}` markers where `CLAUDE.md` appears as a project file reference.

- [ ] **Step 1: Create content/skills/ directory**

```bash
mkdir -p content/skills
```

- [ ] **Step 2: Copy Claude Code skill versions as template base**

```bash
cp -r skills/scaffold-pipeline content/skills/scaffold-pipeline
cp -r skills/scaffold-runner content/skills/scaffold-runner
cp -r skills/multi-model-dispatch content/skills/multi-model-dispatch
```

- [ ] **Step 3: Add template markers to scaffold-pipeline/SKILL.md**

In `content/skills/scaffold-pipeline/SKILL.md`, replace these literal `CLAUDE.md` references with `{{INSTRUCTIONS_FILE}}`:

Line 34 — consolidation description:
```
Optimizes CLAUDE.md under 200 lines
```
→
```
Optimizes {{INSTRUCTIONS_FILE}} under 200 lines
```

Line 50 — beads description:
```
Creates CLAUDE.md + task tracking
```
→
```
Creates {{INSTRUCTIONS_FILE}} + task tracking
```

Lines 81-82 — consolidation commands (keep canonical slug `claude-md-optimization` — this is a pipeline step name, not a platform reference).

- [ ] **Step 4: Add template markers to scaffold-runner/SKILL.md**

In `content/skills/scaffold-runner/SKILL.md`, replace literal `CLAUDE.md` references with `{{INSTRUCTIONS_FILE}}`:

Line 399 (consolidation table row):
```
Optimizes CLAUDE.md under 200 lines
```
→
```
Optimizes {{INSTRUCTIONS_FILE}} under 200 lines
```

Keep all other content as-is — `AskUserQuestionTool` references, `Claude Code` naming, `.claude/rules/` paths, and `claude-md-optimization` slugs are canonical and should not vary by platform.

- [ ] **Step 5: Remove old skills/ and agent-skills/ directories**

```bash
rm -rf skills/scaffold-pipeline skills/scaffold-runner skills/multi-model-dispatch
rm -rf agent-skills
```

Leave the `skills/` directory itself — it will become the generated output directory.

- [ ] **Step 6: Verify content/skills/ structure**

```bash
ls -R content/skills/
```

Expected:
```
content/skills/:
multi-model-dispatch  scaffold-pipeline  scaffold-runner

content/skills/multi-model-dispatch:
SKILL.md

content/skills/scaffold-pipeline:
SKILL.md

content/skills/scaffold-runner:
SKILL.md
```

- [ ] **Step 7: Verify template markers exist**

```bash
grep '{{INSTRUCTIONS_FILE}}' content/skills/scaffold-pipeline/SKILL.md
grep '{{INSTRUCTIONS_FILE}}' content/skills/scaffold-runner/SKILL.md
```

Expected: Each command should return 2 and 1 match(es) respectively.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "refactor: consolidate skills/ and agent-skills/ into content/skills/ with template markers"
```

---

### Task 3: Update core path functions in `src/utils/fs.ts`

**Files:**
- Modify: `src/utils/fs.ts:27-100`

All five `getPackage*Dir()` functions need their hardcoded directory names updated to include the `content/` prefix. Also rename `getPackageAgentSkillsDir` → `getPackageSkillsDir` since agent-skills is consolidated.

- [ ] **Step 1: Update getPackagePipelineDir**

In `src/utils/fs.ts`, replace:

```typescript
export function getPackagePipelineDir(projectRoot?: string): string {
  if (projectRoot) {
    const local = path.join(projectRoot, 'pipeline')
    if (fs.existsSync(local)) return local
  }
  return path.join(getPackageRoot(), 'pipeline')
}
```

With:

```typescript
export function getPackagePipelineDir(projectRoot?: string): string {
  if (projectRoot) {
    const local = path.join(projectRoot, 'content', 'pipeline')
    if (fs.existsSync(local)) return local
  }
  return path.join(getPackageRoot(), 'content', 'pipeline')
}
```

- [ ] **Step 2: Update getPackageKnowledgeDir**

Replace:

```typescript
export function getPackageKnowledgeDir(projectRoot?: string): string {
  if (projectRoot) {
    const local = path.join(projectRoot, 'knowledge')
    if (fs.existsSync(local)) return local
  }
  return path.join(getPackageRoot(), 'knowledge')
}
```

With:

```typescript
export function getPackageKnowledgeDir(projectRoot?: string): string {
  if (projectRoot) {
    const local = path.join(projectRoot, 'content', 'knowledge')
    if (fs.existsSync(local)) return local
  }
  return path.join(getPackageRoot(), 'content', 'knowledge')
}
```

- [ ] **Step 3: Update getPackageToolsDir**

Replace:

```typescript
export function getPackageToolsDir(projectRoot?: string): string {
  if (projectRoot) {
    const local = path.join(projectRoot, 'tools')
    if (fs.existsSync(local)) return local
  }
  return path.join(getPackageRoot(), 'tools')
}
```

With:

```typescript
export function getPackageToolsDir(projectRoot?: string): string {
  if (projectRoot) {
    const local = path.join(projectRoot, 'content', 'tools')
    if (fs.existsSync(local)) return local
  }
  return path.join(getPackageRoot(), 'content', 'tools')
}
```

- [ ] **Step 4: Rename and update getPackageAgentSkillsDir → getPackageSkillsDir**

Replace:

```typescript
/**
 * Resolve the bundled agent-skills directory.
 * If projectRoot is provided and contains agent-skills/, use that (dev/test mode).
 * Otherwise use the package's bundled agent-skills/.
 */
export function getPackageAgentSkillsDir(projectRoot?: string): string {
  if (projectRoot) {
    const local = path.join(projectRoot, 'agent-skills')
    if (fs.existsSync(local)) return local
  }
  return path.join(getPackageRoot(), 'agent-skills')
}
```

With:

```typescript
/**
 * Resolve the bundled skills template directory.
 * If projectRoot is provided and contains content/skills/, use that (dev/test mode).
 * Otherwise use the package's bundled content/skills/.
 */
export function getPackageSkillsDir(projectRoot?: string): string {
  if (projectRoot) {
    const local = path.join(projectRoot, 'content', 'skills')
    if (fs.existsSync(local)) return local
  }
  return path.join(getPackageRoot(), 'content', 'skills')
}
```

- [ ] **Step 5: Update getPackageMethodologyDir**

Replace:

```typescript
export function getPackageMethodologyDir(projectRoot?: string): string {
  if (projectRoot) {
    const local = path.join(projectRoot, 'methodology')
    if (fs.existsSync(local)) return local
  }
  return path.join(getPackageRoot(), 'methodology')
}
```

With:

```typescript
export function getPackageMethodologyDir(projectRoot?: string): string {
  if (projectRoot) {
    const local = path.join(projectRoot, 'content', 'methodology')
    if (fs.existsSync(local)) return local
  }
  return path.join(getPackageRoot(), 'content', 'methodology')
}
```

- [ ] **Step 6: Update the JSDoc comment on getPackageRoot**

Replace:

```typescript
/**
 * Resolve the package's own root directory (where pipeline/, knowledge/, methodology/ live).
 * Works whether scaffold is run from the repo or installed globally via npm/brew.
 */
```

With:

```typescript
/**
 * Resolve the package's own root directory (where content/pipeline/, content/knowledge/, etc. live).
 * Works whether scaffold is run from the repo or installed globally via npm/brew.
 */
```

- [ ] **Step 7: Update all callers of getPackageAgentSkillsDir → getPackageSkillsDir**

Search for all imports/usages of `getPackageAgentSkillsDir` and rename to `getPackageSkillsDir`:

```bash
grep -rn 'getPackageAgentSkillsDir' src/
```

Update each occurrence. Key files:
- `src/core/adapters/gemini.ts` — import and usage
- `src/cli/commands/skill.ts` — if it uses this function
- Any test files importing it

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "refactor: update path functions in fs.ts for content/ directory structure"
```

---

### Task 4: Update skill installation with template resolution

**Files:**
- Modify: `src/cli/commands/skill.ts`

The skill command needs to: (a) read from `content/skills/` instead of separate `skills/` and `agent-skills/`, and (b) resolve `{{INSTRUCTIONS_FILE}}` template markers per platform.

- [ ] **Step 1: Update SkillTarget interface and SKILL_TARGETS**

In `src/cli/commands/skill.ts`, replace:

```typescript
interface SkillTarget {
  sourceDir: 'skills' | 'agent-skills'
  installDir: '.claude/skills' | '.agents/skills'
  label: string
}
```

With:

```typescript
interface SkillTarget {
  installDir: '.claude/skills' | '.agents/skills'
  label: string
  templateVars: Record<string, string>
}
```

Replace:

```typescript
const SKILL_TARGETS: SkillTarget[] = [
  {
    sourceDir: 'skills',
    installDir: '.claude/skills',
    label: 'Claude Code',
  },
  {
    sourceDir: 'agent-skills',
    installDir: '.agents/skills',
    label: 'shared agents',
  },
]
```

With:

```typescript
const SKILL_TARGETS: SkillTarget[] = [
  {
    installDir: '.claude/skills',
    label: 'Claude Code',
    templateVars: {
      INSTRUCTIONS_FILE: 'CLAUDE.md',
    },
  },
  {
    installDir: '.agents/skills',
    label: 'shared agents',
    templateVars: {
      INSTRUCTIONS_FILE: 'AGENTS.md',
    },
  },
]
```

- [ ] **Step 2: Add template resolution function**

Add after the INSTALLABLE_SKILLS constant:

```typescript
/** Resolve {{KEY}} template markers in skill content. */
function resolveSkillTemplate(content: string, vars: Record<string, string>): string {
  return content.replace(/\{\{(\w+)\}\}/g, (match, key) => vars[key] ?? match)
}
```

- [ ] **Step 3: Update getPackageSkillsDir and path helpers**

Replace:

```typescript
/** Resolve the package's skills directory using the same root as pipeline/knowledge. */
function getPackageSkillsDir(sourceDir: SkillTarget['sourceDir']): string {
  return path.join(getPackageRoot(), sourceDir)
}

function getSkillSourcePath(skillName: string, target: SkillTarget): string {
  return path.join(getPackageSkillsDir(target.sourceDir), skillName, 'SKILL.md')
}
```

With:

```typescript
/** Resolve the package's skill template directory (content/skills/). */
function getSkillTemplateDir(): string {
  return path.join(getPackageRoot(), 'content', 'skills')
}

function getSkillSourcePath(skillName: string): string {
  return path.join(getSkillTemplateDir(), skillName, 'SKILL.md')
}
```

- [ ] **Step 4: Update buildTargetStates**

Replace:

```typescript
function buildTargetStates(projectRoot: string, skillName: string): SkillTargetState[] {
  return SKILL_TARGETS.map(target => ({
    target,
    sourcePath: getSkillSourcePath(skillName, target),
    destDir: getSkillDestDir(projectRoot, target, skillName),
    destPath: getSkillDestPath(projectRoot, target, skillName),
  }))
}
```

With:

```typescript
function buildTargetStates(projectRoot: string, skillName: string): SkillTargetState[] {
  const sourcePath = getSkillSourcePath(skillName)
  return SKILL_TARGETS.map(target => ({
    target,
    sourcePath,
    destDir: getSkillDestDir(projectRoot, target, skillName),
    destPath: getSkillDestPath(projectRoot, target, skillName),
  }))
}
```

- [ ] **Step 5: Update install handler to use template resolution**

In the install case, replace:

```typescript
          fs.mkdirSync(state.destDir, { recursive: true })
          fs.copyFileSync(state.sourcePath, state.destPath)
```

With:

```typescript
          fs.mkdirSync(state.destDir, { recursive: true })
          const template = fs.readFileSync(state.sourcePath, 'utf8')
          const resolved = resolveSkillTemplate(template, state.target.templateVars)
          fs.writeFileSync(state.destPath, resolved, 'utf8')
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add template resolution to scaffold skill install"
```

---

### Task 5: Add skill generation to scaffold build

**Files:**
- Modify: `src/cli/commands/build.ts` (add skill generation step after adapter output)

The `scaffold build` command needs to generate resolved skills to root `skills/` for plugin auto-discovery.

- [ ] **Step 1: Identify the build command's main handler**

Read `src/cli/commands/build.ts` and locate where adapter output is written. Add skill generation after that step.

- [ ] **Step 2: Add skill generation to the build handler**

After the existing adapter output generation, add:

```typescript
// Generate resolved skills for plugin auto-discovery
const skillTemplateDir = path.join(getPackageRoot(), 'content', 'skills')
const skillOutputDir = path.join(getPackageRoot(), 'skills')
if (fs.existsSync(skillTemplateDir)) {
  const claudeVars: Record<string, string> = { INSTRUCTIONS_FILE: 'CLAUDE.md' }
  for (const skillName of fs.readdirSync(skillTemplateDir)) {
    const templatePath = path.join(skillTemplateDir, skillName, 'SKILL.md')
    if (!fs.existsSync(templatePath)) continue
    const template = fs.readFileSync(templatePath, 'utf8')
    const resolved = template.replace(/\{\{(\w+)\}\}/g, (match, key) => claudeVars[key] ?? match)
    const outDir = path.join(skillOutputDir, skillName)
    fs.mkdirSync(outDir, { recursive: true })
    fs.writeFileSync(path.join(outDir, 'SKILL.md'), resolved, 'utf8')
  }
}
```

Note: The template resolution logic is duplicated from skill.ts. If it feels worth extracting to a shared utility, do so — but only if it's used in exactly these two places. A 1-line replace call doesn't warrant a shared module.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: generate resolved skills during scaffold build for plugin discovery"
```

---

### Task 6: Update all test files with new paths

**Files:**
- Modify: `src/utils/fs.test.ts`
- Modify: `src/validation/index.test.ts`
- Modify: `src/e2e/knowledge.test.ts`
- Modify: `src/e2e/commands.test.ts`
- Modify: `src/project/adopt.test.ts`
- Modify: `src/cli/commands/build.test.ts`
- Modify: `src/cli/commands/list.test.ts`
- Modify: `src/cli/commands/info.test.ts`
- Modify: `src/cli/commands/skill.test.ts`
- Modify: `src/cli/commands/run.test.ts`
- Modify: `src/core/assembly/knowledge-loader.test.ts`
- Modify: `src/core/adapters/gemini.test.ts`

This is a systematic find-and-replace across test files. The patterns are:

| Old Pattern | New Pattern |
|-------------|-------------|
| `path.join(..., 'pipeline')` | `path.join(..., 'content', 'pipeline')` |
| `path.join(..., 'knowledge')` | `path.join(..., 'content', 'knowledge')` |
| `path.join(..., 'tools')` | `path.join(..., 'content', 'tools')` |
| `path.join(..., 'methodology')` | `path.join(..., 'content', 'methodology')` |
| `path.join(..., 'agent-skills')` | `path.join(..., 'content', 'skills')` |
| `'/fake/pipeline'` | `'/fake/content/pipeline'` |
| `'/fake/knowledge'` | `'/fake/content/knowledge'` |
| `'/fake/tools'` | `'/fake/content/tools'` |
| `'/fake/methodology'` | `'/fake/content/methodology'` |
| `'/test/pipeline'` | `'/test/content/pipeline'` |
| `'/test/knowledge'` | `'/test/content/knowledge'` |
| `'/test/tools'` | `'/test/content/tools'` |
| `'/test/methodology'` | `'/test/content/methodology'` |
| `getPackageAgentSkillsDir` | `getPackageSkillsDir` |

**Important exceptions — do NOT change:**
- References to `commands/` in `findLegacyGeneratedOutputs` tests (`src/project/gitignore.test.ts`) — these detect legacy output in downstream projects
- References to `.claude/skills/` and `.agents/skills/` — these are install targets, unchanged

- [ ] **Step 1: Update each test file**

Work through each file in the list above, applying the pattern replacements. Read each file first to understand context before making changes.

- [ ] **Step 2: Run TypeScript type-check**

```bash
npm run type-check
```

Expected: No errors.

- [ ] **Step 3: Run unit tests**

```bash
npm test
```

Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "test: update test paths for content/ directory structure"
```

---

### Task 7: Delete legacy artifacts

**Files:**
- Delete: `commands/` (73 files)
- Delete: `scripts/extract-commands.sh`
- Delete: `scripts/install.sh`
- Delete: `scripts/uninstall.sh`
- Delete: `.beads/`

`install.sh` and `uninstall.sh` install/uninstall slash commands from `commands/` to `~/.claude/commands/`. With `commands/` removed, they're dead code.

- [ ] **Step 1: Remove commands/ directory**

```bash
git rm -r commands/
```

- [ ] **Step 2: Remove dead scripts**

```bash
git rm scripts/extract-commands.sh
git rm scripts/install.sh
git rm scripts/uninstall.sh
```

- [ ] **Step 3: Remove .beads/**

```bash
rm -rf .beads/
```

(`.beads/` may be partially gitignored; use `git rm -r --cached .beads/ 2>/dev/null; rm -rf .beads/` if needed.)

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor: remove commands/, dead install scripts, and .beads/"
```

---

### Task 8: Archive prompts.md and move development prompts

**Files:**
- Move: `prompts.md` → `docs/archive/prompts-v1.md`
- Move: `prompts/build-scaffold-skill.md` → `docs/build-scaffold-skill.md`
- Move: `prompts/scaffold-completeness-audit.md` → `docs/scaffold-completeness-audit.md`
- Delete: `prompts/` (empty after moves)

- [ ] **Step 1: Create archive directory and move files**

```bash
mkdir -p docs/archive
git mv prompts.md docs/archive/prompts-v1.md
git mv prompts/build-scaffold-skill.md docs/build-scaffold-skill.md
git mv prompts/scaffold-completeness-audit.md docs/scaffold-completeness-audit.md
rmdir prompts
```

- [ ] **Step 2: Commit**

```bash
git add -A
git commit -m "refactor: archive prompts.md, move dev prompts to docs/"
```

---

### Task 9: Reorganize docs/

**Files:**
- Move: `docs/v2/{active subdirs}` → `docs/architecture/`
- Move: `docs/v2/archive/` contents → `docs/archive/v2-archive/`
- Move: Root-level audit/review docs → `docs/archive/audits/` and `docs/archive/reviews/`
- Delete: `docs/v2/` (empty after moves)

- [ ] **Step 1: Identify active vs archive docs in docs/v2/**

```bash
ls docs/v2/
```

Active subdirs to move to `docs/architecture/`: `adrs/`, `api/`, `architecture/`, `data/`, `domain-models/`, `implementation/`, `reference/`, `ux/`, `validation/`, `final/`

Archive subdir: `docs/v2/archive/`

- [ ] **Step 2: Create docs/architecture/ and move active v2 docs**

```bash
mkdir -p docs/architecture
# Move each active subdirectory
for dir in adrs api architecture data domain-models implementation reference ux validation final; do
  [ -d "docs/v2/$dir" ] && git mv "docs/v2/$dir" "docs/architecture/$dir"
done
```

- [ ] **Step 3: Move v2 archive to docs/archive/v2-archive/**

```bash
mkdir -p docs/archive/v2-archive
[ -d "docs/v2/archive" ] && git mv docs/v2/archive/* docs/archive/v2-archive/
```

- [ ] **Step 4: Move root-level audit docs to docs/archive/audits/**

```bash
mkdir -p docs/archive/audits
# Move alignment audit files
for f in docs/alignment-audit*.md docs/comprehensive-alignment-audit*.md; do
  [ -f "$f" ] && git mv "$f" docs/archive/audits/
done
```

- [ ] **Step 5: Move root-level review docs to docs/archive/reviews/**

```bash
mkdir -p docs/archive/reviews
for f in docs/Multi\ Model\ Review*.md; do
  [ -f "$f" ] && git mv "$f" docs/archive/reviews/
done
[ -d "docs/reviews" ] && git mv docs/reviews docs/archive/reviews/user-stories
```

- [ ] **Step 6: Clean up empty docs/v2/ if empty**

```bash
# Remove any remaining empty dirs
find docs/v2 -type d -empty -delete 2>/dev/null
# If v2 still has files, list them for manual review
ls docs/v2/ 2>/dev/null
```

If files remain, assess whether they're active or archivable. Move accordingly.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "docs: reorganize docs/ — active architecture under architecture/, historical under archive/"
```

---

### Task 10: Update .gitignore and remove dist/ from tracking

**Files:**
- Modify: `.gitignore`

- [ ] **Step 1: Add dist/ and skills/ to .gitignore**

Add these entries to `.gitignore`:

```gitignore
# Build output (rebuilt by npm run build)
dist/

# Generated skills (resolved from content/skills/ templates during scaffold build)
skills/
```

- [ ] **Step 2: Remove dist/ from git tracking**

```bash
git rm -r --cached dist/
```

This removes `dist/` from the index without deleting it from disk.

- [ ] **Step 3: Remove skills/ from git tracking if any tracked files remain**

```bash
git rm -r --cached skills/ 2>/dev/null || true
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor: gitignore dist/ and skills/ (generated outputs)"
```

---

### Task 11: Update package.json

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Update the files array**

Replace:

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
  ],
```

With:

```json
  "files": [
    "dist/",
    "content/",
    "skills/",
    "README.md",
    "LICENSE"
  ],
```

Notes:
- `content/` includes pipeline, tools, knowledge, methodology, and skill templates
- `skills/` is generated output needed by the plugin for auto-discovery
- `dist/` is the compiled TypeScript (built by prepublishOnly)

- [ ] **Step 2: Update prepublishOnly to also generate skills**

Replace the prepublishOnly script command or update `scripts/prepublish.sh` to also run `scaffold build` (which now generates skills/) before publishing. Or add a dedicated step:

In `scripts/prepublish.sh`, add skill generation:

```bash
#!/usr/bin/env bash
set -euo pipefail

echo "Running prepublish checks..."
npm run build
npm test

# Generate resolved skills for plugin auto-discovery
echo "Generating resolved skills..."
node dist/index.js build --root "$(pwd)" 2>/dev/null || {
  echo "Warning: scaffold build failed, generating skills manually..."
  for skill_dir in content/skills/*/; do
    skill_name=$(basename "$skill_dir")
    mkdir -p "skills/$skill_name"
    sed 's/{{INSTRUCTIONS_FILE}}/CLAUDE.md/g' "$skill_dir/SKILL.md" > "skills/$skill_name/SKILL.md"
  done
}

echo "Prepublish checks passed."
```

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "build: update package.json files array and prepublish for content/ layout"
```

---

### Task 12: Update Makefile and install-hooks.sh

**Files:**
- Modify: `Makefile`
- Modify: `scripts/install-hooks.sh`

- [ ] **Step 1: Remove dead targets and update validate**

Remove the `extract`, `install`, and `uninstall` targets. Update `validate` since `commands/*.md` no longer exists. Update the `.PHONY` line.

Replace the entire Makefile with:

```makefile
.PHONY: help test lint validate check check-all eval ts-check setup hooks dashboard-test

help: ## Show available targets
	@grep -E '^[a-z][a-z-]*:.*## ' $(MAKEFILE_LIST) | awk -F ':.*## ' '{printf "  \033[36m%-12s\033[0m %s\n", $$1, $$2}'

test: ## Run bats test suite
	bats tests/

lint: ## Run ShellCheck on all shell scripts
	@find scripts lib -name '*.sh' -print0 2>/dev/null | xargs -0 shellcheck --severity=warning

validate: ## Validate frontmatter in pipeline and tool files
	./scripts/validate-frontmatter.sh content/pipeline/**/*.md content/tools/*.md

check: lint validate test eval ## Run bash quality gates (lint + validate + test + eval)

check-all: check ts-check ## Run all quality gates (bash + TypeScript)

ts-check: ## Run TypeScript quality gates (lint + type-check + build + unit tests)
	npm run lint
	npm run type-check
	npm run build
	npm test

eval: ## Run scaffold meta-evals (cross-system consistency checks)
	npx bats tests/evals/

setup: ## Install dev dependencies via Homebrew
	@command -v shellcheck >/dev/null 2>&1 || { echo "Installing shellcheck..."; brew install shellcheck; }
	@command -v bats >/dev/null 2>&1 || { echo "Installing bats-core..."; brew install bats-core; }
	@command -v jq >/dev/null 2>&1 || { echo "Installing jq..."; brew install jq; }
	@echo "All dev dependencies installed."

hooks: ## Install pre-commit and pre-push hooks
	./scripts/install-hooks.sh

dashboard-test: ## Generate test-ready dashboard HTML
	@mkdir -p tests/screenshots/current tests/screenshots/diff
	bash scripts/generate-dashboard.sh --no-open --output tests/screenshots/dashboard-test.html
	@echo "Dashboard ready at: tests/screenshots/dashboard-test.html"
	@echo "Navigate with: file://$(CURDIR)/tests/screenshots/dashboard-test.html"
```

- [ ] **Step 2: Update scripts/install-hooks.sh**

The pre-commit hook has three references that need updating:

1. Line 51: `grep '^commands/.*\.md$'` — remove this entire frontmatter validation block (lines 50-56) since `commands/` no longer exists
2. Lines 58-67: Stale commands check references `pipeline|knowledge` and `commands/` — update paths to `content/pipeline|content/knowledge` and remove the `commands/` staleness check (scaffold build handles this now)
3. Remove Beads (`bd`) hook calls from both pre-commit and pre-push (lines 33-38 and 79-84) since Beads is being removed

- [ ] **Step 3: Verify validate target works with new paths**

```bash
make validate
```

Expected: Frontmatter validation passes on pipeline and tool files.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "build: update Makefile — remove dead targets, update paths for content/"
```

---

### Task 13: Update plugin manifest

**Files:**
- Modify: `.claude-plugin/plugin.json`
- Modify: `.claude-plugin/marketplace.json`

- [ ] **Step 1: Update plugin.json**

Replace:

```json
{
  "name": "scaffold",
  "version": "2.5.0",
  "description": "Composable meta-prompt pipeline for scaffolding new software projects with Claude Code",
  "author": {
    "name": "zigrivers"
  },
  "license": "MIT",
  "keywords": ["scaffolding", "project-setup", "pipeline", "prompts", "beads"]
}
```

With:

```json
{
  "name": "scaffold",
  "version": "3.1.0",
  "description": "AI-powered software project scaffolding — CLI pipeline with auto-activated skills for Claude Code",
  "author": {
    "name": "zigrivers"
  },
  "license": "MIT",
  "keywords": ["scaffolding", "project-setup", "pipeline", "ai", "scaffold"]
}
```

- [ ] **Step 2: Update marketplace.json**

Replace:

```json
{
  "name": "zigrivers-scaffold",
  "owner": {
    "name": "zigrivers"
  },
  "plugins": [
    {
      "name": "scaffold",
      "source": "./",
      "description": "27-prompt pipeline for scaffolding new software projects with Claude Code"
    }
  ]
}
```

With:

```json
{
  "name": "zigrivers-scaffold",
  "owner": {
    "name": "zigrivers"
  },
  "plugins": [
    {
      "name": "scaffold",
      "source": "./",
      "description": "AI-powered scaffolding pipeline with CLI and auto-activated skills"
    }
  ]
}
```

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "build: update plugin manifest for v3.1 layout"
```

---

### Task 14: Update CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

Update all path references to reflect the new layout. Key sections to update:

- "Structure" section — update directory descriptions
- "Source of Truth (v2 Architecture)" — paths now under `content/`
- "Legacy (v1)" — note that prompts.md is archived
- "Editing Guidelines" — update path references
- "Key Commands" — remove `make install`, `make extract`; update `make validate` path
- "Project Structure Quick Reference" — rewrite table for new layout
- "When to Consult Other Docs" — update prompt pipeline reference

- [ ] **Step 1: Read current CLAUDE.md and make all path updates**

Systematically update every reference. Major changes:
- `pipeline/` → `content/pipeline/`
- `tools/` → `content/tools/`
- `knowledge/` → `content/knowledge/`
- `commands/` references → remove or note as deleted
- `skills/` (source) → `content/skills/`
- `agent-skills/` → remove
- `prompts.md` → `docs/archive/prompts-v1.md`
- `docs/v2/` → `docs/architecture/`

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md for content/ directory restructure"
```

---

### Task 15: Update AGENTS.md, README.md, and docs/project-structure.md

**Files:**
- Modify: `AGENTS.md`
- Modify: `README.md`
- Modify: `docs/project-structure.md`

- [ ] **Step 1: Update AGENTS.md**

Review and update any path references. The current AGENTS.md is concise — update the `make check` reference if needed and any path-dependent instructions.

- [ ] **Step 2: Update README.md**

This is the most extensive update. All directory structure examples, installation instructions, and path references need updating. Work through systematically:
- Project structure diagrams → reflect `content/` layout
- `pipeline/`, `tools/`, `knowledge/`, `methodology/` → `content/` prefix
- `commands/` references → remove
- `agent-skills/` → remove
- `skills/` → clarify as generated output
- Installation instructions → update for CLI + skill install workflow

- [ ] **Step 3: Rewrite docs/project-structure.md**

This is the authoritative structure guide. Rewrite to match the new layout per the design spec. Include:
- New top-level directory table
- `content/` subdirectory descriptions
- Clarification of committed vs generated directories
- Updated file counts

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "docs: update AGENTS.md, README.md, and project-structure.md for restructure"
```

---

### Task 16: Run full verification

- [ ] **Step 1: Run TypeScript quality gates**

```bash
npm run build && npm test
```

Expected: Build succeeds, all tests pass.

- [ ] **Step 2: Run bash quality gates**

```bash
make lint && make test
```

Expected: ShellCheck passes, bats tests pass.

Note: `make validate` may need adjustment if the frontmatter glob pattern doesn't match. If it fails, fix the glob in the Makefile and re-run.

- [ ] **Step 3: Run full check**

```bash
make check-all
```

Expected: All gates pass.

- [ ] **Step 4: Verify scaffold build works**

```bash
scaffold build
```

Expected: Build completes, generates files to `.scaffold/generated/` and resolved skills to `skills/`.

- [ ] **Step 5: Verify scaffold skill install works**

```bash
scaffold skill install --force
```

Expected: Skills installed to `.claude/skills/` and `.agents/skills/` with resolved template markers.

- [ ] **Step 6: Verify resolved skills have no unresolved markers**

```bash
grep '{{' .claude/skills/scaffold-pipeline/SKILL.md .claude/skills/scaffold-runner/SKILL.md .agents/skills/scaffold-pipeline/SKILL.md .agents/skills/scaffold-runner/SKILL.md
```

Expected: No matches (all `{{INSTRUCTIONS_FILE}}` resolved).

- [ ] **Step 7: Verify npm pack includes correct files**

```bash
npm pack --dry-run 2>&1 | head -30
```

Expected: Package includes `dist/`, `content/`, `skills/`, `README.md`, `LICENSE`. Does NOT include `tests/`, `docs/`, `.beads/`, `commands/`, `agent-skills/`.

- [ ] **Step 8: Verify no legacy root directories recreated**

```bash
ls -d commands/ agent-skills/ prompts/ codex-prompts/ 2>&1
```

Expected: All "No such file or directory".

- [ ] **Step 9: Final git status**

```bash
git status
```

Review for any untracked files that should be committed or gitignored.

- [ ] **Step 10: Commit any remaining fixes**

If verification surfaced issues that required fixes, commit them:

```bash
git add -A
git commit -m "fix: address verification issues from restructure"
```

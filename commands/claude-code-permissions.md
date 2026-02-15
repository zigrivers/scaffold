---
description: "Configure Claude Code permissions for agents"
---
Set up Claude Code permissions for this project so agents can work without "Do you want to proceed?" prompts. The permissions use two layers that merge at runtime.

Review `docs/tech-stack.md` for stack-specific tools that need permissions, and `CLAUDE.md` for the current project configuration.

## Architecture

| Layer | File | Checked into git? | Purpose |
|-------|------|-------------------|---------|
| Project | `.claude/settings.json` | Yes | Project-specific deny rules (destructive operations) |
| User | `~/.claude/settings.json` | No | Standard tool permissions for your dev environment |

Both layers merge at runtime:
- Allow lists combine (union)
- Deny lists combine (union) — **deny always wins over allow**
- Commands matching an allow pattern (and no deny pattern) run without prompting

### 1. Project-level settings (`.claude/settings.json`)

This gets checked into git. It defines **deny rules only** — the things agents must never do in this project. Allow rules live at the user level (your standard tools, shared across all projects).

```json
{
  "permissions": {
    "allow": [],
    "deny": [
      "Bash(rm -rf *)",
      "Bash(rm -rf /)",
      "Bash(rm -r *)",
      "Bash(sudo *)",
      "Bash(git push --force *)",
      "Bash(git push origin main)",
      "Bash(git push -f origin main)",
      "Bash(git push --force origin main)",
      "Bash(git reset --hard *)",
      "Bash(git worktree remove *)",
      "Bash(bd edit *)"
    ]
  }
}
```

Create the directory if needed: `mkdir -p .claude`

**Why deny-only at project level:**
- `git push origin main` — agents must never push directly to main (all changes via PR)
- `git push --force` — only `--force-with-lease` is allowed, only on feature branches
- `git reset --hard` — too destructive, agents should use `git checkout` or `git clean`
- `git worktree remove` — worktree lifecycle is a human decision, not an agent decision
- `rm -rf` / `rm -r` — recursive deletion should be explicit and human-approved
- `bd edit` — opens interactive editor, breaks AI agents
- `sudo` — agents should never need elevated privileges

**Project-specific deny rules:** Review `docs/tech-stack.md` and add deny rules for destructive operations in your stack. Examples:

```json
"Bash(npx prisma migrate reset *)",
"Bash(DROP TABLE *)",
"Bash(kubectl delete *)",
"Bash(docker rm -f *)",
"Bash(docker system prune *)"
```

### 2. User-level settings (`~/.claude/settings.json`)

This is personal to your machine and shared across all projects. It defines what tools agents are allowed to use without prompting.

If the file already exists, **MERGE** these entries into the existing allow/deny arrays without duplicating or removing existing entries. If it doesn't exist, create it.

```json
{
  "permissions": {
    "allow": [
      "Bash",
      "Read",
      "Write",
      "Edit",

      "Read(~/**)",
      "Edit(~/**)",
      "Write(~/**)",
      "Glob(~/**)",
      "Grep(~/**)",
      "WebFetch(*)",
      "WebSearch",

      "Bash(git status)",
      "Bash(git diff *)",
      "Bash(git log *)",
      "Bash(git branch *)",
      "Bash(git show *)",
      "Bash(git add *)",
      "Bash(git commit *)",
      "Bash(git push *)",
      "Bash(git checkout *)",
      "Bash(git pull *)",
      "Bash(git stash *)",
      "Bash(git fetch *)",
      "Bash(git rebase *)",
      "Bash(git merge *)",
      "Bash(git worktree *)",
      "Bash(git rev-parse *)",
      "Bash(git clean *)",
      "Bash(git -C *)",

      "Bash(gh pr *)",
      "Bash(gh issue *)",
      "Bash(gh auth *)",
      "Bash(gh api *)",

      "Bash(bd)",
      "Bash(bd *)",

      "Bash(make)",
      "Bash(make *)",
      "Bash(npm run *)",
      "Bash(npm test *)",
      "Bash(npm install *)",
      "Bash(npx *)",
      "Bash(node *)",

      "Bash(python *)",
      "Bash(pytest *)",
      "Bash(uv *)",
      "Bash(pip *)",

      "Bash(docker compose *)",
      "Bash(docker ps *)",
      "Bash(docker logs *)",

      "Bash(curl *)",
      "Bash(ls)",
      "Bash(ls *)",
      "Bash(cat *)",
      "Bash(find *)",
      "Bash(grep *)",
      "Bash(head *)",
      "Bash(tail *)",
      "Bash(sort *)",
      "Bash(wc *)",
      "Bash(pwd)",
      "Bash(echo *)",
      "Bash(which *)",
      "Bash(tree *)",
      "Bash(mkdir *)",
      "Bash(cp *)",
      "Bash(mv *)",
      "Bash(rm *)",
      "Bash(touch *)",
      "Bash(chmod *)",
      "Bash(diff *)",
      "Bash(sed *)",
      "Bash(awk *)",
      "Bash(tee *)",
      "Bash(xargs *)",
      "Bash(export *)",
      "Bash(env *)",
      "Bash(printenv *)",
      "Bash(cd *)",
      "Bash(./scripts/*)"
    ],
    "deny": [
      "Bash(rm -rf *)",
      "Bash(rm -rf /)",
      "Bash(rm -r *)",
      "Bash(sudo *)",
      "Bash(git push --force *)",
      "Bash(git reset --hard *)"
    ]
  }
}
```

**Important**: Expand `~/**` to your actual home directory path (e.g., `/Users/username/**`).

**Why broad `Bash` lives at user level:** Your standard dev tools are the same across all projects. Putting them in user-level means you don't copy the same allow list into every project. Project-level only needs deny rules for project-specific destructive operations. The deny rules at both levels combine — deny always wins.

### 3. Stack-Specific Additions

Review `docs/tech-stack.md` for this project's tools. Add any additional tool permissions to your **user-level** settings (since you'll use the same tools across projects).

Common additions by stack:

**Mobile (Expo / React Native):**
```
"Bash(npx expo *)",
"Bash(maestro *)",
"Bash(xcodebuild *)",
"Bash(pod *)",
"Bash(eas *)"
```

**Ruby / Rails:**
```
"Bash(bundle *)",
"Bash(rails *)",
"Bash(rake *)",
"Bash(rspec *)"
```

**Go:**
```
"Bash(go *)",
"Bash(golangci-lint *)"
```

**Rust:**
```
"Bash(cargo *)",
"Bash(rustc *)"
```

**Java / Kotlin:**
```
"Bash(./gradlew *)",
"Bash(mvn *)"
```

### 4. Verify the Setup

After creating both files:

```bash
# Show project settings
cat .claude/settings.json

# Confirm user settings
cat ~/.claude/settings.json

# Test core workflow commands run without prompts:
git status
git fetch origin
bd ready
gh pr list
echo $BD_ACTOR
```

**Workflow command verification checklist:**

Test that these commands (used in the canonical workflow) don't prompt:

| Command | Used In |
|---------|---------|
| `git fetch origin` | Branch creation, between tasks |
| `git checkout -b test-branch origin/main` | Branch creation |
| `git clean -fd` | Worktree cleanup between tasks |
| `git push -u origin HEAD` | PR workflow |
| `git branch -d test-branch` | Task closure cleanup |
| `git fetch origin --prune` | Task closure cleanup |
| `gh pr create --title "test" --body "test"` | PR workflow |
| `gh pr merge --squash --auto --delete-branch` | PR workflow |
| `gh pr checks --watch --fail-fast` | CI watch (long-running) |
| `gh pr view --json state -q .state` | Merge confirmation |
| `bd ready` | Task selection |
| `bd create "test" -p 3` | Task creation |
| `bd close <id>` | Task closure |
| `bd sync` | Task sync |
| Lint and test commands (e.g., `make lint && make test` or `npm run lint && npm test`) | Verification |

Clean up after testing:
```bash
git checkout main 2>/dev/null || true
git branch -D test-branch 2>/dev/null || true
```

### 5. Commit Project Settings

```bash
git add .claude/settings.json
git commit -m "[BD-0] chore: configure Claude Code permissions"
```

## After This Step

When this step is complete, tell the user:

---
**Phase 2 in progress** — Permissions configured in `.claude/settings.json` and `~/.claude/settings.json`.

**Next:** Run `/scaffold:coding-standards` — Create coding standards for the tech stack.

**Pipeline reference:** `/scaffold:prompt-pipeline`

---

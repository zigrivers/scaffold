---
description: "Configure Claude Code permissions for agents"
long-description: "Sets up .claude/settings.json with appropriate tool permissions so Claude Code agents can run autonomously without manual approval for safe operations."
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

### How Permission Matching Works

Claude Code's permission matcher is **shell-operator-aware**. A specific pattern like `Bash(git *)` matches `git status` but does NOT match commands containing shell operators:

| Operator | Example | Why `Bash(git *)` fails |
|----------|---------|------------------------|
| `&&` | `git fetch && git rebase` | Two commands chained |
| `\|\|` | `git checkout main \|\| true` | Fallback operator |
| `\|` | `git log \| head -5` | Pipe |
| `2>/dev/null` | `git status 2>/dev/null` | Redirect |
| `$(...)` | `echo $(git rev-parse HEAD)` | Command substitution |
| `&` | `npx next dev &` | Background execution |
| `;` | `cd dir; make test` | Sequential execution |

**Specific patterns alone cannot cover compound commands. The bare `Bash` entry is the only way to auto-approve them. Safety comes from deny rules, not from enumerating allowed commands.**

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
      "mcp__*"
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

**The bare `Bash` entry is the most important line.** It auto-approves all bash commands including compound commands with shell operators (`&&`, `||`, pipes, redirects, `$(...)`, backgrounding). Deny rules still block destructive operations — deny always wins over allow. Without the bare `Bash` entry, agents will be prompted for every compound command and autonomous workflows become impractical.

**The `mcp__*` entry auto-approves all MCP (plugin) tools.** MCP servers are explicitly installed by the user — if you trust the plugin, you trust its tools. Without this entry, agents will be prompted for every Context7 lookup, every Playwright browser action, and every other MCP tool call. For granular control, use per-server wildcards instead (e.g., `mcp__plugin_context7_context7__*`, `mcp__plugin_playwright_playwright__*`).

**Important**: Expand `~/**` to your actual home directory path (e.g., `/Users/username/**`).

**Why broad `Bash` lives at user level:** Your standard dev tools are the same across all projects. Putting them in user-level means you don't copy the same allow list into every project. Project-level only needs deny rules for project-specific destructive operations. The deny rules at both levels combine — deny always wins.

### Reference: What These Entries Cover

The bare `Bash` entry covers all of the following (and their compound combinations). This is provided for documentation — you do NOT need to add these as individual patterns:

- **Git**: status, diff, log, branch, show, add, commit, push, checkout, pull, stash, fetch, rebase, merge, worktree, rev-parse, clean
- **GitHub CLI**: gh pr, gh issue, gh auth, gh api
- **Task tracking**: bd, bd *
- **Build tools**: make, npm, npx, node, python, pytest, uv, pip
- **Containers**: docker compose, docker ps, docker logs
- **Shell utilities**: curl, ls, cat, find, grep, head, tail, sort, wc, pwd, echo, which, tree, mkdir, cp, mv, rm, touch, chmod, diff, sed, awk, tee, xargs

**MCP (`mcp__*`)**: All tools from all installed MCP servers (plugins). Common servers include Context7 (documentation lookup), Playwright (browser automation), and any custom MCP servers configured in your environment.

### Cautious Mode (alternative)

If you cannot use the bare `Bash` entry (org policy, shared machines, etc.), you can instead enumerate specific patterns. Create your user-level settings with individual `Bash(command *)` entries for each tool category listed in the reference above.

> **Trade-off:** With specific patterns only, you WILL still be prompted for compound commands (anything with `&&`, `||`, pipes, redirects, `$(...)`, backgrounding, `;`). There is no workaround — this is how Claude Code's permission matcher works. Autonomous agent workflows will be impractical in cautious mode.

<details>
<summary>Full cautious-mode allow list (click to expand)</summary>

```json
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
"Bash(./scripts/*)",
"mcp__plugin_context7_context7__*",
"mcp__plugin_playwright_playwright__*"
```

</details>

### 3. Stack-Specific Additions

> **Note:** If you're using bare `Bash` (recommended), stack-specific additions are unnecessary — all commands are already covered. This section only applies if you chose cautious mode.

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
```

#### Tier 1 — Compound Command Tests

These are the litmus test for bare `Bash`. **If any Tier 1 command prompts, the bare `Bash` entry is missing — fix it before continuing.**

| Test Command | Validates |
|--------------|-----------|
| `git fetch origin && echo "done"` | `&&` passes |
| `git rev-parse --show-toplevel \|\| echo "not a repo"` | `\|\|` passes |
| `ls -la 2>/dev/null` | Redirect passes |
| `echo $(pwd)` | Command substitution passes |

#### Tier 2 — Standard Workflow Commands

Test that these commands (used in the canonical workflow) don't prompt:

| Command | Used In |
|---------|---------|
| `git status` | General |
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
| `make lint` | Verification |
| `make test` | Verification |

If MCP plugins are installed, verify that MCP tool calls (e.g., Context7 `resolve-library-id`, Playwright `browser_snapshot`) execute without prompting.

Clean up after testing:
```bash
git checkout main
git branch -D test-branch
```

### 5. Still Getting Prompted?

Five common causes:

1. **Missing bare `Bash`** — open `~/.claude/settings.json` and check for a standalone `"Bash"` entry (not `"Bash(something)"`). It must be present in the allow array.
2. **Conflicting deny rule** — deny always wins over allow. Check both user-level and project-level deny arrays for rules that match the command being prompted.
3. **Unexpanded `~/**` paths** — Claude Code may not expand `~`. Replace `~` with your actual home directory path (e.g., `/Users/username/**`).
4. **Session not restarted** — permission changes require restarting Claude Code (`/exit` and relaunch, or start a new session).
5. **Missing `mcp__*`** — the bare `Bash` entry does NOT cover MCP tools. MCP tools need their own allow entry. Check for `"mcp__*"` in the user-level allow array.

### 6. Commit Project Settings

```bash
git add .claude/settings.json
git commit -m "[BD-0] chore: configure Claude Code permissions"
```

## Process
- Create a Beads task: `bd create "chore: configure Claude Code permissions" -p 0`
  and `bd update <id> --claim`
- Read the user's existing `~/.claude/settings.json` before making changes — if it
  exists, MERGE entries; do not replace the file
- The bare `"Bash"` entry in the user-level allow array is CRITICAL — verify it is
  present after writing the file
- Do NOT include specific `Bash(...)` patterns alongside the bare `"Bash"` — they
  are redundant and create confusion about what's actually needed
- Run the verification checklist (Tier 1 first). If any compound command prompts,
  the bare `"Bash"` entry is missing — fix before continuing
- When both files are created, verified, and committed: `bd close <id>`

## After This Step

When this step is complete, tell the user:

---
**Phase 2 in progress** — Permissions configured in `.claude/settings.json` and `~/.claude/settings.json`.

**Next:** Run `/scaffold:coding-standards` — Create coding standards for the tech stack.

**Pipeline reference:** `/scaffold:prompt-pipeline`

---

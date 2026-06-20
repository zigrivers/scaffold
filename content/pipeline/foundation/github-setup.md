---
name: github-setup
description: Initialize git and create a private or public GitHub remote, then push an initial commit
summary: "Gets your project safely backed up on GitHub early: initializes git if needed, ensures a .gitignore is in place, makes an initial commit, and creates a private (default) or public remote with the GitHub CLI — then verifies the push. Skips gracefully and makes no destructive changes when a repo and remote already exist."
phase: "foundation"
order: 205
dependencies: []
outputs: [docs/github-setup.md]
conditional: null
knowledge-base: [git-workflow-patterns]
reads: [create-prd]
---

## Purpose
Get the project safely onto GitHub as the first foundational act, so every later
phase — tech stack, standards, structure, environment, and all code — is backed up
off-machine from the start. Initialize git if needed, ensure a `.gitignore` is in
place, make an initial commit, and create a remote repository (private by default,
public if the user chooses) named `origin`, then verify the push. A private GitHub
repo is the project's real safety net; local git on one machine is not a backup.
This step establishes the remote that later steps assume — `git-workflow`
(branching, CI, worktrees) configures *how* the repository is used and depends on it
already existing.

## Inputs
- Project name and description — from docs/plan.md if it exists; otherwise ask the user
- GitHub CLI (`gh`) install + authentication status (`gh auth status`)
- Current repository state — whether a `.git/` directory and an `origin` remote already exist

## Expected Outputs
- docs/github-setup.md — a record of the remote URL, visibility (private/public),
  default branch, remote name, and how to re-run the step or change visibility later
- A git repository with an initial commit pushed to a GitHub remote named `origin`
  (created via `gh repo create`, or via a documented manual fallback when `gh` is absent)
- A `.gitignore` that excludes secrets and local env files (`.env`, `.env.local`)
  before the first commit, created if one does not already exist

## Quality Criteria
- (mvp) A git repository exists with at least one commit
- (mvp) Repository visibility was explicitly chosen by the user, never assumed — private is the recommended default
- (mvp) A `.gitignore` is present and excludes secrets and local env files (`.env`, `.env.local`) before the first commit
- (mvp) No secret is committed — the initial commit is verified to contain no credentials, tokens, or keys
- (mvp) An `origin` remote exists and the initial commit is confirmed pushed (verified against the remote, not assumed)
- (mvp) If a repo and `origin` remote already exist, the step makes no destructive changes — no re-init, no remote overwrite, no force-push
- (deep) docs/github-setup.md records the remote URL, visibility, default branch, and how to re-run or change visibility
- (deep) Branching strategy, CI, PR workflow, and branch protection are explicitly deferred to git-workflow (order 330), not duplicated here

## Methodology Scaling
- **deep**: Full setup — detect state, confirm visibility, ensure a comprehensive
  `.gitignore`, secret-scan the initial commit, create the remote, verify the push,
  and write docs/github-setup.md with re-run and visibility-change guidance.
- **mvp**: Initialize git, ensure a minimal `.gitignore`, make an initial commit,
  create a private remote, and confirm the push. Skip the detailed record doc.
- **custom:depth(1-5)**:
  - Depth 1: `git init`, minimal `.gitignore`, initial commit, create private remote, push.
  - Depth 2: add the public/private choice and push verification against the remote.
  - Depth 3: add a secret scan of the initial commit and a `gh`-absent manual fallback.
  - Depth 4: add docs/github-setup.md recording URL, visibility, and default branch.
  - Depth 5: add visibility-change guidance and an explicit hand-off note to git-workflow.

## Mode Detection
If a git repository with an `origin` remote already exists (or docs/github-setup.md
exists), operate in update mode: do NOT re-init the repository or overwrite the
remote. Verify the remote is reachable and the local default branch is pushed, and
only fill gaps — e.g., write docs/github-setup.md if it is missing, or add a
`.gitignore` rule that is absent. Preserve the existing repository, remote URL,
visibility, default branch, and commit history.

## Update Mode Specifics
- **Detect prior artifact**: docs/github-setup.md exists, or a git repository with an `origin` remote already exists (`git remote get-url origin` succeeds)
- **Preserve**: existing remote URL, repository visibility, default branch, commit history, existing `.gitignore` entries
- **Triggers for update**: repository exists but has no `origin` remote (add it and push); repository exists but was never pushed (push); docs/github-setup.md is missing (write it); `.gitignore` is missing a secret/env rule (add it)
- **Conflict resolution**: never delete or recreate an existing remote; to change visibility, use `gh repo edit --visibility` with explicit user confirmation rather than recreating the repository; never force-push and never rewrite history

### Detect the current state
Determine, without making changes yet:
- Is this already a git repository? (`git rev-parse --is-inside-work-tree`)
- Does an `origin` remote already exist? (`git remote get-url origin`)
- Is the GitHub CLI installed and authenticated? (`command -v gh` and `gh auth status`)

If a repository and `origin` already exist, switch to update mode (above) and skip
creation — verify and record only.

### Choose repository visibility (always ask, never assume)
Ask the user which they want, in plain terms, and default to private:
- **Private (recommended)** — only the user (and people they invite) can see it. This
  is the off-machine backup of their work and the safe default.
- **Public** — anyone on the internet can see the code. Only choose this for work the
  user intends to share openly.

Never assume visibility — wait for the choice before creating the remote.

### Initialize, commit, and create the remote
1. If not yet a repository: `git init` and set the default branch to `main`.
2. Ensure a `.gitignore` exists and excludes secrets and local env files (`.env`,
   `.env.local`), dependency/build directories, and OS cruft. Create a minimal one
   if absent; otherwise add only the missing secret/env rules.
3. Stage the project and make an initial commit using the project's commit
   convention (e.g., `chore: initial commit`).
4. Create the remote and push with the GitHub CLI. Derive the repository name from
   the project (docs/plan.md) or ask:
   `gh repo create <name> --private --source=. --remote=origin --push`
   (use `--public` instead of `--private` when the user chose public).
5. **If `gh` is not installed or not authenticated**, do not block — fall back to a
   documented manual path: tell the user to authenticate (`gh auth login`) or create
   the repository in the GitHub web UI, then connect and push with the exact
   commands: `git remote add origin <url>` followed by `git push -u origin main`.

### Verify the push and record the result
- Confirm the push actually succeeded (e.g., `git ls-remote origin` returns the
  branch, or `gh repo view` shows the repository). Show the evidence; never claim
  success without confirming against the remote.
- Write docs/github-setup.md recording the remote URL, visibility, default branch,
  remote name, and how to re-run this step or change visibility later
  (`gh repo edit --visibility …`).

### Safety rules
- **Never commit secrets.** Before the initial commit, scan staged files for obvious
  credentials, tokens, or keys; if any are found, stop and tell the user rather than
  committing.
- Never force-push, never overwrite an existing remote, and never rewrite history.
- Defer branching strategy, commit standards, CI, PR workflow, branch protection, and
  worktrees to the `git-workflow` step (order 330) — do not duplicate that work here.

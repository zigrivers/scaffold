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
Running this early means the remote is in place before the later `git-workflow`
step (order 330), which configures *how* the repository is used (branching, CI,
worktrees). This is a sequencing relationship, not a hard dependency — a user who
created the remote another way can still proceed; this step simply detects that and
skips creation.

## Inputs
- Project name and description — from docs/plan.md (the `create-prd` output named in `reads`) if it exists; otherwise ask the user
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
docs/github-setup.md is always produced (it is the Mode Detection marker) — depth
governs how much it records, not whether it exists. The safety behaviors apply at
**every** depth, not just higher ones: always secret-scan what is about to be pushed
(including already-tracked files and history, not only newly staged changes), and
always use the `gh`-absent manual fallback when the GitHub CLI is unavailable.
- **deep**: Full setup — detect state, confirm visibility, ensure a comprehensive
  `.gitignore`, secret-scan everything about to be pushed, create the remote, verify
  the push, and write docs/github-setup.md with default branch, re-run, and
  visibility-change guidance.
- **mvp**: Initialize git, ensure a minimal `.gitignore`, secret-scan, make an
  initial commit, confirm visibility (private by default — still ask), create the
  remote, confirm the push, and write a minimal docs/github-setup.md (remote URL +
  visibility).
- **custom:depth(1-5)**:
  - Depth 1: `git init`, minimal `.gitignore`, secret-scan, initial commit, confirm visibility (private by default — still ask), create the remote, push, and write a minimal docs/github-setup.md (URL + visibility).
  - Depth 2: add push verification against the remote (confirm the branch exists on origin).
  - Depth 3: tune the `.gitignore` to the project's tech stack and record the remote name and default branch in docs/github-setup.md.
  - Depth 4: expand docs/github-setup.md with re-run instructions.
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
- **Triggers for update**: repository exists but has no `origin` remote (secret-scan the tracked files and commits, then add the remote and push); repository exists but was never pushed (secret-scan tracked files and history first, then push); docs/github-setup.md is missing (write it); `.gitignore` is missing a secret/env rule (add it)
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
3. Stage the project, then scan the staged files for secrets, credentials, tokens,
   or keys (see Safety rules). Only once the scan is clean, make an initial commit
   using the project's commit convention (e.g., `chore: initial commit`).
4. Create the remote and push with the GitHub CLI. Derive the repository name from
   the project (docs/plan.md) or ask:
   `gh repo create <name> --private --source=. --remote=origin --push`
   (use `--public` instead of `--private` when the user chose public).
5. **If `gh` is not installed or not authenticated**, do not block — fall back to a
   documented manual path: tell the user to authenticate (`gh auth login`) or create
   the repository in the GitHub web UI, then connect and push with the exact
   commands: `git remote add origin <url>` followed by `git push -u origin HEAD`
   (`HEAD` pushes the current branch — `main` for a fresh repo, or the existing
   default branch when connecting a repository that already has history — so it never
   assumes the branch is named `main`).

### Verify the push and record the result
- Confirm the push actually succeeded (e.g., `git ls-remote origin` returns the
  branch, or `gh repo view` shows the repository). Show the evidence; never claim
  success without confirming against the remote.
- Write docs/github-setup.md recording the remote URL, visibility, default branch,
  remote name, and how to re-run this step or change visibility later
  (`gh repo edit --visibility …`).
- Commit and push docs/github-setup.md (e.g., `docs: record GitHub setup`) so the
  step's declared output is captured in the repository rather than left uncommitted
  in the working tree. (The record is written after the remote is created — its URL
  and visibility are not known until then — so it lands in this follow-up commit.)

### Safety rules
- **Never commit or push secrets.** Scan for credentials, tokens, and keys before
  the initial commit **and before any push** — including the update-mode case of
  pushing an existing repository for the first time, where the secret may already sit
  in tracked files or earlier commits rather than in newly staged changes. If any are
  found, STOP and tell the user; do not commit or push. Adding a `.gitignore` does NOT
  untrack a secret that is already committed, and cleaning a secret out of existing
  history is destructive — so do not attempt it here. Escalate to the user, who can
  rotate the secret and clean history deliberately (e.g., with `git filter-repo`),
  rather than this step rewriting history.
- Never force-push, never overwrite an existing remote, and never rewrite history.
- Defer branching strategy, commit standards, CI, PR workflow, branch protection, and
  worktrees to the `git-workflow` step (order 330) — do not duplicate that work here.

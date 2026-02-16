# Multi-Model User Stories Review — Setup Guide

The `/scaffold:user-stories-multi-model-review` command (Step 15.5) runs your user stories through independent AI reviewers — OpenAI's Codex CLI and Google's Gemini CLI — to catch gaps that a single model might miss. Each reviewer independently checks whether every requirement in your PRD has a matching user story, then Claude reconciles their findings.

This is optional. If you skip it, the pipeline continues normally from Step 15 to Step 16 (or Step 17 if you don't need platform parity review).

## What You Need

You need **at least one** of these two CLI tools installed and authenticated:

| Tool | Requires | What it costs |
|------|----------|---------------|
| **Codex CLI** | ChatGPT subscription (Plus, Pro, or Team) | Uses subscription credits (~credits per review, included in your plan) |
| **Gemini CLI** | Google account (free tier available) | Uses Gemini API quota (free tier: 60 requests/minute for Gemini 2.5 Pro) |

You can use both (recommended for the best coverage) or just one.

## Step 1: Install Codex CLI

Codex CLI requires **Node.js v22 or later**.

Check your Node version:

```bash
node --version
```

If you're below v22, upgrade Node first:

```bash
brew install node
```

Then install Codex CLI:

```bash
npm install -g @openai/codex
```

Verify the installation:

```bash
codex --version
```

You should see a version number printed.

## Step 2: Authenticate Codex

Run:

```bash
codex login
```

This opens your browser for OAuth login with your ChatGPT account. Sign in with the account that has your ChatGPT subscription (Plus, Pro, or Team).

After signing in, the terminal confirms you're authenticated.

**Headless / SSH environments**: If you're on a machine without a browser, use device auth instead:

```bash
codex login --device-auth
```

This gives you a URL and code to enter on any device with a browser.

**Verify authentication works**:

```bash
codex --version
```

If this prints a version without errors, you're good.

## Step 3: Install Gemini CLI

Gemini CLI also requires Node.js (v18 or later — you already have this if you're running Scaffold).

Install:

```bash
npm install -g @google/gemini-cli
```

Verify:

```bash
gemini --version
```

## Step 4: Authenticate Gemini

Run the Gemini CLI once:

```bash
gemini
```

On first launch, it prompts you to authenticate. Type:

```
/auth
```

This opens your browser for Google OAuth. Sign in with your Google account.

After authenticating, you can exit the Gemini CLI session (type `/quit` or press Ctrl+C) — the credentials are saved for future use.

**Verify authentication works**:

```bash
gemini --version
```

## Step 5: Project Prerequisites

Before running the review, your project needs these files from earlier pipeline steps:

- **`docs/plan.md`** — Your PRD (created in Step 1: `/scaffold:create-prd`)
- **`docs/user-stories.md`** — Your user stories (created in Steps 14-15: `/scaffold:user-stories` and `/scaffold:user-stories-gaps`)

If either file is missing, run the earlier pipeline steps first.

## Step 6: Verify Everything

Run these commands to confirm you're ready:

```bash
# Check CLIs are installed (at least one required)
codex --version
gemini --version

# Check project files exist
test -f docs/plan.md && echo "plan.md: OK" || echo "plan.md: MISSING"
test -f docs/user-stories.md && echo "user-stories.md: OK" || echo "user-stories.md: MISSING"
```

If at least one CLI prints a version and both project files show "OK", you're ready to run:

```
/scaffold:user-stories-multi-model-review
```

## How It Works

When you run the command, here's what happens:

1. **Claude extracts every atomic requirement** from your PRD into a numbered list (REQ-001, REQ-002, etc.)
2. **Claude maps each requirement** to the user stories that cover it, identifying any gaps
3. **Codex and Gemini each independently review** your user stories against the PRD — they produce JSON findings noting missing coverage, vague acceptance criteria, overlaps, and contradictions
4. **Claude reconciles the findings** — if both reviewers agree on an issue, it's high confidence; single-reviewer findings are triaged by severity
5. **Claude applies fixes** to `docs/user-stories.md` — adding missing stories, tightening acceptance criteria, resolving overlaps
6. **Coverage is verified** — the final coverage map must show zero uncovered requirements (or you explicitly defer items)
7. **A review summary** is written to `docs/reviews/user-stories/review-summary.md` documenting everything that was found and fixed

Only Claude edits your user stories file. Codex and Gemini produce read-only JSON critiques.

## Cost and Billing

Neither CLI uses API billing. Both use your existing subscription or free-tier quota:

**Codex CLI** — Uses your ChatGPT subscription credits. Reviews typically consume around 25 credits each. Credit limits reset weekly and vary by plan:
- Plus: Lower weekly credit limit
- Pro: Higher weekly credit limit
- Team: Shared team credits

**Gemini CLI** — Uses Gemini API free-tier quota or your Google AI Studio quota. The free tier provides 60 requests per minute for Gemini 2.5 Pro, which is more than enough for a single review run. No paid subscription is required.

## Troubleshooting

**"codex: command not found"**
The CLI isn't installed or isn't in your PATH. Re-run `npm install -g @openai/codex` and make sure your npm global bin directory is in your PATH (`npm bin -g` shows the directory).

**"gemini: command not found"**
Same as above — re-run `npm install -g @google/gemini-cli` and check your PATH.

**"Node.js v22 or later is required" (Codex)**
Codex CLI requires Node.js v22+. Upgrade with `brew install node` or download from https://nodejs.org.

**Authentication expired**
If a CLI fails with an auth error, re-authenticate:
- Codex: `codex login`
- Gemini: Run `gemini`, then `/auth`

**"docs/plan.md not found" or "docs/user-stories.md not found"**
You need to run earlier pipeline steps first. Run `/scaffold:create-prd` (Step 1) for the PRD and `/scaffold:user-stories` (Step 14) + `/scaffold:user-stories-gaps` (Step 15) for user stories.

**One CLI fails but the other succeeds**
This is fine. The review continues with whichever CLI is available. You'll still get value from a single external reviewer — two is better, but one works.

**Both CLIs fail**
Check that both are installed (`codex --version`, `gemini --version`) and authenticated. If the problem is network-related (timeouts, rate limits), wait a few minutes and try again.

**Review takes a long time**
External CLI calls can take a few minutes depending on the size of your PRD and user stories. This is normal — the CLIs are doing thorough reviews.

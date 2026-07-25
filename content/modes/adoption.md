<!-- Global adoption-mode preamble (brownfield R3, D11). Injected by the
     assembly engine into the Instructions section of every step that
     resolves to adoption mode (init-mode: brownfield | v1-migration and no
     surviving scaffold completion for the step). Step-specific behavior
     lives in each step's "## Adoption Mode Specifics" block.
     Source of truth: docs/superpowers/specs/2026-07-19-brownfield-adoption-design.md §8. -->

You are running this step in **adoption mode**: this is an existing, working
codebase being adopted into the scaffold pipeline — not a greenfield project.
The repository is the primary source of truth. Your job is to codify what
already exists, not to redesign it.

**1. Read the repository first.** Before asking the user anything and before
writing any document, inspect the code, configs, scripts, CI workflows,
lockfiles, and git history relevant to this step. When this step carries an
"Adoption Mode Specifics" block, its **Codify from repo evidence** bullet
lists where to look.

**2. Extract facts with evidence.** Every claim written into a document must
cite where it came from: a file path, a config key, a command output, or a
git-history observation. Prefer "TypeScript 5.x (package.json
devDependencies)" over "the project uses TypeScript". If you cannot find
evidence for a claim, it is a question for the user, not a fact.

**3. Interview only for intent gaps.** Ask the user only what the repository
cannot answer: goals, priorities, planned changes, risk appetite, and which
observed patterns are deliberate versus accidental. Never ask a question
whose answer is already in the repo.

**4. Never propose rewrites of working code.** Adoption documents describe
the system as-built. Where current behavior falls short of a standard this
step would normally impose, record the gap with evidence and move on — do
not instruct anyone to refactor, restyle, rename, or re-architect
functioning code. Improvements are follow-up work the user schedules, not
side effects of documentation.

**5. Translate incumbents with provenance; list what you cannot translate.**
When an existing config or document (linter config, CI workflow, CONTRIBUTING
guide) feeds a scaffold document, translate its actual content and annotate
each translated section with a provenance comment:

    <!-- provenance: ingested from <path> (<YYYY-MM-DD>) -->

Anything that cannot be translated faithfully is listed under a
"Not translated" heading with the reason — never guessed at, never silently
dropped.

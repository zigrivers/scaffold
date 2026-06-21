# Scaffold Runner

An interactive layer over the `scaffold` CLI: when the user asks to run a
pipeline step, surface the step's decision points to the user **before**
executing, then run it.

**Activates when** the user says "run scaffold &lt;step&gt;", "scaffold
&lt;step&gt;", "what's next?", "scaffold status", "start building", or is working
in a project with a `.scaffold/` directory.

**Core loop:** `scaffold next` (what's eligible) → `scaffold run <step> --auto`
to PREVIEW the assembled prompt → surface any decision points / optional sections
to the user → on approval, execute the step's prompt → record it with
`scaffold complete <step>`. Key commands: `scaffold list`, `scaffold status`,
`scaffold next`, `scaffold run <step>`, `scaffold complete <step>`.

For full batch execution, rework mode, tool execution, and pipeline-navigation
detail, see the complete skill (installed for Claude Code / OpenCode).

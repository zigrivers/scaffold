# Scaffold Runner

An interactive layer over the `scaffold` CLI: when the user asks to run a
pipeline step, surface the step's decision points to the user **before**
executing, then run it.

**Activates when** the user says "run scaffold &lt;step&gt;", "scaffold
&lt;step&gt;", "what's next?", "scaffold status", "start building", is working
in a project with a `.scaffold/` directory, or asks to set scaffold up in a
project that has none yet.

**Before `.scaffold/` exists,** pick the bootstrap command from the directory
rather than asking:

- Empty or brand-new directory → `scaffold init`.
- Already has source code or docs → `scaffold adopt`, which initializes the
  config and state itself and selects the `brownfield` methodology. It renders
  a plan and writes nothing until you pass `--apply` with the approved
  `--plan-key`.

Never run `scaffold init` before `scaffold adopt` on an existing codebase:
`init` would select the `deep` methodology and `adopt` would then replace it.

**Core loop:** check `scaffold next` for what's eligible; before running a step,
surface its decision points (depth, strictness, optional sections) to the user;
then run it. For **stateful** pipeline steps, record completion with
`scaffold complete <step>` — **build** steps (e.g. `single-agent-start`) are
stateless and have no completion to record. Key commands: `scaffold list`,
`scaffold status`, `scaffold next`, `scaffold run <step>`, `scaffold complete <step>`.

For the full command surface, run `scaffold guides cli` (every command grouped
by purpose) and `scaffold guides pipeline`; `scaffold next` shows what's eligible
now.

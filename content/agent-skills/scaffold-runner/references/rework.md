## Rework Mode

Rework mode enables systematic re-execution of entire phases for depth improvement or quality cleanup. It uses a persistent session file (`.scaffold/rework.json`) that survives context resets.

### Detection

For a rework or pipeline-resume request, check for an active rework session:

```bash
cat .scaffold/rework.json 2>/dev/null
```

If present and relevant to the request, enter rework mode and show status: "Active rework: 15/23 steps completed, currently in Phase 3".

### Natural Language Triggers

| User Says | Action |
|---|---|
| "rework phases 1-5" | `scaffold rework --through 5` → enter rework mode |
| "rework everything" | `scaffold rework` (requires --phases or --through flag) |
| "rework phases 1-3 excluding 2" | `scaffold rework --through 3 --exclude 2` |
| "continue rework" / "resume rework" | `scaffold rework --resume` → continue from where it stopped |
| "stop rework" / "cancel rework" | `scaffold rework --clear` |
| "rework status" | Read `.scaffold/rework.json`, show progress |

### Creating a Rework Session

When the user requests a rework:

1. Run `scaffold rework --phases <list> --auto --format json` (or `--through N`)
2. The CLI creates `.scaffold/rework.json` with the execution plan and resets selected steps in state.json
3. Show the plan summary: step count, phases, depth

### Executing Rework Steps

For each step in the rework session:

1. Read the current rework session: `scaffold rework --resume --format json`
2. Identify the next pending step from the session
3. **If config.fix is true and step name starts with `review-`**: Add auto-fix instruction
   ```bash
   scaffold run <step> --auto --instructions "Apply fixes directly to the reviewed artifact instead of just listing issues. Summarize what you changed." 2>&1
   ```
4. **Otherwise**: Run normally
   ```bash
   scaffold run <step> --auto 2>&1
   ```
5. Follow the normal Smart Scaffold Execution workflow (preview → extract decisions → execute)
6. After completion:
   ```bash
   scaffold rework --advance <step>    # Update rework session
   scaffold complete <step>             # Update pipeline state
   ```

### Fresh Mode

If the rework config has `fresh: true`, delete the existing artifact before running the step:
- Read the step's `produces` paths from the assembled prompt metadata
- Explain which files will be deleted and preserve the applicable destructive-action approval boundary; an unrelated batch approval does not authorize deletion
- Delete only the authorized files before executing the step
- The step will run in fresh mode (no existing artifact detected)

### Phase Boundary Pauses

When `config.auto` is false (the default):
- After completing the last step in a phase, pause execution
- Show a phase summary (use the phase description from the reference table for context):
  ```
  Phase 1 (Product Definition) complete: 3/3 steps
  Translates your vision into a PRD with features, personas, and success criteria,
  then breaks it into user stories with testable acceptance criteria.
    ✓ create-prd — updated docs/plan.md
    ✓ review-prd — 2 issues found and fixed
    ✓ innovate-prd — added competitive analysis

  Next: Phase 2 (Project Foundation) — Researches and documents technology choices,
  creates coding standards with linter configs, defines testing strategy, and designs
  directory layout for parallel agent work.

  Continue? [Yes / Stop here]
  ```
- Wait for user confirmation before proceeding to the next phase

When `config.auto` is true, skip pauses and continue through all steps.

### Completion

When `scaffold rework --advance` reports all steps done (returns `all_done: true` in JSON):
1. Show the full rework summary (similar to batch summary)
2. The session file is automatically cleaned up by the CLI
3. Show overall pipeline status via `scaffold status`

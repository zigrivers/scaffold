# Recovering from execution failures

Inspect the command output and current state before retrying. Diagnose and repair
recoverable, in-scope errors using the repository's normal tools, then retry the
affected operation. Check whether a failed command already changed state before
repeating it. Reuse passing checks when the relevant files, inputs, environment,
and required policy remain unchanged; rerun affected checks after a repair.

Do not bypass required gates, skip prerequisites silently, invent successful
completion, overwrite another agent's work, or repeat an unchanged failing command
without new evidence. Pause the dependent step when recovery needs credentials,
a destructive action without authorization, a material scope decision, or an
external change. Explain the concrete blocker and resume condition.

| Situation | Response |
|---|---|
| Step not eligible | Show blocking dependencies. Run them only if in scope; skip only when authorized. |
| CLI not installed | Check the project's documented install path and available local CLI; install only within applicable dependency/install policy. If no project-specific path is documented, the npm install command is `npm install -g @zigrivers/scaffold`; honor the same install policy and report it when installation needs authority. |
| No `.scaffold/` directory | Follow the entry skill's init/adopt routing if setup is requested; do not initialize an unrelated task. |
| Step fails during execution | Inspect evidence, repair an in-scope cause, then retry the affected step. Stop only for an unresolved boundary above. |
| Assembled prompt is empty | Inspect CLI diagnostics; use `/scaffold:<step>` only if that command file exists and is the intended documented fallback. |
| Batch step fails | Recover the failed step within scope; continue on success. Skip only if already authorized, otherwise report the blocker and available options. |
| Batch blocker (auth, missing input) | Pause dependent work, report the recovery path, and resume after the missing input or access is available. |

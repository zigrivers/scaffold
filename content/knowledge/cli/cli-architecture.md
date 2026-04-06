---
name: cli-architecture
description: Command router patterns, plugin systems, middleware chains, config resolution order, and lazy loading for CLI tools
topics: [cli, architecture, command-router, plugins, middleware, config-resolution, lazy-loading]
---

CLI architecture is simpler than web architecture but has its own failure modes: slow startup, monolithic command files that resist extension, config that behaves unpredictably, and plugin systems that become security liabilities. Decisions made at the architecture level — how commands are registered, how config is resolved, how plugins hook in — determine whether the tool remains maintainable as it grows.

## Summary

CLI architecture centers on the command router (mapping argv to handlers via established frameworks like yargs, clap, click, or cobra), middleware chains for cross-cutting concerns, deterministic config resolution order, and lazy loading to keep startup under 100ms. Plugin systems extend the CLI without modifying its source but require scoped capabilities and trust verification.

## Deep Guidance

### Command Router Patterns

The command router is the core of a CLI: it maps `argv` tokens to handler functions.

**Framework-based routing (recommended for most tools)**

Use an established CLI framework rather than hand-rolling argument parsing:

- **Node.js**: `yargs` (batteries-included, good for complex CLIs), `commander` (minimal, explicit), `oclif` (framework for large CLIs with plugin support)
- **Rust**: `clap` (derive macros for zero-boilerplate arg parsing), `argh` (minimal)
- **Python**: `click` (decorator-based, composable), `typer` (type-annotation-based, wraps click), `argparse` (stdlib, verbose)
- **Go**: `cobra` (git/kubectl pattern, de facto standard)

**Registration pattern**: Each command module registers itself with the router. The router does not know about individual commands — it discovers them. This prevents the router from becoming a long switch statement.

### Plugin and Extension Systems

Plugins extend the CLI without modifying its source. Design the plugin API before building it:

- **Registration hook**: Plugins export a `register(cli)` function; the CLI passes the router instance. Plugins call `cli.addCommand(...)` to register their subcommands
- **Lifecycle hooks**: `beforeCommand`, `afterCommand`, `onError` — plugins can intercept at these points without modifying core code
- **Capability scope**: Define what plugins can access. Plugins should not be able to override built-in commands or access internal state not explicitly exposed

Security concern: plugins run arbitrary code. Load only from trusted sources; consider a signature or registry verification step for security-sensitive tools.

### Middleware Chains

Middleware runs before and after every command handler. Common middleware concerns:

- **Auth verification**: Check credentials before any command that requires auth
- **Config loading**: Resolve and validate config before handler execution
- **Telemetry**: Record command name, exit code, duration (with user consent)
- **Update checking**: Run in background after command completes; notify user of available updates without blocking

Implement as a chain: each middleware calls `next()` to proceed, or throws/exits to abort. This is the Express/Koa pattern applied to CLIs.

### Config Resolution Order

Enforce a deterministic precedence (highest to lowest):

1. **CLI flags** — explicit user intent, always wins
2. **Environment variables** — deployment/CI context, overrides files
3. **Project-level config file** — `.mytoolrc` or `mytool.config.json` in CWD (walk up to repo root)
4. **User-level config file** — `~/.config/mytool/config.json`
5. **System-level config** — `/etc/mytool/config.json` (optional, for managed environments)
6. **Built-in defaults**

Merging strategy: deep merge for object keys, last-wins for scalar values at higher precedence levels. Log the resolved config origin in debug mode so users can diagnose unexpected values.

### Lazy Loading

Startup time is a first-class metric for CLIs. Every millisecond of startup latency is felt on every invocation:

- **Node.js**: Use dynamic `import()` inside command handlers rather than top-level imports. A `build` command that imports a bundler should not load that bundler when the user runs `my-cli --version`
- **Rust**: Lazy loading is less critical (compile-time linking), but feature flags (`#[cfg(feature = "...")]`) exclude large optional dependencies from the binary
- **Python**: Import heavy libraries (`numpy`, `boto3`) inside command functions, not at module level

Target: `my-cli --help` should complete in under 100ms on any machine. Measure startup time with `time my-cli --help` and set it as a CI regression gate.

### Error Handling Architecture

Define a typed error hierarchy at the architecture level:

- `UsageError` (exit 2): Bad arguments, unknown flags — show usage hint
- `ConfigError` (exit 1): Invalid or missing config — show config file path and what was expected
- `RuntimeError` (exit 1): Operation failed — show what failed and why
- `NetworkError` (exit 1): External call failed — show endpoint, status code, retry hint

Catch all errors at the top-level router, format based on type, and emit structured JSON when `--json` is active. Never let uncaught exceptions reach the user as stack traces in production.

### Telemetry and Analytics

If the CLI collects usage telemetry (command frequency, error rates, feature adoption):

- **Opt-in by default**: Never collect telemetry without explicit user consent. Prompt on first run and respect the answer. Provide `my-cli telemetry disable` to opt out at any time.
- **Transparency**: Document exactly what is collected and where it is sent. Provide `my-cli telemetry status` to show current settings.
- **Privacy**: Never collect file paths, file contents, environment variable values, or personally identifiable information. Collect only: command name, exit code, duration, OS/version, and tool version.
- **Non-blocking**: Telemetry must never slow down the tool. Send data asynchronously in a background process after command completion. If the telemetry endpoint is down, silently discard the data.

### Startup Performance Architecture

CLI startup time is felt on every invocation. Architectural decisions that affect startup:

- **Lazy command loading**: Only load the code for the invoked command. A `deploy` command should not load the `build` command's bundler dependency.
- **Cache config resolution**: If config file discovery involves walking the directory tree, cache the resolved path for the current session.
- **Avoid top-level I/O**: Do not read files, make network calls, or check for updates during module initialization. Defer all I/O to the command handler or a background process.
- **Benchmark in CI**: Add `time my-cli --version` as a CI step and fail if it exceeds 100ms. Startup regressions creep in gradually — CI gates catch them early.

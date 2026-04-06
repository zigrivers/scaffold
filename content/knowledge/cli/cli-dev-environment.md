---
name: cli-dev-environment
description: Local development setup for CLIs including npm link, cargo install, debug flags, manual testing workflow, and hot reload
topics: [cli, dev-environment, npm-link, cargo, debug, hot-reload, testing-workflow]
---

CLI development has a tighter feedback loop requirement than library development: you need to run the actual binary, observe its output, and verify behavior against real filesystem and network state. Setting up a fast local development workflow is not optional — a slow iteration cycle compounds across hundreds of test invocations.

## Summary

### Installing for Local Development

**Node.js (npm link)**

`npm link` creates a global symlink to the local package, making the CLI available as if installed globally:

```bash
cd my-cli
npm install
npm link          # Creates symlink in global node_modules
my-cli --version  # Now resolves to local source
```

To unlink: `npm unlink my-cli` (run from the package directory).

When using workspaces or monorepos, link from the workspace root and use the scoped package name.

**Rust (cargo install --path)**

```bash
cargo install --path .    # Compiles and installs to ~/.cargo/bin/
my-cli --version
```

During active development, prefer `cargo run -- <args>` to avoid reinstall overhead on each change.

**Python (pip install -e)**

```bash
pip install -e .     # Editable install; changes reflect immediately
my-cli --version
```

Editable installs are the Python equivalent of `npm link` — source changes are picked up without reinstall.

**Go**

```bash
go install .         # Installs to $GOPATH/bin
my-cli --version
```

Or run directly: `go run . <args>`.

### Manual Testing Workflow

Structure manual testing around scenarios, not individual flags:

1. Define the happy path scenario as a shell script in `tests/manual/`
2. Define common error scenarios (missing required arg, bad input format, network failure)
3. Run the scenario script after each meaningful change

Keep a `Makefile` target or `scripts/dev-test.sh` that runs the most important manual scenarios. This catches integration issues that unit tests miss and runs in seconds.

### Debug Flags

Support a debug output mode that is invisible in normal operation but invaluable during development:

- **Node.js**: Respect `DEBUG=my-cli:*` using the `debug` package. Namespaced debug output appears only when the env var is set
- **Rust**: Use `RUST_LOG=debug` with the `env_logger` or `tracing` crate
- **Python**: `LOGLEVEL=DEBUG` with the `logging` module

Add an explicit `--verbose` or `--debug` flag that mirrors the env var. This lets users report bugs with detailed output without requiring knowledge of the env var.

Internal debug output always goes to stderr, never stdout. Stdout is for the tool's actual output; mixing diagnostic messages corrupts pipe chains.

### Hot Reload for Node.js

For TypeScript CLIs, use `ts-node` or `tsx` to avoid a compile step during development:

```bash
# Run directly with tsx (fast TypeScript runner)
tsx src/index.ts <args>

# Or use nodemon for file-watch rerun
npx nodemon --ext ts --exec "tsx src/index.ts" -- <args>
```

Add a `dev` script to `package.json`:
```json
{
  "scripts": {
    "dev": "tsx src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js"
  }
}
```

### REPL Development

When building interactive prompts or REPL-like features, test incrementally:

- Mock `process.stdin` and `process.stdout` in unit tests to verify prompt sequences
- Use `script` (Unix) or `Expect` to record and replay terminal interactions in integration tests
- Test TTY vs non-TTY behavior explicitly — many prompt libraries silently skip prompts in non-TTY mode

## Deep Guidance

### Environment Isolation

Use `.env.development` and `.env.test` files for environment-specific overrides. Never commit credentials. Load with `dotenv` (Node), `dotenvy` (Rust), or `python-dotenv`. Validate required env vars at startup with a clear error if missing.

Isolate test runs from the user's real config by setting `XDG_CONFIG_HOME` and `HOME` to temporary directories in tests:

```bash
export XDG_CONFIG_HOME=$(mktemp -d)
my-cli init  # reads/writes to temp dir, never touches ~/.config
```

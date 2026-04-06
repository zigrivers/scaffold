---
name: cli-testing
description: CLI integration testing by spawning processes, snapshot testing help text, mock filesystem, environment variable testing, and CI matrix testing
topics: [cli, testing, integration-tests, snapshot-testing, mock-filesystem, ci-matrix, exit-codes]
---

CLI testing requires a different mindset than library testing. The contract being tested is behavioral: given this argv and environment, what does the tool write to stdout, what does it write to stderr, and what exit code does it return? Unit tests for business logic are necessary but not sufficient — integration tests that spawn the actual binary catch the class of bugs that only appear at the boundary between argument parsing and execution.

## Summary

CLI testing requires spawning the actual binary and asserting on stdout, stderr, and exit code. Snapshot test help text to catch accidental regressions. Isolate filesystem tests with temporary directories and mock `$HOME`/`XDG_CONFIG_HOME`. Test across OS/runtime matrices in CI including Windows.

## Deep Guidance

### Integration Testing by Spawning the Process

The most valuable CLI test spawns the actual binary and asserts on stdout, stderr, and exit code:

**Node.js (vitest or jest)**
```typescript
import { execSync } from 'child_process';

test('build succeeds with valid input', () => {
  const result = execSync('node bin/my-cli build --input fixture.txt', {
    encoding: 'utf8',
    env: { ...process.env, XDG_CONFIG_HOME: tmpDir }
  });
  expect(result).toContain('Build complete');
});

test('exits 2 on unknown flag', () => {
  expect(() =>
    execSync('node bin/my-cli --unknown-flag', { encoding: 'utf8', stdio: 'pipe' })
  ).toThrow('exit code 2');
});
```

**Rust**
```rust
use assert_cmd::Command;

#[test]
fn build_succeeds() {
    Command::cargo_bin("my-cli")
        .unwrap()
        .arg("build")
        .assert()
        .success()
        .stdout(predicates::str::contains("Build complete"));
}
```

**Bats (shell)**
```bash
@test "exits 2 on missing required argument" {
  run my-cli deploy
  [ "$status" -eq 2 ]
  [[ "$output" =~ "required" ]]
}
```

Always test exit codes. Always test that error output goes to stderr. Always test the success path and the most common failure paths.

### Snapshot Testing for Help Text

Help text is part of the public API — changes should be intentional. Snapshot tests catch accidental regressions:

```typescript
test('help text matches snapshot', () => {
  const { stdout } = execSync('node bin/my-cli --help', { encoding: 'utf8' });
  expect(stdout).toMatchSnapshot();
});
```

Update snapshots intentionally when help text changes. In CI, fail on unexpected snapshot drift. This also catches typos and formatting issues in help output.

### Mock Filesystem

Tests that interact with the filesystem must be isolated. Use temporary directories or a mock filesystem:

**Node.js**
```typescript
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';

let tmpDir: string;
beforeEach(() => { tmpDir = mkdtempSync(tmpdir() + '/my-cli-test-'); });
afterEach(() => { rmSync(tmpDir, { recursive: true }); });
```

For unit tests that don't need real disk I/O, `memfs` provides an in-memory filesystem that satisfies the Node.js `fs` module interface.

**Rust**: Use `tempfile::TempDir`. Tests run in parallel by default — each test gets its own temp directory to avoid interference.

**Key rule**: Never write to `$HOME`, `~/.config`, or any real user directory in tests. Set `HOME` and `XDG_CONFIG_HOME` to the temp directory.

### Environment Variable Testing

Test behavior driven by environment variables:

```typescript
test('respects NO_COLOR', () => {
  const result = execSync('node bin/my-cli status', {
    encoding: 'utf8',
    env: { ...process.env, NO_COLOR: '1' }
  });
  // Assert no ANSI escape sequences in output
  expect(result).not.toMatch(/\x1b\[/);
});
```

Test the full env var precedence chain: flag overrides env var, env var overrides config file. Each level should be independently testable.

### CI Matrix Testing

Test across multiple operating systems and runtime versions:

```yaml
# GitHub Actions
strategy:
  matrix:
    os: [ubuntu-latest, macos-latest, windows-latest]
    node: ['18', '20', '22']
```

Windows-specific concerns: path separators (`\` vs `/`), line endings (`\r\n` vs `\n`), `%APPDATA%` vs `$HOME/.config`, and `PATHEXT` for binary extension handling. Test on Windows even if you do not primarily develop on it.

### Test Pyramid for CLIs

- **Unit tests (fast)**: Business logic in `utils/`, pure functions, config parsing, output formatters
- **Integration tests (medium)**: Spawn the CLI process, assert stdout/stderr/exit code for key scenarios
- **End-to-end tests (slow, optional)**: Full workflow against real external services — run in CI on schedule, not on every PR

Keep integration tests fast by using fixtures (pre-created files) rather than generating test input dynamically. A full integration test suite should complete in under 30 seconds.

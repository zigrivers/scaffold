---
name: cli-distribution-patterns
description: npm, pip, and cargo publishing, Homebrew formulae, standalone binaries, Docker images, and GitHub Releases with checksums
topics: [cli, distribution, npm, homebrew, cargo, pip, standalone-binaries, github-releases, checksums]
---

Distribution is where many CLI projects fail: the tool works perfectly in development but is painful to install, update, or run in different environments. A well-distributed CLI reaches users through multiple channels (package manager, direct download, container) and handles updates gracefully.

## Summary

### Package Registry Publishing

**npm (Node.js)**

Declare `bin` in `package.json` and publish to npm:

```json
{
  "name": "@myorg/my-cli",
  "version": "1.0.0",
  "bin": { "my-cli": "./bin/my-cli" },
  "files": ["bin/", "dist/"]
}
```

Users install with `npm install -g @myorg/my-cli`. Use `npm publish --access public` for scoped packages. Set up `publishConfig` for automated CI publishing via npm trusted publishing (GitHub OIDC) rather than storing long-lived tokens.

**cargo (Rust)**

Publish to crates.io with `cargo publish`. Users install with `cargo install my-cli`. Binary name is declared in `Cargo.toml` under `[[bin]]`. Provide pre-built binaries via GitHub Releases for users who do not have Rust installed.

**pip (Python)**

Use `pyproject.toml` with `[project.scripts]` to declare the CLI entry point. Publish to PyPI with `python -m build && twine upload`. Users install with `pip install my-cli` or `pipx install my-cli`. Prefer `pipx` for CLI tools — it installs in an isolated virtualenv, preventing dependency conflicts.

### Homebrew Formulae

Homebrew is the preferred installation channel for macOS users. Two options:

**Core formula (homebrew-core)**: For widely-used tools. Submit a PR to `homebrew/homebrew-core`. Requires the tool to meet popularity and quality standards.

**Custom tap**: For any tool, immediately available:

```ruby
# Formula/my-cli.rb
class MyCli < Formula
  desc "One-line description of what this does"
  homepage "https://github.com/myorg/my-cli"
  url "https://github.com/myorg/my-cli/archive/v1.0.0.tar.gz"
  sha256 "abc123..."
  license "MIT"

  def install
    bin.install "bin/my-cli"
  end

  test do
    assert_match "1.0.0", shell_output("#{bin}/my-cli --version")
  end
end
```

Automate formula updates with `brew bump-formula-pr` or tools like `release-please`. The SHA256 in the formula must match the release tarball exactly.

### Standalone Binaries

Ship zero-dependency binaries for users who do not have the language runtime installed:

- **Node.js**: `pkg` (Vercel) or `nexe` bundle Node + app into a single executable. `bun build --compile` produces a single binary. Provide binaries for `linux-x64`, `linux-arm64`, `darwin-x64`, `darwin-arm64`, `win-x64`
- **Rust**: Cross-compile with `cross` (Docker-based cross-compiler). `cargo-dist` automates release binary creation and GitHub Release uploads
- **Python**: `PyInstaller` bundles the interpreter and dependencies. `Nuitka` compiles to C for smaller binaries
- **Go**: `GOOS=linux GOARCH=amd64 go build` — Go cross-compilation is built in

### GitHub Releases with Checksums

Every release should publish binaries with SHA256 checksums:

```bash
# Generate checksums
sha256sum my-cli-linux-x64 my-cli-darwin-arm64 > checksums.txt

# Upload to release
gh release create v1.0.0 \
  my-cli-linux-x64 \
  my-cli-darwin-arm64 \
  checksums.txt \
  --title "v1.0.0" \
  --notes-file CHANGELOG.md
```

Users verify: `sha256sum -c checksums.txt`. Homebrew formulae require a SHA256 of the source tarball. Provide a `checksums.txt` in a consistent, parseable format.

## Deep Guidance

### Auto-Update Strategy

CLIs should notify users of available updates without blocking command execution:

1. Check for updates asynchronously in a background process after command completes
2. Cache the result for 24 hours to avoid hitting the registry on every run
3. Print update notification to stderr so it does not corrupt stdout output
4. Respect `--no-update-check` flag and `MYCLI_NO_UPDATE_CHECK` env var for CI environments

Implement with a non-blocking background check: spawn a subprocess that writes the latest version to a cache file, then read that cache on the next invocation.

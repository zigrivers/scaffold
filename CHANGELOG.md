# Changelog

All notable changes to Scaffold are documented here.

## [1.3.7] — 2026-02-15

### Added
- Tiered model selection for `claude-fix` job — round 1 uses Sonnet (~40% cheaper), round 2+ escalates to Opus when prior fix didn't satisfy reviewer
- Updated Safety Rails cost cap documentation to reflect tiered pricing

## [1.3.6] — 2026-02-15

### Fixed
- `/scaffold:update` now actively updates plugin installs by pulling the marketplace clone in-place, instead of telling the user to run a manual command
- `/scaffold:version` dynamically detects the installed version from the marketplace clone's `plugin.json`, replacing the hardcoded version that went stale after updates

## [1.3.5] — 2026-02-15

### Added
- MCP tool permissions (`mcp__*`) to Claude Code Permissions prompt — auto-approves all MCP plugin tools (Context7, Playwright, etc.) so agents aren't prompted on every MCP call
- Per-server MCP wildcards added to cautious mode
- MCP troubleshooting and verification guidance

## [1.3.4] — 2026-02-15

### Added
- `docs/scaffold-overview.md` — central reference document covering purpose, all 29 commands, pipeline phases, dependencies, documentation outputs, and key concepts

## [1.3.1] — 2026-02-15

### Added
- `.claude-plugin/marketplace.json` — enables two-step plugin install via `/plugin marketplace add`

### Fixed
- Update install flow from single-command `/plugin install scaffold@zigrivers/scaffold` to two-step marketplace flow (`/plugin marketplace add` + `/plugin install scaffold@zigrivers-scaffold`)
- Update all docs and commands to use `/plugin marketplace update zigrivers-scaffold` instead of re-running install

## [1.3.0] — 2026-02-15

### Added
- `/scaffold:multi-agent-start` command — start multi-agent execution loop in a worktree
- `/scaffold:multi-agent-resume` command — resume multi-agent work after a break

## [1.2.0] — 2025-02-15

### Added
- `/scaffold:version` command — check installed vs. latest version without updating

## [1.1.0] — 2025-02-15

### Added
- `/scaffold:update` command — check for and apply scaffold updates from within Claude Code
- `scripts/update.sh` — standalone CLI update script for terminal use
- `.scaffold-version` marker file written on install for version tracking
- This changelog

### Fixed
- Permissions prompt restructured to fix compound command prompting (`78fda92`)

## [1.0.0] — 2025-02-01

### Added
- Initial release — 25-prompt pipeline for scaffolding new software projects
- Plugin install via `/plugin marketplace add zigrivers/scaffold` + `/plugin install scaffold@zigrivers-scaffold`
- User command install via `scripts/install.sh`
- Auto-activated pipeline context skill
- Full pipeline from product definition (Phase 1) through implementation (Phase 7)

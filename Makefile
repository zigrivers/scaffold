.PHONY: help test lint validate check setup hooks install uninstall extract

help: ## Show available targets
	@grep -E '^[a-z][a-z-]*:.*## ' $(MAKEFILE_LIST) | awk -F ':.*## ' '{printf "  \033[36m%-12s\033[0m %s\n", $$1, $$2}'

test: ## Run bats test suite
	bats tests/

lint: ## Run ShellCheck on all shell scripts
	@find scripts lib -name '*.sh' -print0 2>/dev/null | xargs -0 shellcheck --severity=warning

validate: ## Validate frontmatter in command files
	./scripts/validate-frontmatter.sh commands/*.md

check: lint validate test ## Run all quality gates (lint + validate + test)

setup: ## Install dev dependencies via Homebrew
	@command -v shellcheck >/dev/null 2>&1 || { echo "Installing shellcheck..."; brew install shellcheck; }
	@command -v bats >/dev/null 2>&1 || { echo "Installing bats-core..."; brew install bats-core; }
	@command -v jq >/dev/null 2>&1 || { echo "Installing jq..."; brew install jq; }
	@command -v bd >/dev/null 2>&1 || { echo "Installing beads..."; brew install beads; }
	@echo "All dev dependencies installed."

hooks: ## Install pre-commit and pre-push hooks
	./scripts/install-hooks.sh

install: ## Install scaffold commands to ~/.claude/commands/
	./scripts/install.sh

uninstall: ## Remove scaffold commands from ~/.claude/commands/
	./scripts/uninstall.sh

extract: ## Extract commands from prompts.md
	./scripts/extract-commands.sh

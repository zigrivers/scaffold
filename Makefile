.PHONY: help test lint validate validate-knowledge check check-all eval ts-check setup hooks dashboard-test mmr-build mmr-test mmr-check check-reference-citations check-freshness-citations guides-check

help: ## Show available targets
	@grep -E '^[a-z][a-z-]*:.*## ' $(MAKEFILE_LIST) | awk -F ':.*## ' '{printf "  \033[36m%-12s\033[0m %s\n", $$1, $$2}'

test: ## Run bats test suite
	bats tests/

lint: ## Run ShellCheck on all shell scripts
	@find scripts lib -name '*.sh' -print0 2>/dev/null | xargs -0 shellcheck --severity=warning

validate: ## Validate frontmatter in pipeline and tool files
	./scripts/validate-frontmatter.sh content/pipeline/**/*.md content/tools/*.md

validate-knowledge: ## Validate frontmatter on knowledge entries (freshness fields)
	npm run build
	node dist/index.js validate-knowledge

check-reference-citations: ## Verify file:line citations in all docs/ reference pages resolve (+ rebake-no-op for generated pages)
	node scripts/check-reference-citations.mjs

check-freshness-citations: check-reference-citations ## Back-compat alias for check-reference-citations

check: lint validate test eval ## Run bash quality gates (lint + validate + test + eval)

check-all: check ts-check mmr-check validate-knowledge check-reference-citations ## Run all quality gates (bash + TypeScript + knowledge frontmatter + reference-page citations)

ts-check: ## Run TypeScript quality gates (lint + type-check + build + unit tests)
	npm run lint
	npm run type-check
	npm run build
	npm test

eval: ## Run scaffold meta-evals (cross-system consistency checks)
	npx bats tests/evals/

setup: ## Install dev dependencies via Homebrew
	@command -v shellcheck >/dev/null 2>&1 || { echo "Installing shellcheck..."; brew install shellcheck; }
	@command -v bats >/dev/null 2>&1 || { echo "Installing bats-core..."; brew install bats-core; }
	@command -v jq >/dev/null 2>&1 || { echo "Installing jq..."; brew install jq; }
	@echo "All dev dependencies installed."

hooks: ## Install pre-commit and pre-push hooks
	./scripts/install-hooks.sh

dashboard-test: ## Generate test-ready dashboard HTML
	@mkdir -p tests/screenshots/current tests/screenshots/diff
	bash scripts/generate-dashboard.sh --no-open --output tests/screenshots/dashboard-test.html
	@echo "Dashboard ready at: tests/screenshots/dashboard-test.html"
	@echo "Navigate with: file://$(CURDIR)/tests/screenshots/dashboard-test.html"

guides-check: ## Regenerate guides and verify no drift + security scan
	npm run build
	bash scripts/check-guides-drift.sh

## mmr package
mmr-build: ## Build mmr package
	cd packages/mmr && npm run build

mmr-test: ## Run mmr package tests
	cd packages/mmr && npm test

mmr-check: ## Run mmr package quality gates
	cd packages/mmr && npm run check

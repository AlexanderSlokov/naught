# Naught — everything decays.
#
# One entry point for the things a person actually runs. Every target here is
# read-only with respect to the systems Naught observes; the only thing any of
# them writes is Naught's own data directory.

SHELL := /bin/bash
.DEFAULT_GOAL := help

export NAUGHT_DATA_DIR ?= $(CURDIR)/data
LOCKFILE ?= $(CURDIR)/pnpm-lock.yaml

.PHONY: help
help: ## Show this help
	@echo "Naught — make targets"
	@echo
	@grep -hE '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
		| awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[1m%-16s\033[0m %s\n", $$1, $$2}'
	@echo
	@echo "  data dir: $(NAUGHT_DATA_DIR)"

# --- toolchain --------------------------------------------------------------

.PHONY: install
install: ## Install dependencies from the lockfile, exactly
	pnpm install --frozen-lockfile

.PHONY: build
build: ## Build every workspace package
	pnpm build

.PHONY: typecheck
typecheck: ## Typecheck every workspace package
	pnpm -r typecheck

.PHONY: audit
audit: ## Check the dependency tree against known advisories
	pnpm audit --audit-level=moderate

.PHONY: test
test: ## Run every workspace package's tests
	pnpm -r test

.PHONY: check
check: typecheck test build audit ## Everything CI would run

# --- the point --------------------------------------------------------------

.PHONY: poc
poc: ## Point Naught at Naught, twice, in a scratch lake that is thrown away
	@dir=$$(mktemp -d -t naught-poc-XXXXXXXX); \
	echo "scratch lake: $$dir"; \
	echo "the real lake at $(NAUGHT_DATA_DIR) is not touched"; \
	NAUGHT_DATA_DIR=$$dir pnpm --filter @naught/api poc $(LOCKFILE) && \
	echo && echo "═══ same collector, same lake, second run ═══" && \
	NAUGHT_DATA_DIR=$$dir pnpm --filter @naught/api poc $(LOCKFILE); \
	echo; echo "scratch lake left at $$dir for inspection."

.PHONY: poc-here
poc-here: ## One run against the real lake at NAUGHT_DATA_DIR
	pnpm --filter @naught/api poc $(LOCKFILE)

.PHONY: poc-rotten
poc-rotten: ## Same run against a lockfile known to be rotten — proves the detector fires
	$(MAKE) poc LOCKFILE=$(CURDIR)/fixtures/rotten-lock.yaml

.PHONY: rebuild-cache
rebuild-cache: ## Drop naught.duckdb and rebuild it from the Parquet lake
	pnpm --filter @naught/api rebuild-cache

.PHONY: lake
lake: ## Show what is in the lake right now
	@find "$(NAUGHT_DATA_DIR)/runs" -name '*.parquet' -printf '%10s  %p\n' 2>/dev/null \
		| sort -k2 || echo "lake is empty"

.PHONY: burn
burn: ## Delete the cache only. The lake is never touched.
	rm -f "$(NAUGHT_DATA_DIR)/naught.duckdb" "$(NAUGHT_DATA_DIR)/naught.duckdb.wal"
	@echo "cache gone. runs/ untouched — 'make rebuild-cache' restores everything."

# --- running it -------------------------------------------------------------

.PHONY: api
api: ## Run the API alone (no queue, no UI)
	pnpm --filter @naught/api dev

.PHONY: web
web: ## Run the UI alone
	pnpm --filter @naught/web dev

.PHONY: dev
dev: ## Run API and UI together
	pnpm dev

.PHONY: up
up: ## Bring up api, web and redis in containers
	docker compose up --build -d

.PHONY: down
down: ## Stop the containers. The volume survives.
	docker compose down

.PHONY: clean
clean: ## Remove build output. Does not touch the lake.
	rm -rf apps/api/dist packages/shared/dist apps/web/.next
	find . -name '*.tsbuildinfo' -not -path './node_modules/*' -delete

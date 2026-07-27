SHELL := /usr/bin/env bash

SEED         ?= 42
TICKS        ?= 6000
URL          ?= ws://localhost:8000/ws
HOST         ?= http://localhost:8000
OUT          ?= profile.csv
DURATION     ?= 300
WORKDIR      ?= lab/datasets/generated/run
MODEL        ?=
TAG          ?=

CARGO_RELEASE := cd simulation && cargo

.PHONY: help sim client desktop-dev desktop-pack desktop-release \
        headless test test-backend test-frontend test-desktop test-lab \
        lint lint-rust lint-client lint-lab fmt fmt-rust fmt-client \
        build build-client build-sim build-desktop wasm \
        wipe wipe-archive logs profile lab-pipeline metrics snapshot \
        install install-client install-desktop install-sim \
        clean clean-sim clean-client clean-desktop perf-gate \
        ci-status ci-watch ci-log redeploy ec2-status worlds-list \
        commit-as-1homsi tag-list release-latest

help: ## Show this help (default)
	@printf "\nThe Human Box — make targets\n\n"
	@grep -hE '^[a-zA-Z][a-zA-Z0-9_-]+:.*?## ' $(MAKEFILE_LIST) \
		| sort \
		| awk 'BEGIN {FS=":.*?## "} {printf "  \033[36m%-22s\033[0m %s\n", $$1, $$2}'
	@printf "\nVariables (override on the command line):\n"
	@printf "  SEED=$(SEED)  TICKS=$(TICKS)  HOST=$(HOST)  URL=$(URL)\n"
	@printf "  OUT=$(OUT)  DURATION=$(DURATION)  WORKDIR=$(WORKDIR)\n\n"

# ── Run servers ─────────────────────────────────────────────────────

sim: ## Run the Rust simulation server (release)
	$(CARGO_RELEASE) run --release --bin simulation-rs

client: ## Run the Vite client dev server
	cd client && pnpm dev

desktop-dev: ## Run the Electron desktop app from source
	cd desktop && pnpm run dev

desktop-pack: ## Package the desktop installer for the current platform (no publish)
	cd desktop && pnpm run pack

desktop-release: ## Build + publish desktop installers to GitHub Releases (requires GH_TOKEN)
	cd desktop && pnpm run release

# ── Tests ───────────────────────────────────────────────────────────

test: test-backend test-frontend test-desktop test-lab ## Run every test suite

test-backend: ## Rust simulation tests (release, locked, whole workspace)
	$(CARGO_RELEASE) test --release --locked --workspace

test-frontend: ## Client unit tests
	cd client && pnpm test

test-desktop: ## Desktop tsc typecheck
	cd desktop && pnpm exec tsc -p tsconfig.json --noEmit

test-lab: ## Python lab tests
	cd lab && $$(test -x .venv/bin/python && printf .venv/bin/python || printf python3) -m pytest

# ── Lint + format ───────────────────────────────────────────────────

lint: lint-rust lint-client lint-lab ## Lint everything

lint-rust: ## cargo fmt --check + clippy (whole workspace)
	$(CARGO_RELEASE) fmt --all -- --check
	$(CARGO_RELEASE) clippy --workspace --all-targets -- -W clippy::all

lint-client: ## eslint + prettier check
	cd client && pnpm lint
	cd client && pnpm format:check

lint-lab: ## ruff check for lab package + tests
	cd lab && $$(test -x .venv/bin/python && printf .venv/bin/python || printf python3) -m ruff check .

fmt: fmt-rust fmt-client ## Auto-format the entire tree

fmt-rust: ## cargo fmt --all
	$(CARGO_RELEASE) fmt --all

fmt-client: ## prettier write
	cd client && pnpm format

# ── Build ───────────────────────────────────────────────────────────

build: build-sim wasm build-client ## Build sim, wasm, and client for production

build-sim: ## cargo build --release for the simulation
	$(CARGO_RELEASE) build --release --bin simulation-rs

wasm: ## Build the browser WASM sim-core into client/src/wasm/sim-core (needs rustup + wasm-pack)
	rustup target add wasm32-unknown-unknown >/dev/null 2>&1 || true
	cd simulation && RUSTFLAGS='--cfg getrandom_backend="wasm_js"' \
		rustup run stable wasm-pack build sim-core --target web --release \
		--out-dir ../../client/src/wasm/sim-core

build-client: ## Production Vite build (web target)
	cd client && pnpm run build

build-desktop: ## Build desktop bundle (renderer with VITE_DESKTOP=1 + main process)
	cd desktop && pnpm run build

# ── Smoke + perf ────────────────────────────────────────────────────

headless: ## Headless deterministic run — `make headless SEED=42 TICKS=6000`
	$(CARGO_RELEASE) run --release --bin headless -- \
		--seed $(SEED) --ticks $(TICKS) --every $(TICKS)

profile: ## Headless perf profile CSV — `make profile OUT=a.csv TICKS=12000`
	$(CARGO_RELEASE) run --release --bin headless -- \
		--seed $(SEED) --ticks $(TICKS) --every $(TICKS) \
		--profile ../$(OUT) --profile-every 100

perf-gate: ## Multi-seed sim budget — `make perf-gate TICKS=8000 MAX_TICK_MS=80`
	$(CARGO_RELEASE) build --release --locked --bin headless
	TICKS=$(TICKS) MAX_TICK_MS=$${MAX_TICK_MS:-80} scripts/perf-gate.sh

metrics: ## Scrape /metrics once from a running sim — `make metrics HOST=...`
	@curl -s $(HOST)/metrics

snapshot: ## Hit /snapshot on a running sim (binary, msgpack/gzip)
	@curl -fsSL $(HOST)/snapshot --output /tmp/thb-snapshot.bin \
		&& printf "snapshot saved → /tmp/thb-snapshot.bin (%d bytes)\n" \
			$$(stat -f%z /tmp/thb-snapshot.bin 2>/dev/null || stat -c%s /tmp/thb-snapshot.bin)

# ── Worlds / state ──────────────────────────────────────────────────

wipe: ## Wipe the local live world.save (next launch starts fresh)
	rm -f simulation/world.save
	rm -rf worlds/

wipe-archive: ## Move local worlds/ to a timestamped backup instead of deleting
	@if [ -d worlds ]; then \
		dest="worlds-archive-$$(date +%Y%m%d-%H%M%S)"; \
		mv worlds "$$dest" && echo "archived → $$dest"; \
	else \
		echo "no worlds/ to archive"; \
	fi

worlds-list: ## List the locally archived worlds with their meta
	@if [ -d worlds ]; then \
		for d in worlds/*/; do \
			name=$$(basename "$$d"); \
			meta="$$d/meta.json"; \
			if [ -f "$$meta" ]; then \
				echo "  $$name  $$(jq -r '.created // empty' "$$meta")"; \
			else \
				echo "  $$name  (no meta)"; \
			fi; \
		done; \
	else \
		echo "no worlds/ directory"; \
	fi

logs: ## Tail the local sim log (only when launched via redirect)
	@tail -f simulation/sim.log 2>/dev/null || echo "no simulation/sim.log — run sim with > sim.log first"

# ── Lab pipeline ────────────────────────────────────────────────────

lab-pipeline: ## Run thought-distillation pipeline — `make lab-pipeline DURATION=300 MODEL=...`
	python3 lab/scripts/run_pipeline.py \
		--url $(URL) \
		--duration $(DURATION) \
		--workdir $(WORKDIR) \
		$(if $(MODEL),--eval-model $(MODEL),)

# ── Install ─────────────────────────────────────────────────────────

install: install-client install-desktop install-sim ## Install every JS + Rust dep

install-client: ## pnpm install in client/
	cd client && pnpm install

install-desktop: ## pnpm install in desktop/
	cd desktop && pnpm install

install-sim: ## cargo fetch in simulation/
	$(CARGO_RELEASE) fetch

# ── Clean ───────────────────────────────────────────────────────────

clean: clean-sim clean-client clean-desktop ## Remove every build artifact

clean-sim: ## cargo clean
	$(CARGO_RELEASE) clean

clean-client: ## rm client/dist + client/node_modules/.vite
	rm -rf client/dist client/node_modules/.vite

clean-desktop: ## rm desktop/dist + desktop/out
	rm -rf desktop/dist desktop/out

# ── CI / release ────────────────────────────────────────────────────

ci-status: ## Show the latest pipeline run conclusion
	@gh run list --workflow pipeline.yml --limit 5

ci-watch: ## gh run watch the latest pipeline run
	@gh run watch $$(gh run list --workflow pipeline.yml --limit 1 --json databaseId --jq '.[0].databaseId')

ci-log: ## Print the failed-step log of the latest pipeline run
	@gh run view $$(gh run list --workflow pipeline.yml --limit 1 --json databaseId --jq '.[0].databaseId') --log-failed

redeploy: ## Empty-commit + push to main to trigger the deploy pipeline
	git commit --allow-empty -m "chore: redeploy"
	git push

tag-list: ## Show recent release tags
	@git tag --sort=-creatordate | head -10

release-latest: ## Show the latest GitHub release
	@gh release view

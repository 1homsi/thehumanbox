SHELL := /bin/sh
PYTHON ?= python3
PIP ?= pip
RUFF ?= ruff
PYTEST ?= pytest
TIMESTAMP := $(shell date +%Y%m%d_%H%M%S)

.PHONY: help install test lint format clean smoke eval report pipeline

help:
	@echo "thehumanbox lab — make targets"
	@echo ""
	@echo "  install   install package with dev/trace/inference extras"
	@echo "  test      run pytest suite"
	@echo "  lint      run ruff check"
	@echo "  format    run ruff format"
	@echo "  clean     remove caches and build artifacts"
	@echo "  smoke     quick end-to-end: build a tiny dataset and inspect it"
	@echo "  eval      run thought eval against the dummy backend"
	@echo "  report    build the HTML report"
	@echo "  pipeline  run the full pipeline into runs/<timestamp>/"
	@echo ""

install:
	$(PIP) install -e ".[dev,trace,inference]"

test:
	$(PYTEST) tests/ -v

lint:
	$(RUFF) check src tests scripts

format:
	$(RUFF) format src tests scripts

clean:
	find . -type d -name '__pycache__' -prune -exec rm -rf {} +
	find . -type d -name '.pytest_cache' -prune -exec rm -rf {} +
	find . -type d -name '.ruff_cache' -prune -exec rm -rf {} +
	find . -type d -name '*.egg-info' -prune -exec rm -rf {} +
	rm -rf build dist .coverage htmlcov

smoke:
	@mkdir -p datasets/generated
	$(PYTHON) scripts/build_thought_dataset.py \
	  --input datasets/eval/sample_trace.jsonl \
	  --output datasets/generated/smoke_thoughts.jsonl
	$(PYTHON) scripts/inspect_jsonl.py datasets/generated/smoke_thoughts.jsonl

eval:
	$(PYTHON) -m thehumanbox_lab.cli backend probe --names dummy
	$(PYTHON) scripts/run_thought_eval.py \
	  --input evals/sample_thought_eval.jsonl \
	  --engine baseline

report:
	$(PYTHON) scripts/build_report.py

pipeline:
	$(PYTHON) scripts/run_pipeline.py --workdir runs/$(TIMESTAMP)

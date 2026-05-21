# Contributing to the lab

## Style

- **No code comments.** Identifiers and signatures must carry the
  meaning. If you find yourself reaching for `#` or `"""docstring"""`,
  rename a variable or extract a function instead.
- **Pure stdlib in module code.** Heavy deps (transformers, peft,
  websockets, msgpack) belong in `pyproject.toml` `[project.optional-dependencies]`
  and the modules using them must `import` inside a `try / except
  ImportError` block with a useful raise message.
- **Deterministic randomness.** Take a `seed: int = 42` argument and
  instantiate `random.Random(seed)` rather than touching the global.
- **Backwards-compatible JSON.** Treat saved manifests / registries
  as long-lived; new fields are optional with sensible defaults.

## Adding a new module

1. Put the implementation under `src/thehumanbox_lab/<package>/` and
   add a re-export to that package's `__init__.py`.
2. Add a thin CLI wrapper in `scripts/` that follows the existing
   pattern (`sys.argv = ["thb-lab", "<verb>", *sys.argv[1:]]`).
3. Write a test in `tests/test_<module>.py`. Target one assertion per
   public function as a minimum.
4. If the module changes a public CLI surface, add a row to
   `docs/reference/cli.md`.
5. Run `make test` before pushing.

## Adding a new backend

See `docs/tutorials/03-custom-backend.md`. Three steps: implement the
class, register in `KNOWN_BACKENDS`, add a test.

## Adding a new scorer

1. New file at `src/thehumanbox_lab/scoring/<name>.py` exporting a
   `score(text: str, **kwargs) -> float` function returning 0..1.
2. Register in `scoring/registry.py`.
3. Default weight 0.0 in the aggregator until tuned.

## Tests

```sh
cd lab
make test           # full suite
pytest tests/test_<module>.py -x   # one module
```

Tests are stdlib-`unittest` style under `tests/test_*.py`. We use
pytest as the runner because it's faster.

## Linting

```sh
make lint           # ruff check
make format         # ruff format
```

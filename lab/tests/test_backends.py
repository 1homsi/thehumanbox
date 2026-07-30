from __future__ import annotations

import pytest

from thehumanbox_lab.backends import KNOWN_BACKENDS, Backend, get_backend
from thehumanbox_lab.backends.dummy import DummyBackend
from thehumanbox_lab.backends.health import probe_all, probe_one
from thehumanbox_lab.backends.manager import RequestManager


def test_dummy_backend_is_backend_protocol():
    backend = DummyBackend()
    assert isinstance(backend, Backend)


def test_dummy_backend_complete_is_deterministic():
    a = DummyBackend(seed=1)
    b = DummyBackend(seed=1)
    out_a = a.complete("hello world")
    out_b = b.complete("hello world")
    assert out_a == out_b
    assert out_a != ""


def test_dummy_backend_seed_changes_output():
    a = DummyBackend(seed=1)
    b = DummyBackend(seed=2)
    assert a.complete("same") != b.complete("same")


def test_dummy_backend_health_true():
    assert DummyBackend().health() is True


def test_dummy_backend_stop_truncates_output():
    backend = DummyBackend(seed=0)
    full = backend.complete("stop-test")
    marker = full[:4]
    truncated = backend.complete("stop-test", stop=[marker])
    assert marker not in truncated or truncated == ""


def test_get_backend_dispatches_known_names():
    for name in KNOWN_BACKENDS:
        backend = get_backend(name)
        assert isinstance(backend, Backend)
        assert hasattr(backend, "complete")
        assert hasattr(backend, "health")


def test_get_backend_unknown_raises():
    with pytest.raises(ValueError):
        get_backend("not-a-backend")


def test_request_manager_runs_concurrently():
    backend = DummyBackend(seed=42)
    manager = RequestManager(backend, concurrency=2)
    prompts = [f"prompt-{i}" for i in range(8)]
    outputs = manager.map(prompts)
    assert len(outputs) == len(prompts)
    assert len(set(outputs)) == len(prompts)
    assert backend.calls == len(prompts)


def test_request_manager_rejects_invalid_concurrency():
    with pytest.raises(ValueError):
        RequestManager(DummyBackend(), concurrency=0)


def test_probe_one_for_dummy():
    info = probe_one("dummy")
    assert info["available"] is True
    assert info["latency_ms"] is not None
    assert info["version"] is not None


def test_probe_all_includes_dummy():
    report = probe_all(["dummy"])
    assert "dummy" in report
    assert report["dummy"]["available"] is True

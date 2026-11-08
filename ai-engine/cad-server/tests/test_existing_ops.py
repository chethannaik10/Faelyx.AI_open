"""Regression check: every checked-in /build_part request fixture (the
ones run_test.command and run_new_ops_test.command replay against a live
server) still builds after the sketch-plane / revolve-axis changes."""
import json
import sys
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))

from fastapi.testclient import TestClient  # noqa: E402

from cad_server import app  # noqa: E402

client = TestClient(app)
FIXTURES = sorted(HERE.glob("test_*.json")) + [HERE.parent / "test_build_part.json"]


@pytest.mark.parametrize("path", FIXTURES, ids=lambda p: p.name)
def test_fixture_still_builds(path):
    body = json.loads(path.read_text())
    endpoint = "/inspect_part" if "inspect" in path.name else "/build_part"
    res = client.post(endpoint, json=body)
    assert res.status_code == 200, res.text

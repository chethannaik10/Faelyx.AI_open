"""FAELYX_CORS_ORIGINS: by default any localhost port may call the API;
when set, only the listed origins can (e.g. a hosted GitHub Pages copy)."""
import os
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parents[1]
PROBE = (
    "from fastapi.testclient import TestClient; from cad_server import app; c = TestClient(app);"
    "h = lambda o: c.options('/health', headers={'Origin': o, 'Access-Control-Request-Method': 'GET'}).headers.get('access-control-allow-origin');"
    "print(h('http://localhost:4173'), h('https://you.github.io'))"
)


def _probe(env_value):
    env = dict(os.environ)
    env.pop("FAELYX_CORS_ORIGINS", None)
    if env_value is not None:
        env["FAELYX_CORS_ORIGINS"] = env_value
    out = subprocess.run([sys.executable, "-c", PROBE], cwd=HERE, env=env, capture_output=True, text=True, check=True)
    return out.stdout.split()


def test_default_allows_any_local_port_only():
    assert _probe(None) == ["http://localhost:4173", "None"]


def test_configured_origins_replace_the_local_wildcard():
    assert _probe("https://you.github.io") == ["None", "https://you.github.io"]

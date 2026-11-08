"""faelyx.AI — Hunyuan3D 2.1 engine for Image to 3D (backend side).

Copyright (c) 2026 faelyx.AI. Tencent Hunyuan 3D 2.1 is licensed under the Tencent Hunyuan 3D 2.1 Community License
Agreement, Copyright (c) 2025 Tencent. All Rights Reserved. The trademark rights of "Tencent Hunyuan" are owned by Tencent
or its affiliate. faelyx.AI is not affiliated with, associated with, sponsored or endorsed by Tencent. See NOTICE-hunyuan3d.txt.

Hunyuan3D 2.1 needs Python 3.10 and PyTorch 2.5.1 (Tencent's tested setup), so it does not run inside the CAD server's own
interpreter. setup_hunyuan3d.py makes a separate environment and writes hunyuan3d_runtime/config.json; this module reads
that file, starts hunyuan3d_worker/worker.py in that environment as a child process for every model (and once for the weights download)
and reads the files the worker writes. A crash, an out-of-memory error or "Stop" therefore only ends the child process and gives
the GPU memory back. This module imports neither torch nor anything heavy, so the CAD server starts without any of it.

image_to_3d.py owns the jobs, the finishing options and the HTTP routes; it calls into here.

Remote mode: the same engine can run on a Google Colab GPU instead of this computer. colab_server.py (see
Faelyx_Hunyuan3D_Colab.ipynb) runs on Colab and uses THIS module there; here, once a connection code has been saved with
set_remote(), every public function below talks to that server over HTTPS instead of starting a local worker.
"""
import base64
import json
import os
import re
import shutil
import subprocess
import sys
import threading
import time
import traceback
import urllib.error
import urllib.parse
import urllib.request
import zipfile
import zlib
from pathlib import Path
from typing import Callable, Optional

import numpy as np

HERE = Path(__file__).resolve().parent
RUNTIME = Path(os.environ.get("FAELYX_HUNYUAN_HOME") or HERE / "hunyuan3d_runtime")
WORKER = Path(os.environ.get("FAELYX_HUNYUAN_WORKER") or HERE / "hunyuan3d_worker" / "worker.py")   # the override is for tests
SETUP_BAT = "setup_hunyuan3d.bat"

ENGINE_ID = "hunyuan"
ENGINE_NAME = "Hunyuan3D 2.1"
NOTICE = ("Powered by Tencent Hunyuan. Tencent Hunyuan 3D 2.1 is licensed under the Tencent Hunyuan 3D 2.1 Community License Agreement, "
          "Copyright © 2025 Tencent. All Rights Reserved. faelyx.AI is not affiliated with, associated with, sponsored or endorsed by Tencent.")
LICENSE_TERMS = [
    "Not licensed in the European Union, the United Kingdom or South Korea.",
    "Not for products or services with more than 1 million monthly active users unless Tencent grants a licence.",
    "Its models and outputs must not be used to train or improve any other AI model.",
    "The Acceptable Use Policy applies (for example: no military use, no deceptive or harmful content).",
]
WEIGHT_SHAPE_BYTES = 8_000_000_000      # only for the progress bar before the exact sizes are known
CREATE_NO_WINDOW = 0x08000000


# ----------------------------------------------------------------------------- configuration
def load_config() -> Optional[dict]:
    try:
        cfg = json.loads((RUNTIME / "config.json").read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    return cfg if isinstance(cfg, dict) else None


def _usable(cfg: Optional[dict]) -> bool:
    return bool(cfg and cfg.get("python") and Path(cfg["python"]).is_file() and cfg.get("repo") and (Path(cfg["repo"]) / "hy3dshape").is_dir()
                and WORKER.is_file())


def _local_installed() -> bool:
    cfg = load_config()
    return _usable(cfg) and bool(cfg.get("shape_ok"))


def _local_texture_available() -> bool:
    cfg = load_config()
    return _usable(cfg) and bool(cfg.get("texture_ok"))


def _dir_bytes(p: Path) -> int:
    total = 0
    for root, _dirs, files in os.walk(p):
        for f in files:
            try:
                total += os.path.getsize(os.path.join(root, f))
            except OSError:
                pass
    return total


def _read(path: Path) -> dict:
    try:
        d = json.loads(path.read_text(encoding="utf-8"))
        return d if isinstance(d, dict) else {}
    except (OSError, ValueError):
        return {}


def _child_env() -> dict:
    env = dict(os.environ)
    env.update(PYTHONIOENCODING="utf-8", PYTHONUNBUFFERED="1", FAELYX_HUNYUAN_HOME=str(RUNTIME))
    env.pop("PYTHONHOME", None)
    env.pop("VIRTUAL_ENV", None)
    return env


def _spawn(args: list, log_path: Path) -> subprocess.Popen:
    cfg = load_config()
    log_path.parent.mkdir(parents=True, exist_ok=True)
    log = open(log_path, "ab")
    kw = {"creationflags": CREATE_NO_WINDOW} if os.name == "nt" else {}
    return subprocess.Popen([cfg["python"], "-u", str(WORKER), *args, "--repo", cfg["repo"], "--home", str(RUNTIME)],
                            stdout=log, stderr=subprocess.STDOUT, env=_child_env(), cwd=str(HERE), **kw)


def kill_tree(proc: Optional[subprocess.Popen]) -> None:
    if proc is None or proc.poll() is not None:
        return
    try:
        if os.name == "nt":
            subprocess.run(["taskkill", "/PID", str(proc.pid), "/T", "/F"], capture_output=True, timeout=15, creationflags=CREATE_NO_WINDOW)
        else:
            proc.kill()
    except Exception:  # noqa: BLE001
        try:
            proc.kill()
        except Exception:  # noqa: BLE001
            pass


# ----------------------------------------------------------------------------- weights
_DL: dict = {"proc": None, "error": None}
_DL_LOCK = threading.Lock()


def _weights_marker() -> dict:
    return _read(RUNTIME / "weights_ok.json")


def _local_weights_ready() -> bool:
    m = _weights_marker()
    if not m:
        return False
    if _local_texture_available() and not m.get("texture"):
        return False
    return (RUNTIME / "models" / "tencent" / "Hunyuan3D-2.1" / "hunyuan3d-dit-v2-1").is_dir()


def _download_running() -> bool:
    p = _DL.get("proc")
    return p is not None and p.poll() is None


def _local_start_download() -> None:
    """Starts (once) the background download of the Hunyuan3D 2.1 weights into hunyuan3d_runtime."""
    with _DL_LOCK:
        if _download_running():
            return
        if not _local_installed():
            raise RuntimeError("Hunyuan3D 2.1 is not set up yet — run " + SETUP_BAT + " first.")
        if _local_weights_ready():
            return
        RUNTIME.mkdir(parents=True, exist_ok=True)
        (RUNTIME / "weights_state.json").unlink(missing_ok=True)
        _DL["error"] = None
        _DL["base"] = _dir_bytes(RUNTIME / "models") + _dir_bytes(RUNTIME / "hf")
        _DL["started"] = time.time()
        _DL["proc"] = _spawn(["download", "--texture", "1" if _local_texture_available() else "0"], RUNTIME / "logs" / "download.log")


def stop_download() -> None:
    with _DL_LOCK:
        kill_tree(_DL.get("proc"))
        _DL["proc"] = None


def _local_weights_status() -> dict:
    st = _read(RUNTIME / "weights_state.json")
    ready = _local_weights_ready()
    running = _download_running()
    state = "ready" if ready else "downloading" if running else "missing"
    err = None
    proc = _DL.get("proc")
    if not ready and not running and proc is not None and proc.poll() not in (None, 0) and st.get("state") != "done":
        state, err = "error", st.get("error") or _log_tail(RUNTIME / "logs" / "download.log") or "The download stopped."
    elif st.get("state") == "error" and not running and not ready:
        state, err = "error", st.get("error")
    total = int(st.get("total") or 0) or WEIGHT_SHAPE_BYTES
    got = max(0, _dir_bytes(RUNTIME / "models") + _dir_bytes(RUNTIME / "hf") - int(_DL.get("base", 0))) if running else 0
    pct = 100.0 if ready else min(99.0, 100.0 * got / total) if running else 0.0
    return {"state": state, "percent": round(pct, 1), "downloaded_mb": round(got / 1e6), "total_mb": round(total / 1e6),
            "error": err, "folder": str(RUNTIME), "source": "huggingface.co/tencent/Hunyuan3D-2.1", "files": ["hunyuan3d-dit-v2-1"] + (["hunyuan3d-paintpbr-v2-1", "dinov2-giant"] if _local_texture_available() else []),
            "stage": st.get("stage", ""), "exact_total": bool(st.get("total"))}


def _log_tail(path: Path, n: int = 12) -> str:
    try:
        lines = path.read_text(encoding="utf-8", errors="replace").strip().splitlines()
        return "\n".join(lines[-n:])
    except OSError:
        return ""


# ----------------------------------------------------------------------------- status
def _local_status() -> dict:
    cfg = load_config()
    ok = _usable(cfg)
    c = cfg or {}
    reasons = []
    if not ok:
        reasons.append("Not set up yet.")
    elif not c.get("shape_ok"):
        reasons.append("The shape stage did not pass its self-test: " + str(c.get("shape_error") or "unknown error"))
    elif not c.get("cuda"):
        reasons.append("PyTorch in the Hunyuan environment cannot see an NVIDIA GPU.")
    return {
        "id": ENGINE_ID, "name": ENGINE_NAME, "installed": bool(ok and c.get("shape_ok")), "configured": ok,
        "ready": bool(ok and c.get("shape_ok") and c.get("cuda")), "reasons": reasons,
        "texture_ok": bool(ok and c.get("texture_ok")), "texture_missing": (c.get("texture_missing") or [])[:8] if ok else [],
        "gpu": c.get("gpu"), "vram_gb": c.get("vram_gb"), "ram_gb": c.get("ram_gb"), "torch": c.get("torch"),
        "setup_command": SETUP_BAT, "setup_folder": str(HERE), "runtime_folder": str(RUNTIME),
        "weights": _local_weights_status(), "notice": NOTICE, "license_terms": LICENSE_TERMS,
        "license_url": "https://github.com/Tencent-Hunyuan/Hunyuan3D-2.1/blob/main/LICENSE",
        "source": "https://github.com/Tencent-Hunyuan/Hunyuan3D-2.1",
    }


# ----------------------------------------------------------------------------- one model
def job_dir(job_id: str) -> Path:
    return RUNTIME / "jobs" / job_id


def remove_job_files(job_id: str) -> None:
    shutil.rmtree(job_dir(job_id), ignore_errors=True)


def sweep_old_jobs(max_age_s: float = 86400.0) -> None:
    root = RUNTIME / "jobs"
    if not root.is_dir():
        return
    now = time.time()
    for d in root.iterdir():
        try:
            if d.is_dir() and now - d.stat().st_mtime > max_age_s:
                shutil.rmtree(d, ignore_errors=True)
        except OSError:
            pass


def _load_npz(path: Path):
    z = np.load(path)
    colors = z["colors"]
    return (np.asarray(z["verts"], dtype=np.float64), np.asarray(z["faces"], dtype=np.int64), colors if len(colors) else None)


def _collect(d: Path, res: dict) -> dict:
    final = _load_npz(d / "final.npz")
    lods = {}
    for name in res.get("lods", []):
        p = d / f"lod_{name}.npz"
        if p.is_file():
            lods[name] = _load_npz(p)
    pbr = d / "model_pbr.glb"
    codes = None
    if (d / "codes.npy").is_file():                       # TripoSR: the scene code, kept so colour can be added later from exactly the same model
        try:
            codes = np.load(d / "codes.npy")
        except (OSError, ValueError):
            codes = None
    return {"final": final, "lods": lods, "meta": res, "pbr_glb": pbr if pbr.is_file() else None, "codes": codes}


def run_model(job_id: str, cutout_png: bytes, options: dict, progress: Callable[[float, str], None], is_cancelled: Callable[[], bool],
              on_process: Callable[[Optional[subprocess.Popen]], None]) -> dict:
    """Runs the worker for one picture and returns {'final': (v, f, c), 'lods': {name: (v, f, c)}, 'meta': {...}, 'pbr_glb': Path|None}.
    Raises InterruptedError when cancelled and RuntimeError with a readable message on failure."""
    if remote_enabled():
        return _run_remote(job_id, cutout_png, options, progress, is_cancelled, on_process)
    d = job_dir(job_id)
    d.mkdir(parents=True, exist_ok=True)
    (d / "input.png").write_bytes(cutout_png)
    (d / "job.json").write_text(json.dumps(options), encoding="utf-8")
    log_path = d / "worker.log"
    proc = _spawn(["run", "--job", str(d)], log_path)
    on_process(proc)
    last_msg = ""
    try:
        while proc.poll() is None:
            if is_cancelled():
                kill_tree(proc)
                raise InterruptedError()
            st = _read(d / "status.json")
            if st:
                last_msg = st.get("message", last_msg)
                progress(float(st.get("pct", 0.0)), last_msg + (f"  ·  {int(st['elapsed'] // 60)} min {int(st['elapsed'] % 60):02d} s" if st.get("elapsed", 0) >= 60 else ""))
            time.sleep(0.5)
        st = _read(d / "status.json")
        res = _read(d / "result.json")
        if proc.returncode != 0 or not res.get("ok"):
            if is_cancelled():
                raise InterruptedError()
            msg = st.get("error") or ""
            if not msg:
                tail = _log_tail(log_path, 8)
                msg = "The Hunyuan3D worker stopped without a result." + (f"\n{tail}" if tail else "")
            raise RuntimeError(msg)
        return _collect(d, res)
    finally:
        on_process(None)
        kill_tree(proc)


# ----------------------------------------------------------------------------- remote engine (Google Colab)
REMOTE_FILE = RUNTIME / "remote.json"
_HEALTH: dict = {"t": 0.0, "data": None, "key": ""}
_UA = "faelyx-image-to-3d"
_RESULT_NAMES = re.compile(r"^(result\.json|final\.npz|shape\.npz|codes\.npy|lod_[a-z0-9_]{1,16}\.npz|model_pbr\.glb)$")


def remote_config() -> Optional[dict]:
    d = _read(REMOTE_FILE)
    return d if d.get("url") else None


def remote_enabled(engine: str = "hunyuan") -> bool:
    """Does this engine run on the saved Colab session? The connection (address + access code) is shared; each engine has its own switch
    ('enabled' = Hunyuan3D, 'triposr' = TripoSR, off until the user chooses Colab for it)."""
    c = remote_config()
    if not c:
        return False
    return bool(c.get("triposr", False)) if engine == "triposr" else bool(c.get("enabled", True))


def parse_connection(text: str, token: str = "") -> tuple:
    """Accepts the connection code the Colab notebook prints: 'https://xxxx.trycloudflare.com#ACCESSCODE' (also 'URL ACCESSCODE')."""
    parts = (text or "").split()
    if not parts:
        raise ValueError("Paste the connection code that the Colab notebook printed.")
    url = parts[0]
    tok = (token or "").strip()
    if "#" in url:
        url, frag = url.split("#", 1)
        tok = tok or frag.strip()
    if len(parts) > 1 and not tok:
        tok = parts[1].strip()
    url = url.strip().rstrip("/")
    u = urllib.parse.urlparse(url)
    local = (u.hostname or "") in ("localhost", "127.0.0.1", "::1")
    if not u.netloc or not (u.scheme == "https" or (u.scheme == "http" and local)):
        raise ValueError("The address must start with https:// — copy the whole connection code from the notebook.")
    if not tok:
        raise ValueError("The connection code has no access code. Copy the whole line the notebook printed (the part after the # is the access code).")
    return f"{u.scheme}://{u.netloc}", tok


def set_remote(code: str, token: str = "", verify: bool = True, engine: str = "hunyuan") -> dict:
    """Saves the Colab connection and switches `engine` to it (the other engine keeps its own choice). With verify=True the server
    must answer first, otherwise nothing is saved."""
    url, tok = parse_connection(code, token)
    old = REMOTE_FILE.read_bytes() if REMOTE_FILE.is_file() else None
    prev = remote_config() or {}
    flags = {"enabled": bool(prev.get("enabled", False)), "triposr": bool(prev.get("triposr", False))}
    flags["triposr" if engine == "triposr" else "enabled"] = True
    RUNTIME.mkdir(parents=True, exist_ok=True)
    REMOTE_FILE.write_text(json.dumps({"url": url, "token": tok, **flags}), encoding="utf-8")
    _HEALTH["t"] = 0.0
    if verify:
        h = remote_health(force=True)
        if h.get("_error"):
            if old is None:
                REMOTE_FILE.unlink(missing_ok=True)
            else:
                REMOTE_FILE.write_bytes(old)
            _HEALTH["t"] = 0.0
            raise ValueError(h["_error"])
    return {"url": url}


def set_remote_enabled(on: bool, engine: str = "hunyuan") -> None:
    c = remote_config()
    if not c:
        return
    c["triposr" if engine == "triposr" else "enabled"] = bool(on)
    REMOTE_FILE.write_text(json.dumps(c), encoding="utf-8")
    _HEALTH["t"] = 0.0


def clear_remote() -> None:
    REMOTE_FILE.unlink(missing_ok=True)
    _HEALTH["t"] = 0.0


def _remote_call(method: str, path: str, body: Optional[dict] = None, timeout: float = 20.0) -> dict:
    cfg = remote_config()
    if not cfg:
        raise RuntimeError("No Colab connection is saved.")
    data = json.dumps(body).encode("utf-8") if body is not None else None
    req = urllib.request.Request(cfg["url"] + path, data=data, method=method,
                                 headers={"X-Faelyx-Token": cfg.get("token", ""), "Content-Type": "application/json", "User-Agent": _UA, "Accept": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            raw = r.read()
    except urllib.error.HTTPError as e:
        detail = ""
        try:
            detail = json.loads(e.read().decode("utf-8", "replace")).get("error", "")
        except Exception:  # noqa: BLE001
            pass
        if e.code == 401:
            raise RuntimeError("The Colab session refused the access code. Copy the whole connection code from the notebook again.") from None
        if e.code in (502, 503, 504, 520, 521, 522, 523, 524, 530):
            raise RuntimeError("The Colab session is not answering (it may have stopped or been disconnected). Run the notebook's last cell again and paste the new connection code.") from None
        if e.code == 404:
            raise RuntimeError(detail or "The Colab session does not know this job — it may have restarted.") from None
        raise RuntimeError(detail or f"The Colab session answered with HTTP {e.code}.") from None
    except (urllib.error.URLError, OSError, ValueError) as e:
        reason = getattr(e, "reason", e)
        raise RuntimeError(f"Cannot reach the Colab session ({type(reason).__name__}: {reason}). Is the notebook's last cell still running? A new session means a new connection code.") from None
    try:
        out = json.loads(raw.decode("utf-8"))
    except ValueError:
        raise RuntimeError("The address answered, but not like a Faelyx Colab server. Check the connection code.") from None
    return out if isinstance(out, dict) else {}


def remote_health(force: bool = False) -> dict:
    """The Colab server's own engine status, or {'_error': message}. Cached for a few seconds because the dialog polls the status."""
    cfg = remote_config()
    key = f"{cfg.get('url')}|{cfg.get('token')}" if cfg else ""
    age = time.time() - _HEALTH["t"]
    if not force and _HEALTH["key"] == key and _HEALTH["data"] is not None and age < (8.0 if _HEALTH["data"].get("_error") else 3.0):
        return _HEALTH["data"]
    try:
        data = _remote_call("GET", "/health", timeout=6.0)
        if data.get("server") != "faelyx-colab":
            raise RuntimeError("The address answered, but not like a Faelyx Colab server. Check the connection code.")
    except RuntimeError as e:
        data = {"_error": str(e)}
    _HEALTH.update(t=time.time(), data=data, key=key)
    return data


def _remote_download(path: str, dest: Path) -> None:
    cfg = remote_config()
    req = urllib.request.Request(cfg["url"] + path, headers={"X-Faelyx-Token": cfg.get("token", ""), "User-Agent": _UA})
    tmp = dest.with_suffix(".part")
    try:
        with urllib.request.urlopen(req, timeout=120) as r, open(tmp, "wb") as f:
            shutil.copyfileobj(r, f, 1 << 20)
        tmp.replace(dest)
    except (urllib.error.URLError, OSError) as e:
        raise RuntimeError(f"Could not download the finished model from the Colab session: {e}") from None


def _run_remote(job_id, cutout_png, options, progress, is_cancelled, on_process, engine: str = "hunyuan", verts=None, mask_png=None, codes=None) -> dict:
    name = "TripoSR" if engine == "triposr" else "Hunyuan3D"
    d = job_dir(job_id)
    d.mkdir(parents=True, exist_ok=True)
    (d / "input.png").write_bytes(cutout_png)
    (d / "job.json").write_text(json.dumps(options), encoding="utf-8")
    on_process(None)
    progress(0.0, "Sending the picture to Google Colab…")
    body = {"png_b64": base64.b64encode(cutout_png).decode("ascii"), "options": options}
    if mask_png is not None:                    # TripoSR "Match my picture": the cut-out outline
        body["mask_b64"] = base64.b64encode(mask_png).decode("ascii")
    if codes is not None:                       # TripoSR colour-only job: the scene code the shape was made from (float32, zlib)
        body["codes_b64"] = base64.b64encode(zlib.compress(np.ascontiguousarray(codes, dtype="<f4").tobytes(), 3)).decode("ascii")
        body["codes_shape"] = list(np.asarray(codes).shape)
    if verts is not None:                       # TripoSR colour-only job: the vertices to paint (float32 xyz, zlib, base64)
        body["verts_b64"] = base64.b64encode(zlib.compress(np.ascontiguousarray(verts, dtype="<f4").tobytes(), 3)).decode("ascii")
    if engine == "triposr":
        body["engine"] = "triposr"
        if "triposr" not in remote_health(force=True):
            raise RuntimeError("The Colab session is running an older notebook that cannot make TripoSR models. Upload the new Faelyx_Hunyuan3D_Colab.ipynb "
                               "to Colab, run it, and paste the new connection code.")
    rid = _remote_call("POST", "/jobs", body, timeout=90.0).get("id")
    if not rid:
        raise RuntimeError("The Colab session did not accept the job.")
    fails = 0
    try:
        while True:
            if is_cancelled():
                try:
                    _remote_call("POST", f"/jobs/{rid}/cancel", {}, timeout=10.0)
                except RuntimeError:
                    pass
                raise InterruptedError()
            try:
                st = _remote_call("GET", f"/jobs/{rid}", timeout=20.0)
                fails = 0
            except RuntimeError as e:
                fails += 1
                if "does not know this job" in str(e) or fails >= 12:
                    raise RuntimeError("Lost the connection to the Colab session. " + str(e)) from None
                time.sleep(2.5)
                continue
            state = st.get("state")
            el = float(st.get("elapsed") or 0)
            progress(float(st.get("pct", 0.0)), (st.get("message") or "Working on Colab…") + (f"  ·  {int(el // 60)} min {int(el % 60):02d} s" if el >= 60 else ""))
            if state == "done":
                break
            if state == "failed":
                raise RuntimeError(st.get("error") or f"The {name} worker on Colab stopped without a result.")
            if state == "cancelled":
                raise InterruptedError()
            time.sleep(1.5)
        progress(99.0, "Downloading the finished model from Colab…")
        zpath = d / "result.zip"
        _remote_download(f"/jobs/{rid}/result", zpath)
        with zipfile.ZipFile(zpath) as z:
            for info in z.infolist():
                if _RESULT_NAMES.match(info.filename):
                    with z.open(info) as src, open(d / info.filename, "wb") as dst:
                        shutil.copyfileobj(src, dst, 1 << 20)
        zpath.unlink(missing_ok=True)
        res = _read(d / "result.json")
        if not res.get("ok") or not (d / "final.npz").is_file():
            raise RuntimeError("The Colab session returned an incomplete result.")
        return _collect(d, res)
    finally:
        try:
            _remote_call("DELETE", f"/jobs/{rid}", timeout=10.0)
        except RuntimeError:
            pass


def run_remote_triposr(job_id: str, prepared_png: bytes, options: dict, progress: Callable[[float, str], None],
                       is_cancelled: Callable[[], bool], verts=None, mask_png=None, codes=None) -> dict:
    """TripoSR on the Colab session: `prepared_png` is the picture exactly as TripoSR wants it (cut out, framed, on grey). Returns the
    same dict as run_model(); 'final' holds (verts, faces, colours)."""
    return _run_remote(job_id, prepared_png, options, progress, is_cancelled, lambda p: None, engine="triposr", verts=verts, mask_png=mask_png, codes=codes)


def remote_triposr_start_download() -> None:
    _remote_call("POST", "/weights/download", {"engine": "triposr"}, timeout=30.0)
    _HEALTH["t"] = 0.0


# ----------------------------------------------------------------------------- public API (local or remote)
def installed() -> bool:
    if remote_enabled():
        return bool(remote_health().get("installed"))
    return _local_installed()


def texture_available() -> bool:
    if remote_enabled():
        return bool(remote_health().get("texture_ok"))
    return _local_texture_available()


def weights_ready() -> bool:
    if remote_enabled():
        h = remote_health(force=True)
        return (h.get("weights") or {}).get("state") == "ready"
    return _local_weights_ready()


def start_download() -> None:
    if remote_enabled():
        _remote_call("POST", "/weights/download", {}, timeout=30.0)
        _HEALTH["t"] = 0.0
        return
    _local_start_download()


def weights_status() -> dict:
    if remote_enabled():
        h = remote_health(force=True)
        w = h.get("weights")
        if isinstance(w, dict):
            return w
        return {"state": "missing", "percent": 0, "downloaded_mb": 0, "total_mb": 0, "error": h.get("_error"), "folder": "", "source": "", "files": [], "stage": "", "exact_total": False}
    return _local_weights_status()


def engine_status() -> dict:
    base = _local_status()
    rc = remote_config()
    on = bool(rc and rc.get("enabled", True))
    base["where"] = "local"
    base["remote"] = {"configured": bool(rc), "enabled": on, "url": rc.get("url", "") if rc else "", "reachable": None, "error": None}
    if not on:
        return base
    h = remote_health()
    r = base["remote"]
    base["where"] = "remote"
    if h.get("_error"):
        r.update(reachable=False, error=h["_error"])
        base.update(installed=False, configured=True, ready=False, reasons=[h["_error"]], texture_ok=False, texture_missing=[], gpu=None, vram_gb=None, ram_gb=None)
        base["weights"] = {"state": "missing", "percent": 0, "downloaded_mb": 0, "total_mb": 0, "error": None, "folder": "", "source": "", "files": [], "stage": "", "exact_total": False}
        return base
    r.update(reachable=True, error=None)
    for k in ("installed", "configured", "ready", "reasons", "texture_ok", "texture_missing", "gpu", "vram_gb", "ram_gb", "torch", "weights"):
        if k in h:
            base[k] = h[k]
    base["setup_folder"] = base["runtime_folder"] = "Google Colab"
    return base

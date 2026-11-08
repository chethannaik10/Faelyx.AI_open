"""faelyx.AI — TripoSR on Google Colab (the part that runs on the Colab machine).

Copyright (c) 2026 faelyx.AI. Licensed under the faelyx.AI Image to 3D Module License (LICENSE-faelyx-image-to-3d.md). The TripoSR
model code in ./tsr is © 2024 Tripo AI & Stability AI, MIT License (tsr/LICENSE-TripoSR).

Two halves in one file, so the notebook only has to carry one extra module:

  * the SERVER half (imported by colab_server.py; standard library only): says whether TripoSR is installed, downloads the model
    weights, and runs one job by starting this same file as a child process;
  * the WORKER half (run with the TripoSR environment's Python; imports torch and tsr): `setup`, `selftest`, `download`, `run`.

Why a child process and a separate environment: torch and the model never live in the server process, so a crash or "Stop" only ends the
child and gives the GPU back, and installing TripoSR's packages cannot disturb the notebook's own Python. The environment is a
venv that can see Colab's already-installed PyTorch (--system-site-packages), so only the few missing packages are downloaded.

What the worker is given is the picture exactly as TripoSR wants it (cut out, framed, on mid-grey) — Faelyx prepares it on your
computer, so rembg / onnxruntime are not needed here. What comes back is final.npz (verts, faces, colors) and result.json.

    python triposr_colab.py setup            make the environment and install the packages
    python triposr_colab.py selftest         import everything and report torch / GPU as JSON
    python triposr_colab.py download         fetch the model weights from Hugging Face
    python triposr_colab.py run --job DIR    DIR holds input.png and job.json; writes status.json, result.json, final.npz
"""
import json
import os
import shutil
import signal
import subprocess
import sys
import threading
import time
import traceback
from pathlib import Path
from typing import Callable, Optional

HERE = Path(__file__).resolve().parent
HOME = Path(os.environ.get("FAELYX_TRIPOSR_HOME") or "/content/tsr_runtime")
HF_CACHE = HOME / "hf"
WORKER = Path(os.environ.get("FAELYX_TRIPOSR_WORKER") or __file__).resolve()      # the override is for tests
MODEL_REPO = "stabilityai/TripoSR"
DINO_REPO = "facebook/dino-vitb16"
CONFIG_NAME = "config.yaml"
WEIGHT_NAME = "model.ckpt"
WEIGHTS_BYTES = 1_700_000_000
CHUNK_SIZES = {"standard": 8192, "low": 2048}
FEATURES = ["hq", "colour", "match"]      # hq = high-detail mesh extraction (tsr/faelyx_mesh.py), colour = colour-only jobs; an older notebook reports neither
# Everything tsr/ imports, minus rembg and onnxruntime (cutting out the picture happens on the user's computer).
PACKAGES = ["omegaconf==2.3.0", "einops>=0.7", "transformers>=4.35,<5", "trimesh>=4.0.5", "imageio", "huggingface-hub", "Pillow", "scikit-image"]


# =============================================================================================== small helpers
def _read(path: Path) -> dict:
    try:
        d = json.loads(path.read_text(encoding="utf-8"))
        return d if isinstance(d, dict) else {}
    except (OSError, ValueError):
        return {}


def _write(path: Path, data: dict) -> None:
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(data), encoding="utf-8")
    tmp.replace(path)


def _dir_bytes(p: Path) -> int:
    total = 0
    for root, _dirs, files in os.walk(p):
        for f in files:
            try:
                total += os.path.getsize(os.path.join(root, f))
            except OSError:
                pass
    return total


def _cached(repo: str, name: str) -> bool:
    base = HF_CACHE / ("models--" + repo.replace("/", "--")) / "snapshots"
    try:
        return any((s / name).exists() for s in base.iterdir())
    except OSError:
        return False


def weights_ready() -> bool:
    return _cached(MODEL_REPO, CONFIG_NAME) and _cached(MODEL_REPO, WEIGHT_NAME) and _cached(DINO_REPO, "config.json")


def _env() -> dict:
    return dict(os.environ, HF_HUB_CACHE=str(HF_CACHE), FAELYX_TRIPOSR_HOME=str(HOME), PYTHONUNBUFFERED="1", TOKENIZERS_PARALLELISM="false")


# =============================================================================================== server half
def config() -> dict:
    return _read(HOME / "config.json")


def installed() -> bool:
    c = config()
    return bool(c.get("ok") and c.get("python") and Path(c["python"]).is_file())


def status() -> dict:
    """What colab_server.py reports under "triposr" in /health."""
    c = config()
    reasons = []
    if not installed():
        reasons.append(c.get("error") or "TripoSR is not installed on this Colab machine. Run the notebook's install cell with TripoSR selected.")
    return {"installed": installed(), "ready": installed() and bool(c.get("cuda")), "reasons": reasons, "features": FEATURES, "torch": c.get("torch"),
            "gpu": c.get("gpu"), "vram_gb": c.get("vram_gb"), "weights": weights_status()}


_DL: dict = {"proc": None, "error": None, "base": 0}
_DL_LOCK = threading.Lock()


def _download_running() -> bool:
    p = _DL.get("proc")
    return p is not None and p.poll() is None


def start_download() -> None:
    """Starts the weights download once (does nothing when the files are already there or a download is running)."""
    with _DL_LOCK:
        if _download_running() or weights_ready():
            return
        if not installed():
            raise RuntimeError("TripoSR is not installed on this Colab machine. Run the notebook's install cell with TripoSR selected.")
        (HOME / "logs").mkdir(parents=True, exist_ok=True)
        HF_CACHE.mkdir(parents=True, exist_ok=True)
        _DL.update(error=None, base=_dir_bytes(HF_CACHE))
        log = open(HOME / "logs" / "download.log", "ab")
        _DL["proc"] = subprocess.Popen([config()["python"], str(WORKER), "download"], env=_env(), stdout=log, stderr=subprocess.STDOUT,
                                       start_new_session=True)


def weights_status() -> dict:
    ready = weights_ready()
    if ready:
        state = "ready"
    elif _download_running():
        state = "downloading"
    else:
        p = _DL.get("proc")
        if p is not None and p.returncode not in (None, 0):
            tail = _log_tail(HOME / "logs" / "download.log", 5)
            _DL["error"] = _DL.get("error") or ("The download stopped." + (f"\n{tail}" if tail else ""))
            state = "error"
        else:
            state = "missing"
    got = max(0, _dir_bytes(HF_CACHE) - int(_DL.get("base", 0))) if state == "downloading" else 0
    pct = 100.0 if ready else (min(99.0, 100.0 * got / WEIGHTS_BYTES) if state == "downloading" else 0.0)
    return {"state": state, "percent": round(pct, 1), "downloaded_mb": round(got / 1e6), "total_mb": round(WEIGHTS_BYTES / 1e6),
            "error": _DL.get("error") if state == "error" else None, "folder": str(HF_CACHE), "source": MODEL_REPO, "files": [CONFIG_NAME, WEIGHT_NAME]}


def _log_tail(path: Path, n: int = 8) -> str:
    try:
        return "\n".join(path.read_text(encoding="utf-8", errors="replace").strip().splitlines()[-n:])
    except OSError:
        return ""


def kill_tree(proc: Optional[subprocess.Popen]) -> None:
    if proc is None or proc.poll() is not None:
        return
    try:
        os.killpg(os.getpgid(proc.pid), signal.SIGKILL)
    except (OSError, ProcessLookupError):
        try:
            proc.kill()
        except OSError:
            pass
    try:
        proc.wait(timeout=10)
    except subprocess.TimeoutExpired:
        pass


def run_job(job_dir: Path, png: bytes, options: dict, progress: Callable[[float, str], None], is_cancelled: Callable[[], bool],
            on_process: Callable[[Optional[subprocess.Popen]], None], extra: Optional[dict] = None) -> dict:
    """Runs the worker for one picture; returns result.json's content. Raises InterruptedError when cancelled, RuntimeError on failure."""
    if not installed():
        raise RuntimeError("TripoSR is not installed on this Colab machine. Run the notebook's install cell with TripoSR selected.")
    job_dir.mkdir(parents=True, exist_ok=True)
    (job_dir / "input.png").write_bytes(png)
    (job_dir / "job.json").write_text(json.dumps(options), encoding="utf-8")
    for name, data in (extra or {}).items():
        (job_dir / name).write_bytes(data)
    log_path = job_dir / "worker.log"
    proc = subprocess.Popen([config()["python"], str(WORKER), "run", "--job", str(job_dir)], env=_env(),
                            stdout=open(log_path, "ab"), stderr=subprocess.STDOUT, start_new_session=True)
    on_process(proc)
    try:
        while proc.poll() is None:
            if is_cancelled():
                kill_tree(proc)
                raise InterruptedError()
            st = _read(job_dir / "status.json")
            if st:
                progress(float(st.get("pct", 0.0)), str(st.get("message", "")))
            time.sleep(0.5)
        st = _read(job_dir / "status.json")
        res = _read(job_dir / "result.json")
        if proc.returncode != 0 or not res.get("ok"):
            if is_cancelled():
                raise InterruptedError()
            msg = st.get("error") or ""
            if not msg:
                tail = _log_tail(log_path, 8)
                msg = "The TripoSR worker stopped without a result." + (f"\n{tail}" if tail else "")
            raise RuntimeError(msg)
        return res
    finally:
        on_process(None)
        kill_tree(proc)


# =============================================================================================== worker half
_TAIL: list = []


def _sh(cmd: list, log=print) -> int:
    log("$ " + " ".join(cmd))
    del _TAIL[:]
    p = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, errors="replace")
    for line in p.stdout:
        log(line.rstrip())
        if line.strip() and not line.startswith("WARNING"):
            _TAIL.append(line.strip())
            del _TAIL[:-3]
    return p.wait()


def _why() -> str:
    return " ".join(_TAIL)


def _make_env(log=print) -> str:
    """The Python that runs the worker: a venv that can see Colab's packages (and its PyTorch), else Colab's own Python."""
    venv = HOME / "venv"
    py = venv / "bin" / "python"
    if py.is_file():
        return str(py)
    shutil.rmtree(venv, ignore_errors=True)
    if _sh([sys.executable, "-m", "venv", "--system-site-packages", str(venv)], log) == 0 and py.is_file():
        return str(py)
    log("python -m venv is not available here — trying uv.")
    shutil.rmtree(venv, ignore_errors=True)
    if _sh([sys.executable, "-m", "pip", "install", "-q", "uv"], log) == 0 and \
            _sh([sys.executable, "-m", "uv", "venv", "--seed", "--system-site-packages", "--python", sys.executable, str(venv)], log) == 0 and py.is_file():
        return str(py)
    log("Could not make a separate environment — installing into the notebook's own Python instead.")
    shutil.rmtree(venv, ignore_errors=True)
    return sys.executable


def setup() -> int:
    HOME.mkdir(parents=True, exist_ok=True)
    (HOME / "logs").mkdir(exist_ok=True)
    cfg = {"ok": False, "python": None, "error": None}
    logf = open(HOME / "logs" / "setup.log", "a", encoding="utf-8")

    def log(msg=""):
        print(msg, flush=True)
        logf.write(str(msg) + "\n")
        logf.flush()

    try:
        py = _make_env(log)
        cfg["python"] = py
        if _sh([py, "-m", "pip", "install", "-q", *PACKAGES], log) != 0:
            raise RuntimeError("pip could not install TripoSR's packages: " + _why())
        probe = [py, "-c", "import torch"]
        if subprocess.run(probe, capture_output=True).returncode != 0:
            log("PyTorch is not in this Python — installing it (large download).")
            if _sh([py, "-m", "pip", "install", "-q", "torch"], log) != 0:
                raise RuntimeError("pip could not install PyTorch: " + _why())
        r = subprocess.run([py, str(WORKER), "selftest"], capture_output=True, text=True, env=_env())
        info = {}
        for line in reversed(r.stdout.strip().splitlines()):
            try:
                info = json.loads(line)
                break
            except ValueError:
                continue
        if r.returncode != 0 or not info.get("ok"):
            raise RuntimeError(info.get("error") or (r.stderr.strip().splitlines() or ["The self-test failed."])[-1])
        cfg.update(info, ok=True, error=None)
        if not info.get("cuda"):
            log("Note: PyTorch cannot see a GPU. Check Runtime > Change runtime type.")
    except Exception as e:  # noqa: BLE001
        cfg.update(ok=False, error=f"{type(e).__name__}: {e}")
        log("SETUP FAILED: " + cfg["error"])
    _write(HOME / "config.json", cfg)
    log("TripoSR: " + ("READY" + (f" ({cfg.get('gpu')})" if cfg.get("gpu") else "") if cfg["ok"] else "NOT READY - " + str(cfg["error"])))
    return 0 if cfg["ok"] else 1


def _import_tsr():
    """tsr.utils imports rembg at the top. The worker never cuts out a picture, so a stand-in is enough."""
    import types
    sys.modules.setdefault("rembg", types.ModuleType("rembg"))
    sys.path.insert(0, str(HERE))
    import tsr.system  # noqa: F401
    return sys.modules["tsr.system"]


def selftest() -> int:
    try:
        import torch
        _import_tsr()
        cuda = bool(torch.cuda.is_available())
        out = {"ok": True, "torch": str(torch.__version__), "cuda": cuda, "gpu": None, "vram_gb": None}
        if cuda:
            p = torch.cuda.get_device_properties(0)
            out.update(gpu=p.name, vram_gb=round(p.total_memory / 1024 ** 3, 1))
        print(json.dumps(out))
        return 0
    except Exception as e:  # noqa: BLE001
        print(json.dumps({"ok": False, "error": f"{type(e).__name__}: {e}"}))
        return 1


def download() -> int:
    from huggingface_hub import hf_hub_download
    HF_CACHE.mkdir(parents=True, exist_ok=True)
    hf_hub_download(MODEL_REPO, CONFIG_NAME)
    hf_hub_download(DINO_REPO, "config.json")
    hf_hub_download(MODEL_REPO, WEIGHT_NAME)
    print("TripoSR weights downloaded.")
    return 0


def run(job: Path) -> int:
    t0 = time.time()
    status_path, result_path = job / "status.json", job / "result.json"

    def st(pct, msg, error=None):
        _write(status_path, {"pct": float(pct), "message": msg, "elapsed": round(time.time() - t0, 1), "error": error})

    try:
        opts = _read(job / "job.json")
        task = "colour" if opts.get("task") == "colour" else "shape"
        mc = int(min(512, max(32, float(opts.get("mc_resolution", 384)))))
        thr = float(min(60.0, max(5.0, float(opts.get("threshold", 25.0)))))
        memory = str(opts.get("memory", "standard")) if str(opts.get("memory", "standard")) in CHUNK_SIZES else "standard"
        chunk = CHUNK_SIZES[memory]
        polish = str(opts.get("polish", "standard")) if str(opts.get("polish", "standard")) in ("off", "standard", "strong") else "standard"
        flat_base = bool(opts.get("flat_base", True))
        paint = bool(opts.get("colour", False))
        csmooth = int(min(6, max(0, float(opts.get("colour_smooth", 2)))))
        match = str(opts.get("match", "off")) if str(opts.get("match", "off")) in ("off", "light", "strong") else "off"
        reads = 5 if int(float(opts.get("reads", 1))) >= 5 else 3 if int(float(opts.get("reads", 1))) >= 3 else 1
        st(1, "Starting TripoSR on Colab…")
        import numpy as np
        import torch
        from PIL import Image
        tsr_system = _import_tsr()

        if not weights_ready():
            stop = threading.Event()

            def watch():
                base = _dir_bytes(HF_CACHE)
                while not stop.wait(1.0):
                    got = max(0, _dir_bytes(HF_CACHE) - base)
                    st(3 + 20 * min(1.0, got / WEIGHTS_BYTES), f"Downloading the TripoSR weights on Colab, first run only — {got // 1_000_000:,} of about {WEIGHTS_BYTES // 1_000_000:,} MB…")
            th = threading.Thread(target=watch, daemon=True)
            th.start()
            try:
                download()
            finally:
                stop.set()
        device = "cuda:0" if torch.cuda.is_available() else "cpu"
        st(26, "Loading the TripoSR model…")
        model = tsr_system.TSR.from_pretrained(MODEL_REPO, config_name=CONFIG_NAME, weight_name=WEIGHT_NAME)
        model.to(device)
        model.eval()
        model.renderer.set_chunk_size(chunk)
        image = Image.open(job / "input.png").convert("RGB")
        from tsr import faelyx_mesh as fm
        try:
            st(40, "Reconstructing the object on the Colab GPU…" if device.startswith("cuda") else "Reconstructing the object on the Colab CPU (no GPU found — slow)…")
            note = ""
            if task == "colour":
                raw = np.frombuffer((job / "verts.bin").read_bytes(), dtype="<f4").reshape(-1, 3)
                if (job / "codes.npy").is_file():            # the scene code the shape was made from
                    codes = torch.from_numpy(np.load(job / "codes.npy").astype(np.float32))[None].to(device)
                else:
                    with torch.no_grad():
                        codes = model([image], device=device)
                verts = np.zeros((0, 3), np.float32)
                faces = np.zeros((0, 3), np.int32)
                colors = fm.query_colours(model, codes[0], device, raw, memory, lambda f, m: st(55 + 40 * f, f"Painting the model on Colab… {int(f * 100)} %"), None)
            else:
                mask = None
                if match != "off" and (job / "mask.png").is_file():
                    mask = np.asarray(Image.open(job / "mask.png").convert("L"))
                codes, picture_note = fm.scene_code_from_picture(model, image, mask, {"reads": reads, "match": match, "memory": memory}, device,
                                                                 lambda f, m: st(42 + 14 * f, m), None)
                np.save(job / "codes.npy", codes[0].detach().float().cpu().numpy())
                st(58, f"Reading the shape (high-detail mesh, {mc}³)…")
                geo = fm.build_geometry(model, codes, device, {"mc_resolution": mc, "threshold": thr, "memory": memory, "polish": polish, "flat_base": flat_base},
                                        lambda f, m: st(58 + 28 * f, m), None)
                note = " ".join(x for x in (picture_note, geo["note"]) if x)
                verts = np.asarray(geo["verts"], dtype=np.float32)
                faces = np.asarray(geo["faces"], dtype=np.int32)
                colors = np.zeros((0, 3), np.uint8)
                if paint:
                    st(86, "Painting the model on Colab…")
                    colors = fm.query_colours(model, codes[0], device, verts, memory, None, None)
                    colors = fm.smooth_colours(verts, faces, colors, csmooth)
        except torch.cuda.OutOfMemoryError:
            raise RuntimeError("The Colab GPU ran out of memory. Switch Memory use to “Low” or lower the mesh resolution.") from None
        st(96, "Packing the result…")
        np.savez_compressed(job / "final.npz", verts=verts, faces=faces, colors=colors)
        _write(result_path, {"ok": True, "engine": "triposr", "task": task, "note": note, "faces": int(len(faces)), "seconds": round(time.time() - t0, 1),
                             "lods": [], "textured": False})
        st(100, "Done")
        return 0
    except Exception as e:  # noqa: BLE001
        traceback.print_exc()
        msg = str(e) or type(e).__name__
        _write(result_path, {"ok": False, "error": msg})
        st(0, "Failed", msg)
        return 1


def main(argv: list) -> int:
    cmd = argv[1] if len(argv) > 1 else ""
    if cmd == "setup":
        return setup()
    if cmd == "selftest":
        return selftest()
    if cmd == "download":
        return download()
    if cmd == "run" and "--job" in argv:
        return run(Path(argv[argv.index("--job") + 1]))
    print(__doc__)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv))

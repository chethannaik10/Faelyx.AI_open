"""faelyx.AI — Image to 3D server for Google Colab (Hunyuan3D 2.1 and TripoSR).

Copyright (c) 2026 faelyx.AI. Tencent Hunyuan 3D 2.1 is licensed under the Tencent Hunyuan 3D 2.1 Community License
Agreement, Copyright (c) 2025 Tencent. All Rights Reserved. faelyx.AI is not affiliated with, associated with, sponsored or
endorsed by Tencent. See NOTICE-hunyuan3d.txt.

This small web service is started by Faelyx_Hunyuan3D_Colab.ipynb on a Colab GPU. It uses the very same hunyuan3d.py and
hunyuan3d_worker/worker.py as the desktop install — so a model made here is the same model — and it only adds a thin HTTP layer.
TripoSR runs through triposr_colab.py (also a child process). The notebook installs either engine or both.

  GET    /health                 the engine status (GPU, which stages work, model-file download state)
  POST   /weights/download       start downloading the model files onto this Colab machine; {"engine": "triposr"} for TripoSR, else Hunyuan3D
  POST   /jobs                   {"png_b64": <RGBA cut-out>, "options": {...}}  ->  {"id": ...}
                                 add "engine": "triposr" for TripoSR (the PNG is then the prepared picture and the options are
                                 mc_resolution / threshold / memory)
  GET    /jobs/<id>              {"state": running|done|failed|cancelled, "pct", "message", "elapsed", "error"}
  GET    /jobs/<id>/result       a zip with result.json, final.npz, lod_*.npz and (when coloured) model_pbr.glb
  POST   /jobs/<id>/cancel       stop it
  DELETE /jobs/<id>              forget it and delete its files

Every request must carry the access code in the X-Faelyx-Token header (FAELYX_COLAB_TOKEN). One model is made at a time.
"""
import base64
import binascii
import io
import json
import os
import re
import secrets
import sys
import threading
import time
import uuid
import zipfile
import zlib
from pathlib import Path
from typing import Optional

import numpy as np

from fastapi import FastAPI, Request
from fastapi.responses import FileResponse, JSONResponse

sys.path.insert(0, str(Path(__file__).resolve().parent))
import hunyuan3d as hy  # noqa: E402
import triposr_colab as tc  # noqa: E402

TOKEN = os.environ.get("FAELYX_COLAB_TOKEN", "")
MAX_PNG = 40 * 1024 * 1024
app = FastAPI(title="faelyx.AI Hunyuan3D Colab server")
_JOBS: dict = {}
_LOCK = threading.Lock()
_ID = re.compile(r"^[0-9a-f]{12}$")
_OPTION_KEYS = {"steps", "guidance", "octree", "mode", "texture", "tex_views", "tex_res", "seed", "border", "polish", "flat_base", "variants"}
_TSR_OPTION_KEYS = {"task", "mc_resolution", "threshold", "memory", "polish", "flat_base", "colour", "colour_smooth", "match", "reads"}
MAX_VERTS_BYTES = 120 * 1024 * 1024        # a colour-only TripoSR job carries the mesh vertices (float32 xyz, zlib)


def err(msg: str, code: int = 400):
    return JSONResponse({"error": msg}, status_code=code)


@app.middleware("http")
async def _auth(request: Request, call_next):
    if not TOKEN or not secrets.compare_digest(request.headers.get("x-faelyx-token", "").encode("utf-8"), TOKEN.encode("utf-8")):
        return err("Wrong or missing access code.", 401)
    return await call_next(request)


def _busy() -> bool:
    with _LOCK:
        return any(j["state"] == "running" for j in _JOBS.values())


@app.get("/health")
def health():
    st = hy.engine_status()
    st["server"] = "faelyx-colab"
    st["busy"] = _busy()
    try:
        st["triposr"] = tc.status()
    except Exception as e:  # noqa: BLE001 — never let the second engine break the first one's status
        st["triposr"] = {"installed": False, "ready": False, "reasons": [f"{type(e).__name__}: {e}"], "torch": None, "gpu": None, "vram_gb": None,
                         "weights": {"state": "missing", "percent": 0, "downloaded_mb": 0, "total_mb": 0, "error": None, "folder": "", "source": "", "files": []}}
    return JSONResponse(st)


@app.post("/weights/download")
async def weights_download(request: Request):
    try:
        body = await request.json()
    except ValueError:
        body = {}
    engine = body.get("engine") if isinstance(body, dict) else None
    try:
        if engine == "triposr":
            tc.start_download()
            return JSONResponse(tc.weights_status())
        hy.start_download()
    except Exception as e:  # noqa: BLE001
        return err(str(e))
    return JSONResponse(hy.weights_status())


def _clean_options(o: dict, engine: str = "hunyuan") -> dict:
    keys = _TSR_OPTION_KEYS if engine == "triposr" else _OPTION_KEYS
    out = {}
    for k, v in (o or {}).items():
        if k in keys and isinstance(v, (str, int, float, bool)):
            out[k] = v
    return out


def _run(j: dict, png: bytes, options: dict, extra: Optional[dict] = None) -> None:
    def progress(pct, msg):
        j["pct"], j["message"] = float(pct), str(msg)
        j["elapsed"] = round(time.time() - j["t0"], 1)

    def on_process(p):
        j["proc"] = p

    try:
        if j["engine"] == "triposr":
            tc.run_job(hy.job_dir(j["id"]), png, options, progress, lambda: j["cancel"], on_process, extra)
        else:
            hy.run_model(j["id"], png, options, progress, lambda: j["cancel"], on_process)
        j["state"], j["pct"], j["message"] = "done", 100.0, "Done"
    except InterruptedError:
        j["state"] = "cancelled"
    except Exception as e:  # noqa: BLE001
        j["state"], j["error"] = "failed", str(e)
    j["elapsed"] = round(time.time() - j["t0"], 1)


@app.post("/jobs")
async def create_job(request: Request):
    try:
        body = await request.json()
        png = base64.b64decode(body.get("png_b64", ""), validate=False)
    except (ValueError, binascii.Error):
        return err("The request was not valid JSON.")
    if png[:4] != b"\x89PNG" or len(png) > MAX_PNG:
        return err("The picture must be a PNG under 40 MB.")
    engine = "triposr" if body.get("engine") == "triposr" else "hunyuan"
    options = _clean_options(body.get("options") if isinstance(body.get("options"), dict) else {}, engine)
    if engine == "triposr":
        if not tc.installed():
            return err("TripoSR is not set up on this Colab machine — choose “Both” or “TripoSR only” in step 1 of the notebook and run the install cell.", 409)
    elif not hy.installed():
        return err("Hunyuan3D is not set up on this Colab machine — choose “Both” or “Hunyuan3D 2.1 only” in step 1 of the notebook and run the install cell.", 409)
    extra = {}
    if engine == "triposr" and body.get("verts_b64"):
        try:
            raw = zlib.decompressobj().decompress(base64.b64decode(body["verts_b64"], validate=False), MAX_VERTS_BYTES)
        except (ValueError, binascii.Error, zlib.error):
            return err("The vertex data was not valid.")
        if len(raw) == 0 or len(raw) % 12 or len(raw) >= MAX_VERTS_BYTES:
            return err("The vertex data has the wrong size.")
        extra["verts.bin"] = raw
    if engine == "triposr" and body.get("mask_b64"):               # the cut-out outline for "Match my picture"
        try:
            m = base64.b64decode(body["mask_b64"], validate=False)
        except (ValueError, binascii.Error):
            return err("The outline data was not valid.")
        if m[:4] != b"\x89PNG" or len(m) > MAX_PNG:
            return err("The outline must be a PNG.")
        extra["mask.png"] = m
    if engine == "triposr" and body.get("codes_b64"):              # the scene code of a finished shape (colour-only job)
        try:
            shp = [int(x) for x in body.get("codes_shape") or []]
            raw = zlib.decompressobj().decompress(base64.b64decode(body["codes_b64"], validate=False), MAX_VERTS_BYTES)
            n = 4
            for x in shp:
                n *= x
            if len(shp) != 4 or min(shp) < 1 or n != len(raw):
                return err("The scene code has the wrong size.")
            buf = io.BytesIO()
            np.save(buf, np.frombuffer(raw, dtype="<f4").reshape(shp).copy())
        except (ValueError, TypeError, binascii.Error, zlib.error):
            return err("The scene code was not valid.")
        extra["codes.npy"] = buf.getvalue()
    extra = extra or None
    if options.get("task") == "colour" and extra is None:
        return err("A colour job needs the mesh vertices (verts_b64).")
    with _LOCK:
        if any(j["state"] == "running" for j in _JOBS.values()):
            return err("This Colab session is already making a model. Wait for it to finish or press Stop in Faelyx.", 409)
        jid = uuid.uuid4().hex[:12]
        j = {"id": jid, "engine": engine, "state": "running", "pct": 0.0, "message": "Starting…", "error": None, "cancel": False, "t0": time.time(), "elapsed": 0.0, "proc": None}
        _JOBS[jid] = j
    threading.Thread(target=_run, args=(j, png, options, extra), daemon=True).start()
    return JSONResponse({"id": jid})


def _job(job_id: str):
    return _JOBS.get(job_id) if _ID.match(job_id) else None


@app.get("/jobs/{job_id}")
def job_status(job_id: str):
    j = _job(job_id)
    if j is None:
        return err("Unknown job — the Colab session may have restarted.", 404)
    return JSONResponse({k: j[k] for k in ("id", "state", "pct", "message", "error", "elapsed")})


@app.post("/jobs/{job_id}/cancel")
def job_cancel(job_id: str):
    j = _job(job_id)
    if j is None:
        return err("Unknown job.", 404)
    j["cancel"] = True
    return JSONResponse({"ok": True})


@app.get("/jobs/{job_id}/result")
def job_result(job_id: str):
    j = _job(job_id)
    if j is None:
        return err("Unknown job — the Colab session may have restarted.", 404)
    if j["state"] != "done":
        return err("The model is not finished yet.", 409)
    d = hy.job_dir(job_id)
    zpath = d / "result_pack.zip"
    if not zpath.is_file():
        with zipfile.ZipFile(zpath, "w", zipfile.ZIP_DEFLATED, compresslevel=3) as z:
            for name in ["result.json", "final.npz", "codes.npy", "model_pbr.glb"] + sorted(p.name for p in d.glob("lod_*.npz")):
                if (d / name).is_file():
                    z.write(d / name, name)
    return FileResponse(zpath, media_type="application/zip", filename="result.zip")


@app.delete("/jobs/{job_id}")
def job_delete(job_id: str):
    j = _job(job_id)
    if j is not None:
        j["cancel"] = True
        _JOBS.pop(job_id, None)
        if j["state"] != "running":
            hy.remove_job_files(job_id)
    return JSONResponse({"ok": True})


def main() -> None:
    import uvicorn
    if not TOKEN:
        print("FAELYX_COLAB_TOKEN is not set — refusing to start without an access code.")
        sys.exit(2)
    hy.sweep_old_jobs(6 * 3600)
    uvicorn.run(app, host="127.0.0.1", port=int(os.environ.get("FAELYX_COLAB_PORT", "8765")), log_level="warning")


if __name__ == "__main__":
    main()

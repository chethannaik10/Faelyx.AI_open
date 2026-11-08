"""Builds Faelyx_Hunyuan3D_Colab.ipynb — the Google Colab notebook that runs the Hunyuan3D 2.1 and TripoSR engines for Faelyx Image to 3D.

The notebook carries its own copy of the files it needs (hunyuan3d.py, hunyuan3d_worker/worker.py, setup_hunyuan3d.py,
colab_server.py, triposr_colab.py, the tsr/ package, NOTICE-hunyuan3d.txt) as one compressed block, so it can be uploaded to Colab on
its own. Run this script again after changing any of those files:

    python make_colab_notebook.py
"""
import base64
import io
import json
import tarfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
FILES = ["hunyuan3d.py", "hunyuan3d_worker/worker.py", "hunyuan3d_worker/faelyx_polish.py", "setup_hunyuan3d.py", "colab_server.py", "triposr_colab.py", "NOTICE-hunyuan3d.txt",
         "LICENSE-faelyx-image-to-3d.md"]
FILES += sorted(p.relative_to(HERE).as_posix() for p in (HERE / "tsr").rglob("*") if p.is_file() and "__pycache__" not in p.parts and p.suffix != ".pyc")
OUT = HERE / "Faelyx_Hunyuan3D_Colab.ipynb"


def bundle() -> str:
    buf = io.BytesIO()
    with tarfile.open(fileobj=buf, mode="w:gz") as t:
        for name in FILES:
            data = (HERE / name).read_bytes().replace(b"\r\n", b"\n")
            info = tarfile.TarInfo(name)
            info.size = len(data)
            info.mtime = 0
            t.addfile(info, io.BytesIO(data))
    b = base64.b64encode(buf.getvalue()).decode("ascii")
    return "\n".join(b[i:i + 100] for i in range(0, len(b), 100))


def md(text: str) -> dict:
    return {"cell_type": "markdown", "metadata": {}, "source": text.strip("\n").splitlines(keepends=True)}


def code(text: str, collapsed: bool = False) -> dict:
    meta = {"cellView": "form"} if text.lstrip().startswith("#@title") else {}
    if collapsed:
        meta["collapsed"] = True
    return {"cell_type": "code", "metadata": meta, "execution_count": None, "outputs": [], "source": text.strip("\n").splitlines(keepends=True)}


INTRO = """
# faelyx.AI · Image to 3D on Google Colab

This notebook runs the **Hunyuan3D 2.1** model (shape + optional colour) and/or the **TripoSR** model on a Colab GPU, so the Faelyx
*Image to 3D* dialog can use it instead of your own graphics card. Faelyx prepares the picture on your computer, sends it here,
waits, and brings the finished model back. One Colab session serves both engines with the same connection code.

**How to use it**

1. **Runtime → Change runtime type → a GPU** (T4 is the free one; a bigger GPU is faster and can do Hunyuan3D's colour stage in full).
2. In step 1 choose the engine(s). **TripoSR only** installs in about 4 minutes; **Hunyuan3D 2.1** needs about 15–25 minutes plus its
   model download (several GB). Then **Runtime → Run all** (or run the cells in order).
3. When the last cell prints a **connection code**, paste it in Faelyx: *Image to 3D → pick the engine → Run on → Google Colab → Connect*.
   (The same code works for the other engine too — just choose Google Colab there as well.)
4. Keep this tab open and the last cell running while you work. When Colab disconnects, run the notebook again and paste the new code
   (the address changes every session).

**Good to know**

- Everything is installed on the Colab machine, which is wiped when the session ends — so each new session installs again.
- Pictures you send and models you make pass through Google's machine and a Cloudflare tunnel. Do not send anything confidential.
- TripoSR is © 2024 Tripo AI & Stability AI (MIT licence).
- Hunyuan3D 2.1 is © Tencent and licensed under the *Tencent Hunyuan 3D 2.1 Community License* (not licensed in the EU, UK or South Korea;
  its models and outputs may not be used to train other AI models; see NOTICE-hunyuan3d.txt after step 2). faelyx.AI is not affiliated with Tencent.
- Free Colab can disconnect at any time and has usage limits. Please also read Google's current Colab terms about what a notebook may be used for.
"""

SETTINGS = '''
#@title 1 · Settings and GPU check
ENGINES = "Both"               #@param ["Both", "TripoSR only", "Hunyuan3D 2.1 only"]
COLOUR_STAGE = True            #@param {type:"boolean"}
PREDOWNLOAD_MODELS = True      #@param {type:"boolean"}
ACCESS_CODE = ""               #@param {type:"string"}
# ENGINES: which engine(s) to install. TripoSR is quick (about 4 minutes, a 1.7 GB model); Hunyuan3D 2.1 is the high-quality one (15-25 minutes, several GB).
# COLOUR_STAGE: (Hunyuan3D 2.1 only) also install the colour (texture) stage. It adds ~5-8 minutes and needs the CUDA compiler; if it cannot be built the shape stage still works.
# PREDOWNLOAD_MODELS: download the model files in this notebook (otherwise Faelyx's "Download model files" button, or the first model, does it later).
# ACCESS_CODE: leave empty for a fresh random code every session, or type your own to keep the same one (only the address changes).
import secrets, subprocess
gpu = subprocess.run(["nvidia-smi", "--query-gpu=name,memory.total", "--format=csv,noheader"], capture_output=True, text=True).stdout.strip()
if not gpu:
    raise SystemExit("No GPU found. Use Runtime -> Change runtime type and choose a GPU, then run this cell again.")
print("GPU:", gpu)
ACCESS_CODE = ACCESS_CODE.strip() or secrets.token_urlsafe(12)
WANT_HY, WANT_TSR = ENGINES != "TripoSR only", ENGINES != "Hunyuan3D 2.1 only"
print("Engines:", ", ".join(n for n, w in (("Hunyuan3D 2.1", WANT_HY), ("TripoSR", WANT_TSR)) if w))
'''

UNPACK = '''
#@title 2 · Unpack the Faelyx files (nothing to do here)
import base64, io, os, tarfile
BUNDLE = """
{bundle}
"""
os.makedirs("/content/faelyx_hy", exist_ok=True)
with tarfile.open(fileobj=io.BytesIO(base64.b64decode(BUNDLE)), mode="r:gz") as t:
    t.extractall("/content/faelyx_hy")
print("Unpacked", len(os.listdir("/content/faelyx_hy")), "items.")
if WANT_HY:
    print(open("/content/faelyx_hy/NOTICE-hunyuan3d.txt", encoding="utf-8").read())
'''

INSTALL = '''
#@title 3 · Install the engine(s) (TripoSR ~4 minutes, Hunyuan3D 2.1 15–25 minutes on a fresh session)
import json, os, subprocess, sys
os.environ["FAELYX_HUNYUAN_HOME"] = "/content/hy_runtime"
os.environ["FAELYX_TRIPOSR_HOME"] = "/content/tsr_runtime"
os.environ["FAELYX_COLAB"] = "1"

def sh(cmd):
    p = subprocess.Popen(cmd, shell=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, errors="replace")
    for line in p.stdout:
        print(line, end="")
    return p.wait()

sh(sys.executable + " -m pip install -q fastapi uvicorn")
tsr_ok = hy_ok = False
if WANT_TSR:
    print("=== TripoSR ===")
    sh("cd /content/faelyx_hy && " + sys.executable + " triposr_colab.py setup")
    tcfg = json.load(open("/content/tsr_runtime/config.json"))
    tsr_ok = bool(tcfg.get("ok"))
if WANT_HY:
    print("=== Hunyuan3D 2.1 ===")
    sh("apt-get -qq update && apt-get -qq install -y libgl1 libglu1-mesa libxi6 libxxf86vm1 libxfixes3 libxrender1 libsm6 libxkbcommon0 ninja-build > /dev/null")
    if not os.path.isdir("/content/Hunyuan3D-2.1/hy3dshape"):
        sh("git clone --depth 1 https://github.com/Tencent-Hunyuan/Hunyuan3D-2.1.git /content/Hunyuan3D-2.1")
    sh("cd /content/faelyx_hy && " + sys.executable + " setup_hunyuan3d.py --repo /content/Hunyuan3D-2.1" + ("" if COLOUR_STAGE else " --shape-only"))
    cfg = json.load(open("/content/hy_runtime/config.json"))
    hy_ok = bool(cfg.get("shape_ok"))
print()
if WANT_TSR:
    print("TripoSR             :", "READY" if tsr_ok else "NOT READY - " + str(tcfg.get("error")))
if WANT_HY:
    print("Hunyuan3D shape     :", "READY" if hy_ok else "NOT READY - " + str(cfg.get("shape_error")))
    print("Hunyuan3D colour    :", "READY" if cfg.get("texture_ok") else "not available " + str(cfg.get("texture_missing")))
if not (tsr_ok or hy_ok):
    raise SystemExit("Nothing installed. Copy the last ~30 lines above (or the setup.log files under /content/tsr_runtime/logs and /content/hy_runtime/logs) to Claude.")
if (WANT_TSR and not tsr_ok) or (WANT_HY and not hy_ok):
    print("\\nOne engine did not install; the other one can still be used. Faelyx will say which is missing.")
'''

MODELS = '''
#@title 4 · Download the model files (large; once per session)
import os, sys, time
os.environ["FAELYX_HUNYUAN_HOME"] = "/content/hy_runtime"
os.environ["FAELYX_TRIPOSR_HOME"] = "/content/tsr_runtime"
sys.path.insert(0, "/content/faelyx_hy")

def fetch(label, mod, ready, start, status):
    if not PREDOWNLOAD_MODELS:
        print(label, "- skipped; Faelyx's \\"Download model files\\" button (or the first model) will do it.")
        return
    if ready():
        print(label, "- the model files are already here.")
        return
    start()
    last = ""
    while True:
        w = status()
        line = f"{label}: {w['state']}  {w['percent']}%  ({w['downloaded_mb']:,} of ~{w['total_mb']:,} MB)  {w.get('stage', '')}"
        if line != last:
            print(line)
            last = line
        if w["state"] == "ready":
            break
        if w["state"] == "error":
            print(label, "- download failed:", w["error"])
            return
        time.sleep(10)
    print(label, "- model files ready.")

if WANT_TSR and tsr_ok:
    import triposr_colab as tc
    fetch("TripoSR", tc, tc.weights_ready, tc.start_download, tc.weights_status)
if WANT_HY and hy_ok:
    import hunyuan3d as hy
    fetch("Hunyuan3D 2.1", hy, hy.weights_ready, hy.start_download, hy.weights_status)
'''

SERVE = '''
#@title 5 · Start the server and print the connection code (leave this cell running)
import json, os, re, subprocess, sys, time, urllib.request
os.environ["FAELYX_HUNYUAN_HOME"] = "/content/hy_runtime"
os.environ["FAELYX_TRIPOSR_HOME"] = "/content/tsr_runtime"
PORT = 8765
env = dict(os.environ, FAELYX_COLAB_TOKEN=ACCESS_CODE, FAELYX_COLAB_PORT=str(PORT), PYTHONUNBUFFERED="1")
server = subprocess.Popen([sys.executable, "/content/faelyx_hy/colab_server.py"], env=env, stdout=open("/content/server.log", "ab"), stderr=subprocess.STDOUT)

def get(url, timeout=8):
    req = urllib.request.Request(url, headers={"X-Faelyx-Token": ACCESS_CODE, "User-Agent": "faelyx-colab-check"})
    return json.load(urllib.request.urlopen(req, timeout=timeout))

for _ in range(40):
    try:
        h = get(f"http://127.0.0.1:{PORT}/health"); break
    except Exception:
        time.sleep(1)
else:
    print(open("/content/server.log", errors="replace").read()[-2000:]); raise SystemExit("The server did not start.")

if not os.path.exists("/usr/local/bin/cloudflared"):
    subprocess.run("curl -sL https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o /usr/local/bin/cloudflared && chmod +x /usr/local/bin/cloudflared", shell=True, check=True)
tunnel = subprocess.Popen(["cloudflared", "tunnel", "--url", f"http://127.0.0.1:{PORT}", "--no-autoupdate"], stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
url, t0 = None, time.time()
for line in tunnel.stdout:
    m = re.search(r"https://[-a-z0-9]+\\.trycloudflare\\.com", line)
    if m:
        url = m.group(0); break
    if time.time() - t0 > 90:
        break
if not url:
    raise SystemExit("The tunnel did not start. Run this cell again.")
import threading
threading.Thread(target=lambda: [None for _ in tunnel.stdout], daemon=True).start()       # keep the pipe drained

for _ in range(30):                                   # the new address needs a few seconds before it answers
    try:
        get(url + "/health"); break
    except Exception:
        time.sleep(2)

print("=" * 78)
print("GPU:", h.get("gpu"))
print("  TripoSR       :", "ready" if (h.get("triposr") or {}).get("installed") else "not installed")
print("  Hunyuan3D 2.1 :", ("ready" if h.get("installed") else "not installed") + (" (colour stage " + ("ready)" if h.get("texture_ok") else "not available)") if h.get("installed") else ""))
print()
print("Paste this connection code into Faelyx  (Image to 3D > pick the engine > Run on > Google Colab > Connect):")
print()
print("    " + url + "#" + ACCESS_CODE)
print()
print("Keep this cell running. Stop it (the square button) to shut the server down.")
print("=" * 78)

try:
    n = 0
    while True:
        time.sleep(30)
        if server.poll() is not None:
            print("The server stopped:\\n" + open("/content/server.log", errors="replace").read()[-1500:]); break
        if tunnel.poll() is not None:
            print("The tunnel stopped - run this cell again for a new connection code."); break
        n += 1
        if n % 10 == 0:
            try:
                s = get(f"http://127.0.0.1:{PORT}/health"); print(time.strftime("%H:%M"), "still running" + (" - making a model" if s.get("busy") else ""))
            except Exception as e:
                print("health check failed:", e)
finally:
    server.terminate(); tunnel.terminate()
'''


def main() -> None:
    cells = [
        md(INTRO),
        code(SETTINGS),
        code(UNPACK.replace("{bundle}", bundle()), collapsed=True),
        code(INSTALL),
        code(MODELS),
        code(SERVE),
    ]
    nb = {"nbformat": 4, "nbformat_minor": 5,
          "metadata": {"accelerator": "GPU", "colab": {"gpuType": "T4", "name": "Faelyx_Hunyuan3D_Colab.ipynb", "provenance": []},
                       "kernelspec": {"display_name": "Python 3", "name": "python3"}, "language_info": {"name": "python"}},
          "cells": cells}
    for i, c in enumerate(cells):
        c["id"] = f"faelyx{i}"
    OUT.write_text(json.dumps(nb, indent=1, ensure_ascii=False), encoding="utf-8")
    print(f"wrote {OUT} ({OUT.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()

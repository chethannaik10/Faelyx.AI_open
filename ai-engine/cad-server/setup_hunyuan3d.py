"""faelyx.AI — one-time setup of the Hunyuan3D 2.1 engine (Image to 3D, "best quality" engine).

Copyright (c) 2026 faelyx.AI. Hunyuan3D 2.1 is © 2025 Tencent and is used under the Tencent Hunyuan 3D 2.1
Community License (see NOTICE-hunyuan3d.txt) — faelyx.AI is not affiliated with Tencent.

What it does (every step prints what it is doing; a full log goes to hunyuan3d_runtime/logs/setup.log):
  1. finds the Hunyuan3D-2.1 repository you cloned (git clone https://github.com/Tencent-Hunyuan/Hunyuan3D-2.1)
  2. makes a separate Python 3.10 environment (conda if you have it, else the `py -3.10` launcher) in hunyuan3d_runtime/env
     — the CAD server's own Python is never touched
  3. installs PyTorch 2.5.1 + CUDA 12.4 (the combination Tencent tests; RTX 50-series cards get PyTorch 2.7 + CUDA 12.8)
  4. installs the Hunyuan3D requirements (the shape stage must succeed; the colour-stage extras are optional)
  5. builds the two small native modules of the colour stage (needs Visual Studio Build Tools + the CUDA Toolkit) and
     downloads RealESRGAN_x4plus.pth (64 MB) — skipped with a clear message when the tools are missing
  6. checks everything by importing it, and writes hunyuan3d_runtime/config.json, which the Faelyx backend reads

The shape stage alone (a clean untextured mesh) needs only steps 1-4. The colour stage is optional: if step 5 cannot
finish, Image to 3D still works and just makes uncoloured models. Run this file again any time — finished steps are skipped.

  python setup_hunyuan3d.py                      normal run
  python setup_hunyuan3d.py --repo D:\\Hunyuan3D-2.1   when the clone is somewhere unusual
  python setup_hunyuan3d.py --shape-only         skip the colour stage extras
  python setup_hunyuan3d.py --install-prereqs    also try to install Visual Studio Build Tools and the CUDA Toolkit with winget
  python setup_hunyuan3d.py --check              only re-test the existing environment and rewrite config.json
"""
import argparse
import glob
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
IS_WIN = os.name == "nt"
HOME = Path(os.environ.get("FAELYX_HUNYUAN_HOME") or HERE / "hunyuan3d_runtime")
LOG = None

TORCH_STABLE = {"torch": "2.5.1", "vision": "0.20.1", "audio": "2.5.1", "index": "https://download.pytorch.org/whl/cu124", "tag": "cu124"}
TORCH_BLACKWELL = {"torch": "2.7.0", "vision": "0.22.0", "audio": "2.7.0", "index": "https://download.pytorch.org/whl/cu128", "tag": "cu128"}
# Not needed by the worker (web demo / Blender-free paths / things that do not build on Windows). Skipped when reading requirements.txt.
SKIP = {"gradio", "fastapi", "uvicorn", "pydantic", "pythreejs", "deepspeed", "tb_nightly", "tb-nightly", "cupy-cuda12x", "bpy", "open3d",
        "basicsr", "realesrgan"}
CORE_EXTRA = ["rtree", "fast-simplification", "networkx", "psutil", "pillow", "lxml"]
REALESRGAN_URL = "https://github.com/xinntao/Real-ESRGAN/releases/download/v0.1.0/RealESRGAN_x4plus.pth"


# ----------------------------------------------------------------------------- output
def say(msg: str = "") -> None:
    line = f"{msg}"
    print(line, flush=True)
    if LOG is not None:
        LOG.write(line + "\n")
        LOG.flush()


def step(n: int, total: int, title: str) -> None:
    say()
    say(f"[{n}/{total}] {title}")
    say("-" * 72)


def run(cmd, *, cwd=None, env=None, check=True, quiet=False) -> int:
    """Runs a command, echoing and logging its output. Returns the exit code."""
    shown = " ".join(f'"{c}"' if " " in str(c) else str(c) for c in cmd) if isinstance(cmd, (list, tuple)) else cmd
    say(f"> {shown}")
    p = subprocess.Popen(cmd, cwd=cwd, env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, errors="replace",
                         shell=isinstance(cmd, str))
    tail = []
    assert p.stdout is not None
    for line in p.stdout:
        line = line.rstrip()
        tail.append(line)
        tail[:] = tail[-40:]
        if LOG is not None:
            LOG.write(line + "\n")
        if not quiet and (len(line) < 400):
            print("  " + line, flush=True)
    p.wait()
    if LOG is not None:
        LOG.flush()
    if p.returncode != 0 and check:
        say(f"!! failed with exit code {p.returncode}")
    return p.returncode


def capture(cmd, **kw) -> str:
    try:
        return subprocess.run(cmd, capture_output=True, text=True, errors="replace", timeout=kw.pop("timeout", 60), **kw).stdout.strip()
    except Exception:  # noqa: BLE001
        return ""


# ----------------------------------------------------------------------------- finding things
def find_repo(arg: str) -> Path:
    cands = [arg, os.environ.get("FAELYX_HUNYUAN_REPO", ""), str(HERE / "Hunyuan3D-2.1"), str(HERE.parent.parent / "Hunyuan3D-2.1"),
             str(HERE.parent.parent.parent / "Hunyuan3D-2.1"), str(Path.home() / "Downloads" / "Hunyuan3D-2.1"),
             str(Path.home() / "Hunyuan3D-2.1"), str(Path.home() / "Documents" / "Hunyuan3D-2.1"), "C:\\Hunyuan3D-2.1", "D:\\Hunyuan3D-2.1"]
    for c in cands:
        if c and (Path(c) / "hy3dshape").is_dir() and (Path(c) / "hy3dpaint").is_dir():
            return Path(c).resolve()
    say("Could not find the Hunyuan3D-2.1 folder. Clone it first:")
    say("    git clone https://github.com/Tencent-Hunyuan/Hunyuan3D-2.1.git")
    say("and run this again, or point to it:  python setup_hunyuan3d.py --repo <folder>")
    sys.exit(2)


def env_python() -> Path:
    return HOME / "env" / ("python.exe" if IS_WIN else "bin/python")


def py_version(py: Path):
    out = capture([str(py), "-c", "import sys;print('%d.%d'%sys.version_info[:2])"])
    return out or None


def find_conda() -> str:
    cands = [os.environ.get("CONDA_EXE", ""), shutil.which("conda") or ""]
    home = Path.home()
    for root in ("anaconda3", "miniconda3", "Anaconda3", "Miniconda3", "miniforge3", "mambaforge"):
        cands += [str(home / root / "Scripts" / "conda.exe"), str(home / root / "bin" / "conda"),
                  str(Path(os.environ.get("ProgramData", "C:\\ProgramData")) / root / "Scripts" / "conda.exe"),
                  str(Path(os.environ.get("LOCALAPPDATA", "")) / root / "Scripts" / "conda.exe")]
    for c in cands:
        if c and Path(c).is_file() and not c.lower().endswith(".bat"):
            return c
    return ""


def make_env(given: str) -> Path:
    py = env_python()
    if py.is_file() and py_version(py) == "3.10":
        say(f"Reusing the existing environment: {py}")
        return py
    if given:
        if py_version(Path(given)) != "3.10":
            say(f"{given} is not Python 3.10 (Hunyuan3D 2.1 is tested on 3.10).")
            sys.exit(3)
        run([given, "-m", "venv", str(HOME / "env")])
        return env_python()
    conda = find_conda()
    if conda:
        say(f"Using conda: {conda}")
        rc = run([conda, "create", "-y", "-p", str(HOME / "env"), "python=3.10", "--override-channels", "-c", "conda-forge"])
        if rc == 0 and py_version(env_python()) == "3.10":
            return env_python()
        say("conda could not create the environment; trying the Python launcher instead.")
    if IS_WIN and shutil.which("py"):
        if run(["py", "-3.10", "-m", "venv", str(HOME / "env")], check=False) == 0 and py_version(env_python()) == "3.10":
            return env_python()
    if not IS_WIN:
        # Linux (for example Google Colab, which ships a newer Python): python3.10 if present, else a standalone 3.10 through `uv`.
        p310 = shutil.which("python3.10")
        if p310 and run([p310, "-m", "venv", str(HOME / "env")], check=False) == 0 and py_version(env_python()) == "3.10":
            return env_python()
        uv = shutil.which("uv")
        if not uv:
            run([sys.executable, "-m", "pip", "install", "-q", "uv"], check=False)
            uv = shutil.which("uv") or str(Path(sys.executable).parent / "uv")
        if uv and run([uv, "venv", "--seed", "--python", "3.10", str(HOME / "env")], check=False) == 0 and py_version(env_python()) == "3.10":
            return env_python()
    say("Python 3.10 is needed for this engine and could not be found or created.")
    say("Install Miniconda (https://docs.conda.io/en/latest/miniconda.html) or Python 3.10 (python.org), then run this again.")
    sys.exit(3)


def gpu_info() -> dict:
    out = capture(["nvidia-smi", "--query-gpu=name,compute_cap,memory.total", "--format=csv,noheader,nounits"])
    if not out:
        return {}
    name, cap, mem = [x.strip() for x in out.splitlines()[0].split(",")][:3]
    try:
        return {"name": name, "cap": float(cap), "cap_text": cap, "vram_mb": int(float(mem))}
    except ValueError:
        return {"name": name}


def find_vcvars() -> str:
    vw = Path(os.environ.get("ProgramFiles(x86)", "C:\\Program Files (x86)")) / "Microsoft Visual Studio" / "Installer" / "vswhere.exe"
    if vw.is_file():
        inst = capture([str(vw), "-latest", "-products", "*", "-requires", "Microsoft.VisualStudio.Component.VC.Tools.x86.x64", "-property", "installationPath"])
        if inst:
            v = Path(inst.splitlines()[0]) / "VC" / "Auxiliary" / "Build" / "vcvars64.bat"
            if v.is_file():
                return str(v)
    for pat in ("C:\\Program Files*\\Microsoft Visual Studio\\*\\*\\VC\\Auxiliary\\Build\\vcvars64.bat",):
        hits = sorted(glob.glob(pat))
        if hits:
            return hits[-1]
    return ""


def find_cuda() -> tuple:
    """(CUDA_HOME, 'major.minor') of the toolkit to build with, or ('', '')."""
    cands = []
    for k in ("CUDA_HOME", "CUDA_PATH"):
        if os.environ.get(k):
            cands.append(os.environ[k])
    cands += sorted(glob.glob("C:\\Program Files\\NVIDIA GPU Computing Toolkit\\CUDA\\v12.*"), reverse=True) if IS_WIN else ["/usr/local/cuda"]
    nvcc_name = "nvcc.exe" if IS_WIN else "nvcc"
    for c in cands:
        n = Path(c) / "bin" / nvcc_name
        if n.is_file():
            m = re.search(r"release (\d+\.\d+)", capture([str(n), "--version"]))
            if m:
                return c, m.group(1)
    return "", ""


# ----------------------------------------------------------------------------- pip
def pip(py: Path, *args, check=True) -> int:
    return run([str(py), "-m", "pip", *args], check=check)


def parse_requirements(repo: Path) -> list:
    out = []
    for raw in (repo / "requirements.txt").read_text(encoding="utf-8", errors="replace").splitlines():
        line = raw.split("#", 1)[0].strip()
        if not line or line.startswith("-"):
            continue
        name = re.split(r"[=<>!~\[ ;]", line, 1)[0].lower().replace("_", "-")
        if name in {s.lower().replace("_", "-") for s in SKIP}:
            continue
        out.append(line)
    return out


def install_requirements(py: Path, reqs: list) -> list:
    """Installs the list in one go; if that fails, one by one. Returns the lines that could not be installed."""
    tmp = Path(tempfile.gettempdir()) / "faelyx_hy_requirements.txt"
    tmp.write_text("\n".join(reqs) + "\n", encoding="utf-8")
    if pip(py, "install", "-r", str(tmp), check=False) == 0:
        return []
    say("One of the packages did not install together with the others; trying them one at a time…")
    failed = []
    for r in reqs:
        if pip(py, "install", r, check=False) != 0:
            failed.append(r)
    return failed


# ----------------------------------------------------------------------------- native builds (colour stage)
def linux_build_env(cuda_home: str, cap: str) -> dict:
    env = dict(os.environ)
    env["FORCE_CUDA"] = "1"
    env.setdefault("MAX_JOBS", "2")
    if cuda_home:
        env["CUDA_HOME"] = cuda_home
        env["PATH"] = f"{cuda_home}/bin:" + env.get("PATH", "")
    if cap:
        env["TORCH_CUDA_ARCH_LIST"] = cap
    return env


def build_env_bat(vcvars: str, cuda_home: str, cap: str, body: str, cwd: Path) -> int:
    lines = ["@echo off", f'call "{vcvars}" >nul', "if errorlevel 1 exit /b 1", "set DISTUTILS_USE_SDK=1", "set MSSdk=1",
             "set NVCC_APPEND_FLAGS=-allow-unsupported-compiler", "set FORCE_CUDA=1"]
    if cuda_home:
        lines += [f'set "CUDA_HOME={cuda_home}"', f'set "CUDA_PATH={cuda_home}"', f'set "PATH={cuda_home}\\bin;%PATH%"']
    if cap:
        lines.append(f"set TORCH_CUDA_ARCH_LIST={cap}")
    lines += [body, "exit /b %errorlevel%"]
    bat = Path(tempfile.gettempdir()) / "faelyx_hy_build.bat"
    bat.write_text("\r\n".join(lines) + "\r\n", encoding="utf-8")
    return run(["cmd", "/d", "/c", str(bat)], cwd=str(cwd), check=False)


def build_texture_modules(py: Path, repo: Path, gpu: dict, cuda_home: str, vcvars: str) -> dict:
    res = {"rasterizer": False, "inpaint": False, "notes": []}
    cap = gpu.get("cap_text", "") if gpu else ""
    if IS_WIN:
        if not vcvars:
            res["notes"].append("Visual Studio Build Tools with the “Desktop development with C++” workload were not found.")
            return res
        if not cuda_home:
            res["notes"].append("The CUDA Toolkit (nvcc) was not found — install CUDA Toolkit 12.4 (12.x works).")
            return res
    # --- custom_rasterizer (CUDA)
    rdir = repo / "hy3dpaint" / "custom_rasterizer"
    if IS_WIN:
        rc = build_env_bat(vcvars, cuda_home, cap, f'"{py}" -m pip install --no-build-isolation -e .', rdir)
    else:
        if not cuda_home:
            res["notes"].append("The CUDA Toolkit (nvcc) was not found — the colour stage needs it to build custom_rasterizer.")
            return res
        rc = run([str(py), "-m", "pip", "install", "--no-build-isolation", "-e", "."], cwd=str(rdir), env=linux_build_env(cuda_home, cap), check=False)
    res["rasterizer"] = rc == 0
    if rc != 0:
        res["notes"].append("custom_rasterizer did not build (see the log above). The usual causes: nvcc and PyTorch use different CUDA major versions, or the Visual Studio version is newer than the CUDA Toolkit supports.")
    # --- mesh_inpaint_processor (C++ / pybind11)
    ddir = repo / "hy3dpaint" / "DifferentiableRenderer"
    setup_py = ddir / "faelyx_build_inpaint.py"
    setup_py.write_text(
        "from setuptools import setup\nfrom pybind11.setup_helpers import Pybind11Extension, build_ext\n"
        "setup(name='mesh_inpaint_processor', ext_modules=[Pybind11Extension('mesh_inpaint_processor', ['mesh_inpaint_processor.cpp'], cxx_std=14)],\n"
        "      cmdclass={'build_ext': build_ext}, script_args=['build_ext', '--inplace'])\n", encoding="utf-8")
    if IS_WIN:
        rc = build_env_bat(vcvars, cuda_home, cap, f'"{py}" faelyx_build_inpaint.py', ddir)
    else:
        rc = run([str(py), "faelyx_build_inpaint.py"], cwd=str(ddir), env=linux_build_env(cuda_home, cap), check=False)
    res["inpaint"] = rc == 0
    if rc != 0:
        res["notes"].append("mesh_inpaint_processor did not build (see the log above).")
    return res


def download_file(url: str, dest: Path) -> bool:
    if dest.is_file() and dest.stat().st_size > 10_000_000:
        say(f"{dest.name} is already there.")
        return True
    dest.parent.mkdir(parents=True, exist_ok=True)
    say(f"Downloading {dest.name} (64 MB)…")
    try:
        tmp = dest.with_suffix(".part")
        urllib.request.urlretrieve(url, tmp)
        tmp.replace(dest)
        return True
    except Exception as e:  # noqa: BLE001
        say(f"Could not download {url}: {e}")
        return False


# ----------------------------------------------------------------------------- main
def main() -> int:
    global LOG
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--repo", default="")
    ap.add_argument("--python", default="", help="an existing Python 3.10 to build the environment from")
    ap.add_argument("--shape-only", action="store_true")
    ap.add_argument("--install-prereqs", action="store_true")
    ap.add_argument("--check", action="store_true")
    ap.add_argument("--torch", choices=["cu124", "cu128"], default="")
    a = ap.parse_args()

    (HOME / "logs").mkdir(parents=True, exist_ok=True)
    LOG = open(HOME / "logs" / "setup.log", "a", encoding="utf-8")
    say(f"=== faelyx.AI Hunyuan3D 2.1 setup — {time.strftime('%Y-%m-%d %H:%M:%S')} ===")
    repo = find_repo(a.repo)
    say(f"Hunyuan3D-2.1 folder: {repo}")
    gpu = gpu_info()
    if gpu:
        say(f"GPU: {gpu.get('name')} · compute capability {gpu.get('cap_text', '?')} · {round(gpu.get('vram_mb', 0) / 1024, 1)} GB")
    else:
        say("No NVIDIA GPU was reported by nvidia-smi. Hunyuan3D 2.1 needs one; the setup continues so you can fix the driver and re-run --check.")
    total = 6

    if a.check:
        py = env_python()
        if not py.is_file():
            say("There is no environment yet — run this without --check first.")
            return 1
    else:
        step(1, total, "Python 3.10 environment")
        py = make_env(a.python)
        say(f"Python: {py}")

        step(2, total, "PyTorch")
        tv = TORCH_BLACKWELL if (a.torch == "cu128" or (not a.torch and gpu.get("cap", 0) >= 12.0)) else TORCH_STABLE
        have = capture([str(py), "-c", "import torch;print(torch.__version__)"])
        if have.startswith(tv["torch"]) and tv["tag"] in have:
            say(f"PyTorch {have} is already installed.")
        else:
            pip(py, "install", "-U", "pip", "wheel", "setuptools<70")
            if pip(py, "install", f"torch=={tv['torch']}", f"torchvision=={tv['vision']}", f"torchaudio=={tv['audio']}", "--index-url", tv["index"], check=False) != 0:
                say("PyTorch did not install. Check the internet connection and run this again.")
                return 4

        step(3, total, "Hunyuan3D requirements (shape stage)")
        reqs = parse_requirements(repo) + CORE_EXTRA
        failed = install_requirements(py, reqs)
        # accelerate/diffusers/transformers must stay at the tested versions even if something upgraded them
        if failed:
            say("Not installed: " + ", ".join(failed))
        core_failed = [f for f in failed if re.split(r"[=<>!~\[ ;]", f, 1)[0].lower() in
                       {"transformers", "diffusers", "accelerate", "safetensors", "numpy", "scipy", "trimesh", "einops", "omegaconf", "pymeshlab", "rembg",
                        "huggingface-hub", "huggingface_hub", "scikit-image", "xatlas", "onnxruntime", "opencv-python", "pyyaml"}]
        if core_failed:
            say("These are needed for the shape stage and did not install: " + ", ".join(core_failed))
            say("The log has the reason (hunyuan3d_runtime\\logs\\setup.log). Fix it and run this again.")
            return 5

        step(4, total, "Colour-stage packages (optional)")
        tex_notes = []
        if a.shape_only:
            say("Skipped (--shape-only).")
        else:
            if pip(py, "install", "bpy==4.0.0", check=False) != 0:
                tex_notes.append("bpy 4.0 (Blender as a module) did not install — it is needed to write the textured GLB.")
            pip(py, "install", "lmdb", "addict", "yapf", "future", "tqdm", check=False)
            if pip(py, "install", "--no-deps", "--no-build-isolation", "basicsr==1.4.2", "realesrgan==0.3.0", check=False) != 0:
                tex_notes.append("basicsr / realesrgan did not install — they are needed for texture sharpening.")

        step(5, total, "Colour-stage native modules (optional)")
        vcvars = find_vcvars() if IS_WIN else ""
        cuda_home, cuda_ver = find_cuda()
        if IS_WIN and a.install_prereqs and not a.shape_only:
            if not vcvars and shutil.which("winget"):
                say("Installing Visual Studio 2022 Build Tools with winget (a Windows permission prompt will appear; ~3-6 GB)…")
                run(["winget", "install", "-e", "--id", "Microsoft.VisualStudio.2022.BuildTools", "--override",
                     "--wait --passive --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"], check=False)
                vcvars = find_vcvars()
            if not cuda_home and shutil.which("winget"):
                say("Installing the NVIDIA CUDA Toolkit with winget (a Windows permission prompt will appear; ~3 GB)…")
                run(["winget", "install", "-e", "--id", "Nvidia.CUDA", "--version", "12.4"], check=False)
                cuda_home, cuda_ver = find_cuda()
        if a.shape_only:
            say("Skipped (--shape-only).")
            built = {"rasterizer": False, "inpaint": False, "notes": []}
        else:
            say(f"Visual Studio C++ tools: {vcvars or 'not found'}")
            say(f"CUDA Toolkit: {cuda_home + ' (' + cuda_ver + ')' if cuda_home else 'not found'}")
            built = build_texture_modules(py, repo, gpu, cuda_home, vcvars)
            tex_notes += built["notes"]
            download_file(REALESRGAN_URL, repo / "hy3dpaint" / "ckpt" / "RealESRGAN_x4plus.pth")

    step(6, total, "Checking everything")
    worker = HERE / "hunyuan3d_worker" / "worker.py"
    probe = {}
    try:
        probe = json.loads(capture([str(py), str(worker), "probe"], timeout=180) or "{}")
    except json.JSONDecodeError:
        pass
    selft = {}
    try:
        selft = json.loads(capture([str(py), str(worker), "selftest", "--repo", str(repo), "--home", str(HOME)], timeout=900).splitlines()[-1])
    except (json.JSONDecodeError, IndexError):
        selft = {"shape": {"ok": False, "error": "the self-test produced no result"}, "texture": {"ok": False, "missing": [], "error": None}}
    shape_ok = bool(selft["shape"]["ok"])
    tex_ok = bool(selft["texture"]["ok"])
    cfg = {"version": 1, "python": str(py), "repo": str(repo), "home": str(HOME), "setup_time": time.time(),
           "torch": probe.get("torch"), "cuda": bool(probe.get("cuda")), "gpu": probe.get("gpu") or gpu.get("name"), "vram_gb": probe.get("vram_gb"),
           "compute_capability": probe.get("compute_capability"), "ram_gb": probe.get("ram_gb"),
           "shape_ok": shape_ok, "shape_error": selft["shape"].get("error"),
           "texture_ok": tex_ok, "texture_missing": selft["texture"].get("missing", []) + ([selft["texture"]["error"]] if selft["texture"].get("error") else [])}
    (HOME).mkdir(parents=True, exist_ok=True)
    (HOME / "config.json").write_text(json.dumps(cfg, indent=2), encoding="utf-8")

    say()
    say("=" * 72)
    say(f"Shape stage (clean 3D mesh):  {'READY' if shape_ok else 'NOT READY — ' + str(cfg['shape_error'])}")
    say(f"Colour stage (texture):       {'READY' if tex_ok else 'not available'}")
    if not tex_ok:
        for m in cfg["texture_missing"]:
            say(f"   - {m}")
        say("   (Image to 3D still works without it and makes uncoloured models. See IMAGE_TO_3D.md for what to install.)")
    if probe.get("ram_gb") and probe["ram_gb"] < 23:
        say(f"Note: this PC has {probe['ram_gb']} GB of RAM. Loading the shape model peaks at roughly 20 GB, so Windows will use the page file — it works, but slowly.")
    if probe.get("vram_gb") and probe["vram_gb"] < 8:
        say(f"Note: {probe['vram_gb']} GB of video memory is below what Tencent lists; the engine will use its slow low-memory mode.")
    if os.environ.get("FAELYX_COLAB"):
        say("Next: run the notebook's next cells (download the model files, then start the server).")
    else:
        say("Next: restart the Faelyx backend, open Image to 3D, choose “Hunyuan3D 2.1”, press “Download model files” (one time, large).")
    return 0 if shape_ok else 6


if __name__ == "__main__":
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        print("\nStopped.")
        sys.exit(130)

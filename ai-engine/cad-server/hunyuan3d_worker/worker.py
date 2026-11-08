"""faelyx.AI — Hunyuan3D 2.1 worker.

Copyright (c) 2026 faelyx.AI (the glue code in this file). Hunyuan3D 2.1 itself is
"Tencent Hunyuan 3D 2.1 is licensed under the Tencent Hunyuan 3D 2.1 Community License Agreement,
Copyright (c) 2025 Tencent. All Rights Reserved. The trademark rights of Tencent Hunyuan are owned by
Tencent or its affiliate." — see NOTICE-hunyuan3d.txt. faelyx.AI is not affiliated with, sponsored or
endorsed by Tencent.

This script runs in its OWN Python 3.10 environment (made by setup_hunyuan3d.py), never inside the CAD
server's environment, because Hunyuan3D 2.1 is tested on Python 3.10 / PyTorch 2.5.1 while the CAD server
may run a newer Python. image_to_3d.py / hunyuan3d.py start it as a child process and read its
status.json, so a crash, an out-of-memory error or a Stop press never takes the CAD server down and the GPU
memory is given back the moment the process ends.

Commands
  probe     print JSON about torch / the GPU / the RAM                       (used by the installer)
  selftest  print JSON: can the shape and texture stages be imported?        (used by the installer)
  download  fetch the model weights from Hugging Face with a progress file   (used by the Faelyx backend)
  run       make one model from <job>/input.png according to <job>/job.json

Memory modes for "run" (shape stage; chosen automatically from the free VRAM unless the job asks for one)
  full      everything on the GPU                                  about 10-13 GB free
  balanced  one network at a time on the GPU (accelerate hooks)    about 9 GB free
  low       the 3.3B shape transformer is streamed layer by layer from system RAM; only the small parts stay
            on the GPU. Slow, but runs in a few GB of VRAM. If one mode runs out of memory the next lower one is tried.
The colour (texture) stage is optional and "best effort": if it cannot run, the plain shape is returned
and the reason is written to result.json.
"""
import argparse
import gc
import json
import os
import sys
import time
import traceback
from pathlib import Path

HERE = Path(__file__).resolve().parent
if str(HERE) not in sys.path:
    sys.path.insert(0, str(HERE))                    # faelyx_polish.py lives next to this file


# ----------------------------------------------------------------------------- small helpers
def _write_json(path: Path, data: dict) -> None:
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(data), encoding="utf-8")
    os.replace(tmp, path)


class Status:
    """status.json — read by the Faelyx backend every half second."""

    def __init__(self, job_dir: Path):
        self.path = job_dir / "status.json"
        self.t0 = time.time()
        self.data = {"state": "running", "pct": 0.0, "message": "Starting…", "stage": "start", "mode": "", "error": None}

    def update(self, pct=None, message=None, stage=None, **extra):
        if pct is not None:
            self.data["pct"] = round(float(pct), 1)
        if message is not None:
            self.data["message"] = message
        if stage is not None:
            self.data["stage"] = stage
        self.data.update(extra)
        self.data["elapsed"] = round(time.time() - self.t0, 1)
        try:
            _write_json(self.path, self.data)
        except OSError:
            pass


def _setup_paths(repo: Path) -> None:
    for p in (repo, repo / "hy3dshape", repo / "hy3dpaint"):
        s = str(p)
        if s not in sys.path:
            sys.path.insert(0, s)


def _apply_env(home: Path) -> None:
    """Keep every download inside the Faelyx runtime folder."""
    os.environ.setdefault("HF_HOME", str(home / "hf"))
    os.environ.setdefault("HF_HUB_CACHE", str(home / "hf" / "hub"))
    os.environ.setdefault("HY3DGEN_MODELS", str(home / "models"))
    os.environ.setdefault("HF_HUB_DISABLE_SYMLINKS_WARNING", "1")
    os.environ.setdefault("PYTORCH_CUDA_ALLOC_CONF", "expandable_segments:True")
    os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")


def _torch_fix(repo: Path) -> None:
    try:
        from torchvision_fix import apply_fix      # repo/torchvision_fix.py — basicsr needs torchvision.transforms.functional_tensor
        apply_fix()
    except Exception as e:  # noqa: BLE001
        print(f"[faelyx] torchvision fix not applied: {e}", file=sys.stderr)


def _free_gpu():
    gc.collect()
    try:
        import torch
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
    except Exception:  # noqa: BLE001
        pass


def _is_oom(e: BaseException) -> bool:
    t = f"{type(e).__name__} {e}".lower()
    return "out of memory" in t or "outofmemory" in t or "cuda error: out" in t or ("cublas" in t and "alloc" in t)


# ----------------------------------------------------------------------------- probe / selftest
def cmd_probe(_a) -> int:
    info = {"python": sys.version.split()[0], "torch": None, "cuda": False, "gpu": None, "vram_gb": None, "free_gb": None,
            "compute_capability": None, "ram_gb": None, "error": None}
    try:
        import torch
        info["torch"] = str(torch.__version__)
        info["cuda_build"] = str(torch.version.cuda)
        if torch.cuda.is_available():
            p = torch.cuda.get_device_properties(0)
            free, total = torch.cuda.mem_get_info()
            info.update(cuda=True, gpu=p.name, vram_gb=round(total / 1024 ** 3, 1), free_gb=round(free / 1024 ** 3, 1),
                        compute_capability=f"{p.major}.{p.minor}")
    except Exception as e:  # noqa: BLE001
        info["error"] = f"{type(e).__name__}: {e}"
    try:
        import psutil
        info["ram_gb"] = round(psutil.virtual_memory().total / 1024 ** 3, 1)
    except Exception:  # noqa: BLE001
        pass
    print(json.dumps(info))
    return 0


def cmd_selftest(a) -> int:
    repo = Path(a.repo)
    _setup_paths(repo)
    _apply_env(Path(a.home))
    out = {"shape": {"ok": False, "error": None}, "texture": {"ok": False, "error": None, "missing": []}}
    try:
        from hy3dshape.pipelines import Hunyuan3DDiTFlowMatchingPipeline  # noqa: F401
        import trimesh, scipy, skimage, rembg  # noqa: F401,E401
        out["shape"]["ok"] = True
    except Exception as e:  # noqa: BLE001
        out["shape"]["error"] = f"{type(e).__name__}: {e}"
    missing = out["texture"]["missing"]
    try:
        _torch_fix(repo)
        for mod in ("custom_rasterizer", "bpy", "xatlas", "pymeshlab", "realesrgan", "basicsr", "cv2", "rtree"):
            try:
                __import__(mod)
            except Exception as e:  # noqa: BLE001
                missing.append(f"{mod} ({type(e).__name__}: {str(e)[:120]})")
        try:
            sys.path.insert(0, str(repo / "hy3dpaint" / "DifferentiableRenderer"))
            import mesh_inpaint_processor  # noqa: F401
        except Exception as e:  # noqa: BLE001
            missing.append(f"mesh_inpaint_processor ({type(e).__name__}: {str(e)[:120]})")
        if not (repo / "hy3dpaint" / "ckpt" / "RealESRGAN_x4plus.pth").is_file():
            missing.append("RealESRGAN_x4plus.pth (not downloaded)")
        if not (repo / "hy3dpaint" / "hunyuanpaintpbr").is_dir():
            missing.append("hy3dpaint/hunyuanpaintpbr (folder not in the repository clone)")
        if not missing:
            from textureGenPipeline import Hunyuan3DPaintPipeline, Hunyuan3DPaintConfig  # noqa: F401
            out["texture"]["ok"] = True
    except Exception as e:  # noqa: BLE001
        out["texture"]["error"] = f"{type(e).__name__}: {e}"
    print(json.dumps(out))
    return 0


# ----------------------------------------------------------------------------- download
def cmd_download(a) -> int:
    home = Path(a.home)
    _apply_env(home)
    sf = home / "weights_state.json"
    state = {"state": "running", "total": 0, "error": None, "stage": "listing"}
    _write_json(sf, state)
    try:
        from huggingface_hub import HfApi, snapshot_download
        repo_id = "tencent/Hunyuan3D-2.1"
        api = HfApi()
        info = api.model_info(repo_id, files_metadata=True)
        sizes = {s.rfilename: (s.size or 0) for s in info.siblings}
        dit = [n for n in sizes if n.startswith("hunyuan3d-dit-v2-1/")]
        keep_dit = [n for n in dit if n.endswith("config.yaml") or n.endswith("model.fp16.ckpt")]
        if not any(n.endswith("model.fp16.ckpt") for n in keep_dit):
            keep_dit = dit                                          # file names differ from what the code expects: take the folder
        paint = [n for n in sizes if n.startswith("hunyuan3d-paintpbr-v2-1/")]
        want_texture = a.texture
        total = sum(sizes[n] for n in keep_dit) + (sum(sizes[n] for n in paint) if want_texture else 0)
        dino_patterns = ["*.json", "model.safetensors"]
        if want_texture:
            try:
                di = api.model_info("facebook/dinov2-giant", files_metadata=True)
                total += sum((s.size or 0) for s in di.siblings if s.rfilename.endswith(".json") or s.rfilename == "model.safetensors")
            except Exception:  # noqa: BLE001
                pass
        state.update(total=int(total), stage="shape")
        _write_json(sf, state)

        models = home / "models" / "tencent" / "Hunyuan3D-2.1"
        snapshot_download(repo_id=repo_id, allow_patterns=keep_dit, local_dir=str(models))
        if want_texture:
            state.update(stage="texture")
            _write_json(sf, state)
            snapshot_download(repo_id=repo_id, allow_patterns=["hunyuan3d-paintpbr-v2-1/*"])
            state.update(stage="dino")
            _write_json(sf, state)
            snapshot_download(repo_id="facebook/dinov2-giant", allow_patterns=dino_patterns)
        _write_json(home / "weights_ok.json", {"texture": bool(want_texture), "time": time.time(), "shape_files": keep_dit})
        state.update(state="done", stage="done")
        _write_json(sf, state)
        return 0
    except BaseException as e:  # noqa: BLE001
        traceback.print_exc()
        state.update(state="error", error=f"{type(e).__name__}: {e}")
        _write_json(sf, state)
        return 1


# ----------------------------------------------------------------------------- the model run
def _pick_mode(requested: str, torch) -> str:
    if not torch.cuda.is_available():
        raise RuntimeError("Hunyuan3D 2.1 needs an NVIDIA GPU with CUDA. None was found by PyTorch in the Hunyuan environment.")
    free_gb = torch.cuda.mem_get_info()[0] / 1024 ** 3
    if requested in ("full", "balanced", "low"):
        return requested
    return "full" if free_gb >= 13 else "balanced" if free_gb >= 9 else "low"


MODES = ["full", "balanced", "low"]
CHUNKS = {"full": 200000, "balanced": 60000, "low": 16000}


def _rss_gb() -> float:
    try:
        import psutil
        return round(psutil.Process().memory_info().rss / 1024 ** 3, 1)
    except Exception:  # noqa: BLE001
        return 0.0


_NOOP_INITS = ("uniform_", "normal_", "trunc_normal_", "constant_", "ones_", "zeros_", "xavier_uniform_", "xavier_normal_",
               "kaiming_uniform_", "kaiming_normal_", "orthogonal_", "eye_", "dirac_", "sparse_")


def _lean_loading(torch, log):
    """Context manager that makes Tencent's Hunyuan3DDiTPipeline.from_pretrained use about 8 GB of RAM instead of about 21 GB.

    Tencent's loader reads the whole 7.4 GB checkpoint into RAM (torch.load) AND builds the 3.3B-parameter transformer in float32
    (13 GB) before it is cut down to float16 — a peak of ~21 GB, which is more than a 16 GB PC (or a free Colab machine, 12.7 GB) has, so
    the operating system ends the process during loading. Here (1) the checkpoint is memory-mapped, so it is read from the disk as needed
    instead of being copied into RAM, and (2) the transformer is built directly in float16 with the random weight initialisation switched off
    (every weight is overwritten by the checkpoint right after; the loader checks that none is missing). The result is the same float16
    model the original path ends with. If anything in this shortcut is not supported, the original loader runs unchanged."""
    import contextlib
    import hy3dshape.pipelines as pl

    @contextlib.contextmanager
    def ctx():
        orig_load, orig_inst = torch.load, pl.instantiate_from_config
        saved_inits = {n: getattr(torch.nn.init, n, None) for n in _NOOP_INITS}

        def load(*a, **k):
            if k.get("weights_only") and "mmap" not in k:
                try:
                    return orig_load(*a, **dict(k, mmap=True))
                except Exception as e:  # noqa: BLE001
                    log(f"memory-mapped checkpoint loading is not available ({type(e).__name__}: {e}); reading it normally")
            return orig_load(*a, **k)

        def inst(config, **kw):
            if "denoisers" not in str(config.get("target", "")):          # only the big transformer; the VAE and the image encoder are small
                return orig_inst(config, **kw)
            old_dtype = torch.get_default_dtype()
            try:
                torch.set_default_dtype(torch.float16)
                for n in _NOOP_INITS:
                    if saved_inits[n] is not None:
                        setattr(torch.nn.init, n, lambda t, *aa, **kk: t)
                return orig_inst(config, **kw)
            finally:
                torch.set_default_dtype(old_dtype)
                for n, f in saved_inits.items():
                    if f is not None:
                        setattr(torch.nn.init, n, f)

        torch.load, pl.instantiate_from_config = load, inst
        try:
            yield
        finally:
            torch.load, pl.instantiate_from_config = orig_load, orig_inst
    return ctx()


def _load_shape(mode: str, torch, border=None, log=print):
    """Hunyuan3DDiTFlowMatchingPipeline placed for `mode`."""
    from hy3dshape.pipelines import Hunyuan3DDiTFlowMatchingPipeline
    kw = dict(subfolder="hunyuan3d-dit-v2-1", use_safetensors=False, device="cpu", dtype=torch.float16)
    try:
        with _lean_loading(torch, log):
            pipe = Hunyuan3DDiTFlowMatchingPipeline.from_pretrained("tencent/Hunyuan3D-2.1", **kw)
        log(f"shape model loaded (lean loader), process memory {_rss_gb()} GB")
    except MemoryError:
        raise
    except Exception as e:  # noqa: BLE001
        log(f"lean loader failed ({type(e).__name__}: {e}); using Tencent's loader")
        _free_gpu()
        pipe = Hunyuan3DDiTFlowMatchingPipeline.from_pretrained("tencent/Hunyuan3D-2.1", **kw)
    if border is not None:                                       # "Object size": how much empty border Hunyuan leaves around the object
        try:
            pipe.image_processor.border_ratio = min(0.5, max(0.0, float(border)))
        except Exception:  # noqa: BLE001
            pass
    cuda = torch.device("cuda")
    if mode == "full":
        pipe.to(cuda)
    else:
        from accelerate import cpu_offload, cpu_offload_with_hook
        if mode == "balanced":
            hook = None
            for module in (pipe.conditioner, pipe.model, pipe.vae):
                _, hook = cpu_offload_with_hook(module, cuda, prev_module_hook=hook)
        else:                                                     # low: stream the big transformer, keep the small parts resident
            pipe.conditioner.to(cuda)
            pipe.vae.to(cuda)
            cpu_offload(pipe.model, execution_device=cuda, offload_buffers=True)
        pipe.device = cuda                                        # latents and samples are made on the GPU
    return pipe


def _shape_stage(job: dict, img, st: Status, torch, log):
    """Returns (trimesh, mode_used, info). `info` has the clean-up report and, when several variants were made, their scores."""
    requested = job.get("mode", "auto")
    mode = _pick_mode(requested, torch)
    order = MODES[MODES.index(mode):]
    last = None
    variants = max(1, min(4, int(job.get("variants", 1) or 1)))
    level = str(job.get("polish", "standard"))
    flat_base = bool(job.get("flat_base", False))
    try:
        import numpy as np
        alpha = np.asarray(img.getchannel("A"))
    except Exception:  # noqa: BLE001
        alpha = None
    for m in order:
        pipe = None
        try:
            st.update(8, f"Loading the Hunyuan3D shape model ({m} memory mode) — the first load reads about 7 GB from disk…", "load", mode=m)
            pipe = _load_shape(m, torch, job.get("border"), log)
            polisher = None
            if level != "off":
                try:
                    from faelyx_polish import install_polish
                    polisher = install_polish(pipe.vae, level, flat_base, log)
                except Exception as e:  # noqa: BLE001 — the clean-up is optional
                    log(f"surface clean-up unavailable ({type(e).__name__}: {e})")
            steps = int(job.get("steps", 50))
            octree = int(job.get("octree", 384))
            chunk = CHUNKS[m]
            ladder = [(octree, chunk), (octree, max(2000, chunk // 4)), (min(octree, 384), max(2000, chunk // 8)), (min(octree, 256), 2000)]
            results = []                                          # (score, seed, mesh, report)
            for k in range(variants):
                seed = int(job.get("seed", 1234)) + k
                gen = torch.Generator("cpu").manual_seed(seed)
                tag = f" — variant {k + 1} of {variants}" if variants > 1 else ""
                lo, span = 14 + 70 * k / variants, 70 / variants

                def on_step(i, t, outputs, lo=lo, span=span, tag=tag):
                    st.update(lo + 0.8 * span * (i + 1) / max(1, steps), f"Shaping the model — step {i + 1} of {steps} ({m} memory mode){tag}", "shape")

                st.update(lo, f"Shaping the model — step 0 of {steps} ({m} memory mode){tag}", "shape")
                with torch.inference_mode():
                    latents = pipe(image=img, num_inference_steps=steps, guidance_scale=float(job.get("guidance", 5.0)), generator=gen,
                                   output_type="latent", enable_pbar=False, callback=on_step, callback_steps=1)
                mesh = None
                for oct_res, chunks in ladder:
                    try:
                        st.update(lo + 0.82 * span, f"Extracting and cleaning the surface (grid {oct_res}³){tag}…", "mesh")
                        with torch.inference_mode():
                            out = pipe._export(latents, "trimesh", box_v=1.01, mc_level=0.0, num_chunks=chunks, octree_resolution=oct_res, mc_algo=None, enable_pbar=False)
                        mesh = out[0]
                        break
                    except Exception as e:  # noqa: BLE001
                        if not _is_oom(e):
                            raise
                        log(f"surface extraction ran out of memory at grid {oct_res}, chunk {chunks}; trying a smaller setting")
                        _free_gpu()
                if mesh is None:
                    raise MemoryError("CUDA out of memory while extracting the surface, even at the smallest setting.")
                rep = dict(polisher.report) if polisher is not None else {}
                score = 0.0
                if variants > 1 and alpha is not None and rep.get("silhouettes"):
                    try:
                        from faelyx_polish import silhouette_score
                        score = silhouette_score(rep["silhouettes"], alpha)
                    except Exception as e:  # noqa: BLE001
                        log(f"could not score variant {k + 1}: {e}")
                log(f"variant {k + 1}/{variants}: seed {seed}, {len(mesh.faces):,} triangles" + (f", outline match {score:.3f}" if variants > 1 else ""))
                results.append((score, seed, mesh, rep))
                del latents
                _free_gpu()
            del pipe
            _free_gpu()
            best = max(range(len(results)), key=lambda i: (results[i][0], -i))
            score, seed, mesh, rep = results[best]
            info = {"seed": seed, "variants": variants, "scores": [round(r[0], 4) for r in results], "chosen": best + 1}
            try:
                from faelyx_polish import summary
                info["polish_note"] = summary(rep)
            except Exception:  # noqa: BLE001
                info["polish_note"] = ""
            return mesh, m, info
        except Exception as e:  # noqa: BLE001
            last = e
            pipe = None
            _free_gpu()
            if not _is_oom(e):
                raise
            log(f"out of memory in {m} mode: {e}")
    raise MemoryError(f"The GPU ran out of memory in every mode, down to the lowest ({last}). Close other GPU programs, or lower the surface detail.")


def _save_npz(path: Path, verts, faces, colors=None):
    import numpy as np
    np.savez(path, verts=np.asarray(verts, dtype=np.float32), faces=np.asarray(faces, dtype=np.int32),
             colors=np.zeros((0, 3), np.uint8) if colors is None else np.asarray(colors, dtype=np.uint8))


def _sample_texture(tex_mesh, points):
    """Colour for `points` (N,3) by projecting them on tex_mesh's surface and reading its UV texture."""
    import numpy as np
    import trimesh
    mat = tex_mesh.visual.material
    img = getattr(mat, "baseColorTexture", None) or getattr(mat, "image", None)
    if img is None:
        raise ValueError("the textured mesh has no colour image")
    tex = np.asarray(img.convert("RGB"), dtype=np.float32)
    h, w = tex.shape[:2]
    uvs = np.asarray(tex_mesh.visual.uv)
    faces = np.asarray(tex_mesh.faces)
    out = np.zeros((len(points), 3), np.uint8)
    for s in range(0, len(points), 60000):
        p = points[s:s + 60000]
        closest, _d, tid = trimesh.proximity.closest_point(tex_mesh, p)
        bary = trimesh.triangles.points_to_barycentric(tex_mesh.triangles[tid], closest)
        uv = (uvs[faces[tid]] * bary[..., None]).sum(1)
        x = np.clip(uv[:, 0], 0, 1) * (w - 1)
        y = (1.0 - np.clip(uv[:, 1], 0, 1)) * (h - 1)
        x0, y0 = np.floor(x).astype(int), np.floor(y).astype(int)
        x1, y1 = np.minimum(x0 + 1, w - 1), np.minimum(y0 + 1, h - 1)
        fx, fy = (x - x0)[:, None], (y - y0)[:, None]
        c = (tex[y0, x0] * (1 - fx) * (1 - fy) + tex[y0, x1] * fx * (1 - fy) + tex[y1, x0] * (1 - fx) * fy + tex[y1, x1] * fx * fy)
        out[s:s + 60000] = np.clip(c + 0.5, 0, 255).astype(np.uint8)
    return out


def _texture_stage(job: dict, mesh, cutout_path: Path, job_dir: Path, repo: Path, st: Status, torch, log):
    """Returns (final_verts, final_faces, colors, textured_glb_path_or_None). Raises on failure."""
    import numpy as np
    import trimesh
    _torch_fix(repo)
    from textureGenPipeline import Hunyuan3DPaintPipeline, Hunyuan3DPaintConfig
    views = 6 if int(job.get("tex_views", 6)) <= 6 else 8
    res = 768 if int(job.get("tex_res", 512)) >= 768 else 512
    free_gb = torch.cuda.mem_get_info()[0] / 1024 ** 3
    offload = free_gb < 24
    st.update(78, "Preparing the colour stage…", "texture")
    white = job_dir / "shape_for_paint.obj"
    mesh.export(str(white))
    conf = Hunyuan3DPaintConfig(views, res)
    conf.realesrgan_ckpt_path = str(repo / "hy3dpaint" / "ckpt" / "RealESRGAN_x4plus.pth")
    conf.multiview_cfg_path = str(repo / "hy3dpaint" / "cfgs" / "hunyuan-paint-pbr.yaml")
    conf.custom_pipeline = str(repo / "hy3dpaint" / "hunyuanpaintpbr")
    if offload:
        conf.device = "cpu"                                         # load on the CPU, then let diffusers move one network at a time
    pp = Hunyuan3DPaintPipeline(conf)
    if offload:
        net = pp.models["multiview_model"]
        net.pipeline.enable_model_cpu_offload()
        if getattr(net, "dino_v2", None) is not None:
            net.dino_v2 = net.dino_v2.to("cuda")
        net.device = "cuda"
    st.update(82, f"Painting {views} views of the model ({res}px) — this is the slowest step…", "texture")
    out_obj = job_dir / "textured.obj"
    pp(mesh_path=str(white), image_path=str(cutout_path), output_mesh_path=str(out_obj), save_glb=True)   # already under torch.no_grad()
    del pp
    _free_gpu()
    glb = out_obj.with_suffix(".glb")
    src = glb if glb.is_file() else out_obj
    st.update(93, "Transferring the colours onto the full-detail model…", "texture")
    tex = trimesh.load(str(src), force="mesh", process=False)
    verts = np.asarray(mesh.vertices, dtype=np.float64)
    faces = np.asarray(mesh.faces)
    ext = float(np.max(verts.max(0) - verts.min(0))) or 1.0
    same_space = np.allclose(np.sort(tex.bounds[1] - tex.bounds[0]), np.sort(verts.max(0) - verts.min(0)), atol=0.08 * ext) \
        and np.allclose(tex.bounds.mean(0), (verts.max(0) + verts.min(0)) / 2, atol=0.08 * ext)
    if same_space:
        try:
            return verts, faces, _sample_texture(tex, verts), (glb if glb.is_file() else None)
        except Exception as e:  # noqa: BLE001
            log(f"colour transfer failed ({e}); using the colours of the painted mesh instead")
    col = np.asarray(tex.visual.to_color().vertex_colors)[:, :3]
    return np.asarray(tex.vertices, dtype=np.float64), np.asarray(tex.faces), col, (glb if glb.is_file() else None)


def _make_lods(verts, faces, colors, job_dir: Path, log):
    """Quadric-decimated copies (low / medium / high) so the viewport and exports keep the shape instead of a grid-clustered mesh."""
    import numpy as np
    caps = {"low": 20000, "medium": 60000, "high": 150000}
    made = []
    try:
        import pymeshlab
    except Exception:  # noqa: BLE001
        pymeshlab = None
    tree = None
    if colors is not None:
        from scipy.spatial import cKDTree
        tree = cKDTree(verts)
    for name, cap in caps.items():
        if len(faces) <= cap:
            continue
        try:
            if pymeshlab is None:
                raise RuntimeError("pymeshlab missing")
            ms = pymeshlab.MeshSet()
            ms.add_mesh(pymeshlab.Mesh(vertex_matrix=np.asarray(verts, dtype=np.float64), face_matrix=np.asarray(faces, dtype=np.int32)))
            ms.meshing_decimation_quadric_edge_collapse(targetfacenum=cap, qualitythr=0.5, preservenormal=True, preserveboundary=True,
                                                        optimalplacement=True, planarquadric=True, autoclean=True)
            m = ms.current_mesh()
            v, f = m.vertex_matrix(), m.face_matrix()
        except Exception as e:  # noqa: BLE001
            try:
                import trimesh
                m = trimesh.Trimesh(verts, faces, process=False).simplify_quadric_decimation(face_count=cap)
                v, f = np.asarray(m.vertices), np.asarray(m.faces)
            except Exception as e2:  # noqa: BLE001
                log(f"no {name} level of detail ({e}; {e2})")
                continue
        c = None
        if tree is not None:
            _d, idx = tree.query(v)
            c = colors[idx]
        _save_npz(job_dir / f"lod_{name}.npz", v, f, c)
        made.append(name)
    return made


def cmd_run(a) -> int:
    job_dir = Path(a.job)
    home = Path(a.home)
    repo = Path(a.repo)
    job = json.loads((job_dir / "job.json").read_text(encoding="utf-8"))
    st = Status(job_dir)
    notes = []
    log = lambda m: (print(f"[faelyx] {m}", flush=True), notes.append(m))  # noqa: E731
    try:
        _apply_env(home)
        _setup_paths(repo)
        os.chdir(repo)
        import numpy as np
        import torch
        from PIL import Image
        st.update(3, "Reading the picture…", "start")
        cutout = job_dir / "input.png"
        img = Image.open(cutout).convert("RGBA")
        t0 = time.time()
        mesh, mode, shape_info = _shape_stage(job, img, st, torch, log)
        t_shape = time.time() - t0
        verts = np.asarray(mesh.vertices, dtype=np.float64)
        faces = np.asarray(mesh.faces)
        _save_npz(job_dir / "shape.npz", verts, faces)
        st.update(75, f"Shape done: {len(faces):,} triangles.", "shape", mode=mode)

        colors, pbr_glb, texture_note, textured = None, None, "", False
        want = str(job.get("texture", "auto"))
        if want != "off":
            try:
                t1 = time.time()
                verts, faces, colors, pbr_glb = _texture_stage(job, mesh, cutout, job_dir, repo, st, torch, log)
                textured = True
                notes.append(f"texture: {time.time() - t1:.0f}s")
            except BaseException as e:  # noqa: BLE001
                traceback.print_exc()
                _free_gpu()
                texture_note = ("The colour stage ran out of GPU memory, so this is the plain shape. Try a smaller texture size, or run it on a bigger GPU."
                                if _is_oom(e) else f"The colour stage could not run ({type(e).__name__}: {str(e)[:300]}). This is the plain shape.")
        st.update(96, "Building the levels of detail…", "finish")
        lods = _make_lods(verts, faces, colors, job_dir, log)
        _save_npz(job_dir / "final.npz", verts, faces, colors)
        if pbr_glb is not None:
            os.replace(pbr_glb, job_dir / "model_pbr.glb")
        _write_json(job_dir / "result.json", {"ok": True, "textured": textured, "texture_note": texture_note, "mode": mode,
                                              "faces": int(len(faces)), "lods": lods, "pbr_glb": pbr_glb is not None,
                                              "shape_seconds": round(t_shape, 1), "seconds": round(time.time() - st.t0, 1), "notes": notes[-8:],
                                              "shape_info": shape_info})
        st.update(100, "Done", "done", state="done")
        return 0
    except BaseException as e:  # noqa: BLE001
        traceback.print_exc()
        msg = ("The GPU ran out of memory. Close other GPU programs, lower the surface detail, or choose the Low memory mode." if _is_oom(e)
               else f"{type(e).__name__}: {e}")
        st.update(message=msg, state="error", error=msg)
        return 1


def main() -> int:
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    for name in ("probe", "selftest", "download", "run"):
        p = sub.add_parser(name)
        p.add_argument("--repo", default="")
        p.add_argument("--home", default="")
        if name == "run":
            p.add_argument("--job", required=True)
        if name == "download":
            p.add_argument("--texture", type=int, default=1)
    a = ap.parse_args()
    if a.cmd == "download":
        a.texture = bool(a.texture)
    return {"probe": cmd_probe, "selftest": cmd_selftest, "download": cmd_download, "run": cmd_run}[a.cmd](a)


if __name__ == "__main__":
    sys.exit(main())

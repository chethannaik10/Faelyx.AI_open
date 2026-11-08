"""Backend tests for image_to_3d.py — no build123d, no network, no GPU:
    cd ai-engine/cad-server && python -m pytest tests/test_image_to_3d.py -q
"""
import base64
import io
import sys
import time
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import image_to_3d as i3  # noqa: E402


def _png_data_url(arr: np.ndarray, mode: str) -> str:
    from PIL import Image
    buf = io.BytesIO()
    Image.fromarray(arr, mode).save(buf, "PNG")
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()


def _disc_rgba(n=200, r=70, hole=0):
    yy, xx = np.mgrid[:n, :n]
    d = np.hypot(yy - n / 2, xx - n / 2)
    m = (d < r) & (d >= hole)
    rgb = np.zeros((n, n, 3), np.uint8)
    rgb[..., 0] = np.clip(xx * 255 // n, 0, 255)
    rgb[..., 1] = np.clip(yy * 255 // n, 0, 255)
    rgb[..., 2] = 120
    return np.dstack([rgb, (m * 255).astype(np.uint8)]), m


def _solid(mask, **kw):
    rgb = np.full(mask.shape + (3,), 150, np.uint8)
    rgb[..., 0] = np.linspace(40, 240, mask.shape[1], dtype=np.uint8)[None, :]
    return i3.clean_mesh(i3.build_solid(rgb, mask, **kw))


def test_disc_is_closed_and_printable_in_every_mode():
    _, m = _disc_rgba()
    for shape in ("inflate", "relief", "both"):
        for base in ("mirror", "flat"):
            mesh = _solid(m, shape=shape, base=base)
            st = i3.mesh_stats(mesh)
            assert st["closed"], (shape, base, st)
            assert st["volume"] > 0 and st["printable"], (shape, base, st)
            assert st["non_manifold_edges"] == 0


def test_ring_with_a_hole_is_closed():
    _, m = _disc_rgba(hole=30)
    st = i3.mesh_stats(_solid(m))
    assert st["closed"] and st["printable"], st


def test_non_convex_shape():
    n = 160
    m = np.zeros((n, n), bool)
    m[20:140, 20:60] = True
    m[100:140, 20:140] = True       # an "L"
    st = i3.mesh_stats(_solid(m, shape="inflate"))
    assert st["closed"] and st["printable"], st


def test_front_faces_the_front_view():
    _, m = _disc_rgba()
    mesh = _solid(m, shape="inflate", base="flat")
    assert mesh.verts[:, 1].min() < -0.01          # bulges towards -Y (the Front view)
    assert abs(mesh.verts[:, 1].max()) < 1e-9      # flat back at Y = 0


def test_volume_scales_with_size():
    _, m = _disc_rgba()
    mesh = _solid(m)
    a = i3.mesh_stats(i3.place_mesh(mesh, 50))
    b = i3.mesh_stats(i3.place_mesh(mesh, 100))
    assert abs(max(a["size"]) - 50) < 1e-6 and abs(max(b["size"]) - 100) < 1e-6
    assert abs(b["volume"] / a["volume"] - 8) < 1e-6


def test_place_ground_and_orient():
    _, m = _disc_rgba()
    mesh = i3.place_mesh(_solid(m), 60, "ground")
    assert abs(mesh.verts[:, 2].min()) < 1e-9
    assert abs(mesh.verts[:, 0].mean()) < 1.5
    up_y = i3.Mesh(np.array([[0, 1, 0], [1, 0, 0], [0, 0, 1.0]]), np.array([[0, 1, 2]]))
    r = i3.orient_mesh(up_y, "y")
    assert np.allclose(r.verts[0], [0, 0, 1])        # +Y becomes +Z
    s = i3.orient_mesh(up_y, "z", 90)
    assert np.allclose(s.verts[1], [0, 1, 0])


def test_alpha_png_is_used_as_the_cutout():
    rgba, m = _disc_rgba()
    rgb, alpha = i3.decode_image(_png_data_url(rgba, "RGBA"))
    assert alpha is not None
    mask, how = i3.segment(rgb, alpha)
    assert "transparency" in how
    assert abs(mask.mean() - m.mean()) < 0.01


def test_plain_background_is_keyed_out():
    n = 200
    yy, xx = np.mgrid[:n, :n]
    rgb = np.full((n, n, 3), 245, np.uint8)
    rgb[np.hypot(yy - 100, xx - 100) < 60] = (200, 40, 40)
    mask, how = i3.segment(rgb, None)
    assert abs(mask.mean() - np.pi * 60 ** 2 / n ** 2) < 0.03, (mask.mean(), how)


def test_stl_and_ply_are_well_formed():
    _, m = _disc_rgba()
    mesh = i3.place_mesh(_solid(m), 40)
    stl = i3.to_stl(mesh)
    n = int(np.frombuffer(stl[80:84], "<u4")[0])
    assert n == len(mesh.faces) and len(stl) == 84 + 50 * n
    ply = i3.to_ply(mesh)
    head, _, body = ply.partition(b"end_header\n")
    assert b"element vertex %d" % len(mesh.verts) in head and b"property uchar red" in head
    assert len(body) == len(mesh.verts) * 15 + len(mesh.faces) * 13


def test_clean_mesh_welds_and_fixes_winding():
    # a cube built from 12 triangles with duplicated vertices and inside-out winding
    v = np.array([[x, y, z] for x in (0, 1) for y in (0, 1) for z in (0, 1)], float)
    f = np.array([[0, 1, 3], [0, 3, 2], [4, 6, 7], [4, 7, 5], [0, 4, 5], [0, 5, 1], [2, 3, 7], [2, 7, 6], [0, 2, 6], [0, 6, 4], [1, 5, 7], [1, 7, 3]])
    cube = i3.Mesh(np.vstack([v, v]), np.vstack([f, f]) % 16)
    out = i3.clean_mesh(cube)
    assert len(out.verts) == 8 and len(out.faces) == 12
    st = i3.mesh_stats(out)
    assert st["closed"] and abs(st["volume"] - 1.0) < 1e-9


def test_open_mesh_is_not_printable():
    v = np.array([[0, 0, 0], [1, 0, 0], [0, 1, 0.0]])
    st = i3.mesh_stats(i3.Mesh(v, np.array([[0, 1, 2]])))
    assert not st["closed"] and not st["printable"]


def _wait(job_id, secs=60):
    t0 = time.time()
    while time.time() - t0 < secs:
        info = i3.job_info(job_id)
        if info["status"] in ("succeeded", "failed", "cancelled"):
            return info
        time.sleep(0.05)
    raise AssertionError("job timed out")


def test_job_end_to_end():
    rgba, _ = _disc_rgba()
    jid = i3.create_job(_png_data_url(rgba, "RGBA"), "builtin", {"shape": "both", "detail": "low"})
    info = _wait(jid)
    assert info["status"] == "succeeded", info
    assert info["stats"]["printable"] and info["has_colors"]
    big = i3.job_info(jid, size_mm=120)
    assert abs(max(big["stats"]["size"]) - 120) < 1e-6
    stl = i3.job_mesh_bytes(jid, "stl", 120)
    assert len(stl) == 84 + 50 * big["stats"]["faces"]
    assert i3.job_mesh_bytes(jid, "ply", 30)[:3] == b"ply"
    assert i3.job_cutout(jid)[:4] == b"\x89PNG"
    assert i3.delete_job(jid) and not i3.delete_job(jid)


def test_bad_input_is_a_clear_error():
    for bad in ("", "not-base64!!", "data:image/png;base64,AAAA"):
        try:
            i3.create_job(bad)
        except ValueError as e:
            assert str(e)
        else:
            raise AssertionError("expected ValueError")
    try:
        i3.create_job(_png_data_url(_disc_rgba()[0], "RGBA"), "nope")
    except ValueError as e:
        assert "Unknown engine" in str(e)


def test_engine_order_and_pixal_needs_a_server():
    i3.pixal_url = lambda: ""
    ok, why = i3.ENGINES["pixal3d"].available()
    assert not ok and "Find server" in why
    assert i3.ENGINES["builtin"].available()[0]
    assert [e["id"] for e in i3.list_engines()] == ["pixal3d", "builtin"]


# ---- Pixal3D against a mock PIXAL-3D server --------------------------------
def _box_glb(textured=True, nodes_scale=1.0):
    """A unit cube as a GLB (Y-up), UV-mapped onto a 2x2 red/green/blue/white texture."""
    import json as _j
    import struct as _s
    p = np.array([[x, y, z] for x in (0, 1) for y in (0, 1) for z in (0, 1)], np.float32)
    quads = [(0, 1, 3, 2), (4, 6, 7, 5), (0, 4, 5, 1), (2, 3, 7, 6), (0, 2, 6, 4), (1, 5, 7, 3)]
    idx = []
    for a, b, c, d in quads:
        idx += [a, b, c, a, c, d]
    idx = np.array(idx, np.uint16)
    # fix winding to outward using the centroid test
    tri = idx.reshape(-1, 3)
    for k, t in enumerate(tri):
        n = np.cross(p[t[1]] - p[t[0]], p[t[2]] - p[t[0]])
        if np.dot(n, p[t].mean(0) - 0.5) < 0:
            tri[k] = t[::-1]
    idx = tri.reshape(-1)
    uv = np.array([[(v[0] * 0.5 + 0.1), (v[1] * 0.5 + 0.1)] for v in p], np.float32)
    uv[:, 0] += 0.0
    img = np.zeros((2, 2, 3), np.uint8)
    img[0, 0], img[0, 1], img[1, 0], img[1, 1] = (255, 0, 0), (0, 255, 0), (0, 0, 255), (255, 255, 255)
    from PIL import Image
    pb = io.BytesIO()
    Image.fromarray(img).save(pb, "PNG")
    png = pb.getvalue()
    blobs = [p.tobytes(), idx.tobytes(), uv.tobytes(), png]
    offs, buf = [], b""
    for bl in blobs:
        offs.append(len(buf))
        buf += bl + b"\0" * (-len(bl) % 4)
    g = {"asset": {"version": "2.0"}, "scene": 0, "scenes": [{"nodes": [0]}],
         "nodes": [{"mesh": 0, "scale": [nodes_scale] * 3, "translation": [0, 1, 0]}],
         "meshes": [{"primitives": [{"attributes": {"POSITION": 0, "TEXCOORD_0": 2}, "indices": 1, "material": 0}]}],
         "materials": [{"pbrMetallicRoughness": {"baseColorTexture": {"index": 0}}}] if textured else [{}],
         "textures": [{"source": 0}], "images": [{"bufferView": 3, "mimeType": "image/png"}],
         "buffers": [{"byteLength": len(buf)}],
         "bufferViews": [{"buffer": 0, "byteOffset": offs[0], "byteLength": len(blobs[0])},
                         {"buffer": 0, "byteOffset": offs[1], "byteLength": len(blobs[1])},
                         {"buffer": 0, "byteOffset": offs[2], "byteLength": len(blobs[2])},
                         {"buffer": 0, "byteOffset": offs[3], "byteLength": len(png)}],
         "accessors": [{"bufferView": 0, "componentType": 5126, "count": 8, "type": "VEC3"},
                       {"bufferView": 1, "componentType": 5123, "count": len(idx), "type": "SCALAR"},
                       {"bufferView": 2, "componentType": 5126, "count": 8, "type": "VEC2"}]}
    js = _j.dumps(g).encode()
    js += b" " * (-len(js) % 4)
    total = 12 + 8 + len(js) + 8 + len(buf)
    return b"glTF" + _s.pack("<II", 2, total) + _s.pack("<II", len(js), 0x4E4F534A) + js + _s.pack("<II", len(buf), 0x004E4942) + buf


def test_parse_glb_cube_with_texture():
    m = i3.clean_mesh(i3.parse_glb(_box_glb()))
    assert len(m.faces) == 12
    st = i3.mesh_stats(m)
    assert st["closed"] and abs(st["volume"] - 1.0) < 1e-6
    assert m.verts[:, 1].min() == 1.0 and m.verts[:, 1].max() == 2.0     # node translation applied
    assert m.colors is not None and len({tuple(c) for c in m.colors}) > 1
    s2 = i3.mesh_stats(i3.clean_mesh(i3.parse_glb(_box_glb(nodes_scale=2.0))))
    assert abs(s2["volume"] - 8.0) < 1e-6


def test_parse_glb_rejects_garbage():
    for data in (b"", b"hello world, not a glb at all", b"glTF" + b"\0" * 30):
        try:
            i3.parse_glb(data)
        except (ValueError, KeyError, Exception) as e:  # noqa: BLE001
            assert str(e) or True
        else:
            raise AssertionError("expected an error")


def test_decimate_lands_under_the_cap_and_keeps_shape():
    yy, xx = np.mgrid[:300, :300]
    m = _solid(np.hypot(yy - 150, xx - 150) < 120, detail="high")
    n0 = len(m.faces)
    d = i3.decimate_mesh(m, n0 // 5)
    assert 0 < len(d.faces) <= n0 // 5 and len(d.faces) > n0 // 12
    assert d.colors is not None and len(d.colors) == len(d.verts)
    ex0, ex1 = m.verts.max(0) - m.verts.min(0), d.verts.max(0) - d.verts.min(0)
    assert np.allclose(ex0, ex1, rtol=0.08)
    assert i3.decimate_mesh(m, n0 * 2) is m


def test_normalize_pixal_url():
    assert i3.normalize_pixal_url("42003") == "http://127.0.0.1:42003"
    assert i3.normalize_pixal_url("localhost:42003/") == "http://localhost:42003"
    assert i3.normalize_pixal_url("http://192.168.1.20:8188") == "http://192.168.1.20:8188"
    assert i3.normalize_pixal_url("") == ""
    for bad in ("http://8.8.8.8:80", "ftp://localhost:1", "http://"):
        try:
            i3.normalize_pixal_url(bad)
        except ValueError as e:
            assert str(e)
        else:
            raise AssertionError(bad)


class _MockPixal:
    """Speaks the /pixal_studio/* REST API the PIXAL-3D launcher exposes."""
    def __init__(self, glb, steps=3, busy=False, fail=None):
        import http.server
        import json as _j
        import threading as _t
        outer = self
        self.glb, self.steps, self.busy, self.fail = glb, steps, busy, fail
        self.polls = 0
        self.cancelled = False
        self.uploaded = None
        self.generated = None

        class H(http.server.BaseHTTPRequestHandler):
            def log_message(self, *a):
                pass

            def _send(self, code, obj=None, raw=None, ctype="application/json"):
                data = raw if raw is not None else _j.dumps(obj).encode()
                self.send_response(code)
                self.send_header("Content-Type", ctype)
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)

            def do_GET(self):
                if self.path == "/pixal_studio/config":
                    return self._send(200, {"gpu": "Mock RTX", "tier": "mainstream", "vram_mode": "native_low_vram",
                                            "model_loaded": False, "presets": {"draft": {}, "high": {}, "ultra": {}}})
                if self.path == "/pixal_studio/status":
                    outer.polls += 1
                    if outer.cancelled:
                        return self._send(200, {"stage": "Cancelled", "progress": 0.2, "done": True, "error": "cancelled", "cancelled": True})
                    if outer.fail:
                        return self._send(200, {"stage": "Failed", "progress": 0.3, "done": True, "error": outer.fail})
                    if outer.polls < outer.steps:
                        return self._send(200, {"stage": "Shape", "progress": outer.polls / outer.steps, "done": False, "eta": 90, "seed": 7})
                    return self._send(200, {"stage": "Done", "progress": 1.0, "done": True, "error": None, "model_url": "/pixal_studio/model/abc.glb", "seed": 7})
                if self.path == "/pixal_studio/model/abc.glb":
                    return self._send(200, raw=outer.glb, ctype="model/gltf-binary")
                self._send(404, {"error": "nope"})

            def do_POST(self):
                n = int(self.headers.get("Content-Length", 0))
                body = self.rfile.read(n)
                if self.path == "/pixal_studio/upload":
                    outer.uploaded = body
                    return self._send(200, {"image_id": "img1", "preview": ""})
                if self.path == "/pixal_studio/generate":
                    if outer.busy:
                        return self._send(409, {"error": "a generation is already running"})
                    outer.generated = _j.loads(body)
                    return self._send(200, {"job_id": "j1"})
                if self.path == "/pixal_studio/cancel":
                    outer.cancelled = True
                    return self._send(200, {"ok": True})
                self._send(404, {"error": "nope"})

        self.srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), H)
        self.url = f"http://127.0.0.1:{self.srv.server_address[1]}"
        _t.Thread(target=self.srv.serve_forever, daemon=True).start()

    def close(self):
        self.srv.shutdown()


def _fast_sleep():
    real = time.sleep
    i3.time.sleep = lambda s: real(min(s, 0.02))
    return real


def test_pixal_engine_end_to_end_with_mock_server():
    real = _fast_sleep()
    mock = _MockPixal(_box_glb(), steps=3)
    try:
        i3.pixal_url = lambda: mock.url
        i3.ENGINES["pixal3d"]._probe_cache = (0.0, "", None)
        assert i3.ENGINES["pixal3d"].available() == (True, "")
        jid = i3.create_job(_png_data_url(_disc_rgba()[0], "RGBA"), "pixal3d", {"quality": "draft", "seed": 5, "faces": "low"})
        info = _wait(jid)
        assert info["status"] == "succeeded", info
        assert info["up"] == "y" and info["has_glb"] and not info["has_cutout"] and info["seed"] == 7
        assert info["stats"]["closed"] and info["stats"]["faces"] == 12
        # Y-up cube 1 unit → scaled to 60 mm, standing on Z=0
        assert abs(max(info["stats"]["size"]) - 60) < 1e-6
        stl = i3.job_mesh_bytes(jid, "stl", 60)
        assert len(stl) == 84 + 50 * 12
        assert i3.job_glb(jid)[:4] == b"glTF"
        assert mock.generated == {"image_id": "img1", "quality": "draft", "seed": 5}
        assert b"filename=\"reference.png\"" in mock.uploaded and b"\x89PNG" in mock.uploaded
        i3.delete_job(jid)
    finally:
        i3.time.sleep = real
        mock.close()


def test_pixal_busy_failed_and_cancelled():
    real = _fast_sleep()
    try:
        img = _png_data_url(_disc_rgba()[0], "RGBA")
        m = _MockPixal(_box_glb(), busy=True)
        i3.pixal_url = lambda: m.url
        i3.ENGINES["pixal3d"]._probe_cache = (0.0, "", None)
        info = _wait(i3.create_job(img, "pixal3d", {}))
        assert info["status"] == "failed" and "busy" in info["error"]
        m.close()
        m = _MockPixal(_box_glb(), fail="CUDA out of memory")
        i3.pixal_url = lambda: m.url
        info = _wait(i3.create_job(img, "pixal3d", {}))
        assert info["status"] == "failed" and "CUDA out of memory" in info["error"]
        m.close()
        m = _MockPixal(_box_glb(), steps=10_000)
        i3.pixal_url = lambda: m.url
        jid = i3.create_job(img, "pixal3d", {})
        t0 = time.time()
        while i3.job_info(jid)["progress"] < 13 and time.time() - t0 < 5:
            real(0.02)
        assert i3.cancel_job(jid)
        info = _wait(jid)
        assert info["status"] == "cancelled" and m.cancelled
        m.close()
        i3.pixal_url = lambda: "http://127.0.0.1:1"
        i3.ENGINES["pixal3d"]._probe_cache = (0.0, "", None)
        assert not i3.ENGINES["pixal3d"].available()[0]
        try:
            i3.create_job(img, "pixal3d", {})
        except ValueError as e:
            assert "not available" in str(e)
        else:
            raise AssertionError("expected ValueError")
    finally:
        i3.time.sleep = real


class _FakeApp:
    """Stands in for FastAPI: records the handlers install() registers."""
    def __init__(self):
        self.routes = {}

    def _reg(self, method):
        def deco(path):
            def wrap(fn):
                self.routes[(method, path)] = fn
                return fn
            return wrap
        return deco

    def __getattr__(self, name):
        if name in ("get", "post", "delete"):
            return self._reg(name.upper())
        raise AttributeError(name)


def test_http_handlers():
    app = _FakeApp()
    i3.install(app)
    assert set(app.routes) == {("GET", "/image_to_3d/engines"), ("POST", "/image_to_3d/jobs"), ("GET", "/image_to_3d/jobs/{job_id}"),
                               ("GET", "/image_to_3d/jobs/{job_id}/mesh"), ("GET", "/image_to_3d/jobs/{job_id}/cutout"),
                               ("DELETE", "/image_to_3d/jobs/{job_id}"), ("GET", "/image_to_3d/config"), ("POST", "/image_to_3d/config"),
                               ("GET", "/image_to_3d/pixal/detect"), ("POST", "/image_to_3d/jobs/{job_id}/cancel"),
                               ("GET", "/image_to_3d/jobs/{job_id}/glb")}
    r = app.routes
    assert [e["id"] for e in r[("GET", "/image_to_3d/engines")]()["engines"]] == ["pixal3d", "builtin"]
    bad = r[("POST", "/image_to_3d/jobs")](i3.CreateJobRequest(image="nope!!"))
    assert bad.status_code == 400
    jid = r[("POST", "/image_to_3d/jobs")](i3.CreateJobRequest(image=_png_data_url(_disc_rgba()[0], "RGBA"), engine="builtin", options={"detail": "low"}))["job_id"]
    _wait(jid)
    info = r[("GET", "/image_to_3d/jobs/{job_id}")](jid, 80.0, None, 0.0)
    import json
    body = json.loads(info.body)
    assert body["status"] == "succeeded" and abs(max(body["stats"]["size"]) - 80) < 1e-6
    mesh = r[("GET", "/image_to_3d/jobs/{job_id}/mesh")](jid, "stl", 80.0, "ground", None, 0.0)
    assert mesh.status_code == 200 and len(mesh.body) == 84 + 50 * body["stats"]["faces"]
    assert r[("GET", "/image_to_3d/jobs/{job_id}/mesh")](jid, "obj", 80.0, "ground", None, 0.0).status_code == 400
    assert r[("GET", "/image_to_3d/jobs/{job_id}/cutout")](jid).body[:4] == b"\x89PNG"
    assert r[("GET", "/image_to_3d/jobs/{job_id}")]("nojob", 60.0, None, 0.0).status_code == 404
    assert r[("DELETE", "/image_to_3d/jobs/{job_id}")](jid) == {"deleted": True}


if __name__ == "__main__":
    fails = 0
    for name, fn in sorted(globals().items()):
        if name.startswith("test_") and callable(fn):
            try:
                fn()
                print("ok  ", name)
            except Exception as e:  # noqa: BLE001
                fails += 1
                import traceback
                print("FAIL", name, "->", repr(e))
                traceback.print_exc()
    sys.exit(1 if fails else 0)

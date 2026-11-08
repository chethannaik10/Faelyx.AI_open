"""
cad_io.py

CATIA V5 data management (TU Graz script, chapter 10): exporting 3D data
as STEP (keeps the solid, loses the history — exactly as the script
notes), IGES (surfaces and points), plus BREP, STL, glTF; and importing
STEP / IGES / BREP files as history-free solids ("File / Open" of a
foreign format, or "Existing Component" in an assembly).

Open Cascade writes/reads real files, so everything goes through a temp
file and comes back as bytes.
"""

from __future__ import annotations

import base64
import os
import tempfile

from build123d import Compound, export_brep, export_gltf, export_step, export_stl, import_brep, import_step

EXPORT_TYPES = {
    "step": ("model/step", ".step"),
    "iges": ("model/iges", ".igs"),
    "brep": ("application/octet-stream", ".brep"),
    "stl": ("model/stl", ".stl"),
    "gltf": ("model/gltf-binary", ".glb"),
}


def _tmp(suffix: str) -> str:
    fd, path = tempfile.mkstemp(suffix=suffix)
    os.close(fd)
    return path


def export_shape(shape, fmt: str) -> tuple[bytes, str, str]:
    fmt = fmt.lower()
    if fmt not in EXPORT_TYPES:
        raise ValueError(f"unknown export format {fmt!r} (use {', '.join(EXPORT_TYPES)})")
    media, suffix = EXPORT_TYPES[fmt]
    path = _tmp(suffix)
    try:
        if fmt == "step":
            ok = export_step(shape, path)
        elif fmt == "iges":
            from OCP.IGESControl import IGESControl_Controller, IGESControl_Writer
            IGESControl_Controller.Init_s()
            writer = IGESControl_Writer("MM", 1)   # 1 = B-rep (solid) mode
            writer.AddShape(shape.wrapped)
            writer.ComputeModel()
            ok = writer.Write(path)
        elif fmt == "brep":
            ok = export_brep(shape, path)
        elif fmt == "stl":
            ok = export_stl(shape, path)
        else:
            ok = export_gltf(shape, path, binary=True)
        if ok is False:
            raise ValueError(f"Open Cascade could not write the {fmt.upper()} file")
        with open(path, "rb") as f:
            data = f.read()
    finally:
        os.remove(path)
    return data, media, suffix


def import_shape(data_b64: str, filename: str):
    """Decode an uploaded STEP / IGES / BREP file into a shape."""
    ext = os.path.splitext(filename or "")[1].lower()
    if ext not in (".step", ".stp", ".iges", ".igs", ".brep"):
        raise ValueError("import supports .step/.stp, .iges/.igs and .brep files")
    if "," in data_b64[:100] and data_b64.startswith("data:"):
        data_b64 = data_b64.split(",", 1)[1]
    try:
        raw = base64.b64decode(data_b64, validate=False)
    except Exception as e:
        raise ValueError(f"file data isn't valid base64: {e}") from e
    path = _tmp(ext)
    try:
        with open(path, "wb") as f:
            f.write(raw)
        if ext in (".step", ".stp"):
            shape = import_step(path)
        elif ext == ".brep":
            shape = import_brep(path)
        else:
            from OCP.IFSelect import IFSelect_RetDone
            from OCP.IGESControl import IGESControl_Reader
            reader = IGESControl_Reader()
            if reader.ReadFile(path) != IFSelect_RetDone:
                raise ValueError("could not read the IGES file")
            reader.TransferRoots()
            shape = Compound(reader.OneShape())
    finally:
        os.remove(path)
    if not list(shape.faces()):
        raise ValueError("the imported file contains no surface or solid geometry")
    return shape

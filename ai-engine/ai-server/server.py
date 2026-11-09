"""Faelyx AI planner: language in, validated geometry out."""
import json, os
from typing import Optional
import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from openai import OpenAI
from prompts import SYSTEM

load_dotenv()
CAD   = os.environ.get("FAELYX_CAD_URL", "http://127.0.0.1:8000")
MODEL = os.environ.get("FAELYX_MODEL", "gpt-4o-mini")
MAX_ATTEMPTS, MAX_BBOX_MM = 3, 2000.0

client = OpenAI(
    api_key=os.environ.get("FAELYX_LLM_KEY") or os.environ.get("OPENAI_API_KEY"),
    base_url=os.environ.get("FAELYX_LLM_BASE") or None,
)

app = FastAPI(title="Faelyx AI Planner")
app.add_middleware(CORSMiddleware, allow_origins=["*"],
                   allow_methods=["*"], allow_headers=["*"])


class DialogueRequest(BaseModel):
    prompt: str
    answers: Optional[dict] = None
    current_spec: Optional[dict] = None


def _ask(prompt: str, answers, current_spec, error: Optional[str] = None) -> dict:
    payload = {"prompt": prompt, "answers": answers, "current_spec": current_spec}
    if error:
        payload["previous_attempt_failed"] = error
    r = client.chat.completions.create(
        model=MODEL, temperature=0.1,
        response_format={"type": "json_object"},
        messages=[{"role": "system", "content": SYSTEM},
                  {"role": "user", "content": json.dumps(payload)}],
    )
    return json.loads(r.choices[0].message.content)


async def _execute_code(code: str) -> dict:
    async with httpx.AsyncClient(timeout=60) as h:
        r = await h.post(f"{CAD}/execute_code", json={"code": code, "timeout_s": 30})
    if r.status_code != 200:
        raise ValueError(r.text[:1000])
    return r.json()


def _gate(report: dict) -> Optional[str]:
    if not report.get("isSingleWatertightSolid"):
        return f"result is not one watertight solid (solidCount={report.get('solidCount')})"
    if report.get("volumeMm3", 0) <= 0:
        return "volume is zero"
    bb = report.get("boundingBoxMm", {})
    for axis in ("x", "y", "z"):
        if bb.get(axis, 0) > MAX_BBOX_MM:
            return f"bounding box {axis}={bb[axis]} exceeds {MAX_BBOX_MM} mm"
    return None


@app.post("/ai/build")
async def build(req: DialogueRequest):
    error = None
    last = None
    for attempt in range(1, MAX_ATTEMPTS + 1):
        try:
            out = _ask(req.prompt, req.answers, req.current_spec, error)
        except Exception as e:
            raise HTTPException(502, f"LLM call failed: {e}")

        action = out.get("action", "ready")
        if action == "ask":
            return {"action": "ask", "spec": out.get("spec", {}),
                    "questions": out.get("spec", {}).get("questions", [])}

        code = (out.get("code") or "").strip()
        # Auto-fix common LLM hallucinations for build123d
        code = code.replace('.filter_by_axis(', '.filter_by(')
        code = code.replace('.filter_by(Axis.', '.filter_by(Axis.')
        if not code:
            error = "LLM returned action=ready but code was empty"
            last = out
            continue

        try:
            exec_out = await _execute_code(code)
        except ValueError as e:
            error = str(e)
            last = out
            continue

        problem = _gate(exec_out["metrics"])
        if not problem:
            return {"action": "ready",
                    "spec": out.get("spec", {}),
                    "code": code,
                    "stl": exec_out["stl"],
                    "report": exec_out["metrics"],
                    "attempts": attempt}
        error = problem
        last = out

    raise HTTPException(422, {
        "error": "could not produce a valid solid after retries",
        "last_error": error,
        "last_spec": (last or {}).get("spec", {}),
    })


@app.get("/health")
def health():
    return {"status": "ok", "model": MODEL, "cad": CAD}

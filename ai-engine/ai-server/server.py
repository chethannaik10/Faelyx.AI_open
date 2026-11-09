"""Faelyx AI planner: language in, validated geometry out."""
import json, os
import chromadb
from chromadb import EmbeddingFunction, Documents, Embeddings
from fastembed import TextEmbedding
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
class FastEmbedEmbeddingFunction(EmbeddingFunction):
    def __init__(self, model_name: str = "BAAI/bge-small-en-v1.5"):
        self.model = TextEmbedding(model_name=model_name)

    def __call__(self, input: Documents) -> Embeddings:
        return [list(map(float, e)) for e in self.model.embed(input)]

chroma_client = chromadb.PersistentClient(path="./chroma_db")
embedding_fn = FastEmbedEmbeddingFunction(model_name="BAAI/bge-small-en-v1.5")
collection = chroma_client.get_collection(name="build123d_docs", embedding_function=embedding_fn)
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
        model=MODEL, temperature=0.1, max_tokens=4096,
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
    
    # --- 1. RAG RETRIEVAL ---
    # Search the manual for the 3 most relevant chunks
    results = collection.query(query_texts=[req.prompt], n_results=2)
    context = "\n---\n".join(results['documents'][0]) if results['documents'] else ""
    
    # Combine the manual with the user's prompt
    enhanced_prompt = f"""
Here is relevant documentation from the build123d manual:
{context}

User Request: {req.prompt}
"""
    # ------------------------

    for attempt in range(1, MAX_ATTEMPTS + 1):
        try:
            # 2. Pass the enhanced prompt instead of the raw prompt
            out = _ask(enhanced_prompt, req.answers, req.current_spec, error)
        except Exception as e:
            raise HTTPException(502, f"LLM call failed: {e}")

        action = out.get("action", "ready")
        if action == "ask":
            return {"action": "ask", "spec": out.get("spec", {}),
                    "questions": out.get("spec", {}).get("questions", [])}

        code = (out.get("code") or "").strip()
        # Auto-fix common LLM hallucinations for build123d
        code = code.replace('.filter_by_axis(', '.filter_by(')

        # Fix argument order: fillet(8, edge) -> fillet(edge, radius=8)
        code = re.sub(r'fillet\((\d+(?:\.\d+)?),\s*([a-zA-Z0-9_]+)\)', r'fillet(\g<2>, radius=\g<1>)', code)
        code = re.sub(r'chamfer\((\d+(?:\.\d+)?),\s*([a-zA-Z0-9_]+)\)', r'chamfer(\g<2>, length=\g<1>)', code)
        
        # Fix lowercase Vector coordinates (build123d uses uppercase X, Y, Z)
        code = code.replace('.start_point().x', '.start_point().X').replace('.start_point().y', '.start_point().Y').replace('.start_point().z', '.start_point().Z')
        code = code.replace('.end_point().x', '.end_point().X').replace('.end_point().y', '.end_point().Y').replace('.end_point().z', '.end_point().Z')
        code = code.replace('.center().x', '.center().X').replace('.center().y', '.center().Y').replace('.center().z', '.center().Z')
        code = code.replace('.position.x', '.position.X').replace('.position.y', '.position.Y').replace('.position.z', '.position.Z')


        # Auto-fix common OOP method hallucinations for build123d
        import re
        # Convert my_shape.fillet(radius=5, edges=my_edges) -> fillet(my_edges, radius=5)
        code = re.sub(r'([a-zA-Z0-9_]+)\.fillet\(radius=([^,]+),\s*edges=([^)]+)\)', r'fillet(\g<3>, radius=\g<2>)', code)
        # Convert my_shape.fillet(5, my_edges) -> fillet(my_edges, 5)
        code = re.sub(r'([a-zA-Z0-9_]+)\.fillet\(([^,]+),\s*([^)]+)\)', r'fillet(\g<3>, radius=\g<2>)', code)
        # Convert my_shape.chamfer(length=2, edges=my_edges) -> chamfer(my_edges, length=2)
        code = re.sub(r'([a-zA-Z0-9_]+)\.chamfer\(length=([^,]+),\s*edges=([^)]+)\)', r'chamfer(\g<3>, length=\g<2>)', code)

        # Auto-fix common OOP method hallucinations for build123d
        import re
        # Convert my_shape.fillet(radius=5, edges=my_edges) -> fillet(my_edges, radius=5)
        code = re.sub(r'([a-zA-Z0-9_]+)\.fillet\(radius=([^,]+),\s*edges=([^)]+)\)', r'fillet(, radius=)', code)
        # Convert my_shape.fillet(5, my_edges) -> fillet(my_edges, 5)
        code = re.sub(r'([a-zA-Z0-9_]+)\.fillet\(([^,]+),\s*([^)]+)\)', r'fillet(, radius=)', code)
        # Convert my_shape.chamfer(length=2, edges=my_edges) -> chamfer(my_edges, length=2)
        code = re.sub(r'([a-zA-Z0-9_]+)\.chamfer\(length=([^,]+),\s*edges=([^)]+)\)', r'chamfer(, length=)', code)

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

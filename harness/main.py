# main.py
"""
Controller harness — FastAPI (INTERNAL SERVICE).

Harness ini hanya boleh diakses oleh Backend SQL (port 3002),
BUKAN oleh FE. Bind ke 127.0.0.1 supaya tidak bisa diakses dari luar host.

Routes:
    POST /question   → terima query, proses di background, kembalikan job_id
    GET  /answer     → cek status job; kalau selesai, kembalikan jawaban
    GET  /health     → health check (tanpa auth, untuk monitoring)

Keamanan:
    - Bind ke 127.0.0.1
    - Header X-Internal-Key wajib (kalau INTERNAL_API_KEY diset di .env)
    - CORS hanya untuk Backend SQL

Jalankan:
    cd harness && python main.py
"""

from __future__ import annotations

import logging
import os
import threading
import time
import uuid
from dataclasses import asdict
from typing import Dict, Optional

from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from pipeline import get_pipeline, RAGResponse

logger = logging.getLogger("harness.main")


# =========================================================================
# LOGGING
# =========================================================================

def _setup_logging():
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s  %(levelname)-8s  %(name)-22s  %(message)s",
        datefmt="%H:%M:%S",
        force=True,
    )
    for noisy in (
        "chromadb", "urllib3", "httpx",
        "sentence_transformers", "transformers",
        "huggingface_hub", "torch",
    ):
        logging.getLogger(noisy).setLevel(logging.WARNING)


# =========================================================================
# INTERNAL AUTH
# =========================================================================
# Kalau INTERNAL_API_KEY diset di .env, semua request (kecuali /health)
# wajib menyertakan header X-Internal-Key dengan nilai yang sama.
# Kalau tidak diset, auth dilewati (untuk development lokal).
# =========================================================================

_INTERNAL_API_KEY = os.environ.get("INTERNAL_API_KEY", "").strip()


def _verify_internal_key(x_internal_key: Optional[str] = Header(default=None)):
    if not _INTERNAL_API_KEY:
        # development mode — auth dilewati
        return
    if x_internal_key != _INTERNAL_API_KEY:
        raise HTTPException(status_code=401, detail="Invalid internal key.")


# =========================================================================
# JOB STORE (in-memory)
# =========================================================================
# Struktur:
#   _jobs[job_id] = {
#       "status":      "pending" | "done" | "error",
#       "response":    dict | None,
#       "error":       str | None,
#       "created_at":  float,
#       "finished_at": float | None,
#       "query":       str,
#   }
#
# Untuk produksi multi-instance, ganti dengan Redis. Interface sama.
# =========================================================================

_jobs: Dict[str, Dict] = {}
_jobs_lock = threading.Lock()
_JOB_TTL_SECONDS = 3600          # job dihapus setelah 1 jam
_MAX_JOBS        = 5000          # batas atas untuk cegah memory leak


def _cleanup_old_jobs():
    """Hapus job yang sudah lewat TTL atau kalau melebihi batas."""
    now = time.time()
    with _jobs_lock:
        expired = [
            jid for jid, j in _jobs.items()
            if j.get("finished_at") and (now - j["finished_at"]) > _JOB_TTL_SECONDS
        ]
        for jid in expired:
            _jobs.pop(jid, None)

        if len(_jobs) > _MAX_JOBS:
            sorted_done = sorted(
                (jid for jid, j in _jobs.items() if j.get("finished_at")),
                key=lambda jid: _jobs[jid]["finished_at"],
            )
            for jid in sorted_done[: len(_jobs) - _MAX_JOBS]:
                _jobs.pop(jid, None)


# =========================================================================
# BACKGROUND WORKER
# =========================================================================

def _run_job(job_id: str, query: str):
    """Proses query di thread terpisah. Update _jobs setelah selesai."""
    pipeline = get_pipeline()
    try:
        logger.info("[Job %s] start — query=%r", job_id[:8], query[:80])
        response: RAGResponse = pipeline.answer(query)
        payload = asdict(response)

        with _jobs_lock:
            _jobs[job_id].update({
                "status":      "done",
                "response":    payload,
                "finished_at": time.time(),
            })
        logger.info(
            "[Job %s] done — intent=%s  %.2fs",
            job_id[:8], response.intent, response.processing_time,
        )
    except Exception as e:
        logger.exception("[Job %s] gagal", job_id[:8])
        with _jobs_lock:
            _jobs[job_id].update({
                "status":      "error",
                "error":       str(e),
                "finished_at": time.time(),
            })


# =========================================================================
# FASTAPI APP
# =========================================================================

app = FastAPI(title="Batik Harness (internal)", version="1.0.0")

# CORS: hanya Backend SQL (3002) yang boleh hit dari browser.
# Kalau backend dan harness satu host, CORS tidak terlalu penting,
# tapi tetap diset untuk keamanan.
_BACKEND_ORIGIN = os.environ.get("BACKEND_BASE_URL", "http://127.0.0.1:3002").rstrip("/")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[_BACKEND_ORIGIN],
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


# ── Schemas ─────────────────────────────────────────────────────────────

class QuestionRequest(BaseModel):
    query: str = Field(..., min_length=1, max_length=2000)


class QuestionResponse(BaseModel):
    job_id: str
    status: str


class AnswerResponse(BaseModel):
    job_id:  str
    status:  str                       # "pending" | "done" | "error"
    answer:  Optional[str]   = None
    intent:  Optional[str]   = None
    sources: Optional[list]  = None
    processing_time: Optional[float] = None
    error:   Optional[str]   = None


# ── Routes ──────────────────────────────────────────────────────────────

@app.post(
    "/question",
    response_model=QuestionResponse,
    dependencies=[Depends(_verify_internal_key)],
)
def post_question(req: QuestionRequest):
    """
    Terima query, jadwalkan ke background thread, kembalikan job_id.
    Backend SQL lalu polling GET /answer?job_id=... sampai status != pending.
    """
    _cleanup_old_jobs()

    query = req.query.strip()
    if not query:
        raise HTTPException(status_code=400, detail="Query kosong.")

    job_id = uuid.uuid4().hex
    with _jobs_lock:
        _jobs[job_id] = {
            "status":      "pending",
            "response":    None,
            "error":       None,
            "created_at":  time.time(),
            "finished_at": None,
            "query":       query,
        }

    threading.Thread(
        target=_run_job,
        args=(job_id, query),
        daemon=True,
    ).start()

    logger.info("[POST /question] job=%s  query=%r", job_id[:8], query[:80])
    return QuestionResponse(job_id=job_id, status="pending")


@app.get(
    "/answer",
    response_model=AnswerResponse,
    dependencies=[Depends(_verify_internal_key)],
)
def get_answer(job_id: str):
    """
    Cek status job. Kalau selesai, kembalikan jawaban.
    Kalau masih pending, kembalikan status saja.
    """
    with _jobs_lock:
        job = _jobs.get(job_id)

    if job is None:
        raise HTTPException(status_code=404, detail="job_id tidak ditemukan.")

    if job["status"] == "pending":
        return AnswerResponse(job_id=job_id, status="pending")

    if job["status"] == "error":
        return AnswerResponse(
            job_id=job_id,
            status="error",
            error=job.get("error") or "unknown error",
        )

    resp = job["response"] or {}
    return AnswerResponse(
        job_id=job_id,
        status="done",
        answer=resp.get("answer"),
        intent=resp.get("intent"),
        sources=resp.get("sources"),
        processing_time=resp.get("processing_time"),
    )


@app.get("/health")
def health():
    return {
        "status":   "ok",
        "jobs":     len(_jobs),
        "uptime_s": int(time.time() - _START_TIME),
        "auth":     "on" if _INTERNAL_API_KEY else "off",
    }


# =========================================================================
# STARTUP / ENTRYPOINT
# =========================================================================

_START_TIME = time.time()


@app.on_event("startup")
def _on_startup():
    _setup_logging()
    logger.info("═" * 60)
    logger.info("Batik Harness — internal FastAPI service")
    logger.info("Port  : 3001 (bind 127.0.0.1)")
    logger.info("Backend SQL : %s", _BACKEND_ORIGIN)
    logger.info("Ollama      : %s", os.environ.get("OLLAMA_BASE_URL", "(tidak diset)"))
    logger.info("LLM provider: %s", os.environ.get("LLM_PROVIDER", "groq"))
    if _INTERNAL_API_KEY:
        logger.info("Internal auth: AKTIF (X-Internal-Key wajib)")
    else:
        logger.warning("Internal auth: NONAKTIF — jangan pakai di produksi!")
    logger.info("Memuat pipeline (embedding + reranker + LLM)...")
    t = time.perf_counter()
    get_pipeline()
    logger.info("Pipeline siap dalam %.2fs", time.perf_counter() - t)
    logger.info("═" * 60)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "main:app",
        host="127.0.0.1",       # hanya localhost — tidak bisa diakses dari luar
        port=3001,
        log_level="info",
    )
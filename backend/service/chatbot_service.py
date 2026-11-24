# backend/service/chatbot_service.py
import logging
import os
import re
import threading
import time
from collections import deque

import requests

from service.exceptions import ValidationError, ServiceException
from url_controller import build_harness_url, get_harness_headers

logger = logging.getLogger("backend.chatbot_service")

# ==========================================
# KONFIGURASI
# ==========================================
# .env root sudah dimuat otomatis saat import url_controller
HARNESS_TIMEOUT = float(os.getenv("HARNESS_TIMEOUT", "10"))  # detik, per request ke harness

MAX_QUERY_LENGTH = 500
JOB_ID_PATTERN = re.compile(r"^[0-9a-f]{32}$")  # harness memakai uuid4().hex

# Rate limit per pengunjung (chatbot publik, tanpa login)
RATE_LIMIT_MAX = 10      # maksimal 10 pertanyaan ...
RATE_LIMIT_WINDOW = 60   # ... per 60 detik

_hits: dict = {}
_hits_lock = threading.Lock()


# ==========================================
# HELPER
# ==========================================
def check_rate_limit(client_id: str) -> None:
    """Batasi jumlah pertanyaan per pengunjung (in-memory)."""
    now = time.time()
    with _hits_lock:
        timestamps = _hits.setdefault(client_id, deque())
        while timestamps and now - timestamps[0] > RATE_LIMIT_WINDOW:
            timestamps.popleft()

        if len(timestamps) >= RATE_LIMIT_MAX:
            raise ServiceException(
                "Terlalu banyak pertanyaan. Coba lagi sebentar lagi.",
                status_code=429,
            )
        timestamps.append(now)

        # Cegah dict membengkak: buang pengunjung yang sudah lama tidak aktif
        if len(_hits) > 10000:
            for key in [k for k, v in _hits.items() if not v or now - v[-1] > RATE_LIMIT_WINDOW]:
                _hits.pop(key, None)


def _call_harness(method: str, path: str, **kwargs) -> requests.Response:
    """Panggil harness via url_controller. Error jaringan diubah jadi ServiceException yang ramah."""
    url = build_harness_url(path)
    extra_headers = kwargs.pop("headers", None)
    try:
        return requests.request(
            method,
            url,
            headers=get_harness_headers(extra_headers),
            timeout=HARNESS_TIMEOUT,
            **kwargs,
        )
    except requests.exceptions.Timeout:
        logger.warning("Harness timeout: %s %s", method, url)
        raise ServiceException(
            "Chatbot sedang sibuk. Coba lagi sebentar lagi.", status_code=504
        )
    except requests.exceptions.RequestException as e:
        logger.warning("Harness tidak bisa dihubungi: %s", e)
        raise ServiceException(
            "Chatbot sedang tidak tersedia. Coba lagi nanti.", status_code=503
        )


# ==========================================
# SERVICE
# ==========================================
def submit_question(query: str) -> dict:
    """Kirim pertanyaan ke harness, kembalikan job_id untuk di-polling."""
    query = (query or "").strip()
    if not query:
        raise ValidationError("Pertanyaan tidak boleh kosong.")
    if len(query) > MAX_QUERY_LENGTH:
        raise ValidationError(f"Pertanyaan maksimal {MAX_QUERY_LENGTH} karakter.")

    r = _call_harness("POST", "/question", json={"query": query})

    if r.status_code != 200:
        logger.error("Harness /question status=%s body=%s", r.status_code, r.text[:200])
        raise ServiceException("Chatbot gagal memproses pertanyaan.", status_code=502)

    try:
        data = r.json()
        return {"job_id": data["job_id"], "status": data.get("status", "pending")}
    except (ValueError, KeyError):
        logger.error("Format respons harness /question tidak dikenali: %s", r.text[:200])
        raise ServiceException("Chatbot gagal memproses pertanyaan.", status_code=502)


def get_answer(job_id: str) -> dict:
    """Cek status job di harness. Kalau selesai, kembalikan jawabannya."""
    if not JOB_ID_PATTERN.match(job_id or ""):
        raise ValidationError("job_id tidak valid.")

    r = _call_harness("GET", "/answer", params={"job_id": job_id})

    if r.status_code == 404:
        raise ServiceException(
            "Pertanyaan tidak ditemukan atau sudah kedaluwarsa.", status_code=404
        )
    if r.status_code != 200:
        logger.error("Harness /answer status=%s body=%s", r.status_code, r.text[:200])
        raise ServiceException("Chatbot gagal mengambil jawaban.", status_code=502)

    try:
        data = r.json()
    except ValueError:
        logger.error("Respons harness /answer bukan JSON: %s", r.text[:200])
        raise ServiceException("Chatbot gagal mengambil jawaban.", status_code=502)

    status = data.get("status")

    if status == "pending":
        return {"job_id": job_id, "status": "pending"}

    if status == "error":
        # Detail error hanya di log server, jangan dibocorkan ke pengunjung
        logger.error("Job %s gagal di harness: %s", job_id[:8], data.get("error"))
        return {
            "job_id": job_id,
            "status": "error",
            "message": "Maaf, terjadi kendala saat menjawab. Coba tanyakan lagi.",
        }

    return {
        "job_id": job_id,
        "status": "done",
        "answer": data.get("answer"),
        "intent": data.get("intent"),
    }
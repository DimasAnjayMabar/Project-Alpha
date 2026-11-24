# harness/url_controller.py
import os
from pathlib import Path
from typing import Literal, Optional
from urllib.parse import urlparse

from dotenv import load_dotenv

ROOT_DIR = Path(__file__).resolve().parent.parent
load_dotenv(ROOT_DIR / ".env")

UrlMode = Literal["base", "remote"]

# =========================================================================
# SWITCH MANUAL: ubah ke "remote" atau "base"
# =========================================================================
BACKEND_MODE: UrlMode = "base"  # "remote" | "base"

INTERNAL_API_KEY = os.getenv("INTERNAL_API_KEY", "").strip()

BACKEND_BASE_URL = os.getenv("BACKEND_BASE_URL", "http://localhost:3002").rstrip("/")
BACKEND_REMOTE_URL = os.getenv("BACKEND_REMOTE_URL", "").rstrip("/")

HARNESS_BASE_URL = os.getenv("HARNESS_BASE_URL", "http://127.0.0.1:3001").rstrip("/")
HARNESS_REMOTE_URL = os.getenv("HARNESS_REMOTE_URL", "").rstrip("/")

_BACKEND_URLS = {
    "base": BACKEND_BASE_URL,
    "remote": BACKEND_REMOTE_URL,
}

BACKEND_URL = _BACKEND_URLS.get(BACKEND_MODE, "")
if not BACKEND_URL:
    raise ValueError(
        f"[harness.url_controller] URL backend untuk mode='{BACKEND_MODE}' kosong di .env"
    )


def extract_origin(url: str) -> str:
    """Ambil scheme://host[:port] tanpa path (wajib untuk CORSMiddleware)."""
    parsed = urlparse(url)
    return f"{parsed.scheme}://{parsed.netloc}" if parsed.scheme and parsed.netloc else ""


# Host & port binding Uvicorn (selalu lokal; trafik remote masuk lewat Caddy)
_parsed_harness = urlparse(HARNESS_BASE_URL)
HARNESS_HOST = _parsed_harness.hostname or "127.0.0.1"
HARNESS_PORT = _parsed_harness.port or 3001

# CORS origins mengikuti BACKEND_MODE aktif
if BACKEND_MODE == "base":
    _parsed_backend = urlparse(BACKEND_BASE_URL)
    _backend_port = _parsed_backend.port or 3002
    _cors_candidates = [
        extract_origin(BACKEND_BASE_URL),
        f"http://localhost:{_backend_port}",
        f"http://127.0.0.1:{_backend_port}",
    ]
else:
    _cors_candidates = [extract_origin(BACKEND_URL)]

BACKEND_CORS_ORIGINS = list(dict.fromkeys(origin for origin in _cors_candidates if origin))


def build_backend_url(path: str) -> str:
    clean = path if path.startswith("/") else f"/{path}"
    return f"{BACKEND_URL}{clean}"


def get_backend_headers(extra: Optional[dict] = None) -> dict:
    headers = dict(extra or {})
    if INTERNAL_API_KEY:
        headers["X-Internal-Key"] = INTERNAL_API_KEY
    if BACKEND_MODE == "remote":
        headers["ngrok-skip-browser-warning"] = "true"
    return headers


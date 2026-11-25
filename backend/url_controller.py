# backend/url_controller.py
import os
from pathlib import Path
from typing import Literal, Optional
from urllib.parse import urlparse

from dotenv import load_dotenv

# Selalu baca .env dari root project_alpha/
ROOT_DIR = Path(__file__).resolve().parent.parent
load_dotenv(ROOT_DIR / ".env")

UrlMode = Literal["base", "remote"]

# =========================================================================
# SWITCH MANUAL: ubah masing-masing ke "remote" atau "base"
# =========================================================================
BACKEND_PUBLIC_MODE: UrlMode = "remote"  # Untuk build_public_media_url & redirect OAuth
STORAGE_MODE: UrlMode = "remote"           # Target server Storage (port 3003)
HARNESS_MODE: UrlMode = "remote"           # Target server Harness (port 3001)

INTERNAL_API_KEY = os.getenv("INTERNAL_API_KEY", "")
INTERNAL_API_KEY_HEADER = "X-Internal-Key"

_URLS = {
    "backend": {
        "base": os.getenv("BACKEND_BASE_URL", "http://localhost:3002").rstrip("/"),
        "remote": os.getenv("BACKEND_REMOTE_URL", "").rstrip("/"),
    },
    "storage": {
        "base": os.getenv("STORAGE_BASE_URL", "http://localhost:3003").rstrip("/"),
        "remote": os.getenv("STORAGE_REMOTE_URL", "").rstrip("/"),
    },
    "harness": {
        "base": os.getenv("HARNESS_BASE_URL", "http://127.0.0.1:3001").rstrip("/"),
        "remote": os.getenv("HARNESS_REMOTE_URL", "").rstrip("/"),
    },
}


def _resolve(service: str, mode: UrlMode) -> str:
    url = _URLS[service].get(mode, "")
    if not url:
        raise ValueError(
            f"[backend.url_controller] URL '{service}' untuk mode='{mode}' kosong di .env"
        )
    return url


def extract_origin(url: str) -> str:
    """Ambil scheme://host[:port] tanpa path (wajib untuk CORSMiddleware)."""
    parsed = urlparse(url)
    return f"{parsed.scheme}://{parsed.netloc}" if parsed.scheme and parsed.netloc else ""


# URL aktif siap impor di seluruh file backend
BACKEND_URL = _resolve("backend", BACKEND_PUBLIC_MODE)
STORAGE_URL = _resolve("storage", STORAGE_MODE)
HARNESS_URL = _resolve("harness", HARNESS_MODE)


def build_storage_url(path: str) -> str:
    clean = path if path.startswith("/") else f"/{path}"
    if STORAGE_URL.endswith("/storage") and (
        clean == "/storage" or clean.startswith("/storage/")
    ):
        clean = clean[len("/storage"):]
    return f"{STORAGE_URL}{clean}"


def build_harness_url(path: str) -> str:
    clean = path if path.startswith("/") else f"/{path}"
    return f"{HARNESS_URL}{clean}"


def build_backend_url(path: str) -> str:
    clean = path if path.startswith("/") else f"/{path}"
    return f"{BACKEND_URL}{clean}"


def get_storage_headers(extra: Optional[dict] = None) -> dict:
    headers = dict(extra or {})
    if INTERNAL_API_KEY:
        headers[INTERNAL_API_KEY_HEADER] = INTERNAL_API_KEY
    if STORAGE_MODE == "remote":
        headers["ngrok-skip-browser-warning"] = "true"
    return headers


def get_harness_headers(extra: Optional[dict] = None) -> dict:
    headers = dict(extra or {})
    if INTERNAL_API_KEY:
        headers[INTERNAL_API_KEY_HEADER] = INTERNAL_API_KEY
    if HARNESS_MODE == "remote":
        headers["ngrok-skip-browser-warning"] = "true"
    return headers

COOKIE_SECURE: bool = BACKEND_PUBLIC_MODE == "remote"
COOKIE_SAMESITE: Literal["lax", "none"] = "none" if BACKEND_PUBLIC_MODE == "remote" else "lax"
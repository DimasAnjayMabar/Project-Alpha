# storage/config.py
import os
from pathlib import Path
from typing import Literal
from urllib.parse import urlparse

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent
ROOT_DIR = BASE_DIR.parent  # project_alpha/

# Load .env dari root project
load_dotenv(ROOT_DIR / ".env")

UrlMode = Literal["base", "remote"]

# =========================================================================
# URL CONTROLLER TERPUSAT (SWITCH MANUAL — TANPA FALLBACK)
# Ubah masing-masing ke "remote" atau "base" sesuai kebutuhan
# =========================================================================
STORAGE_MODE: UrlMode = "base"   # "base" | "remote" (identitas/URL publik storage)
BACKEND_MODE: UrlMode = "base"   # "base" | "remote" (origin backend untuk CORS)

# Raw URL dari .env root
STORAGE_BASE_URL = os.getenv("STORAGE_BASE_URL", "http://localhost:3003").rstrip("/")
STORAGE_REMOTE_URL = os.getenv("STORAGE_REMOTE_URL", "").rstrip("/")

BACKEND_BASE_URL = os.getenv("BACKEND_BASE_URL", "http://localhost:3002").rstrip("/")
BACKEND_REMOTE_URL = os.getenv("BACKEND_REMOTE_URL", "").rstrip("/")

INTERNAL_API_KEY = os.getenv("INTERNAL_API_KEY", "").strip()

_STORAGE_URLS = {
    "base": STORAGE_BASE_URL,
    "remote": STORAGE_REMOTE_URL,
}

_BACKEND_URLS = {
    "base": BACKEND_BASE_URL,
    "remote": BACKEND_REMOTE_URL,
}


def _resolve_url(url_map: dict, mode: UrlMode, name: str) -> str:
    url = url_map.get(mode, "")
    if not url:
        raise ValueError(
            f"[storage.config] URL {name} untuk mode='{mode}' kosong atau belum diset di .env"
        )
    return url


def _extract_origin(url: str) -> str:
    """
    Ambil scheme://host[:port] tanpa path (wajib untuk CORSMiddleware).
    Contoh: 'https://xxx.ngrok-free.app/backend' -> 'https://xxx.ngrok-free.app'
    """
    parsed = urlparse(url)
    return f"{parsed.scheme}://{parsed.netloc}" if parsed.scheme and parsed.netloc else ""


# URL aktif sesuai switch manual di atas
STORAGE_URL = _resolve_url(_STORAGE_URLS, STORAGE_MODE, "STORAGE")
BACKEND_URL = _resolve_url(_BACKEND_URLS, BACKEND_MODE, "BACKEND")

# =========================================================================
# HOST & PORT BINDING UVICORN (SELALU LOKAL)
# Tetap diparsing dari STORAGE_BASE_URL karena Caddy yang mem-proxy trafik
# masuk dari ngrok ke port lokal ini.
# =========================================================================
_parsed_storage = urlparse(STORAGE_BASE_URL)
STORAGE_HOST = _parsed_storage.hostname or "127.0.0.1"
STORAGE_PORT = _parsed_storage.port or 3003

# =========================================================================
# CORS ORIGINS (MENGIKUTI BACKEND_MODE AKTIF)
# =========================================================================
if BACKEND_MODE == "base":
    _parsed_backend = urlparse(BACKEND_BASE_URL)
    _backend_port = _parsed_backend.port or 3002
    _cors_candidates = [
        _extract_origin(BACKEND_BASE_URL),
        f"http://localhost:{_backend_port}",
        f"http://127.0.0.1:{_backend_port}",
    ]
else:
    _cors_candidates = [
        _extract_origin(BACKEND_URL),
    ]

CORS_ORIGINS = list(dict.fromkeys(origin for origin in _cors_candidates if origin))

# =========================================================================
# DIREKTORI FISIK — SELURUH OUTPUT DISERAGAMKAN KE .WEBP
# - uploads/products/display/...
# - uploads/products/mockup/...
# - uploads/shop_profile/...
# =========================================================================
UPLOAD_ROOT = (BASE_DIR / "uploads").resolve()
PRODUCT_UPLOAD_ROOT = (UPLOAD_ROOT / "products").resolve()
DISPLAY_DIR = (PRODUCT_UPLOAD_ROOT / "display").resolve()
MOCKUP_DIR = (PRODUCT_UPLOAD_ROOT / "mockup").resolve()
SHOP_PROFILE_DIR = (UPLOAD_ROOT / "shop_profile").resolve()

# =========================================================================
# ATURAN VALIDASI & OLAHAN GAMBAR (SEMUA DISIMPAN SEBAGAI WEBP)
# =========================================================================
MAX_DISPLAY_FILES_PER_REQUEST = 10
MAX_DISPLAY_SIZE_BYTES = 5 * 1024 * 1024        # 5 MB per gambar display
MAX_MOCKUP_SIZE_BYTES = 15 * 1024 * 1024        # 15 MB untuk mockup 3D WebP lossless
MAX_SHOP_PROFILE_SIZE_BYTES = 5 * 1024 * 1024   # 5 MB untuk logo/profil toko

DISPLAY_MAX_DIMENSION = (1600, 1600)
DISPLAY_WEBP_QUALITY = 82

SHOP_PROFILE_MAX_DIMENSION = (512, 512)
SHOP_PROFILE_WEBP_QUALITY = 85

# Format input yang diterima saat upload sebelum dikonversi ke WebP
ALLOWED_CONTENT_TYPES = {
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/webp",
}


def ensure_storage_dirs() -> None:
    DISPLAY_DIR.mkdir(parents=True, exist_ok=True)
    MOCKUP_DIR.mkdir(parents=True, exist_ok=True)
    SHOP_PROFILE_DIR.mkdir(parents=True, exist_ok=True)
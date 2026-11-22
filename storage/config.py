# storage/config.py
import os
from pathlib import Path
from urllib.parse import urlparse
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent
ROOT_DIR = BASE_DIR.parent  # project_alpha/

# Load .env dari root project
load_dotenv(ROOT_DIR / ".env")

STORAGE_BASE_URL = os.getenv("STORAGE_BASE_URL", "http://localhost:3003").rstrip("/")
BACKEND_BASE_URL = os.getenv("BACKEND_BASE_URL", "http://localhost:3002").rstrip("/")
INTERNAL_API_KEY = os.getenv("INTERNAL_API_KEY", "")

# Parsing host & port langsung dari STORAGE_BASE_URL
_parsed_storage = urlparse(STORAGE_BASE_URL)
STORAGE_HOST = _parsed_storage.hostname or "127.0.0.1"
STORAGE_PORT = _parsed_storage.port or 3003

# CORS otomatis mengizinkan BACKEND_BASE_URL (baik localhost maupun 127.0.0.1)
_parsed_backend = urlparse(BACKEND_BASE_URL)
_backend_port = _parsed_backend.port or 3002
CORS_ORIGINS = list(
    dict.fromkeys([
        BACKEND_BASE_URL,
        f"http://localhost:{_backend_port}",
        f"http://127.0.0.1:{_backend_port}",
    ])
)

# Direktori fisik — path relatif di DB: uploads/products/{display|mockup}/...
UPLOAD_ROOT = (BASE_DIR / "uploads").resolve()
PRODUCT_UPLOAD_ROOT = (UPLOAD_ROOT / "products").resolve()
DISPLAY_DIR = (PRODUCT_UPLOAD_ROOT / "display").resolve()
MOCKUP_DIR = (PRODUCT_UPLOAD_ROOT / "mockup").resolve()

# Aturan validasi gambar
MAX_DISPLAY_FILES_PER_REQUEST = 10
MAX_DISPLAY_SIZE_BYTES = 5 * 1024 * 1024     # 5 MB per gambar display
MAX_MOCKUP_SIZE_BYTES = 15 * 1024 * 1024     # 15 MB untuk mockup 3D lossless
DISPLAY_MAX_DIMENSION = (1600, 1600)
DISPLAY_WEBP_QUALITY = 82

ALLOWED_CONTENT_TYPES = {
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/webp",
}


def ensure_storage_dirs() -> None:
    DISPLAY_DIR.mkdir(parents=True, exist_ok=True)
    MOCKUP_DIR.mkdir(parents=True, exist_ok=True)
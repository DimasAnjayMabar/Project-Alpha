# backend/service/storage_service.py
import logging
import os
from pathlib import Path
from typing import Iterator, List, Optional, Tuple
from urllib.parse import quote

import requests
from dotenv import load_dotenv

from service.exceptions import ServiceException, ValidationError

# =========================================================================
# KONFIGURASI ENV (project_alpha/.env)
# =========================================================================

ROOT_DIR = Path(__file__).resolve().parent.parent.parent
load_dotenv(ROOT_DIR / ".env")

STORAGE_BASE_URL = os.getenv("STORAGE_BASE_URL", "http://localhost:3003").rstrip("/")
BACKEND_BASE_URL = os.getenv("BACKEND_BASE_URL", "http://localhost:3002").rstrip("/")
INTERNAL_API_KEY = os.getenv("INTERNAL_API_KEY", "")

# Harus sama dengan header di storage/controller/storage_controller.py
INTERNAL_API_KEY_HEADER = "X-Internal-Key"

# Prefix route proxy di backend/controller/storage_controller.py
MEDIA_PUBLIC_PREFIX = "/storage/files"

STORAGE_UPLOAD_TIMEOUT = 20    # Detik (upload multiple display / mockup hingga 15 MB)
STORAGE_DEFAULT_TIMEOUT = 10   # Detik (health, delete, proxy read)
STREAM_CHUNK_SIZE = 64 * 1024  # 64 KB per chunk

logger = logging.getLogger("backend.storage_service")

# Format masukan file dari controller/service lain: (filename, content_type, raw_bytes)
IncomingFile = Tuple[str, Optional[str], bytes]


# =========================================================================
# HELPER INTERNAL & URL BUILDER
# =========================================================================

def _internal_headers() -> dict:
    headers = {}
    if INTERNAL_API_KEY:
        headers[INTERNAL_API_KEY_HEADER] = INTERNAL_API_KEY
    return headers


def build_public_media_url(relative_path: Optional[str]) -> Optional[str]:
    """
    Ubah path relatif DB (uploads/products/... atau uploads/shop_profile/...)
    menjadi URL publik lewat proxy backend 3002.
    Jika sudah berupa URL penuh http(s):// (misalnya dari seed lama), kembalikan apa adanya.
    """
    if not relative_path:
        return None
    raw = relative_path.strip()
    if not raw:
        return None
    if raw.startswith(("http://", "https://")):
        return raw

    cleaned = raw.lstrip("/").replace("\\", "/")
    if not cleaned:
        return None
    return f"{BACKEND_BASE_URL}{MEDIA_PUBLIC_PREFIX}/{quote(cleaned, safe='/')}"


def _attach_public_url(file_meta: dict) -> dict:
    enriched = dict(file_meta)
    enriched["public_url"] = build_public_media_url(enriched.get("image_url"))
    return enriched


def _extract_error_detail(resp: requests.Response) -> str:
    try:
        payload = resp.json()
        if isinstance(payload, dict):
            return str(payload.get("detail") or payload.get("message") or resp.text)
    except ValueError:
        pass
    return resp.text or f"Storage server mengembalikan status {resp.status_code}."


def _handle_storage_response(resp: requests.Response) -> dict:
    if resp.status_code >= 400:
        detail = _extract_error_detail(resp)
        raise ServiceException(detail, status_code=resp.status_code)

    try:
        payload = resp.json()
    except ValueError:
        raise ServiceException("Respons dari storage server bukan JSON valid.", status_code=502)

    if isinstance(payload, dict) and "data" in payload:
        return payload["data"]
    return payload


def _sanitize_relative_path(relative_path: str) -> str:
    cleaned = (relative_path or "").strip().lstrip("/").replace("\\", "/")
    if not cleaned or ".." in cleaned.split("/"):
        raise ValidationError(f"Path file tidak valid: '{relative_path}'")
    return cleaned


# =========================================================================
# HEALTH CHECK
# =========================================================================

def check_storage_health() -> dict:
    url = f"{STORAGE_BASE_URL}/storage/health"
    try:
        resp = requests.get(url, timeout=STORAGE_DEFAULT_TIMEOUT)
        return _handle_storage_response(resp)
    except requests.exceptions.Timeout:
        raise ServiceException("Storage server timeout saat cek health.", status_code=504)
    except requests.exceptions.RequestException as e:
        raise ServiceException(f"Gagal terhubung ke storage server: {str(e)}", status_code=503)


# =========================================================================
# UPLOAD DISPLAY (MULTIPLE - GALERI PRODUK, OUTPUT WEBP)
# =========================================================================

def upload_display_images(
    incoming_files: List[IncomingFile],
    prefix: Optional[str] = None,
) -> dict:
    """Kirim 1 atau banyak gambar display ke storage server (port 3003)."""
    if not incoming_files:
        raise ValidationError("Minimal 1 gambar display harus dikirim.")

    url = f"{STORAGE_BASE_URL}/storage/upload/display"
    files_payload = []
    for idx, (filename, content_type, raw_bytes) in enumerate(incoming_files):
        if not raw_bytes:
            raise ValidationError(f"File '{filename or f'display_{idx}'}' kosong.")
        files_payload.append((
            "files",
            (
                filename or f"display_{idx}.bin",
                raw_bytes,
                content_type or "application/octet-stream",
            ),
        ))

    form_data = {}
    if prefix:
        form_data["prefix"] = prefix

    try:
        resp = requests.post(
            url,
            headers=_internal_headers(),
            files=files_payload,
            data=form_data,
            timeout=STORAGE_UPLOAD_TIMEOUT,
        )
        data = _handle_storage_response(resp)
        files = [_attach_public_url(item) for item in data.get("files", [])]
        return {
            "count": data.get("count", len(files)),
            "files": files,
        }

    except ServiceException:
        raise
    except requests.exceptions.Timeout:
        raise ServiceException("Upload gambar display ke storage timeout.", status_code=504)
    except requests.exceptions.RequestException as e:
        raise ServiceException(f"Gagal mengunggah gambar display ke storage: {str(e)}", status_code=503)


# =========================================================================
# UPLOAD MOCKUP (SINGLE - TEKSTUR MOCKUP 3D WEBP LOSSLESS)
# =========================================================================

def upload_mockup_image(
    filename: str,
    content_type: Optional[str],
    raw_bytes: bytes,
    prefix: Optional[str] = None,
    output_format: Optional[str] = None,  # Diabaikan: storage diseragamkan ke WebP lossless
) -> dict:
    """Kirim 1 gambar mockup 3D WebP lossless ke storage server (port 3003)."""
    if not raw_bytes:
        raise ValidationError(f"File mockup '{filename or 'mockup'}' kosong.")

    url = f"{STORAGE_BASE_URL}/storage/upload/mockup"
    files_payload = {
        "file": (
            filename or "mockup.bin",
            raw_bytes,
            content_type or "application/octet-stream",
        )
    }
    form_data = {}
    if prefix:
        form_data["prefix"] = prefix

    try:
        resp = requests.post(
            url,
            headers=_internal_headers(),
            files=files_payload,
            data=form_data,
            timeout=STORAGE_UPLOAD_TIMEOUT,
        )
        data = _handle_storage_response(resp)
        return _attach_public_url(data)

    except ServiceException:
        raise
    except requests.exceptions.Timeout:
        raise ServiceException("Upload gambar mockup ke storage timeout.", status_code=504)
    except requests.exceptions.RequestException as e:
        raise ServiceException(f"Gagal mengunggah gambar mockup ke storage: {str(e)}", status_code=503)


# =========================================================================
# UPLOAD SHOP PROFILE / LOGO UMKM (SINGLE - OUTPUT WEBP)
# =========================================================================

def upload_shop_profile_image(
    filename: str,
    content_type: Optional[str],
    raw_bytes: bytes,
    prefix: Optional[str] = None,
) -> dict:
    """Kirim 1 gambar logo/profil toko UMKM ke storage server (port 3003)."""
    if not raw_bytes:
        raise ValidationError(f"File logo toko '{filename or 'shop-profile'}' kosong.")

    url = f"{STORAGE_BASE_URL}/storage/upload/shop-profile"
    files_payload = {
        "file": (
            filename or "shop-profile.bin",
            raw_bytes,
            content_type or "application/octet-stream",
        )
    }
    form_data = {}
    if prefix:
        form_data["prefix"] = prefix

    try:
        resp = requests.post(
            url,
            headers=_internal_headers(),
            files=files_payload,
            data=form_data,
            timeout=STORAGE_UPLOAD_TIMEOUT,
        )
        data = _handle_storage_response(resp)
        return _attach_public_url(data)

    except ServiceException:
        raise
    except requests.exceptions.Timeout:
        raise ServiceException("Upload logo toko ke storage timeout.", status_code=504)
    except requests.exceptions.RequestException as e:
        raise ServiceException(f"Gagal mengunggah logo toko ke storage: {str(e)}", status_code=503)


# =========================================================================
# DELETE FILES (EDIT, HAPUS PERMANEN & ROLLBACK DB)
# =========================================================================

def delete_storage_files(
    paths: List[str],
    ignore_errors: bool = False,
) -> dict:
    """Hapus 1 atau banyak file di storage server (port 3003) berdasarkan path relatif DB."""
    cleaned_paths = list(dict.fromkeys(p.strip() for p in paths if p and p.strip()))
    if not cleaned_paths:
        if ignore_errors:
            return {"deleted": [], "not_found": []}
        raise ValidationError("Daftar path file yang akan dihapus tidak boleh kosong.")

    url = f"{STORAGE_BASE_URL}/storage/files/delete"
    try:
        resp = requests.post(
            url,
            headers=_internal_headers(),
            json={"paths": cleaned_paths},
            timeout=STORAGE_DEFAULT_TIMEOUT,
        )
        return _handle_storage_response(resp)

    except Exception as e:
        if ignore_errors:
            logger.warning("[Storage Cleanup] Gagal menghapus file %s: %s", cleaned_paths, e)
            return {"deleted": [], "not_found": cleaned_paths}
        if isinstance(e, ServiceException):
            raise e
        if isinstance(e, requests.exceptions.Timeout):
            raise ServiceException("Request hapus file ke storage timeout.", status_code=504)
        raise ServiceException(f"Gagal menghapus file di storage: {str(e)}", status_code=503)


def delete_single_storage_file(path: str, ignore_errors: bool = False) -> dict:
    cleaned = _sanitize_relative_path(path)
    return delete_storage_files([cleaned], ignore_errors=ignore_errors)


# =========================================================================
# PROXY STREAM FILE (DIPANGGIL backend/controller/storage_controller.py)
# =========================================================================

def fetch_storage_file_stream(
    file_path: str,
) -> Tuple[Iterator[bytes], str, str, Optional[str]]:
    """
    Ambil file gambar dari storage (3003) secara streaming untuk diteruskan
    oleh backend/controller/storage_controller.py ke browser.
    """
    cleaned = _sanitize_relative_path(file_path)
    url = f"{STORAGE_BASE_URL}/storage/files/{quote(cleaned, safe='/')}"

    try:
        resp = requests.get(
            url,
            headers=_internal_headers(),
            stream=True,
            timeout=STORAGE_DEFAULT_TIMEOUT,
        )
    except requests.exceptions.Timeout:
        raise ServiceException("Storage server timeout saat mengambil file.", status_code=504)
    except requests.exceptions.RequestException as e:
        raise ServiceException(f"Gagal mengambil file dari storage: {str(e)}", status_code=503)

    if resp.status_code >= 400:
        detail = _extract_error_detail(resp)
        resp.close()
        raise ServiceException(detail, status_code=resp.status_code)

    media_type = resp.headers.get("Content-Type", "application/octet-stream")
    cache_control = resp.headers.get("Cache-Control", "public, max-age=86400")
    content_length = resp.headers.get("Content-Length")

    def _iter_chunks() -> Iterator[bytes]:
        try:
            for chunk in resp.iter_content(chunk_size=STREAM_CHUNK_SIZE):
                if chunk:
                    yield chunk
        finally:
            resp.close()

    return _iter_chunks(), media_type, cache_control, content_length
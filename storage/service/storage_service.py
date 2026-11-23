# storage/service/storage_service.py
import io
import logging
import re
from pathlib import Path
from typing import List, Optional, Tuple
from uuid import uuid4

from PIL import Image, ImageOps, UnidentifiedImageError

from config import (
    ALLOWED_CONTENT_TYPES,
    BASE_DIR,
    DISPLAY_DIR,
    DISPLAY_MAX_DIMENSION,
    DISPLAY_WEBP_QUALITY,
    MAX_DISPLAY_FILES_PER_REQUEST,
    MAX_DISPLAY_SIZE_BYTES,
    MAX_MOCKUP_SIZE_BYTES,
    MAX_SHOP_PROFILE_SIZE_BYTES,
    MOCKUP_DIR,
    PRODUCT_UPLOAD_ROOT,
    SHOP_PROFILE_DIR,
    SHOP_PROFILE_MAX_DIMENSION,
    SHOP_PROFILE_WEBP_QUALITY,
    STORAGE_PORT,
    ensure_storage_dirs,
)
from service.exceptions import (
    FileTooLargeError,
    NotFoundError,
    StorageException,
    UnsupportedMediaError,
    ValidationError,
)

logger = logging.getLogger("storage.service")

IncomingFile = Tuple[str, Optional[str], bytes]
ALLOWED_UPLOAD_ROOTS = (PRODUCT_UPLOAD_ROOT, SHOP_PROFILE_DIR)


def _slugify_prefix(value: Optional[str], fallback: str = "img") -> str:
    if not value:
        return fallback
    cleaned = re.sub(r"[^a-zA-Z0-9_-]+", "-", value.strip().lower()).strip("-")
    return cleaned[:40] or fallback


def _validate_content_type(content_type: Optional[str], filename: str) -> None:
    if content_type and content_type.lower() not in ALLOWED_CONTENT_TYPES:
        raise UnsupportedMediaError(
            f"Format '{content_type}' pada '{filename}' tidak didukung. Gunakan JPG, PNG, atau WebP."
        )


def _open_and_validate_image(raw_bytes: bytes, max_bytes: int, filename: str) -> Image.Image:
    if not raw_bytes:
        raise ValidationError(f"File '{filename}' kosong.")

    if len(raw_bytes) > max_bytes:
        max_mb = max_bytes // (1024 * 1024)
        raise FileTooLargeError(
            f"Ukuran file '{filename}' melebihi batas maksimal {max_mb} MB."
        )

    try:
        img = Image.open(io.BytesIO(raw_bytes))
        img.load()
        return ImageOps.exif_transpose(img)
    except (UnidentifiedImageError, OSError):
        raise ValidationError(f"File '{filename}' bukan gambar yang valid atau korup.")


def _normalize_color_mode(img: Image.Image) -> Image.Image:
    if img.mode in ("RGBA", "LA") or (img.mode == "P" and "transparency" in img.info):
        return img.convert("RGBA")
    if img.mode != "RGB":
        return img.convert("RGB")
    return img


def _build_file_metadata(file_path: Path, width: int, height: int) -> dict:
    rel_path = file_path.relative_to(BASE_DIR).as_posix()
    return {
        "image_url": rel_path,
        "filename": file_path.name,
        "size_bytes": file_path.stat().st_size,
        "width": width,
        "height": height,
    }


def _resolve_safe_upload_path(relative_path: str) -> Path:
    cleaned = (relative_path or "").strip().lstrip("/").replace("\\", "/")
    if not cleaned:
        raise ValidationError("Path file tidak boleh kosong.")

    target = (BASE_DIR / cleaned).resolve()
    if not any(target.is_relative_to(root) for root in ALLOWED_UPLOAD_ROOTS):
        raise ValidationError(f"Path tidak diizinkan: '{relative_path}'")
    return target


def save_display_images(
    incoming_files: List[IncomingFile],
    prefix: Optional[str] = None,
) -> dict:
    if not incoming_files:
        raise ValidationError("Minimal 1 file gambar display harus diunggah.")
    if len(incoming_files) > MAX_DISPLAY_FILES_PER_REQUEST:
        raise ValidationError(
            f"Maksimal {MAX_DISPLAY_FILES_PER_REQUEST} gambar display per request."
        )

    ensure_storage_dirs()
    safe_prefix = _slugify_prefix(prefix, fallback="display")
    saved_paths: List[Path] = []
    results: List[dict] = []

    try:
        for idx, (filename, content_type, raw_bytes) in enumerate(incoming_files):
            label = filename or f"display_{idx}"
            _validate_content_type(content_type, label)

            img = _open_and_validate_image(raw_bytes, MAX_DISPLAY_SIZE_BYTES, label)
            img = _normalize_color_mode(img)
            img.thumbnail(DISPLAY_MAX_DIMENSION, Image.Resampling.LANCZOS)

            out_name = f"{safe_prefix}-{uuid4().hex[:12]}.webp"
            out_path = DISPLAY_DIR / out_name
            img.save(out_path, format="WEBP", quality=DISPLAY_WEBP_QUALITY, method=4)

            saved_paths.append(out_path)
            results.append(_build_file_metadata(out_path, img.width, img.height))

        logger.info("[Upload Display] %d file tersimpan (prefix=%s)", len(results), safe_prefix)
        return {"count": len(results), "files": results}

    except Exception as e:
        for path in saved_paths:
            if path.exists():
                path.unlink(missing_ok=True)
        if isinstance(e, StorageException):
            raise e
        raise StorageException(f"Gagal menyimpan gambar display: {str(e)}", status_code=500)


def save_mockup_image(
    filename: str,
    content_type: Optional[str],
    raw_bytes: bytes,
    prefix: Optional[str] = None,
) -> dict:
    """Simpan gambar mockup 3D sebagai WebP lossless tanpa resize paksa."""
    ensure_storage_dirs()
    label = filename or "mockup"
    _validate_content_type(content_type, label)

    try:
        img = _open_and_validate_image(raw_bytes, MAX_MOCKUP_SIZE_BYTES, label)
        img = _normalize_color_mode(img)

        safe_prefix = _slugify_prefix(prefix, fallback="mockup")
        out_name = f"{safe_prefix}-{uuid4().hex[:12]}.webp"
        out_path = MOCKUP_DIR / out_name
        img.save(out_path, format="WEBP", lossless=True, quality=100)

        meta = _build_file_metadata(out_path, img.width, img.height)
        logger.info(
            "[Upload Mockup] tersimpan: %s (%dx%d)",
            meta["image_url"],
            img.width,
            img.height,
        )
        return meta

    except Exception as e:
        if isinstance(e, StorageException):
            raise e
        raise StorageException(f"Gagal menyimpan gambar mockup: {str(e)}", status_code=500)


def save_shop_profile_image(
    filename: str,
    content_type: Optional[str],
    raw_bytes: bytes,
    prefix: Optional[str] = None,
) -> dict:
    """Simpan logo/profil toko UMKM sebagai WebP (maks 512x512, transparansi terjaga)."""
    ensure_storage_dirs()
    label = filename or "shop-profile"
    _validate_content_type(content_type, label)

    try:
        img = _open_and_validate_image(raw_bytes, MAX_SHOP_PROFILE_SIZE_BYTES, label)
        img = _normalize_color_mode(img)
        img.thumbnail(SHOP_PROFILE_MAX_DIMENSION, Image.Resampling.LANCZOS)

        safe_prefix = _slugify_prefix(prefix, fallback="shop")
        out_name = f"{safe_prefix}-{uuid4().hex[:12]}.webp"
        out_path = SHOP_PROFILE_DIR / out_name
        img.save(out_path, format="WEBP", quality=SHOP_PROFILE_WEBP_QUALITY, method=4)

        meta = _build_file_metadata(out_path, img.width, img.height)
        logger.info(
            "[Upload Shop Profile] tersimpan: %s (%dx%d)",
            meta["image_url"],
            img.width,
            img.height,
        )
        return meta

    except Exception as e:
        if isinstance(e, StorageException):
            raise e
        raise StorageException(f"Gagal menyimpan logo toko: {str(e)}", status_code=500)


def resolve_existing_file(relative_path: str) -> Path:
    target = _resolve_safe_upload_path(relative_path)
    if not target.exists() or not target.is_file():
        raise NotFoundError(f"File '{relative_path}' tidak ditemukan.")
    return target


def delete_files(paths: List[str]) -> dict:
    if not paths:
        raise ValidationError("Daftar path yang akan dihapus tidak boleh kosong.")

    deleted: List[str] = []
    not_found: List[str] = []

    try:
        for rel_path in paths:
            target = _resolve_safe_upload_path(rel_path)
            if target.exists() and target.is_file():
                target.unlink()
                deleted.append(rel_path)
            else:
                not_found.append(rel_path)

        logger.info("[Delete] deleted=%d not_found=%d", len(deleted), len(not_found))
        return {"deleted": deleted, "not_found": not_found}

    except Exception as e:
        if isinstance(e, StorageException):
            raise e
        raise StorageException(f"Gagal menghapus file: {str(e)}", status_code=500)


def get_storage_health() -> dict:
    return {
        "service": "storage",
        "port": STORAGE_PORT,
        "display_dir": str(DISPLAY_DIR),
        "mockup_dir": str(MOCKUP_DIR),
        "shop_profile_dir": str(SHOP_PROFILE_DIR),
    }
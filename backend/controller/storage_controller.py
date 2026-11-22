# backend/controller/storage_controller.py
from fastapi import APIRouter
from fastapi.responses import StreamingResponse

from service.storage_service import fetch_storage_file_stream

router = APIRouter(prefix="/storage", tags=["Storage"])


# =========================================================================
# 1. RUTE
# =========================================================================

@router.get("/files/{file_path:path}")
def get_storage_file_route(file_path: str):
    """Proxy stream gambar dari storage internal (3003) ke browser."""
    return controller_get_storage_file(file_path)


# =========================================================================
# 2. CONTROLLER
# =========================================================================

def controller_get_storage_file(file_path: str):
    chunks, media_type, cache_control, content_length = fetch_storage_file_stream(file_path)
    headers = {"Cache-Control": cache_control}
    if content_length:
        headers["Content-Length"] = content_length

    return StreamingResponse(
        chunks,
        media_type=media_type,
        headers=headers,
    )
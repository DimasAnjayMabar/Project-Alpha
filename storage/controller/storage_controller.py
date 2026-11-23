# storage/controller/storage_controller.py
from typing import List, Optional

from fastapi import APIRouter, Depends, File, Form, Header, HTTPException, Query, UploadFile, status
from fastapi.responses import FileResponse

from config import INTERNAL_API_KEY
from schemas.storage_schemas import DeleteFilesRequest
from service.storage_service import (
    delete_files,
    get_storage_health,
    resolve_existing_file,
    save_display_images,
    save_mockup_image,
    save_shop_profile_image,
)

router = APIRouter(prefix="/storage", tags=["Storage"])


# =========================================================================
# INTERNAL AUTH DEPENDENCY (BACKEND 3002 -> STORAGE 3003)
# =========================================================================

def verify_internal_api_key(x_internal_key: Optional[str] = Header(default=None)) -> None:
    if not INTERNAL_API_KEY:
        return
    if x_internal_key != INTERNAL_API_KEY:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="X-Internal-Key tidak valid atau tidak disertakan.",
        )


# =========================================================================
# 1. RUTE
# =========================================================================

@router.get("/health")
def health_route():
    return controller_health()


@router.post(
    "/upload/display",
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(verify_internal_api_key)],
)
async def upload_display_route(
    files: List[UploadFile] = File(..., description="1 atau lebih gambar galeri produk (output WebP)"),
    prefix: Optional[str] = Form(None, description="Opsional: product_id atau slug"),
):
    return await controller_upload_display(files, prefix)


@router.post(
    "/upload/mockup",
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(verify_internal_api_key)],
)
async def upload_mockup_route(
    file: UploadFile = File(..., description="1 gambar mockup 3D produk (output WebP lossless)"),
    prefix: Optional[str] = Form(None, description="Opsional: product_id atau slug"),
):
    return await controller_upload_mockup(file, prefix)


@router.post(
    "/upload/shop-profile",
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(verify_internal_api_key)],
)
async def upload_shop_profile_route(
    file: UploadFile = File(..., description="1 gambar logo/profil toko UMKM (output WebP)"),
    prefix: Optional[str] = Form(None, description="Opsional: nama atau slug toko"),
):
    return await controller_upload_shop_profile(file, prefix)


@router.post(
    "/files/delete",
    dependencies=[Depends(verify_internal_api_key)],
)
def delete_files_batch_route(data: DeleteFilesRequest):
    return controller_delete_files_batch(data)


@router.delete(
    "/files",
    dependencies=[Depends(verify_internal_api_key)],
)
def delete_single_file_route(
    path: str = Query(
        ...,
        description="Path relatif file: uploads/products/... atau uploads/shop_profile/...",
    ),
):
    return controller_delete_single_file(path)


@router.get(
    "/files/{file_path:path}",
    dependencies=[Depends(verify_internal_api_key)],
)
def get_file_route(file_path: str):
    """Dipakai backend (3002) untuk mem-proxy file gambar ke frontend."""
    return controller_get_file(file_path)


# =========================================================================
# 2. CONTROLLER
# =========================================================================

def controller_health():
    result = get_storage_health()
    return {"status": "success", "data": result}


async def controller_upload_display(files: List[UploadFile], prefix: Optional[str]):
    incoming_files = []
    for upload in files:
        raw_bytes = await upload.read()
        incoming_files.append((upload.filename or "", upload.content_type, raw_bytes))

    result = save_display_images(incoming_files, prefix=prefix)
    return {
        "status": "success",
        "message": f"{result['count']} gambar display berhasil diunggah",
        "data": result,
    }


async def controller_upload_mockup(
    file: UploadFile,
    prefix: Optional[str],
):
    raw_bytes = await file.read()
    result = save_mockup_image(
        filename=file.filename or "mockup",
        content_type=file.content_type,
        raw_bytes=raw_bytes,
        prefix=prefix,
    )
    return {
        "status": "success",
        "message": "Gambar mockup berhasil diunggah",
        "data": result,
    }


async def controller_upload_shop_profile(
    file: UploadFile,
    prefix: Optional[str],
):
    raw_bytes = await file.read()
    result = save_shop_profile_image(
        filename=file.filename or "shop-profile",
        content_type=file.content_type,
        raw_bytes=raw_bytes,
        prefix=prefix,
    )
    return {
        "status": "success",
        "message": "Logo toko berhasil diunggah",
        "data": result,
    }


def controller_delete_files_batch(data: DeleteFilesRequest):
    result = delete_files(data.paths)
    return {
        "status": "success",
        "message": f"{len(result['deleted'])} file berhasil dihapus",
        "data": result,
    }


def controller_delete_single_file(path: str):
    result = delete_files([path])
    return {
        "status": "success",
        "message": "Proses penghapusan file selesai",
        "data": result,
    }


def controller_get_file(file_path: str):
    target = resolve_existing_file(file_path)
    return FileResponse(
        path=target,
        headers={"Cache-Control": "public, max-age=86400"},
    )
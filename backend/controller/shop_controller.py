# backend/controller/shop_controller.py
from datetime import datetime, timedelta, timezone
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, Response, UploadFile
from fastapi.concurrency import run_in_threadpool
import jwt
from sqlalchemy.orm import Session

from database import get_db
from middleware import ALGORITHM, COOKIE_SECURE, SECRET_KEY, get_current_account_id
from schemas.shop_schemas import ShopStatusRequest
from service.shop_service import (
    get_my_shop,
    get_public_shop_by_id,
    register_shop,
    search_public_shops,
    set_my_shop_status,
    soft_delete_my_shop,
    update_my_shop,
)

from url_controller import COOKIE_SAMESITE, COOKIE_SECURE

router = APIRouter(prefix="/shop", tags=["Shop"])


# =========================================================================
# 1. RUTE
# =========================================================================

# --- Auth / Onboarding (multipart/form-data: teks + opsional upload logo) ---
@router.post("/register")
async def register_route(
    request: Request,
    response: Response,
    name: str = Form(..., description="Nama sanggar / toko UMKM (wajib)"),
    address: Optional[str] = Form(None, description="Alamat lengkap sanggar"),
    number: Optional[str] = Form(None, description="Nomor WhatsApp pemesanan"),
    instagram: Optional[str] = Form(None, description="Username atau link Instagram"),
    online_shop: Optional[str] = Form(None, description="Link Shopee/Tokopedia"),
    gmaps: Optional[str] = Form(None, description="Link Google Maps"),
    description: Optional[str] = Form(None, description="Deskripsi singkat sanggar"),
    profile_image: Optional[UploadFile] = File(
        None,
        description="Opsional: 1 file logo UMKM (JPG, PNG, WebP — disimpan sebagai WebP)",
    ),
    db: Session = Depends(get_db),
):
    return await controller_register_shop(
        request=request,
        response=response,
        shop_payload={
            "name": name,
            "address": address,
            "number": number,
            "instagram": instagram,
            "online_shop": online_shop,
            "gmaps": gmaps,
            "description": description,
        },
        profile_image=profile_image,
        db=db,
    )


# --- Seller (Wajib Login, taruh sebelum /{shop_id}) ---
@router.get("/me")
def get_my_shop_route(
    account_id: str = Depends(get_current_account_id),
    db: Session = Depends(get_db),
):
    return controller_get_my_shop(account_id, db)


@router.patch("/me")
async def update_my_shop_route(
    name: Optional[str] = Form(None, description="Nama sanggar / toko UMKM"),
    address: Optional[str] = Form(None, description="Alamat lengkap sanggar"),
    number: Optional[str] = Form(None, description="Nomor WhatsApp pemesanan"),
    instagram: Optional[str] = Form(None, description="Username atau link Instagram"),
    online_shop: Optional[str] = Form(None, description="Link Shopee/Tokopedia"),
    gmaps: Optional[str] = Form(None, description="Link Google Maps"),
    description: Optional[str] = Form(None, description="Deskripsi singkat sanggar"),
    active_status: Optional[bool] = Form(None, description="Status aktif/nonaktif sanggar"),
    remove_profile: bool = Form(False, description="Set true untuk menghapus logo sanggar saat ini"),
    profile_image: Optional[UploadFile] = File(
        None,
        description="Opsional: 1 file logo UMKM pengganti (JPG, PNG, WebP — disimpan sebagai WebP)",
    ),
    account_id: str = Depends(get_current_account_id),
    db: Session = Depends(get_db),
):
    raw_fields = {
        "name": name,
        "address": address,
        "number": number,
        "instagram": instagram,
        "online_shop": online_shop,
        "gmaps": gmaps,
        "description": description,
        "active_status": active_status,
    }
    # Hanya kirim field yang benar-benar disertakan oleh frontend (partial update)
    update_payload = {k: v for k, v in raw_fields.items() if v is not None}

    return await controller_update_my_shop(
        update_payload=update_payload,
        profile_image=profile_image,
        remove_profile=remove_profile,
        account_id=account_id,
        db=db,
    )


@router.patch("/me/status")
def update_my_shop_status_route(
    data: ShopStatusRequest,
    account_id: str = Depends(get_current_account_id),
    db: Session = Depends(get_db),
):
    return controller_update_my_shop_status(data, account_id, db)


@router.delete("/me")
def delete_my_shop_route(
    account_id: str = Depends(get_current_account_id),
    db: Session = Depends(get_db),
):
    return controller_delete_my_shop(account_id, db)


# --- Public (Web Pengunjung - Tanpa Login) ---
@router.get("")
def list_and_search_shops_route(
    q: Optional[str] = Query(None, description="Cari berdasarkan nama, alamat, atau deskripsi"),
    page: int = Query(1, ge=1),
    limit: int = Query(12, ge=1, le=100),
    db: Session = Depends(get_db),
):
    return controller_search_public_shops(q, page, limit, db)


@router.get("/{shop_id}")
def get_shop_detail_route(
    shop_id: UUID,
    db: Session = Depends(get_db),
):
    return controller_get_public_shop(shop_id, db)


# =========================================================================
# 2. CONTROLLER
# =========================================================================

async def controller_register_shop(
    request: Request,
    response: Response,
    shop_payload: dict,
    profile_image: Optional[UploadFile],
    db: Session,
):
    pending_oauth = request.session.get("pending_oauth")
    if not pending_oauth:
        raise HTTPException(
            status_code=401,
            detail="Sesi pendaftaran habis. Silakan login ulang via Google.",
        )

    profile_tuple = None
    if profile_image is not None and profile_image.filename:
        raw_bytes = await profile_image.read()
        profile_tuple = (profile_image.filename, profile_image.content_type, raw_bytes)

    result = await run_in_threadpool(
        register_shop,
        db,
        pending_oauth,
        shop_payload,
        profile_tuple,
    )

    request.session.pop("pending_oauth", None)

    expire = datetime.now(timezone.utc) + timedelta(days=1)
    token = jwt.encode(
        {"sub": str(result["account_id"]), "role": "penjual", "exp": expire},
        SECRET_KEY,
        algorithm=ALGORITHM,
    )

    response.set_cookie(
        key="access_token",
        value=token,
        httponly=True,
        secure=COOKIE_SECURE,
        samesite=COOKIE_SAMESITE,
        max_age=86400,
    )

    return {"status": "success", "message": "Registrasi toko berhasil", "data": result}


def controller_get_my_shop(account_id: str, db: Session):
    result = get_my_shop(db, account_id)
    return {"status": "success", "data": result}


async def controller_update_my_shop(
    update_payload: dict,
    profile_image: Optional[UploadFile],
    remove_profile: bool,
    account_id: str,
    db: Session,
):
    profile_tuple = None
    if profile_image is not None and profile_image.filename:
        raw_bytes = await profile_image.read()
        profile_tuple = (profile_image.filename, profile_image.content_type, raw_bytes)

    result = await run_in_threadpool(
        update_my_shop,
        db,
        account_id,
        update_payload,
        profile_tuple,
        remove_profile,
    )
    return {"status": "success", "message": "Profil toko berhasil diperbarui", "data": result}


def controller_update_my_shop_status(data: ShopStatusRequest, account_id: str, db: Session):
    result = set_my_shop_status(db, account_id, data.active_status)
    status_text = "diaktifkan" if data.active_status else "dinonaktifkan"
    return {"status": "success", "message": f"Toko berhasil {status_text}", "data": result}


def controller_delete_my_shop(account_id: str, db: Session):
    result = soft_delete_my_shop(db, account_id)
    return {"status": "success", "message": "Toko berhasil dinonaktifkan", "data": result}


def controller_search_public_shops(
    q: Optional[str],
    page: int,
    limit: int,
    db: Session,
):
    result = search_public_shops(db, q=q, page=page, limit=limit)
    return {"status": "success", "data": result}


def controller_get_public_shop(shop_id: UUID, db: Session):
    result = get_public_shop_by_id(db, shop_id)
    return {"status": "success", "data": result}
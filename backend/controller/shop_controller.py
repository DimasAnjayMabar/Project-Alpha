# backend/controller/shop_controller.py
from datetime import datetime, timedelta
from typing import Optional
from uuid import UUID

import jwt
from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from sqlalchemy.orm import Session

from database import get_db
from middleware import ALGORITHM, COOKIE_SECURE, SECRET_KEY
from schemas.shop_schemas import (
    ShopRegistrationRequest,
    ShopStatusRequest,
    ShopUpdateRequest,
)
from service.shop_service import (
    get_my_shop,
    get_public_shop_by_id,
    register_shop,
    search_public_shops,
    set_my_shop_status,
    soft_delete_my_shop,
    update_my_shop,
)

router = APIRouter(prefix="/shop", tags=["Shop"])


# =========================================================================
# AUTH DEPENDENCY (nanti dipindah ke middleware.py agar dishare ke product)
# =========================================================================

def get_current_account_id(request: Request) -> str:
    # Pakai payload hasil decode AuthMiddleware jika sudah tersedia
    state_user = getattr(request.state, "user", None)
    if isinstance(state_user, dict) and state_user.get("sub"):
        return str(state_user["sub"])

    # Fallback decode cookie langsung
    token = request.cookies.get("access_token")
    if not token:
        raise HTTPException(status_code=401, detail="Silakan login terlebih dahulu.")

    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        account_id = payload.get("sub")
        if not account_id:
            raise HTTPException(status_code=401, detail="Token tidak valid.")
        return str(account_id)
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Sesi login habis. Silakan login ulang.")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Token tidak valid.")


# =========================================================================
# 1. RUTE
# =========================================================================

# --- Auth / Onboarding ---
@router.post("/register")
def register_route(
    data: ShopRegistrationRequest,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
):
    return controller_register_shop(data, request, response, db)


# --- Seller (Wajib Login, taruh sebelum /{shop_id}) ---
@router.get("/me")
def get_my_shop_route(
    account_id: str = Depends(get_current_account_id),
    db: Session = Depends(get_db),
):
    return controller_get_my_shop(account_id, db)


@router.patch("/me")
def update_my_shop_route(
    data: ShopUpdateRequest,
    account_id: str = Depends(get_current_account_id),
    db: Session = Depends(get_db),
):
    return controller_update_my_shop(data, account_id, db)


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

def controller_register_shop(
    data: ShopRegistrationRequest,
    request: Request,
    response: Response,
    db: Session,
):
    pending_oauth = request.session.get("pending_oauth")
    if not pending_oauth:
        raise HTTPException(
            status_code=401,
            detail="Sesi pendaftaran habis. Silakan login ulang via Google.",
        )

    result = register_shop(db, pending_oauth, data.model_dump())

    del request.session["pending_oauth"]

    expire = datetime.utcnow() + timedelta(days=1)
    token = jwt.encode(
        {"sub": result["account_id"], "role": "penjual", "exp": expire},
        SECRET_KEY,
        algorithm=ALGORITHM,
    )

    response.set_cookie(
        key="access_token",
        value=token,
        httponly=True,
        secure=COOKIE_SECURE,
        samesite="lax",
        max_age=86400,
    )

    return {"status": "success", "message": "Registrasi toko berhasil", "data": result}


def controller_get_my_shop(account_id: str, db: Session):
    result = get_my_shop(db, account_id)
    return {"status": "success", "data": result}


def controller_update_my_shop(data: ShopUpdateRequest, account_id: str, db: Session):
    # exclude_unset=True memastikan hanya field yang dikirim frontend yang ikut di-update
    payload = data.model_dump(exclude_unset=True)
    result = update_my_shop(db, account_id, payload)
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
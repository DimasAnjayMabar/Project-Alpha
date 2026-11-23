# backend/controller/auth_controller.py
from datetime import datetime, timedelta, timezone
import logging
import os
from urllib.parse import urlencode

from authlib.integrations.starlette_client import OAuth
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.responses import RedirectResponse
import jwt
from sqlalchemy.orm import Session

from database import get_db
from middleware import ALGORITHM, COOKIE_SECURE, SECRET_KEY
from service.auth_service import login_oauth, logout_user

logger = logging.getLogger("backend.auth_controller")

router = APIRouter(prefix="/auth", tags=["Authentication"])

# Tujuan redirect frontend (bisa dioverride melalui project_alpha/.env)
LOGIN_SUCCESS_URL = os.getenv("LOGIN_SUCCESS_URL", "http://localhost:5173/seller")
REGISTER_PAGE_URL = os.getenv("REGISTER_PAGE_URL", "http://localhost:5173/register")

# --- Setup Authlib OAuth (khusus mengambil email & sub/oauth_id) ---
oauth = OAuth()
oauth.register(
    name="google",
    client_id=os.getenv("GOOGLE_CLIENT_ID"),
    client_secret=os.getenv("GOOGLE_CLIENT_SECRET"),
    server_metadata_url="https://accounts.google.com/.well-known/openid-configuration",
    client_kwargs={"scope": "openid email"},
)


# ==========================================
# 1. HELPER
# ==========================================
def create_access_token(account: dict) -> str:
    expire = datetime.now(timezone.utc) + timedelta(days=1)
    return jwt.encode(
        {"sub": str(account["id"]), "role": account["role"], "exp": expire},
        SECRET_KEY,
        algorithm=ALGORITHM,
    )


def set_access_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key="access_token",
        value=token,
        httponly=True,
        secure=COOKIE_SECURE,
        samesite="lax",
        max_age=86400,
    )


def _redirect_login_error(code: str) -> RedirectResponse:
    sep = "&" if "?" in LOGIN_SUCCESS_URL else "?"
    return RedirectResponse(url=f"{LOGIN_SUCCESS_URL}{sep}{urlencode({'error': code})}")


# ==========================================
# 2. RUTE
# ==========================================
@router.get("/google/login")
async def google_login(request: Request):
    redirect_uri = str(request.url_for("google_callback"))
    return await oauth.google.authorize_redirect(
        request, redirect_uri, prompt="select_account"
    )


@router.get("/google/callback")
async def google_callback(request: Request, db: Session = Depends(get_db)):
    return await controller_google_callback(request, db)


@router.get("/pending")
def pending_registration_route(request: Request):
    """Dipakai halaman /register frontend untuk menampilkan email Google yang sedang mendaftar."""
    return controller_pending_registration(request)


@router.post("/logout")
def logout_route(request: Request, response: Response):
    return controller_logout(request, response)


# ==========================================
# 3. FUNGSI CONTROLLER
# ==========================================
async def controller_google_callback(request: Request, db: Session):
    try:
        token = await oauth.google.authorize_access_token(request)
    except Exception as e:
        logger.warning("[OAuth] Callback Google gagal: %s", e)
        return _redirect_login_error("oauth_failed")

    user_info = token.get("userinfo")
    if not user_info or not user_info.get("email") or not user_info.get("sub"):
        return _redirect_login_error("email_unavailable")

    # Kesepakatan: Google hanya diambil email & oauth_id (sub).
    # Logo/profil toko diunggah sendiri oleh seller saat registrasi atau di pengaturan toko.
    oauth_data = {
        "email": user_info.get("email"),
        "oauth_provider": "google",
        "oauth_id": user_info.get("sub"),
    }

    result = login_oauth(db, oauth_data)

    # Belum terdaftar: simpan data email/oauth di session, arahkan ke form registrasi frontend
    if result["status"] == "need_registration":
        request.session["pending_oauth"] = oauth_data
        return RedirectResponse(url=REGISTER_PAGE_URL)

    # Sudah terdaftar: buat JWT lalu set cookie LANGSUNG ke RedirectResponse
    jwt_token = create_access_token(result["account"])
    redirect = RedirectResponse(url=LOGIN_SUCCESS_URL)
    set_access_cookie(redirect, jwt_token)
    return redirect


def controller_pending_registration(request: Request):
    pending_oauth = request.session.get("pending_oauth")
    if not pending_oauth or not pending_oauth.get("email"):
        raise HTTPException(
            status_code=401,
            detail="Sesi pendaftaran tidak ditemukan atau sudah habis. Silakan masuk ulang melalui Google.",
        )

    return {
        "status": "success",
        "data": {
            "email": pending_oauth["email"],
            "oauth_provider": pending_oauth.get("oauth_provider", "google"),
        },
    }


def controller_logout(request: Request, response: Response):
    logout_user()
    request.session.clear()
    response.delete_cookie(key="access_token")
    return {"status": "success", "message": "Berhasil logout"}
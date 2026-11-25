# backend/controller/auth_controller.py
from datetime import datetime, timedelta, timezone
import logging
import os
from urllib.parse import urlencode

from authlib.integrations.starlette_client import OAuth
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.responses import RedirectResponse
import httpx
import jwt
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from database import get_db
from middleware import ALGORITHM, SECRET_KEY
from service.auth_service import login_oauth, logout_user
from url_controller import COOKIE_SAMESITE, COOKIE_SECURE, build_backend_url

logger = logging.getLogger("backend.auth_controller")

router = APIRouter(prefix="/auth", tags=["Authentication"])

# Tujuan redirect frontend (bisa dioverride melalui project_alpha/.env)
LOGIN_SUCCESS_URL = os.getenv("LOGIN_SUCCESS_URL", "http://localhost:5173/seller")
REGISTER_PAGE_URL = os.getenv("REGISTER_PAGE_URL", "http://localhost:5173/register")
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET", "")

GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token"
GOOGLE_USERINFO_ENDPOINT = "https://openidconnect.googleapis.com/v1/userinfo"

# --- Setup Authlib OAuth (khusus mengambil email & sub/oauth_id) ---
oauth = OAuth()
oauth.register(
    name="google",
    client_id=GOOGLE_CLIENT_ID,
    client_secret=GOOGLE_CLIENT_SECRET,
    server_metadata_url="https://accounts.google.com/.well-known/openid-configuration",
    client_kwargs={"scope": "openid email"},
)


class GoogleCodeExchangeRequest(BaseModel):
    code: str = Field(..., min_length=1)


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
        samesite=COOKIE_SAMESITE,
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
    redirect_uri = build_backend_url("/auth/google/callback")
    return await oauth.google.authorize_redirect(
        request, redirect_uri, prompt="select_account"
    )


@router.get("/google/callback")
async def google_callback(request: Request, db: Session = Depends(get_db)):
    return await controller_google_callback(request, db)


@router.post("/google/exchange")
async def google_exchange(
    payload: GoogleCodeExchangeRequest,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
):
    """Menukar authorization code dari Google GIS popup via fetch (bebas interstitial ngrok)."""
    return await controller_google_exchange(payload.code, request, response, db)


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

    oauth_data = {
        "email": user_info.get("email"),
        "oauth_provider": "google",
        "oauth_id": user_info.get("sub"),
    }

    result = login_oauth(db, oauth_data)

    if result["status"] == "need_registration":
        request.session["pending_oauth"] = oauth_data
        return RedirectResponse(url=REGISTER_PAGE_URL)

    jwt_token = create_access_token(result["account"])
    redirect = RedirectResponse(url=LOGIN_SUCCESS_URL)
    set_access_cookie(redirect, jwt_token)
    return redirect


async def controller_google_exchange(
    code: str,
    request: Request,
    response: Response,
    db: Session,
):
    if not GOOGLE_CLIENT_ID or not GOOGLE_CLIENT_SECRET:
        raise HTTPException(
            status_code=500,
            detail="Konfigurasi GOOGLE_CLIENT_ID atau GOOGLE_CLIENT_SECRET belum lengkap.",
        )

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            token_res = await client.post(
                GOOGLE_TOKEN_ENDPOINT,
                data={
                    "code": code,
                    "client_id": GOOGLE_CLIENT_ID,
                    "client_secret": GOOGLE_CLIENT_SECRET,
                    "redirect_uri": "postmessage",
                    "grant_type": "authorization_code",
                },
            )
            if token_res.status_code != 200:
                logger.warning(
                    "[OAuth] Tukar code Google gagal (%s): %s",
                    token_res.status_code,
                    token_res.text,
                )
                raise HTTPException(
                    status_code=401,
                    detail="Kode autentikasi Google tidak valid atau sudah kedaluwarsa.",
                )

            token_json = token_res.json()
            google_access_token = token_json.get("access_token")
            if not google_access_token:
                raise HTTPException(
                    status_code=401,
                    detail="Token akses Google tidak ditemukan.",
                )

            userinfo_res = await client.get(
                GOOGLE_USERINFO_ENDPOINT,
                headers={"Authorization": f"Bearer {google_access_token}"},
            )
            if userinfo_res.status_code != 200:
                logger.warning(
                    "[OAuth] Ambil userinfo Google gagal (%s): %s",
                    userinfo_res.status_code,
                    userinfo_res.text,
                )
                raise HTTPException(
                    status_code=401,
                    detail="Gagal membaca informasi email dari akun Google.",
                )
            user_info = userinfo_res.json()
    except HTTPException:
        raise
    except Exception as e:
        logger.warning("[OAuth] Error koneksi ke Google: %s", e)
        raise HTTPException(
            status_code=502,
            detail="Gagal menghubungi server autentikasi Google. Silakan coba lagi.",
        )

    email = user_info.get("email")
    oauth_id = user_info.get("sub")
    if not email or not oauth_id:
        raise HTTPException(
            status_code=400,
            detail="Alamat email dari akun Google tidak dapat dibaca.",
        )

    # Kesepakatan: Google hanya diambil email & oauth_id (sub).
    oauth_data = {
        "email": email,
        "oauth_provider": "google",
        "oauth_id": oauth_id,
    }

    result = login_oauth(db, oauth_data)

    if result["status"] == "need_registration":
        request.session["pending_oauth"] = oauth_data
        return {
            "status": "need_registration",
            "data": {
                "email": email,
            },
        }

    request.session.pop("pending_oauth", None)
    jwt_token = create_access_token(result["account"])
    set_access_cookie(response, jwt_token)
    return {
        "status": "success",
        "data": {
            "account": result["account"],
        },
    }


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
    response.delete_cookie(key="access_token", secure=COOKIE_SECURE, samesite=COOKIE_SAMESITE)
    return {"status": "success", "message": "Berhasil logout"}
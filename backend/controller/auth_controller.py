from fastapi import APIRouter, Depends, Response, Request
from fastapi.responses import RedirectResponse, JSONResponse
from sqlalchemy.orm import Session
from datetime import datetime, timedelta, timezone
import jwt
import os
from authlib.integrations.starlette_client import OAuth

from service.auth_service import login_oauth, logout_user
from middleware import SECRET_KEY, ALGORITHM, COOKIE_SECURE
from database import get_db

router = APIRouter(prefix="/auth", tags=["Authentication"])

# Tujuan redirect (bisa diganti ke URL frontend lewat .env)
LOGIN_SUCCESS_URL = os.getenv("LOGIN_SUCCESS_URL", "/me")
REGISTER_PAGE_URL = os.getenv("REGISTER_PAGE_URL", "/docs")

# --- Setup Authlib OAuth ---
oauth = OAuth()
oauth.register(
    name='google',
    client_id=os.getenv("GOOGLE_CLIENT_ID"),
    client_secret=os.getenv("GOOGLE_CLIENT_SECRET"),
    server_metadata_url='https://accounts.google.com/.well-known/openid-configuration',
    client_kwargs={'scope': 'openid email profile'}
)


# ==========================================
# 1. HELPER
# ==========================================
def create_access_token(account: dict) -> str:
    expire = datetime.now(timezone.utc) + timedelta(days=1)
    return jwt.encode(
        {"sub": account["id"], "role": account["role"], "exp": expire},
        SECRET_KEY,
        algorithm=ALGORITHM
    )


def set_access_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key="access_token", value=token, httponly=True,
        secure=COOKIE_SECURE, samesite="lax", max_age=86400
    )


# ==========================================
# 2. RUTE
# ==========================================
@router.get("/google/login")
async def google_login(request: Request):
    redirect_uri = str(request.url_for('google_callback'))
    return await oauth.google.authorize_redirect(
        request, redirect_uri, prompt='select_account'
    )


@router.get("/google/callback")
async def google_callback(request: Request, db: Session = Depends(get_db)):
    return await controller_google_callback(request, db)


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
        return JSONResponse(
            status_code=400,
            content={"status": "error", "message": f"OAuth gagal: {str(e)}"}
        )

    user_info = token.get('userinfo')
    if not user_info:
        return JSONResponse(
            status_code=400,
            content={"status": "error", "message": "Data user dari Google tidak ditemukan."}
        )

    oauth_data = {
        "email": user_info.get("email"),
        "oauth_provider": "google",
        "oauth_id": user_info.get("sub"),
        "display_name": user_info.get("name"),
        "profile": user_info.get("picture")
    }

    result = login_oauth(db, oauth_data)

    # Belum terdaftar: simpan data Google di session, arahkan ke form registrasi
    if result["status"] == "need_registration":
        request.session["pending_oauth"] = oauth_data
        return RedirectResponse(url=REGISTER_PAGE_URL)

    # Sudah terdaftar: buat JWT lalu set cookie LANGSUNG ke RedirectResponse
    # (cookie yang diset ke objek response lain tidak ikut terkirim)
    jwt_token = create_access_token(result["account"])
    redirect = RedirectResponse(url=LOGIN_SUCCESS_URL)
    set_access_cookie(redirect, jwt_token)
    return redirect


def controller_logout(request: Request, response: Response):
    logout_user()
    request.session.clear()
    response.delete_cookie(key="access_token")
    return {"status": "success", "message": "Berhasil logout"}
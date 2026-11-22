# backend/main.py
import os
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.sessions import SessionMiddleware
import uvicorn

# Load .env dari root project_alpha/.env sebelum import modul internal
ROOT_DIR = Path(__file__).resolve().parent.parent
load_dotenv(ROOT_DIR / ".env")

from controller import (
    auth_controller,
    chatbot_controller,
    product_controller,
    shop_controller,
    storage_controller,
)
from middleware import AuthMiddleware, COOKIE_SECURE, service_exception_handler
from service.exceptions import ServiceException

app = FastAPI(title="Project Alpha API", version="1.0.0")

# ==========================================
# MIDDLEWARE
# Urutan eksekusi incoming request di Starlette adalah dari BAWAH ke ATAS:
# CORSMiddleware -> AuthMiddleware -> SessionMiddleware -> Route
# ==========================================

# 1. SessionMiddleware -> cookie "registration_token"
#    Dipakai Authlib (state OAuth) dan menyimpan pending_oauth saat registrasi.
REGISTRATION_SECRET = os.getenv("REGISTRATION_SECRET_KEY")
if not REGISTRATION_SECRET:
    raise RuntimeError("REGISTRATION_SECRET_KEY belum diatur di file .env")

app.add_middleware(
    SessionMiddleware,
    secret_key=REGISTRATION_SECRET,
    session_cookie="registration_token",
    max_age=1800,  # 30 menit
    same_site="lax",
    https_only=COOKIE_SECURE,
)

# 2. AuthMiddleware -> proteksi rute seller lewat cookie "access_token" (JWT)
app.add_middleware(AuthMiddleware)

# 3. CORSMiddleware (wajib paling akhir agar 401 & OPTIONS tetap dapat header CORS)
RAW_CORS_ORIGINS = os.getenv(
    "BACKEND_CORS_ORIGINS",
    ",".join([
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5174",
    ]),
)
CORS_ORIGINS = [origin.strip() for origin in RAW_CORS_ORIGINS.split(",") if origin.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ==========================================
# EXCEPTION HANDLER
# ==========================================
app.add_exception_handler(ServiceException, service_exception_handler)

# ==========================================
# ROUTER
# ==========================================
app.include_router(auth_controller.router)
app.include_router(shop_controller.router)
app.include_router(product_controller.router)
app.include_router(storage_controller.router)
app.include_router(chatbot_controller.router)
app.include_router(product_controller.router)
app.include_router(product_controller.harness_router)


# ==========================================
# RUTE TESTING
# ==========================================
@app.get("/me", tags=["Testing"])
def get_me(request: Request):
    return {"status": "success", "user": request.state.user}


if __name__ == "__main__":
    uvicorn.run("main:app", host="127.0.0.1", port=3002, reload=True)
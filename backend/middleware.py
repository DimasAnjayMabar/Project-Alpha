# backend/middleware.py
import os
from pathlib import Path
import re

from dotenv import load_dotenv
from fastapi import HTTPException, Request
from fastapi.responses import JSONResponse
import jwt
from starlette.middleware.base import BaseHTTPMiddleware

from service.exceptions import ServiceException

# ==========================================
# 1. Load Environment Variables (project_alpha/.env)
# ==========================================
ROOT_DIR = Path(__file__).resolve().parent.parent
load_dotenv(ROOT_DIR / ".env")

SECRET_KEY = os.getenv("ACCESS_SECRET_KEY")
if not SECRET_KEY:
    raise RuntimeError("ACCESS_SECRET_KEY belum diatur di file .env")

ALGORITHM = "HS256"

# Cookie secure: isi COOKIE_SECURE=true di .env saat deploy dengan HTTPS.
COOKIE_SECURE = os.getenv("COOKIE_SECURE", "false").lower() == "true"


# ==========================================
# 2. Aturan Rute Publik (Tanpa Login)
# ==========================================
PUBLIC_EXACT_PATHS = {
    "/auth/google/login",
    "/auth/google/callback",
    "/auth/google/exchange",
    "/auth/pending",
    "/auth/logout",
    "/shop/register",
    "/chatbot/question",
    "/chatbot/answer",
    "/docs",
    "/docs/oauth2-redirect",
    "/openapi.json",
    "/redoc",
}

# Rute publik khusus method GET/HEAD (tidak meloloskan POST/PATCH/DELETE)
PUBLIC_READ_EXACT_PATHS = {
    "/shop",
    "/product",
    "/product/categories",
    "/chatbot/products/search",
}

PUBLIC_READ_PREFIXES = (
    "/storage/files/",
    "/chatbot/answer/",
)

# Regex UUID ketat agar /shop/me dan /product/me tidak ikut lolos sebagai rute publik
_UUID_PATTERN = r"[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}"
PUBLIC_READ_REGEXES = (
    re.compile(rf"^/shop/{_UUID_PATTERN}$"),
    re.compile(rf"^/product/{_UUID_PATTERN}$"),
)


def _is_public_request(method: str, raw_path: str) -> bool:
    method_upper = method.upper()
    if method_upper == "OPTIONS":
        return True

    path = raw_path.rstrip("/") or "/"

    if path in PUBLIC_EXACT_PATHS:
        return True

    if method_upper in ("GET", "HEAD"):
        if path in PUBLIC_READ_EXACT_PATHS:
            return True
        if any(path.startswith(prefix) for prefix in PUBLIC_READ_PREFIXES):
            return True
        if any(pattern.match(path) for pattern in PUBLIC_READ_REGEXES):
            return True

    return False


# ==========================================
# 3. Middleware Cek Cookie JWT (Proteksi Rute)
# ==========================================
class AuthMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        if _is_public_request(request.method, request.url.path):
            return await call_next(request)

        token = request.cookies.get("access_token")
        if not token:
            return JSONResponse(
                status_code=401,
                content={"detail": "Akses ditolak. Silakan login."},
            )

        try:
            payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
            request.state.user = payload
        except jwt.ExpiredSignatureError:
            return JSONResponse(
                status_code=401,
                content={"detail": "Sesi telah berakhir. Silakan login ulang."},
            )
        except jwt.InvalidTokenError:
            return JSONResponse(
                status_code=401,
                content={"detail": "Token tidak valid."},
            )

        return await call_next(request)


# ==========================================
# 4. Auth Dependency untuk Controller Seller
# ==========================================
def get_current_account_id(request: Request) -> str:
    state_user = getattr(request.state, "user", None)
    if isinstance(state_user, dict) and state_user.get("sub"):
        return str(state_user["sub"])

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


# ==========================================
# 5. Global Exception Handler
# ==========================================
async def service_exception_handler(request: Request, exc: ServiceException):
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "status": "error",
            "message": exc.message,
        },
    )
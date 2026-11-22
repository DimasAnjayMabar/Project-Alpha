# storage/main.py
"""
Entrypoint Server Storage (Port 3003).
Berjalan sebagai internal service yang hanya dipanggil oleh Backend (Port 3002),
sama seperti Harness (Port 3001).

Jalankan dari folder storage/:
    uvicorn main:app --host 127.0.0.1 --port 3003 --reload
"""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from config import CORS_ORIGINS, STORAGE_HOST, STORAGE_PORT, ensure_storage_dirs
from controller.storage_controller import router as storage_router
from service.exceptions import StorageException

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s  %(message)s",
)
logger = logging.getLogger("storage.main")


@asynccontextmanager
async def lifespan(app: FastAPI):
    ensure_storage_dirs()
    logger.info("Storage server siap di http://%s:%d", STORAGE_HOST, STORAGE_PORT)
    yield


app = FastAPI(
    title="Batik Storage Server",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=False,
    allow_methods=["GET", "POST", "DELETE"],
    allow_headers=["*"],
)


@app.exception_handler(StorageException)
async def storage_exception_handler(request: Request, exc: StorageException):
    return JSONResponse(
        status_code=exc.status_code,
        content={"status": "error", "detail": exc.message},
    )


app.include_router(storage_router)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "main:app",
        host=STORAGE_HOST,
        port=STORAGE_PORT,
        reload=True,
    )
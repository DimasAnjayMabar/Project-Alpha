# backend/controller/product_controller.py
import json
from typing import List, Literal, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, Query, UploadFile, status
from fastapi.concurrency import run_in_threadpool
from sqlalchemy.orm import Session

from controller.shop_controller import get_current_account_id
from database import get_db
from schemas.product_schemas import ProductStatusRequest
from service.exceptions import ValidationError
from service.product_service import (
    create_product,
    delete_product,
    get_my_product_by_id,
    get_public_product_by_id,
    list_categories_with_attributes,
    list_my_products,
    search_products_for_harness,
    search_public_products,
    set_product_status,
    update_product,
)

router = APIRouter(prefix="/product", tags=["Product"])


# =========================================================================
# HELPER PARSE FORM JSON & FILE
# =========================================================================

def _parse_json_field(raw: Optional[str], field_name: str, expected_type: type):
    if raw is None or not raw.strip():
        return None
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        raise ValidationError(f"Field '{field_name}' harus berupa JSON yang valid.")
    if not isinstance(parsed, expected_type):
        raise ValidationError(f"Tipe JSON pada '{field_name}' tidak sesuai.")
    return parsed


async def _read_upload_files(files: Optional[List[UploadFile]]):
    if not files:
        return None
    result = []
    for f in files:
        if not f or not f.filename:
            continue
        raw = await f.read()
        result.append((f.filename, f.content_type, raw))
    return result or None


async def _read_single_upload(file: Optional[UploadFile]):
    if not file or not file.filename:
        return None
    raw = await file.read()
    return (file.filename, file.content_type, raw)


# =========================================================================
# 1. RUTE
# =========================================================================

# --- Kategori & Skema Atribut (taruh sebelum /{product_id}) ---
@router.get("/categories")
def list_categories_route(db: Session = Depends(get_db)):
    return controller_list_categories(db)


# --- Seller (Wajib Login, taruh sebelum /{product_id}) ---
@router.get("/me")
def list_my_products_route(
    q: Optional[str] = Query(None, description="Cari nama, deskripsi, atau atribut produk"),
    active_status: Optional[bool] = Query(None),
    category_slug: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(12, ge=1, le=100),
    account_id: str = Depends(get_current_account_id),
    db: Session = Depends(get_db),
):
    return controller_list_my_products(account_id, q, active_status, category_slug, page, limit, db)


@router.get("/me/{product_id}")
def get_my_product_detail_route(
    product_id: UUID,
    account_id: str = Depends(get_current_account_id),
    db: Session = Depends(get_db),
):
    return controller_get_my_product(account_id, product_id, db)


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_product_route(
    name: str = Form(..., description="Nama produk"),
    price: float = Form(..., description="Harga produk"),
    category_id: Optional[str] = Form(None, description="Opsional, default kategori 'batik'"),
    description: Optional[str] = Form(None),
    additional_attribute: Optional[str] = Form(
        None,
        description='JSON object, contoh: {"motif":"Turonggo Yakso","teknik":"Tulis","bahan":"Katun","berat_gram":350}',
    ),
    active_status: bool = Form(True),
    product_link: Optional[str] = Form(None),
    mockup_output_format: Literal["webp", "png"] = Form("webp"),
    display_images: Optional[List[UploadFile]] = File(None, description="Multiple gambar galeri"),
    mockup_image: Optional[UploadFile] = File(None, description="Single gambar mockup 3D"),
    account_id: str = Depends(get_current_account_id),
    db: Session = Depends(get_db),
):
    return await controller_create_product(
        account_id=account_id,
        name=name,
        price=price,
        category_id=category_id,
        description=description,
        additional_attribute_raw=additional_attribute,
        active_status=active_status,
        product_link=product_link,
        mockup_output_format=mockup_output_format,
        display_images=display_images,
        mockup_image=mockup_image,
        db=db,
    )


@router.patch("/{product_id}")
async def update_product_route(
    product_id: UUID,
    name: Optional[str] = Form(None),
    price: Optional[float] = Form(None),
    category_id: Optional[str] = Form(None),
    description: Optional[str] = Form(None),
    additional_attribute: Optional[str] = Form(None, description="JSON object atribut tambahan"),
    active_status: Optional[bool] = Form(None),
    product_link: Optional[str] = Form(None),
    delete_display_image_ids: Optional[str] = Form(
        None,
        description='JSON array ID product_display_image yang dihapus, contoh: ["uuid-1"]',
    ),
    display_image_orders: Optional[str] = Form(
        None,
        description='JSON array urutan gambar, contoh: [{"id":"uuid-1","order":0}]',
    ),
    remove_mockup: bool = Form(False, description="Set true untuk menghapus mockup tanpa pengganti"),
    mockup_output_format: Literal["webp", "png"] = Form("webp"),
    new_display_images: Optional[List[UploadFile]] = File(None, description="Tambah gambar display baru"),
    new_mockup_image: Optional[UploadFile] = File(None, description="Ganti/tambah gambar mockup 3D"),
    account_id: str = Depends(get_current_account_id),
    db: Session = Depends(get_db),
):
    return await controller_update_product(
        account_id=account_id,
        product_id=product_id,
        name=name,
        price=price,
        category_id=category_id,
        description=description,
        additional_attribute_raw=additional_attribute,
        active_status=active_status,
        product_link=product_link,
        delete_display_image_ids_raw=delete_display_image_ids,
        display_image_orders_raw=display_image_orders,
        remove_mockup=remove_mockup,
        mockup_output_format=mockup_output_format,
        new_display_images=new_display_images,
        new_mockup_image=new_mockup_image,
        db=db,
    )


@router.patch("/{product_id}/status")
def update_product_status_route(
    product_id: UUID,
    data: ProductStatusRequest,
    account_id: str = Depends(get_current_account_id),
    db: Session = Depends(get_db),
):
    return controller_update_product_status(account_id, product_id, data, db)


@router.delete("/{product_id}")
def delete_product_route(
    product_id: UUID,
    permanent: bool = Query(False, description="true untuk hapus permanen beserta file di storage 3003"),
    account_id: str = Depends(get_current_account_id),
    db: Session = Depends(get_db),
):
    return controller_delete_product(account_id, product_id, permanent, db)


# --- Public (Web Pengunjung - Tanpa Login) ---
@router.get("")
def list_and_search_products_route(
    q: Optional[str] = Query(None, description="Kata kunci nama produk, toko, atau atribut"),
    motif: Optional[str] = Query(None, description="Filter motif batik"),
    shop_id: Optional[UUID] = Query(None, description="Filter berdasarkan ID toko"),
    category_slug: Optional[str] = Query(None, description="Filter slug kategori, misal: batik"),
    min_price: Optional[float] = Query(None, ge=0),
    max_price: Optional[float] = Query(None, ge=0),
    sort_by: Literal["newest", "price_asc", "price_desc", "name_asc"] = Query("newest"),
    page: int = Query(1, ge=1),
    limit: int = Query(12, ge=1, le=100),
    db: Session = Depends(get_db),
):
    return controller_search_public_products(
        q=q,
        motif=motif,
        shop_id=str(shop_id) if shop_id else None,
        category_slug=category_slug,
        min_price=min_price,
        max_price=max_price,
        sort_by=sort_by,
        page=page,
        limit=limit,
        db=db,
    )


@router.get("/{product_id}")
def get_public_product_detail_route(
    product_id: UUID,
    db: Session = Depends(get_db),
):
    return controller_get_public_product(product_id, db)


# =========================================================================
# 2. CONTROLLER
# =========================================================================

def controller_list_categories(db: Session):
    result = list_categories_with_attributes(db)
    return {"status": "success", "data": result}


def controller_list_my_products(
    account_id: str,
    q: Optional[str],
    active_status: Optional[bool],
    category_slug: Optional[str],
    page: int,
    limit: int,
    db: Session,
):
    result = list_my_products(
        db=db,
        account_id=account_id,
        q=q,
        active_status=active_status,
        category_slug=category_slug,
        page=page,
        limit=limit,
    )
    return {"status": "success", "data": result}


def controller_get_my_product(account_id: str, product_id: UUID, db: Session):
    result = get_my_product_by_id(db, account_id, product_id)
    return {"status": "success", "data": result}


async def controller_create_product(
    account_id: str,
    name: str,
    price: float,
    category_id: Optional[str],
    description: Optional[str],
    additional_attribute_raw: Optional[str],
    active_status: bool,
    product_link: Optional[str],
    mockup_output_format: str,
    display_images: Optional[List[UploadFile]],
    mockup_image: Optional[UploadFile],
    db: Session,
):
    parsed_attrs = _parse_json_field(additional_attribute_raw, "additional_attribute", dict)
    display_files = await _read_upload_files(display_images)
    mockup_file = await _read_single_upload(mockup_image)

    result = await run_in_threadpool(
        create_product,
        db=db,
        account_id=account_id,
        name=name,
        price=price,
        category_id=category_id,
        description=description,
        additional_attribute=parsed_attrs,
        active_status=active_status,
        product_link=product_link,
        display_files=display_files,
        mockup_file=mockup_file,
        mockup_output_format=mockup_output_format,
    )
    return {"status": "success", "message": "Produk berhasil ditambahkan", "data": result}


async def controller_update_product(
    account_id: str,
    product_id: UUID,
    name: Optional[str],
    price: Optional[float],
    category_id: Optional[str],
    description: Optional[str],
    additional_attribute_raw: Optional[str],
    active_status: Optional[bool],
    product_link: Optional[str],
    delete_display_image_ids_raw: Optional[str],
    display_image_orders_raw: Optional[str],
    remove_mockup: bool,
    mockup_output_format: str,
    new_display_images: Optional[List[UploadFile]],
    new_mockup_image: Optional[UploadFile],
    db: Session,
):
    parsed_attrs = _parse_json_field(additional_attribute_raw, "additional_attribute", dict)
    parsed_delete_ids = _parse_json_field(
        delete_display_image_ids_raw, "delete_display_image_ids", list
    )
    parsed_orders = _parse_json_field(display_image_orders_raw, "display_image_orders", list)

    display_files = await _read_upload_files(new_display_images)
    mockup_file = await _read_single_upload(new_mockup_image)

    result = await run_in_threadpool(
        update_product,
        db=db,
        account_id=account_id,
        product_id=product_id,
        name=name,
        price=price,
        category_id=category_id,
        description=description,
        additional_attribute=parsed_attrs,
        active_status=active_status,
        product_link=product_link,
        new_display_files=display_files,
        delete_display_image_ids=parsed_delete_ids,
        display_image_orders=parsed_orders,
        new_mockup_file=mockup_file,
        remove_mockup=remove_mockup,
        mockup_output_format=mockup_output_format,
    )
    return {"status": "success", "message": "Produk berhasil diperbarui", "data": result}


def controller_update_product_status(
    account_id: str,
    product_id: UUID,
    data: ProductStatusRequest,
    db: Session,
):
    result = set_product_status(db, account_id, product_id, data.active_status)
    status_text = "diaktifkan" if data.active_status else "dinonaktifkan"
    return {"status": "success", "message": f"Produk berhasil {status_text}", "data": result}


def controller_delete_product(
    account_id: str,
    product_id: UUID,
    permanent: bool,
    db: Session,
):
    result = delete_product(db, account_id, product_id, permanent=permanent)
    msg = "Produk berhasil dihapus permanen" if permanent else "Produk berhasil dinonaktifkan"
    return {"status": "success", "message": msg, "data": result}


def controller_search_public_products(
    q: Optional[str],
    motif: Optional[str],
    shop_id: Optional[str],
    category_slug: Optional[str],
    min_price: Optional[float],
    max_price: Optional[float],
    sort_by: str,
    page: int,
    limit: int,
    db: Session,
):
    result = search_public_products(
        db=db,
        q=q,
        motif=motif,
        shop_id=shop_id,
        category_slug=category_slug,
        min_price=min_price,
        max_price=max_price,
        sort_by=sort_by,
        page=page,
        limit=limit,
    )
    return {"status": "success", "data": result}


def controller_get_public_product(product_id: UUID, db: Session):
    result = get_public_product_by_id(db, product_id)
    return {"status": "success", "data": result}

# Tambahkan ke daftar import dari service.product_service:
# search_products_for_harness

harness_router = APIRouter(tags=["Harness Internal"])


@harness_router.get("/api/products/search")
def harness_search_products_route(
    keyword: Optional[str] = Query(None, description="Kata kunci nama toko/produk"),
    motif: Optional[str] = Query(None, description="Filter motif batik"),
    max_harga: Optional[float] = Query(None, ge=0, description="Batas harga maksimal"),
    limit: int = Query(5, ge=1, le=20),
    db: Session = Depends(get_db),
):
    return controller_harness_search_products(keyword, motif, max_harga, limit, db)


def controller_harness_search_products(
    keyword: Optional[str],
    motif: Optional[str],
    max_harga: Optional[float],
    limit: int,
    db: Session,
):
    result = search_products_for_harness(
        db=db,
        keyword=keyword,
        motif=motif,
        max_harga=max_harga,
        limit=limit,
    )
    return {"status": "success", "data": result}
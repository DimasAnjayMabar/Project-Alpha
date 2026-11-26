# backend/service/product_service.py
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
import math
from typing import Any, Dict, List, Optional
from uuid import UUID

from sqlalchemy import String, cast, func, or_
from sqlalchemy.orm import Session

from migration.models import (
    Category,
    CategoryAttribute,
    Product,
    ProductDisplayImage,
    ProductMockupImage,
    Shop,
)
from service.exceptions import ServiceException, ValidationError
from service.storage_service import (
    IncomingFile,
    build_public_media_url,
    delete_storage_files,
    upload_display_images,
    upload_mockup_image,
)

DEFAULT_CATEGORY_SLUG = "batik"


# =========================================================================
# HELPER INTERNAL
# =========================================================================

def _validate_uuid_str(value: str | UUID, label: str = "ID") -> str:
    try:
        return str(UUID(str(value)))
    except (ValueError, TypeError):
        raise ValidationError(f"Format {label} tidak valid.")


def _parse_price(value: Any) -> Decimal:
    try:
        price = Decimal(str(value))
    except (InvalidOperation, ValueError, TypeError):
        raise ValidationError("Format harga tidak valid.")

    if price < 0:
        raise ValidationError("Harga tidak boleh bernilai negatif.")
    if price >= Decimal("10000000000"):  # Batas DECIMAL(12,2)
        raise ValidationError("Harga melebihi batas maksimal.")
    return price.quantize(Decimal("0.01"))


def _get_shop_by_account(db: Session, account_id: str | UUID) -> Shop:
    acc_id_str = _validate_uuid_str(account_id, "account_id")
    shop = db.query(Shop).filter(cast(Shop.account_id, String) == acc_id_str).first()
    if not shop:
        raise ServiceException("Toko tidak ditemukan untuk akun ini.", status_code=404)
    return shop


def _resolve_category(db: Session, category_id: Optional[str] = None) -> Category:
    cleaned_id = category_id.strip() if isinstance(category_id, str) else category_id
    if cleaned_id:
        cat_id_str = _validate_uuid_str(cleaned_id, "category_id")
        category = db.query(Category).filter(cast(Category.id, String) == cat_id_str).first()
        if not category:
            raise ServiceException("Kategori tidak ditemukan.", status_code=404)
        return category

    category = db.query(Category).filter(Category.slug == DEFAULT_CATEGORY_SLUG).first()
    if not category:
        raise ServiceException(
            f"Kategori default '{DEFAULT_CATEGORY_SLUG}' belum tersedia di database.",
            status_code=404,
        )
    return category


def _validate_additional_attributes(
    db: Session,
    category_id: Any,
    attrs: Optional[Dict[str, Any]],
) -> Dict[str, Any]:
    """Validasi additional_attribute terhadap registry category_attribute."""
    if attrs is None:
        attrs = {}
    if not isinstance(attrs, dict):
        raise ValidationError("additional_attribute harus berupa JSON object.")

    schema_rows = (
        db.query(CategoryAttribute)
        .filter(cast(CategoryAttribute.category_id, String) == str(category_id))
        .order_by(CategoryAttribute.order.asc())
        .all()
    )

    for row in schema_rows:
        key = row.name
        val = attrs.get(key)

        is_missing = val is None or (isinstance(val, str) and not val.strip())
        if row.required and is_missing:
            raise ValidationError(f"Atribut '{key}' wajib diisi untuk kategori ini.")

        if is_missing:
            continue

        expected_type = str(row.type).lower()
        if expected_type == "string":
            if not isinstance(val, str):
                raise ValidationError(f"Atribut '{key}' harus bertipe teks (string).")
        elif expected_type == "number":
            if isinstance(val, bool) or not isinstance(val, (int, float)):
                raise ValidationError(f"Atribut '{key}' harus bertipe angka (number).")
        elif expected_type == "boolean":
            if not isinstance(val, bool):
                raise ValidationError(f"Atribut '{key}' harus bertipe boolean (true/false).")
        elif expected_type == "date":
            if not isinstance(val, str):
                raise ValidationError(f"Atribut '{key}' harus berupa tanggal format YYYY-MM-DD.")
            try:
                date.fromisoformat(val)
            except ValueError:
                raise ValidationError(f"Atribut '{key}' tidak valid. Gunakan format YYYY-MM-DD.")

    return attrs


def _serialize_product(
    db: Session,
    product: Product,
    shop: Optional[Shop] = None,
    category: Optional[Category] = None,
) -> dict:
    display_rows = (
        db.query(ProductDisplayImage)
        .filter(cast(ProductDisplayImage.product_id, String) == str(product.id))
        .order_by(ProductDisplayImage.order.asc(), ProductDisplayImage.created_at.asc())
        .all()
    )
    mockup_row = (
        db.query(ProductMockupImage)
        .filter(cast(ProductMockupImage.product_id, String) == str(product.id))
        .first()
    )

    if category is None:
        category = (
            db.query(Category)
            .filter(cast(Category.id, String) == str(product.category_id))
            .first()
        )
    if shop is None:
        shop = (
            db.query(Shop)
            .filter(cast(Shop.id, String) == str(product.shop_id))
            .first()
        )

    return {
        "id": str(product.id),
        "shop_id": str(product.shop_id),
        "category_id": str(product.category_id),
        "category_name": category.name if category else None,
        "category_slug": category.slug if category else None,
        "name": product.name,
        "price": float(product.price),
        "description": product.description,
        "additional_attribute": product.additional_attribute or {},
        "active_status": bool(product.active_status),
        "product_link": product.product_link,
        "display_images": [
            {
                "id": str(img.id),
                "image_url": img.image_url,
                "public_url": build_public_media_url(img.image_url),
                "order": img.order,
            }
            for img in display_rows
        ],
        "mockup_image": (
            {
                "id": str(mockup_row.id),
                "image_url": mockup_row.image_url,
                "public_url": build_public_media_url(mockup_row.image_url),
            }
            if mockup_row
            else None
        ),
        "shop": (
            {
                "id": str(shop.id),
                "name": shop.name,
                "address": shop.address,
                "number": shop.number,
                "instagram": shop.instagram,
                "online_shop": shop.online_shop,
                "gmaps": shop.gmaps,
                "description": shop.description,
            }
            if shop
            else None
        ),
        "created_at": product.created_at.isoformat() if product.created_at else None,
        "updated_at": product.updated_at.isoformat() if product.updated_at else None,
    }


def _get_owned_product(db: Session, account_id: str | UUID, product_id: str | UUID) -> tuple[Shop, Product]:
    shop = _get_shop_by_account(db, account_id)
    prod_id_str = _validate_uuid_str(product_id, "product_id")

    product = (
        db.query(Product)
        .filter(
            cast(Product.id, String) == prod_id_str,
            cast(Product.shop_id, String) == str(shop.id),
        )
        .first()
    )
    if not product:
        raise ServiceException(
            "Produk tidak ditemukan atau bukan milik toko Anda.",
            status_code=404,
        )
    return shop, product


# =========================================================================
# CATEGORY & SCHEMA ATTRIBUTE (HELPER FORM SELLER)
# =========================================================================

def list_categories_with_attributes(db: Session) -> List[dict]:
    try:
        categories = db.query(Category).order_by(Category.name.asc()).all()
        result = []
        for cat in categories:
            attrs = (
                db.query(CategoryAttribute)
                .filter(cast(CategoryAttribute.category_id, String) == str(cat.id))
                .order_by(CategoryAttribute.order.asc())
                .all()
            )
            result.append({
                "id": str(cat.id),
                "name": cat.name,
                "slug": cat.slug,
                "attributes": [
                    {
                        "id": str(a.id),
                        "name": a.name,
                        "type": str(a.type),
                        "required": bool(a.required),
                        "order": a.order,
                    }
                    for a in attrs
                ],
            })
        return result
    except Exception as e:
        if isinstance(e, ServiceException):
            raise e
        raise ServiceException(f"Gagal mengambil daftar kategori: {str(e)}", status_code=500)


# =========================================================================
# CREATE PRODUK + UPLOAD STORAGE (PORT 3003)
# =========================================================================

def create_product(
    db: Session,
    account_id: str | UUID,
    name: str,
    price: Any,
    category_id: Optional[str] = None,
    description: Optional[str] = None,
    additional_attribute: Optional[Dict[str, Any]] = None,
    active_status: bool = True,
    product_link: Optional[str] = None,
    display_files: Optional[List[IncomingFile]] = None,
    mockup_file: Optional[IncomingFile] = None,
    mockup_output_format: str = "webp",
) -> dict:
    cleaned_name = (name or "").strip()
    if len(cleaned_name) < 2:
        raise ValidationError("Nama produk minimal 2 karakter.")

    parsed_price = _parse_price(price)
    shop = _get_shop_by_account(db, account_id)
    category = _resolve_category(db, category_id)
    validated_attrs = _validate_additional_attributes(db, category.id, additional_attribute)

    uploaded_paths: List[str] = []
    display_meta_list: List[dict] = []
    mockup_meta: Optional[dict] = None

    try:
        # 1. Upload gambar ke storage server (port 3003)
        if display_files:
            upload_res = upload_display_images(display_files, prefix=cleaned_name)
            display_meta_list = upload_res.get("files", [])
            uploaded_paths.extend(
                item["image_url"] for item in display_meta_list if item.get("image_url")
            )

        if mockup_file:
            m_name, m_ctype, m_bytes = mockup_file
            mockup_meta = upload_mockup_image(
                filename=m_name,
                content_type=m_ctype,
                raw_bytes=m_bytes,
                prefix=cleaned_name,
                output_format=mockup_output_format,
            )
            if mockup_meta.get("image_url"):
                uploaded_paths.append(mockup_meta["image_url"])

        # 2. Simpan ke DB dalam satu transaksi
        new_product = Product(
            shop_id=shop.id,
            category_id=category.id,
            name=cleaned_name,
            price=parsed_price,
            description=description,
            additional_attribute=validated_attrs,
            active_status=bool(active_status),
            product_link=product_link,
        )
        db.add(new_product)
        db.flush()

        for idx, item in enumerate(display_meta_list):
            db.add(
                ProductDisplayImage(
                    product_id=new_product.id,
                    image_url=item["image_url"],
                    order=idx,
                )
            )

        if mockup_meta:
            db.add(
                ProductMockupImage(
                    product_id=new_product.id,
                    image_url=mockup_meta["image_url"],
                )
            )

        db.commit()
        db.refresh(new_product)
        return _serialize_product(db, new_product, shop=shop, category=category)

    except Exception as e:
        db.rollback()
        # Rollback file di port 3003 jika simpan DB atau upload kedua gagal
        if uploaded_paths:
            delete_storage_files(uploaded_paths, ignore_errors=True)
        if isinstance(e, ServiceException):
            raise e
        raise ServiceException(f"Gagal menambahkan produk: {str(e)}", status_code=500)


# =========================================================================
# UPDATE PRODUK + SINKRONISASI STORAGE (PORT 3003)
# =========================================================================

def update_product(
    db: Session,
    account_id: str | UUID,
    product_id: str | UUID,
    name: Optional[str] = None,
    price: Any = None,
    category_id: Optional[str] = None,
    description: Optional[str] = None,
    additional_attribute: Optional[Dict[str, Any]] = None,
    active_status: Optional[bool] = None,
    product_link: Optional[str] = None,
    new_display_files: Optional[List[IncomingFile]] = None,
    delete_display_image_ids: Optional[List[str]] = None,
    display_image_orders: Optional[List[Dict[str, Any]]] = None,
    new_mockup_file: Optional[IncomingFile] = None,
    remove_mockup: bool = False,
    mockup_output_format: str = "webp",
) -> dict:
    shop, product = _get_owned_product(db, account_id, product_id)

    # Abaikan category_id jika dikirim sebagai string kosong dari multipart form
    cleaned_category_id = category_id.strip() if isinstance(category_id, str) else category_id
    is_changing_category = bool(cleaned_category_id)

    target_category = (
        _resolve_category(db, cleaned_category_id)
        if is_changing_category
        else _resolve_category(db, str(product.category_id))
    )

    if name is not None:
        cleaned_name = name.strip()
        if len(cleaned_name) < 2:
            raise ValidationError("Nama produk minimal 2 karakter.")
    else:
        cleaned_name = product.name

    parsed_price = _parse_price(price) if price is not None else None

    # Validasi additional_attribute jika dikirim atau jika ganti kategori
    if additional_attribute is not None or is_changing_category:
        attrs_to_validate = (
            additional_attribute
            if additional_attribute is not None
            else (product.additional_attribute or {})
        )
        validated_attrs = _validate_additional_attributes(db, target_category.id, attrs_to_validate)
    else:
        validated_attrs = None

    # Validasi struktur display_image_orders sebelum menyentuh storage / DB
    if display_image_orders is not None:
        for item in display_image_orders:
            if not isinstance(item, dict):
                raise ValidationError(
                    "Setiap item pada display_image_orders harus berupa JSON object."
                )

    newly_uploaded_paths: List[str] = []
    old_paths_to_delete: List[str] = []
    new_display_meta: List[dict] = []
    new_mockup_meta: Optional[dict] = None

    try:
        # 1. Upload file baru dulu ke port 3003 (jangan hapus file lama sebelum commit!)
        if new_display_files:
            upload_res = upload_display_images(new_display_files, prefix=cleaned_name)
            new_display_meta = upload_res.get("files", [])
            newly_uploaded_paths.extend(
                item["image_url"] for item in new_display_meta if item.get("image_url")
            )

        if new_mockup_file:
            m_name, m_ctype, m_bytes = new_mockup_file
            new_mockup_meta = upload_mockup_image(
                filename=m_name,
                content_type=m_ctype,
                raw_bytes=m_bytes,
                prefix=cleaned_name,
                output_format=mockup_output_format,
            )
            if new_mockup_meta.get("image_url"):
                newly_uploaded_paths.append(new_mockup_meta["image_url"])

        # 2. Update field utama produk
        if name is not None:
            product.name = cleaned_name
        if parsed_price is not None:
            product.price = parsed_price
        if is_changing_category:
            product.category_id = target_category.id
        if description is not None:
            product.description = description
        if validated_attrs is not None:
            product.additional_attribute = validated_attrs
        if active_status is not None:
            product.active_status = bool(active_status)
        if product_link is not None:
            product.product_link = product_link
        product.updated_at = datetime.utcnow()

        # 3. Hapus gambar display lama yang diminta seller
        if delete_display_image_ids:
            valid_del_ids = [
                _validate_uuid_str(img_id, "delete_display_image_ids")
                for img_id in delete_display_image_ids
            ]
            imgs_to_remove = (
                db.query(ProductDisplayImage)
                .filter(
                    cast(ProductDisplayImage.product_id, String) == str(product.id),
                    cast(ProductDisplayImage.id, String).in_(valid_del_ids),
                )
                .all()
            )
            for img in imgs_to_remove:
                old_paths_to_delete.append(img.image_url)
                db.delete(img)
            db.flush()

        # 4. Atur ulang urutan gambar display eksisting jika dikirim
        if display_image_orders:
            existing_imgs = (
                db.query(ProductDisplayImage)
                .filter(cast(ProductDisplayImage.product_id, String) == str(product.id))
                .all()
            )
            img_map = {str(img.id): img for img in existing_imgs}
            for item in display_image_orders:
                img_id = str(item.get("id", ""))
                new_order = item.get("order")
                if (
                    img_id in img_map
                    and isinstance(new_order, int)
                    and not isinstance(new_order, bool)
                    and new_order >= 0
                ):
                    img_map[img_id].order = new_order
            db.flush()

        # 5. Tambahkan gambar display baru di urutan terakhir
        if new_display_meta:
            max_order = (
                db.query(func.max(ProductDisplayImage.order))
                .filter(cast(ProductDisplayImage.product_id, String) == str(product.id))
                .scalar()
            )
            next_order = (max_order + 1) if max_order is not None else 0
            for offset, item in enumerate(new_display_meta):
                db.add(
                    ProductDisplayImage(
                        product_id=product.id,
                        image_url=item["image_url"],
                        order=next_order + offset,
                    )
                )

        # 6. Kelola gambar mockup 3D (ganti atau hapus)
        existing_mockup = (
            db.query(ProductMockupImage)
            .filter(cast(ProductMockupImage.product_id, String) == str(product.id))
            .first()
        )
        if new_mockup_meta:
            if existing_mockup:
                old_paths_to_delete.append(existing_mockup.image_url)
                existing_mockup.image_url = new_mockup_meta["image_url"]
            else:
                db.add(
                    ProductMockupImage(
                        product_id=product.id,
                        image_url=new_mockup_meta["image_url"],
                    )
                )
        elif remove_mockup and existing_mockup:
            old_paths_to_delete.append(existing_mockup.image_url)
            db.delete(existing_mockup)

        db.commit()
        db.refresh(product)

        # 7. Commit DB sukses -> hapus file lama di storage server (port 3003)
        if old_paths_to_delete:
            delete_storage_files(old_paths_to_delete, ignore_errors=True)

        return _serialize_product(db, product, shop=shop, category=target_category)

    except Exception as e:
        db.rollback()
        # Commit DB gagal -> rollback hanya file BARU, file lama tetap aman
        if newly_uploaded_paths:
            delete_storage_files(newly_uploaded_paths, ignore_errors=True)
        if isinstance(e, ServiceException):
            raise e
        raise ServiceException(f"Gagal memperbarui produk: {str(e)}", status_code=500)


# =========================================================================
# STATUS & DELETE PRODUK (SELLER)
# =========================================================================

def set_product_status(
    db: Session,
    account_id: str | UUID,
    product_id: str | UUID,
    active_status: bool,
) -> dict:
    try:
        shop, product = _get_owned_product(db, account_id, product_id)
        product.active_status = bool(active_status)
        product.updated_at = datetime.utcnow()
        db.commit()
        db.refresh(product)
        return _serialize_product(db, product, shop=shop)
    except Exception as e:
        db.rollback()
        if isinstance(e, ServiceException):
            raise e
        raise ServiceException(f"Gagal mengubah status produk: {str(e)}", status_code=500)


def delete_product(
    db: Session,
    account_id: str | UUID,
    product_id: str | UUID,
    permanent: bool = False,
) -> dict:
    """
    Default: soft delete (active_status = False).
    Jika permanent=True: hapus permanen dari DB + bersihkan file gambar di port 3003.
    """
    if not permanent:
        return set_product_status(db, account_id, product_id, active_status=False)

    paths_to_delete: List[str] = []
    try:
        _, product = _get_owned_product(db, account_id, product_id)
        prod_id_str = str(product.id)

        display_rows = (
            db.query(ProductDisplayImage)
            .filter(cast(ProductDisplayImage.product_id, String) == prod_id_str)
            .all()
        )
        for img in display_rows:
            paths_to_delete.append(img.image_url)
            db.delete(img)

        mockup_row = (
            db.query(ProductMockupImage)
            .filter(cast(ProductMockupImage.product_id, String) == prod_id_str)
            .first()
        )
        if mockup_row:
            paths_to_delete.append(mockup_row.image_url)
            db.delete(mockup_row)

        deleted_id = str(product.id)
        db.delete(product)
        db.commit()

        if paths_to_delete:
            delete_storage_files(paths_to_delete, ignore_errors=True)

        return {"id": deleted_id, "deleted_permanently": True}

    except Exception as e:
        db.rollback()
        if isinstance(e, ServiceException):
            raise e
        raise ServiceException(f"Gagal menghapus produk: {str(e)}", status_code=500)


# =========================================================================
# READ & SEARCH (SELLER - TERMASUK PRODUK NONAKTIF)
# =========================================================================

def list_my_products(
    db: Session,
    account_id: str | UUID,
    q: Optional[str] = None,
    active_status: Optional[bool] = None,
    category_slug: Optional[str] = None,
    page: int = 1,
    limit: int = 12,
) -> dict:
    if page < 1:
        raise ValidationError("Parameter page minimal 1.")
    if limit < 1 or limit > 100:
        raise ValidationError("Parameter limit harus antara 1 sampai 100.")

    try:
        shop = _get_shop_by_account(db, account_id)
        query = db.query(Product).filter(cast(Product.shop_id, String) == str(shop.id))

        if active_status is not None:
            query = query.filter(Product.active_status.is_(active_status))

        if category_slug and category_slug.strip():
            query = query.join(
                Category, cast(Product.category_id, String) == cast(Category.id, String)
            ).filter(Category.slug == category_slug.strip().lower())

        if q and q.strip():
            kw = f"%{q.strip()}%"
            query = query.filter(
                or_(
                    Product.name.ilike(kw),
                    Product.description.ilike(kw),
                    cast(Product.additional_attribute, String).ilike(kw),
                )
            )

        total = query.with_entities(func.count(Product.id)).scalar() or 0
        offset = (page - 1) * limit
        products = (
            query.order_by(Product.created_at.desc())
            .offset(offset)
            .limit(limit)
            .all()
        )

        return {
            "items": [_serialize_product(db, p, shop=shop) for p in products],
            "pagination": {
                "page": page,
                "limit": limit,
                "total": total,
                "total_pages": math.ceil(total / limit) if total > 0 else 0,
            },
        }
    except Exception as e:
        if isinstance(e, ServiceException):
            raise e
        raise ServiceException(f"Gagal mengambil daftar produk toko: {str(e)}", status_code=500)


def get_my_product_by_id(db: Session, account_id: str | UUID, product_id: str | UUID) -> dict:
    try:
        shop, product = _get_owned_product(db, account_id, product_id)
        return _serialize_product(db, product, shop=shop)
    except Exception as e:
        if isinstance(e, ServiceException):
            raise e
        raise ServiceException(f"Gagal mengambil detail produk: {str(e)}", status_code=500)


# =========================================================================
# READ & SEARCH (PUBLIC - WEB PENGUNJUNG & HARNESS CHATBOT)
# =========================================================================

def search_public_products(
    db: Session,
    q: Optional[str] = None,
    motif: Optional[str] = None,
    shop_id: Optional[str] = None,
    category_slug: Optional[str] = None,
    min_price: Optional[float] = None,
    max_price: Optional[float] = None,
    sort_by: str = "newest",
    page: int = 1,
    limit: int = 12,
) -> dict:
    if page < 1:
        raise ValidationError("Parameter page minimal 1.")
    if limit < 1 or limit > 100:
        raise ValidationError("Parameter limit harus antara 1 sampai 100.")
    if min_price is not None and max_price is not None and min_price > max_price:
        raise ValidationError("min_price tidak boleh lebih besar dari max_price.")

    try:
        # Hanya tampilkan produk aktif dari toko yang juga aktif
        query = (
            db.query(Product)
            .join(Shop, cast(Product.shop_id, String) == cast(Shop.id, String))
            .filter(Product.active_status.is_(True), Shop.active_status.is_(True))
        )

        if shop_id:
            shop_id_str = _validate_uuid_str(shop_id, "shop_id")
            query = query.filter(cast(Product.shop_id, String) == shop_id_str)

        if category_slug and category_slug.strip():
            query = query.join(
                Category, cast(Product.category_id, String) == cast(Category.id, String)
            ).filter(Category.slug == category_slug.strip().lower())

        if q and q.strip():
            kw = f"%{q.strip()}%"
            query = query.filter(
                or_(
                    Product.name.ilike(kw),
                    Product.description.ilike(kw),
                    Shop.name.ilike(kw),
                    Shop.description.ilike(kw),
                    cast(Product.additional_attribute, String).ilike(kw),
                )
            )

        if motif and motif.strip():
            motif_kw = f"%{motif.strip()}%"
            query = query.filter(
                or_(
                    Product.name.ilike(motif_kw),
                    cast(Product.additional_attribute, String).ilike(motif_kw),
                )
            )

        if min_price is not None:
            query = query.filter(Product.price >= Decimal(str(min_price)))
        if max_price is not None:
            query = query.filter(Product.price <= Decimal(str(max_price)))

        total = query.with_entities(func.count(Product.id)).scalar() or 0
        offset = (page - 1) * limit

        if sort_by == "price_asc":
            order_clause = Product.price.asc()
        elif sort_by == "price_desc":
            order_clause = Product.price.desc()
        elif sort_by == "name_asc":
            order_clause = Product.name.asc()
        else:
            order_clause = Product.created_at.desc()

        products = query.order_by(order_clause).offset(offset).limit(limit).all()

        return {
            "items": [_serialize_product(db, p) for p in products],
            "pagination": {
                "page": page,
                "limit": limit,
                "total": total,
                "total_pages": math.ceil(total / limit) if total > 0 else 0,
            },
        }
    except Exception as e:
        if isinstance(e, ServiceException):
            raise e
        raise ServiceException(f"Gagal mencari produk: {str(e)}", status_code=500)


def get_public_product_by_id(db: Session, product_id: str | UUID) -> dict:
    prod_id_str = _validate_uuid_str(product_id, "product_id")
    try:
        row = (
            db.query(Product, Shop)
            .join(Shop, cast(Product.shop_id, String) == cast(Shop.id, String))
            .filter(
                cast(Product.id, String) == prod_id_str,
                Product.active_status.is_(True),
                Shop.active_status.is_(True),
            )
            .first()
        )
        if not row:
            raise ServiceException("Produk tidak ditemukan atau sedang nonaktif.", status_code=404)

        product, shop = row
        return _serialize_product(db, product, shop=shop)
    except Exception as e:
        if isinstance(e, ServiceException):
            raise e
        raise ServiceException(f"Gagal mengambil detail produk: {str(e)}", status_code=500)
    
# =========================================================================
# ADAPTOR SEARCH UNTUK HARNESS CHATBOT (PORT 3001)
# =========================================================================

# =========================================================================
# ADAPTOR SEARCH UNTUK HARNESS CHATBOT (PORT 3001)
# =========================================================================

def search_products_for_harness(
    db: Session,
    keyword: Optional[str] = None,
    motif: Optional[str] = None,
    max_harga: Optional[float] = None,
    limit: int = 5,
) -> List[dict]:
    """
    Adaptor pencarian produk khusus harness/pipeline.py.
    Mengembalikan list datar lengkap dengan deskripsi & additional_attribute.
    """
    result = search_public_products(
        db=db,
        q=keyword,
        motif=motif,
        category_slug=None,
        max_price=max_harga,
        sort_by="price_asc" if max_harga is not None else "newest",
        page=1,
        limit=limit,
    )

    formatted: List[dict] = []
    for item in result.get("items", []):
        shop = item.get("shop") or {}
        attrs = item.get("additional_attribute") or {}
        display_imgs = item.get("display_images") or []
        mockup_img = item.get("mockup_image") or {}

        motif_val = attrs.get("motif")
        nama_tampil = item["name"]
        if motif_val and str(motif_val).lower() not in nama_tampil.lower():
            nama_tampil = f"{nama_tampil} (Motif {motif_val})"

        harga_int = int(round(item["price"]))

        formatted.append({
            # Field kompatibilitas untuk pipeline & kartu frontend
            "nama_motif": nama_tampil,
            "name": item["name"],
            "nama_umkm": shop.get("name") or "-",
            "harga": harga_int,
            "harga_per_meter": harga_int,
            "kontak_wa": shop.get("number") or "-",
            "alamat": shop.get("address") or "-",
            # Spesifikasi lengkap, deskripsi/filosofi produk & profil toko untuk CS
            "description": (item.get("description") or "").strip(),
            "shop_description": (shop.get("description") or "").strip(),
            "additional_attribute": attrs,
            "motif": motif_val,
            "teknik": attrs.get("teknik"),
            "bahan": attrs.get("bahan"),
            "bentuk": attrs.get("bentuk"),
            "panjang_cm": attrs.get("panjang_cm"),
            "lebar_cm": attrs.get("lebar_cm"),
            "berat_gram": attrs.get("berat_gram"),
            "pewarna_alami": attrs.get("pewarna_alami"),
            # Metadata tambahan untuk sources chatbot di frontend
            "id": item["id"],
            "shop_id": item["shop_id"],
            "product_link": item.get("product_link"),
            "thumbnail_url": display_imgs[0]["public_url"] if display_imgs else None,
            "mockup_url": mockup_img.get("public_url"),
        })

    return formatted
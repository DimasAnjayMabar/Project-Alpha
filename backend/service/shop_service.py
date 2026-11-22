# backend/service/shop_service.py
import math
import re
from typing import Optional
from uuid import UUID

from sqlalchemy import String, cast, func, or_
from sqlalchemy.orm import Session

from migration.models import Account, Shop
from service.exceptions import ServiceException, ValidationError


# =========================================================================
# HELPER INTERNAL
# =========================================================================

def _normalize_phone(number: Optional[str]) -> Optional[str]:
    """Rapikan nomor WA (08... -> 628..., buang spasi/strip)."""
    if not number:
        return None
    cleaned = re.sub(r"[^\d+]", "", number.strip())
    if cleaned.startswith("+"):
        cleaned = cleaned[1:]
    if cleaned.startswith("0"):
        cleaned = "62" + cleaned[1:]
    return cleaned[:20]


def _serialize_shop(shop: Shop) -> dict:
    return {
        "id": str(shop.id),
        "account_id": str(shop.account_id),
        "name": shop.name,
        "address": shop.address,
        "number": shop.number,
        "instagram": shop.instagram,
        "online_shop": shop.online_shop,
        "gmaps": shop.gmaps,
        "description": shop.description,
        "active_status": bool(shop.active_status),
    }


def _validate_uuid_str(value: str | UUID, label: str = "ID") -> str:
    try:
        return str(UUID(str(value)))
    except (ValueError, TypeError):
        raise ValidationError(f"Format {label} tidak valid.")


def get_shop_model_by_account(db: Session, account_id: str | UUID) -> Optional[Shop]:
    """Helper reusable untuk mencari toko berdasarkan account_id."""
    acc_id_str = _validate_uuid_str(account_id, "account_id")
    return db.query(Shop).filter(cast(Shop.account_id, String) == acc_id_str).first()


# =========================================================================
# CREATE (REGISTER ACCOUNT + SHOP)
# =========================================================================

def register_shop(db: Session, oauth_data: dict, shop_data: dict):
    # 1. Validasi Input
    name = (shop_data.get("name") or "").strip()
    if not name:
        raise ValidationError("Nama toko wajib diisi.")

    if not oauth_data.get("email") or not oauth_data.get("oauth_id"):
        raise ValidationError("Data OAuth tidak valid.")

    # 2. Try-Catch DB Query
    try:
        existing_account = db.query(Account).filter(
            Account.oauth_provider == oauth_data.get("oauth_provider"),
            Account.oauth_id == oauth_data.get("oauth_id"),
        ).first()

        if existing_account:
            raise ValidationError("Akun sudah terdaftar. Silakan login.")

        # Buat Account
        new_account = Account(
            email=oauth_data.get("email"),
            oauth_provider=oauth_data.get("oauth_provider"),
            oauth_id=oauth_data.get("oauth_id"),
            display_name=oauth_data.get("display_name"),
            profile=oauth_data.get("profile"),
        )
        db.add(new_account)
        db.flush()  # Flush untuk mendapatkan new_account.id

        # Buat Shop
        new_shop = Shop(
            account_id=new_account.id,
            name=name,
            address=shop_data.get("address"),
            number=_normalize_phone(shop_data.get("number")),
            instagram=shop_data.get("instagram"),
            online_shop=shop_data.get("online_shop"),
            gmaps=shop_data.get("gmaps"),
            description=shop_data.get("description"),
        )
        db.add(new_shop)

        db.commit()
        db.refresh(new_shop)

        # Cast ke str agar aman saat di-encode ke JWT & JSON
        return {
            "account_id": str(new_account.id),
            "shop_id": str(new_shop.id),
            "shop": _serialize_shop(new_shop),
        }

    except Exception as e:
        db.rollback()
        if isinstance(e, ServiceException):
            raise e
        raise ServiceException(f"Gagal mendaftarkan toko: {str(e)}", status_code=500)


# =========================================================================
# READ & SEARCH (PUBLIC - WEB PENGUNJUNG)
# =========================================================================

def search_public_shops(
    db: Session,
    q: Optional[str] = None,
    page: int = 1,
    limit: int = 12,
):
    if page < 1:
        raise ValidationError("Parameter page minimal 1.")
    if limit < 1 or limit > 100:
        raise ValidationError("Parameter limit harus antara 1 sampai 100.")

    try:
        query = db.query(Shop).filter(Shop.active_status.is_(True))

        if q and q.strip():
            keyword = f"%{q.strip()}%"
            query = query.filter(
                or_(
                    Shop.name.ilike(keyword),
                    Shop.address.ilike(keyword),
                    Shop.description.ilike(keyword),
                )
            )

        total = query.with_entities(func.count(Shop.id)).scalar() or 0
        offset = (page - 1) * limit

        shops = (
            query.order_by(Shop.name.asc())
            .offset(offset)
            .limit(limit)
            .all()
        )

        return {
            "items": [_serialize_shop(s) for s in shops],
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
        raise ServiceException(f"Gagal mengambil daftar toko: {str(e)}", status_code=500)


def get_public_shop_by_id(db: Session, shop_id: str | UUID):
    shop_id_str = _validate_uuid_str(shop_id, "shop_id")

    try:
        shop = (
            db.query(Shop)
            .filter(
                cast(Shop.id, String) == shop_id_str,
                Shop.active_status.is_(True),
            )
            .first()
        )
        if not shop:
            raise ServiceException("Toko tidak ditemukan atau sedang nonaktif.", status_code=404)

        return _serialize_shop(shop)

    except Exception as e:
        if isinstance(e, ServiceException):
            raise e
        raise ServiceException(f"Gagal mengambil detail toko: {str(e)}", status_code=500)


# =========================================================================
# READ, UPDATE, DELETE (SELLER - AUTHENTICATED)
# =========================================================================

def get_my_shop(db: Session, account_id: str | UUID):
    try:
        shop = get_shop_model_by_account(db, account_id)
        if not shop:
            raise ServiceException("Toko tidak ditemukan untuk akun ini.", status_code=404)

        return _serialize_shop(shop)

    except Exception as e:
        if isinstance(e, ServiceException):
            raise e
        raise ServiceException(f"Gagal mengambil data toko: {str(e)}", status_code=500)


def update_my_shop(db: Session, account_id: str | UUID, update_data: dict):
    if not update_data:
        raise ValidationError("Tidak ada data yang dikirim untuk diperbarui.")

    updatable_fields = {
        "name",
        "address",
        "number",
        "instagram",
        "online_shop",
        "gmaps",
        "description",
    }

    try:
        shop = get_shop_model_by_account(db, account_id)
        if not shop:
            raise ServiceException("Toko tidak ditemukan untuk akun ini.", status_code=404)

        for field, value in update_data.items():
            if field not in updatable_fields:
                continue

            if field == "name":
                cleaned_name = (value or "").strip()
                if not cleaned_name:
                    raise ValidationError("Nama toko tidak boleh kosong.")
                setattr(shop, field, cleaned_name)
            elif field == "number":
                setattr(shop, field, _normalize_phone(value))
            else:
                setattr(shop, field, value)

        db.commit()
        db.refresh(shop)
        return _serialize_shop(shop)

    except Exception as e:
        db.rollback()
        if isinstance(e, ServiceException):
            raise e
        raise ServiceException(f"Gagal memperbarui toko: {str(e)}", status_code=500)


def set_my_shop_status(db: Session, account_id: str | UUID, active_status: bool):
    try:
        shop = get_shop_model_by_account(db, account_id)
        if not shop:
            raise ServiceException("Toko tidak ditemukan untuk akun ini.", status_code=404)

        shop.active_status = active_status
        db.commit()
        db.refresh(shop)
        return _serialize_shop(shop)

    except Exception as e:
        db.rollback()
        if isinstance(e, ServiceException):
            raise e
        raise ServiceException(f"Gagal mengubah status toko: {str(e)}", status_code=500)


def soft_delete_my_shop(db: Session, account_id: str | UUID):
    """Soft delete dengan menonaktifkan toko agar relasi produk tetap utuh."""
    return set_my_shop_status(db, account_id, active_status=False)


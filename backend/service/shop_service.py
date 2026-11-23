# backend/service/shop_service.py
import math
import re
from typing import Optional
from uuid import UUID

from sqlalchemy import String, cast, func, or_
from sqlalchemy.orm import Session

from migration.models import Account, Shop
from service.exceptions import ServiceException, ValidationError
from service.storage_service import (
    IncomingFile,
    build_public_media_url,
    delete_storage_files,
    upload_shop_profile_image,
)


# =========================================================================
# HELPER INTERNAL
# =========================================================================

def _empty_to_none(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    cleaned = value.strip()
    return cleaned if cleaned else None


def _is_managed_storage_path(path: Optional[str]) -> bool:
    """Pastikan hanya file lokal di folder uploads/ yang dihapus ke storage 3003."""
    if not path:
        return False
    cleaned = path.strip().lstrip("/").replace("\\", "/")
    return cleaned.startswith("uploads/")


def _normalize_phone(number: Optional[str]) -> Optional[str]:
    """Rapikan nomor WA (08... -> 628..., buang spasi/strip)."""
    if not number:
        return None
    cleaned = re.sub(r"[^\d+]", "", number.strip())
    if not cleaned:
        return None
    if cleaned.startswith("+"):
        cleaned = cleaned[1:]
    if cleaned.startswith("0"):
        cleaned = "62" + cleaned[1:]
    return cleaned[:20]


def _serialize_shop(shop: Shop, profile: Optional[str] = None) -> dict:
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
        "profile": profile,
        "profile_public_url": build_public_media_url(profile),
        "active_status": bool(shop.active_status),
    }


def _validate_uuid_str(value: str | UUID, label: str = "ID") -> str:
    try:
        return str(UUID(str(value)))
    except (ValueError, TypeError):
        raise ValidationError(f"Format {label} tidak valid.")


def _get_account_model_by_id(db: Session, account_id: str | UUID) -> Optional[Account]:
    acc_id_str = _validate_uuid_str(account_id, "account_id")
    return db.query(Account).filter(cast(Account.id, String) == acc_id_str).first()


def _get_account_profile_by_id(db: Session, account_id: str | UUID) -> Optional[str]:
    acc_id_str = str(account_id)
    row = (
        db.query(Account.profile)
        .filter(cast(Account.id, String) == acc_id_str)
        .first()
    )
    return row[0] if row else None


def _get_account_profiles_map(db: Session, account_ids: list[str]) -> dict[str, Optional[str]]:
    unique_ids = list(dict.fromkeys(str(aid) for aid in account_ids if aid))
    if not unique_ids:
        return {}
    rows = (
        db.query(Account.id, Account.profile)
        .filter(cast(Account.id, String).in_(unique_ids))
        .all()
    )
    return {str(acc_id): profile for acc_id, profile in rows}


def get_shop_model_by_account(db: Session, account_id: str | UUID) -> Optional[Shop]:
    """Helper reusable untuk mencari toko berdasarkan account_id."""
    acc_id_str = _validate_uuid_str(account_id, "account_id")
    return db.query(Shop).filter(cast(Shop.account_id, String) == acc_id_str).first()


# =========================================================================
# CREATE (REGISTER ACCOUNT + SHOP + OPSIONAL UPLOAD LOGO KE PORT 3003)
# =========================================================================

def register_shop(
    db: Session,
    oauth_data: dict,
    shop_data: dict,
    profile_image: Optional[IncomingFile] = None,
):
    # 1. Validasi Input sebelum mengunggah file ke storage
    name = (shop_data.get("name") or "").strip()
    if not name:
        raise ValidationError("Nama toko wajib diisi.")
    if len(name) < 2:
        raise ValidationError("Nama toko minimal 2 karakter.")

    email = (oauth_data.get("email") or "").strip().lower()
    oauth_id = (oauth_data.get("oauth_id") or "").strip()
    oauth_provider = (oauth_data.get("oauth_provider") or "google").strip()

    if not email or not oauth_id:
        raise ValidationError("Data OAuth tidak valid.")

    uploaded_profile_path: Optional[str] = None

    # 2. Cek duplikasi -> Upload logo (jika ada) -> Simpan DB (rollback storage jika gagal)
    try:
        existing_account = (
            db.query(Account)
            .filter(
                or_(
                    (Account.oauth_provider == oauth_provider)
                    & (Account.oauth_id == oauth_id),
                    func.lower(Account.email) == email,
                )
            )
            .first()
        )

        if existing_account:
            raise ValidationError("Akun sudah terdaftar. Silakan login.")

        if profile_image is not None:
            filename, content_type, raw_bytes = profile_image
            uploaded = upload_shop_profile_image(
                filename=filename,
                content_type=content_type,
                raw_bytes=raw_bytes,
                prefix=name,
            )
            uploaded_profile_path = uploaded["image_url"]

        # Buat Account (email & oauth_id dari Google, profile dari upload logo UMKM)
        new_account = Account(
            email=email,
            oauth_provider=oauth_provider,
            oauth_id=oauth_id,
            display_name=None,
            profile=uploaded_profile_path,
        )
        db.add(new_account)
        db.flush()

        # Buat Shop
        new_shop = Shop(
            account_id=new_account.id,
            name=name,
            address=_empty_to_none(shop_data.get("address")),
            number=_normalize_phone(shop_data.get("number")),
            instagram=_empty_to_none(shop_data.get("instagram")),
            online_shop=_empty_to_none(shop_data.get("online_shop")),
            gmaps=_empty_to_none(shop_data.get("gmaps")),
            description=_empty_to_none(shop_data.get("description")),
        )
        db.add(new_shop)

        db.commit()
        db.refresh(new_shop)

        return {
            "account_id": str(new_account.id),
            "shop_id": str(new_shop.id),
            "shop": _serialize_shop(new_shop, profile=new_account.profile),
        }

    except Exception as e:
        db.rollback()
        if uploaded_profile_path:
            delete_storage_files([uploaded_profile_path], ignore_errors=True)
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

        profile_map = _get_account_profiles_map(db, [str(s.account_id) for s in shops])

        return {
            "items": [
                _serialize_shop(s, profile=profile_map.get(str(s.account_id)))
                for s in shops
            ],
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

        profile = _get_account_profile_by_id(db, shop.account_id)
        return _serialize_shop(shop, profile=profile)

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

        profile = _get_account_profile_by_id(db, shop.account_id)
        return _serialize_shop(shop, profile=profile)

    except Exception as e:
        if isinstance(e, ServiceException):
            raise e
        raise ServiceException(f"Gagal mengambil data toko: {str(e)}", status_code=500)


def update_my_shop(
    db: Session,
    account_id: str | UUID,
    update_data: dict,
    profile_image: Optional[IncomingFile] = None,
    remove_profile: bool = False,
):
    if not update_data and profile_image is None and not remove_profile:
        raise ValidationError("Tidak ada data yang dikirim untuk diperbarui.")

    updatable_fields = {
        "name",
        "address",
        "number",
        "instagram",
        "online_shop",
        "gmaps",
        "description",
        "active_status",
    }

    newly_uploaded_profile: Optional[str] = None
    old_profile_to_delete: Optional[str] = None

    try:
        shop = get_shop_model_by_account(db, account_id)
        if not shop:
            raise ServiceException("Toko tidak ditemukan untuk akun ini.", status_code=404)

        account = _get_account_model_by_id(db, shop.account_id)
        if not account:
            raise ServiceException("Akun pemilik toko tidak ditemukan.", status_code=404)

        # 1. Validasi & terapkan pembaruan field teks/status toko terlebih dahulu
        for field, value in update_data.items():
            if field not in updatable_fields:
                continue

            if field == "name":
                cleaned_name = (value or "").strip()
                if not cleaned_name:
                    raise ValidationError("Nama toko tidak boleh kosong.")
                if len(cleaned_name) < 2:
                    raise ValidationError("Nama toko minimal 2 karakter.")
                setattr(shop, field, cleaned_name)
            elif field == "number":
                setattr(shop, field, _normalize_phone(value))
            elif field == "active_status":
                if isinstance(value, bool):
                    setattr(shop, field, value)
            else:
                setattr(shop, field, _empty_to_none(value) if isinstance(value, str) else value)

        # 2. Kelola logo UMKM (Account.profile) dengan aman
        current_profile = account.profile

        if profile_image is not None:
            filename, content_type, raw_bytes = profile_image
            uploaded = upload_shop_profile_image(
                filename=filename,
                content_type=content_type,
                raw_bytes=raw_bytes,
                prefix=shop.name,
            )
            newly_uploaded_profile = uploaded["image_url"]
            account.profile = newly_uploaded_profile
            if _is_managed_storage_path(current_profile):
                old_profile_to_delete = current_profile
        elif remove_profile:
            account.profile = None
            if _is_managed_storage_path(current_profile):
                old_profile_to_delete = current_profile

        db.commit()
        db.refresh(shop)
        db.refresh(account)

        # 3. Setelah commit DB sukses, baru hapus logo lama di storage port 3003
        if old_profile_to_delete and old_profile_to_delete != account.profile:
            delete_storage_files([old_profile_to_delete], ignore_errors=True)

        return _serialize_shop(shop, profile=account.profile)

    except Exception as e:
        db.rollback()
        if newly_uploaded_profile:
            delete_storage_files([newly_uploaded_profile], ignore_errors=True)
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
        profile = _get_account_profile_by_id(db, shop.account_id)
        return _serialize_shop(shop, profile=profile)

    except Exception as e:
        db.rollback()
        if isinstance(e, ServiceException):
            raise e
        raise ServiceException(f"Gagal mengubah status toko: {str(e)}", status_code=500)


def soft_delete_my_shop(db: Session, account_id: str | UUID):
    """Soft delete dengan menonaktifkan toko agar relasi produk tetap utuh."""
    return set_my_shop_status(db, account_id, active_status=False)
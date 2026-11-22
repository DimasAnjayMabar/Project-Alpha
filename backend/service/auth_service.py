from sqlalchemy.orm import Session
from migration.models import Account
from service.exceptions import ValidationError, ServiceException

def login_oauth(db: Session, oauth_data: dict):
    # 1. Validasi
    if not oauth_data.get("email"):
        raise ValidationError("Email dari OAuth tidak ditemukan.")

    # 2. Try-Catch DB Query
    try:
        account = db.query(Account).filter(
            Account.oauth_provider == oauth_data.get("oauth_provider"),
            Account.oauth_id == oauth_data.get("oauth_id")
        ).first()

        # Jika belum terdaftar, kembalikan status butuh registrasi
        if not account:
            return {"status": "need_registration", "oauth_data": oauth_data}

        # Jika sudah terdaftar, login sukses
        return {
            "status": "success",
            "account": {
                "id": account.id,
                "email": account.email,
                "display_name": account.display_name,
                "role": account.role.value if account.role else "penjual"
            }
        }
    except Exception as e:
        # 3. Catch Service
        raise ServiceException(f"Gagal melakukan login: {str(e)}", status_code=500)

def logout_user():
    # Karena logout hanya menghapus cookie di sisi Controller, 
    # service ini hanya berfungsi sebagai penanda alur yang rapi.
    return {"status": "success", "message": "Berhasil logout"}
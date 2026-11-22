# seeder.py (jalankan dari root backend: python seeder.py)
from decimal import Decimal
from sqlalchemy import String, cast
from sqlalchemy.orm import Session

from database import get_db
from migration.models import (
    Account,
    Category,
    CategoryAttribute,
    Product,
    ProductDisplayImage,
    ProductMockupImage,
    Shop,
)

# =========================================================================
# ID AKUN & TOKO EXISTING (MILIK KAMU)
# =========================================================================
EXISTING_ACCOUNT_ID = "08d503e2-846d-416a-9652-4d3c1a36df33"
EXISTING_SHOP_ID = "6555ecc5-5dc4-444b-a470-4ce72db8559a"


# =========================================================================
# 1. DATA KATEGORI DEFAULT (HANYA BATIK) & SCHEMA ATRIBUT
# =========================================================================
CATEGORIES_DATA = [
    {
        "name": "Batik",
        "slug": "batik",
        "attributes": [
            {"name": "motif", "type": "string", "required": True, "order": 1},
            {"name": "teknik", "type": "string", "required": True, "order": 2},
            {"name": "bahan", "type": "string", "required": True, "order": 3},
            {"name": "bentuk", "type": "string", "required": False, "order": 4},  # default "Kain", bisa "Baju" jika sudah jadi
            {"name": "panjang_cm", "type": "number", "required": False, "order": 5},
            {"name": "lebar_cm", "type": "number", "required": False, "order": 6},
            {"name": "berat_gram", "type": "number", "required": True, "order": 7},
            {"name": "pewarna_alami", "type": "boolean", "required": False, "order": 8},
        ],
    },
]


# =========================================================================
# 2. DATA TOKO PEMBANDING (UNTUK TES SEARCH, PAGINASI & FILTER AKTIF)
# =========================================================================
DUMMY_SELLERS = [
    {
        "account": {
            "email": "sekarjagad.trenggalek@example.com",
            "oauth_provider": "google",
            "oauth_id": "seed-google-oauth-sekar-jagad",
            "display_name": "Admin Batik Sekar Jagad",
            "profile": "https://example.com/avatars/sekar-jagad.png",
            "role": "penjual",
        },
        "shop": {
            "name": "Batik Sekar Jagad",
            "address": "Jl. Panglima Sudirman No. 18, Kab. Trenggalek, Jawa Timur",
            "number": "6281234567001",
            "instagram": "@batiksekarjagad.tgl",
            "online_shop": "https://shopee.co.id/batiksekarjagad",
            "gmaps": "https://maps.google.com/?q=Batik+Sekar+Jagad+Trenggalek",
            "description": "Pengrajin kain batik tulis dan cap khas Trenggalek dengan pewarna sintetis maupun alam.",
            "active_status": True,
        },
    },
    {
        "account": {
            "email": "sekarbiru.trenggalek@example.com",
            "oauth_provider": "google",
            "oauth_id": "seed-google-oauth-sekar-biru",
            "display_name": "Admin Batik Sekar Biru",
            "profile": "https://example.com/avatars/sekar-biru.png",
            "role": "penjual",
        },
        "shop": {
            "name": "Batik Sekar Biru",
            "address": "Desa Sukorejo, Kec. Gandusari, Kab. Trenggalek, Jawa Timur",
            "number": "6281234567002",
            "instagram": "@batiksekarbiru",
            "online_shop": "https://tokopedia.com/batiksekarbiru",
            "gmaps": "https://maps.google.com/?q=Batik+Sekar+Biru+Trenggalek",
            "description": "Menyediakan kain batik tulis dan kombinasi motif cengkehan, pari srono, dan manggis.",
            "active_status": True,
        },
    },
    {
        "account": {
            "email": "tokononaktif.trenggalek@example.com",
            "oauth_provider": "google",
            "oauth_id": "seed-google-oauth-nonaktif",
            "display_name": "Admin Toko Tutup Sementara",
            "profile": "https://example.com/avatars/nonaktif.png",
            "role": "penjual",
        },
        "shop": {
            "name": "Batik Arsip Nonaktif",
            "address": "Kec. Pogalan, Kab. Trenggalek, Jawa Timur",
            "number": "6281234567003",
            "instagram": "@batikarsip",
            "online_shop": None,
            "gmaps": None,
            "description": "Toko contoh dengan active_status=False untuk uji filter publik.",
            "active_status": False,
        },
    },
]


# =========================================================================
# 3. DATA PRODUK (SEMUA KATEGORI 'batik', FOKUS KAIN BATIK)
# =========================================================================
def build_products_data(my_shop_id, extra_shops: dict) -> list[dict]:
    products = [
        # --- Produk untuk TOKO EXISTING KAMU (6555ecc5-...) ---
        {
            "shop_id": my_shop_id,
            "category_slug": "batik",
            "name": "Kain Batik Tulis Turonggo Yakso Premium",
            "price": Decimal("325000.00"),
            "description": "Kain batik tulis tangan motif khas Turonggo Yakso dengan detail halus pada katun primisima, siap dijahit menjadi berbagai busana.",
            "additional_attribute": {
                "motif": "Turonggo Yakso",
                "teknik": "Tulis",
                "bahan": "Katun Primisima",
                "bentuk": "Kain",
                "panjang_cm": 240,
                "lebar_cm": 115,
                "berat_gram": 350,
                "pewarna_alami": False,
            },
            "active_status": True,
            "product_link": "https://shopee.co.id/product/turonggo-yakso-premium",
            "display_images": [
                "uploads/products/display/turonggo-yakso-1.webp",
                "uploads/products/display/turonggo-yakso-2.webp",
                "uploads/products/display/turonggo-yakso-3.webp",
            ],
            "mockup_image": "uploads/products/mockup/turonggo-yakso-3d.webp",
        },
        {
            "shop_id": my_shop_id,
            "category_slug": "batik",
            "name": "Kain Batik Cap Cengkehan Pewarna Alam",
            "price": Decimal("185000.00"),
            "description": "Kain batik cap motif Cengkehan khas Trenggalek dengan warna earthy dari pewarna alami.",
            "additional_attribute": {
                "motif": "Cengkehan",
                "teknik": "Cap",
                "bahan": "Katun Prima",
                "bentuk": "Kain",
                "panjang_cm": 220,
                "lebar_cm": 110,
                "berat_gram": 310,
                "pewarna_alami": True,
            },
            "active_status": True,
            "product_link": "https://shopee.co.id/product/cengkehan-alam",
            "display_images": [
                "uploads/products/display/cengkehan-1.webp",
                "uploads/products/display/cengkehan-2.webp",
            ],
            "mockup_image": "uploads/products/mockup/cengkehan-3d.webp",
        },
        {
            "shop_id": my_shop_id,
            "category_slug": "batik",
            "name": "Kain Batik Kombinasi Gajah Nungguk Sogan",
            "price": Decimal("245000.00"),
            "description": "Kain batik kombinasi tulis dan cap motif Gajah Nungguk dengan nuansa sogan klasik.",
            "additional_attribute": {
                "motif": "Gajah Nungguk",
                "teknik": "Kombinasi",
                "bahan": "Katun Primisima",
                "bentuk": "Kain",
                "panjang_cm": 235,
                "lebar_cm": 115,
                "berat_gram": 340,
                "pewarna_alami": False,
            },
            "active_status": True,
            "product_link": "https://shopee.co.id/product/kain-gajah-nungguk",
            "display_images": [
                "uploads/products/display/gajah-nungguk-1.webp",
                "uploads/products/display/gajah-nungguk-2.webp",
            ],
            "mockup_image": "uploads/products/mockup/gajah-nungguk-3d.webp",
        },
        {
            "shop_id": my_shop_id,
            "category_slug": "batik",
            "name": "Kain Batik Cap Motif Kopi Trenggalek",
            "price": Decimal("145000.00"),
            "description": "Kain batik cap motif Kopi Trenggalek cocok untuk bahan kemeja, tunik, maupun seragam.",
            "additional_attribute": {
                "motif": "Kopi Trenggalek",
                "teknik": "Cap",
                "bahan": "Katun Prima",
                "bentuk": "Kain",
                "panjang_cm": 210,
                "lebar_cm": 110,
                "berat_gram": 290,
                "pewarna_alami": False,
            },
            "active_status": True,
            "product_link": "https://shopee.co.id/product/kain-kopi-trenggalek",
            "display_images": [
                "uploads/products/display/kopi-trenggalek-1.webp",
            ],
            "mockup_image": "uploads/products/mockup/kopi-trenggalek-3d.webp",
        },
        {
            "shop_id": my_shop_id,
            "category_slug": "batik",
            "name": "Kain Batik Pari Srono Edisi Lama (Draft/Nonaktif)",
            "price": Decimal("150000.00"),
            "description": "Produk contoh dengan active_status=False untuk menguji tampilan seller vs pengunjung.",
            "additional_attribute": {
                "motif": "Pari Srono",
                "teknik": "Cap",
                "bahan": "Katun Prima",
                "bentuk": "Kain",
                "panjang_cm": 200,
                "lebar_cm": 110,
                "berat_gram": 300,
                "pewarna_alami": False,
            },
            "active_status": False,
            "product_link": None,
            "display_images": [
                "uploads/products/display/pari-srono-draft.webp",
            ],
            "mockup_image": None,
        },
    ]

    # --- Produk untuk toko pembanding ---
    if "Batik Sekar Jagad" in extra_shops:
        products.extend([
            {
                "shop_id": extra_shops["Batik Sekar Jagad"],
                "category_slug": "batik",
                "name": "Kain Batik Tulis Manggis Trenggalek",
                "price": Decimal("290000.00"),
                "description": "Kain batik tulis motif buah manggis khas Trenggalek dengan kombinasi warna sogan klasik.",
                "additional_attribute": {
                    "motif": "Manggis",
                    "teknik": "Tulis",
                    "bahan": "Katun Primisima",
                    "bentuk": "Kain",
                    "panjang_cm": 240,
                    "lebar_cm": 115,
                    "berat_gram": 340,
                    "pewarna_alami": True,
                },
                "active_status": True,
                "product_link": "https://shopee.co.id/batiksekarjagad/manggis",
                "display_images": [
                    "uploads/products/display/manggis-1.webp",
                    "uploads/products/display/manggis-2.webp",
                ],
                "mockup_image": "uploads/products/mockup/manggis-3d.webp",
            },
            {
                "shop_id": extra_shops["Batik Sekar Jagad"],
                "category_slug": "batik",
                "name": "Kain Batik Cap Batu Tumpuk",
                "price": Decimal("165000.00"),
                "description": "Kain batik cap motif Batu Tumpuk berbahan katun prima yang adem dan mudah dijahit.",
                "additional_attribute": {
                    "motif": "Batu Tumpuk",
                    "teknik": "Cap",
                    "bahan": "Katun Prima",
                    "bentuk": "Kain",
                    "panjang_cm": 215,
                    "lebar_cm": 110,
                    "berat_gram": 300,
                    "pewarna_alami": False,
                },
                "active_status": True,
                "product_link": "https://shopee.co.id/batiksekarjagad/batu-tumpuk",
                "display_images": [
                    "uploads/products/display/batu-tumpuk-1.webp",
                ],
                "mockup_image": "uploads/products/mockup/batu-tumpuk-3d.webp",
            },
        ])

    if "Batik Sekar Biru" in extra_shops:
        products.append({
            "shop_id": extra_shops["Batik Sekar Biru"],
            "category_slug": "batik",
            "name": "Kain Batik Kombinasi Pari Srono Biru Indigo",
            "price": Decimal("210000.00"),
            "description": "Kain batik kombinasi motif Pari Srono dengan warna biru indigo khas Batik Sekar Biru.",
            "additional_attribute": {
                "motif": "Pari Srono",
                "teknik": "Kombinasi",
                "bahan": "Katun Primisima",
                "bentuk": "Kain",
                "panjang_cm": 230,
                "lebar_cm": 115,
                "berat_gram": 330,
                "pewarna_alami": True,
            },
            "active_status": True,
            "product_link": "https://tokopedia.com/batiksekarbiru/pari-srono-indigo",
            "display_images": [
                "uploads/products/display/pari-srono-indigo-1.webp",
            ],
            "mockup_image": "uploads/products/mockup/pari-srono-indigo-3d.webp",
        })

    return products


# =========================================================================
# FUNGSI SEEDING
# =========================================================================

def verify_existing_account_and_shop(db: Session) -> Shop:
    db_url = db.get_bind().url.render_as_string(hide_password=True)
    print(f"[DEBUG] Terhubung ke DB: {db_url}")

    account = (
        db.query(Account)
        .filter(cast(Account.id, String) == EXISTING_ACCOUNT_ID)
        .first()
    )
    if not account:
        all_accounts = db.query(Account.id, Account.email).limit(10).all()
        print(f"[DEBUG] Isi tabel account di DB ini ({len(all_accounts)} baris): {all_accounts}")
        raise RuntimeError(
            f"Account dengan ID {EXISTING_ACCOUNT_ID} tidak ditemukan di database."
        )

    shop = (
        db.query(Shop)
        .filter(cast(Shop.id, String) == EXISTING_SHOP_ID)
        .first()
    )
    if not shop:
        all_shops = db.query(Shop.id, Shop.name).limit(10).all()
        print(f"[DEBUG] Isi tabel shop di DB ini ({len(all_shops)} baris): {all_shops}")
        raise RuntimeError(
            f"Shop dengan ID {EXISTING_SHOP_ID} tidak ditemukan di database."
        )

    print(f"[OK] Account ditemukan: {account.email} ({account.id}, type={type(account.id).__name__})")
    print(f"[OK] Shop ditemukan   : {shop.name} ({shop.id}, type={type(shop.id).__name__})")
    return shop


def seed_categories(db: Session) -> dict[str, Category]:
    category_map: dict[str, Category] = {}

    for cat_data in CATEGORIES_DATA:
        category = db.query(Category).filter(Category.slug == cat_data["slug"]).first()
        if not category:
            category = Category(name=cat_data["name"], slug=cat_data["slug"])
            db.add(category)
            db.flush()
            print(f"[+] Category dibuat: {category.name} ({category.slug})")
        else:
            print(f"[=] Category sudah ada: {category.name}")

        category_map[category.slug] = category

        for attr_data in cat_data["attributes"]:
            existing_attr = (
                db.query(CategoryAttribute)
                .filter(
                    CategoryAttribute.category_id == category.id,
                    CategoryAttribute.name == attr_data["name"],
                )
                .first()
            )
            if not existing_attr:
                db.add(
                    CategoryAttribute(
                        category_id=category.id,
                        name=attr_data["name"],
                        type=attr_data["type"],
                        required=attr_data["required"],
                        order=attr_data["order"],
                    )
                )

    db.flush()
    return category_map


def seed_dummy_sellers(db: Session) -> dict:
    shop_ids: dict = {}

    for item in DUMMY_SELLERS:
        acc_data = item["account"]
        shop_data = item["shop"]

        account = (
            db.query(Account)
            .filter(
                Account.oauth_provider == acc_data["oauth_provider"],
                Account.oauth_id == acc_data["oauth_id"],
            )
            .first()
        )
        if not account:
            account = Account(**acc_data)
            db.add(account)
            db.flush()
            print(f"[+] Account dummy dibuat: {account.email}")

        shop = db.query(Shop).filter(Shop.account_id == account.id).first()
        if not shop:
            shop = Shop(account_id=account.id, **shop_data)
            db.add(shop)
            db.flush()
            print(f"[+] Shop dummy dibuat   : {shop.name} (active={shop.active_status})")
        else:
            print(f"[=] Shop dummy sudah ada: {shop.name}")

        shop_ids[shop.name] = shop.id

    return shop_ids


def seed_products(
    db: Session,
    my_shop_id,
    extra_shops: dict,
    category_map: dict[str, Category],
):
    products_data = build_products_data(my_shop_id, extra_shops)

    for p_data in products_data:
        category = category_map[p_data["category_slug"]]

        existing_product = (
            db.query(Product)
            .filter(
                Product.shop_id == p_data["shop_id"],
                Product.name == p_data["name"],
            )
            .first()
        )
        if existing_product:
            print(f"[=] Product sudah ada: {existing_product.name}")
            continue

        product = Product(
            shop_id=p_data["shop_id"],
            category_id=category.id,
            name=p_data["name"],
            price=p_data["price"],
            description=p_data["description"],
            additional_attribute=p_data["additional_attribute"],
            active_status=p_data["active_status"],
            product_link=p_data["product_link"],
        )
        db.add(product)
        db.flush()

        for idx, img_url in enumerate(p_data.get("display_images", [])):
            db.add(
                ProductDisplayImage(
                    product_id=product.id,
                    image_url=img_url,
                    order=idx,
                )
            )

        if p_data.get("mockup_image"):
            db.add(
                ProductMockupImage(
                    product_id=product.id,
                    image_url=p_data["mockup_image"],
                )
            )

        print(f"[+] Product dibuat: {product.name} (active={product.active_status})")


def run_seed():
    db_gen = get_db()
    db = next(db_gen)
    try:
        my_shop = verify_existing_account_and_shop(db)
        category_map = seed_categories(db)
        extra_shops = seed_dummy_sellers(db)
        seed_products(db, my_shop.id, extra_shops, category_map)

        db.commit()
        print("\n[SELESAI] Seeding database berhasil.")
    except Exception as e:
        db.rollback()
        print(f"\n[ERROR] Seeding dibatalkan: {e}")
        raise
    finally:
        try:
            next(db_gen)
        except StopIteration:
            pass


if __name__ == "__main__":
    run_seed()
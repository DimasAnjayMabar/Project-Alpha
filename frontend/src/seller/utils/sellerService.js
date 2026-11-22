import { INITIAL_DATABASE } from '../../user/data/databaseSeed';

export const DB_STORAGE_KEY = 'batik_wicara_db_v1';
export const SELLER_SESSION_KEY = 'batik_wicara_seller_session_v1';

export function loadSharedDatabase() {
  try {
    const raw = localStorage.getItem(DB_STORAGE_KEY);
    if (!raw) return INITIAL_DATABASE;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed.shop) && Array.isArray(parsed.product)) {
      return {
        account: parsed.account || [],
        shop: parsed.shop || [],
        category: parsed.category || [],
        category_attribute: parsed.category_attribute || [],
        product: parsed.product || [],
        product_display_image: parsed.product_display_image || [],
        product_mockup_image: parsed.product_mockup_image || [],
      };
    }
  } catch {
    // Gunakan seed awal jika localStorage kosong atau rusak
  }
  return INITIAL_DATABASE;
}

export function saveSharedDatabase(db) {
  try {
    localStorage.setItem(DB_STORAGE_KEY, JSON.stringify(db));
  } catch (err) {
    console.error('Gagal menyimpan database ke localStorage:', err);
  }
}

export function getSavedSellerAccountId() {
  try {
    return localStorage.getItem(SELLER_SESSION_KEY) || null;
  } catch {
    return null;
  }
}

export function saveSellerSession(accountId) {
  try {
    if (accountId) {
      localStorage.setItem(SELLER_SESSION_KEY, accountId);
    } else {
      localStorage.removeItem(SELLER_SESSION_KEY);
    }
  } catch {
    // Abaikan jika storage diblokir
  }
}

/**
 * Autentikasi akun penjual berdasarkan email dan sandi/PIN sanggar.
 * Catatan: Untuk akun seed awal, sandi default demo adalah "123456".
 */
export function authenticateSeller(db, email, password) {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (!normalizedEmail) {
    throw new Error('Masukkan alamat email pengelola sanggar.');
  }

  const account = (db.account || []).find(
    (acc) => acc.email.toLowerCase() === normalizedEmail && acc.role === 'penjual'
  );

  if (!account) {
    throw new Error('Akun penjual dengan email tersebut tidak ditemukan.');
  }

  const expectedPass = account.password || '123456';
  if (password !== expectedPass) {
    throw new Error('Kata sandi / PIN sanggar tidak sesuai.');
  }

  const shop = (db.shop || []).find((s) => s.account_id === account.id);
  if (!shop) {
    throw new Error('Akun ini belum terhubung dengan data toko UMKM.');
  }

  return { account, shop };
}

/**
 * Mendaftarkan akun penjual + toko UMKM baru (relasi 1:1).
 */
export function registerNewSeller(db, payload) {
  const email = String(payload.email || '').trim().toLowerCase();
  const displayName = String(payload.displayName || '').trim();
  const password = String(payload.password || '').trim();
  const shopName = String(payload.shopName || '').trim();
  const address = String(payload.address || '').trim();
  const whatsapp = String(payload.whatsapp || '').replace(/\D/g, '');
  const description = String(payload.description || '').trim();

  if (!email || !displayName || !password || !shopName || !address || !whatsapp) {
    throw new Error('Harap lengkapi semua kolom wajib pendaftaran sanggar.');
  }

  const emailExists = (db.account || []).some((a) => a.email.toLowerCase() === email);
  if (emailExists) {
    throw new Error('Email tersebut sudah terdaftar. Silakan langsung masuk (Login).');
  }

  const now = new Date().toISOString();
  const newAccountId = `acc-${Date.now()}`;
  const newShopId = `shop-${Date.now()}`;

  const normalizedWa = whatsapp.startsWith('0')
    ? `62${whatsapp.slice(1)}`
    : whatsapp.startsWith('62')
    ? whatsapp
    : `62${whatsapp}`;

  const newAccount = {
    id: newAccountId,
    email,
    password,
    oauth_provider: 'email',
    oauth_id: `local|${newAccountId}`,
    display_name: displayName,
    profile: '',
    role: 'penjual',
    created_at: now,
  };

  const newShop = {
    id: newShopId,
    account_id: newAccountId,
    name: shopName,
    address,
    number: normalizedWa,
    instagram: '',
    online_shop: '',
    gmaps: `https://maps.google.com/?q=${encodeURIComponent(shopName + ' Trenggalek')}`,
    description:
      description ||
      `Sentra perajin ${shopName} yang melestarikan wastra batik khas Kabupaten Trenggalek.`,
    active_status: true,
  };

  const updatedDb = {
    ...db,
    account: [...(db.account || []), newAccount],
    shop: [...(db.shop || []), newShop],
  };

  return { updatedDb, account: newAccount, shop: newShop };
}

/**
 * GUARD KEAMANAN: Memastikan akun yang sedang login adalah pemilik sah toko
 * dan (jika ada targetProductId) pemilik sah produk tersebut.
 */
export function verifyOwnership(db, currentAccountId, targetProductId = null) {
  if (!currentAccountId) {
    throw new Error('Sesi login tidak valid. Silakan masuk terlebih dahulu.');
  }

  const myShop = (db.shop || []).find((s) => s.account_id === currentAccountId);
  if (!myShop) {
    throw new Error('Akses ditolak: Anda tidak memiliki sanggar UMKM yang terdaftar.');
  }

  if (targetProductId) {
    const targetProduct = (db.product || []).find((p) => p.id === targetProductId);
    if (!targetProduct) {
      throw new Error('Produk tidak ditemukan di database.');
    }
    if (targetProduct.shop_id !== myShop.id) {
      throw new Error(
        'AKSES DITOLAK: Anda tidak diizinkan mengubah atau menghapus katalog milik UMKM lain!'
      );
    }
  }

  return { myShop };
}

/**
 * Menambahkan produk baru khusus ke toko milik seller yang sedang login.
 */
export function createSellerProduct(db, currentAccountId, productInput, imageUrls = []) {
  const { myShop } = verifyOwnership(db, currentAccountId);
  const now = new Date().toISOString();
  const newProductId = `prod-${Date.now()}`;

  const newProduct = {
    id: newProductId,
    shop_id: myShop.id, // Dikunci ke toko milik user yang login
    category_id: productInput.category_id,
    name: String(productInput.name || '').trim(),
    price: Number(productInput.price) || 0,
    description: String(productInput.description || '').trim(),
    additional_attribute: productInput.additional_attribute || {},
    active_status: productInput.active_status !== false,
    product_link: String(productInput.product_link || '').trim(),
    created_at: now,
    updated_at: now,
  };

  const cleanUrls = imageUrls.map((u) => String(u || '').trim()).filter(Boolean);
  const newDisplayImages = cleanUrls.map((url, idx) => ({
    id: `img-${Date.now()}-${idx + 1}`,
    product_id: newProductId,
    image_url: url,
    order: idx + 1,
    created_at: now,
  }));

  return {
    ...db,
    product: [newProduct, ...(db.product || [])],
    product_display_image: [...(db.product_display_image || []), ...newDisplayImages],
  };
}

/**
 * Memperbarui produk milik seller yang sedang login (ditolak jika milik toko lain).
 */
export function updateSellerProduct(db, currentAccountId, productId, productInput, imageUrls = []) {
  const { myShop } = verifyOwnership(db, currentAccountId, productId);
  const now = new Date().toISOString();

  const updatedProducts = (db.product || []).map((p) => {
    if (p.id !== productId) return p;
    return {
      ...p,
      shop_id: myShop.id, // Tetap terkunci pada toko pemilik
      category_id: productInput.category_id,
      name: String(productInput.name || '').trim(),
      price: Number(productInput.price) || 0,
      description: String(productInput.description || '').trim(),
      additional_attribute: productInput.additional_attribute || {},
      active_status: productInput.active_status !== false,
      product_link: String(productInput.product_link || '').trim(),
      updated_at: now,
    };
  });

  const cleanUrls = imageUrls.map((u) => String(u || '').trim()).filter(Boolean);
  const remainingImages = (db.product_display_image || []).filter(
    (img) => img.product_id !== productId
  );
  const replacementImages = cleanUrls.map((url, idx) => ({
    id: `img-${Date.now()}-${idx + 1}`,
    product_id: productId,
    image_url: url,
    order: idx + 1,
    created_at: now,
  }));

  return {
    ...db,
    product: updatedProducts,
    product_display_image: [...remainingImages, ...replacementImages],
  };
}

/**
 * Menghapus produk milik seller yang sedang login (ditolak jika milik toko lain).
 */
export function deleteSellerProduct(db, currentAccountId, productId) {
  verifyOwnership(db, currentAccountId, productId);

  return {
    ...db,
    product: (db.product || []).filter((p) => p.id !== productId),
    product_display_image: (db.product_display_image || []).filter(
      (img) => img.product_id !== productId
    ),
    product_mockup_image: (db.product_mockup_image || []).filter(
      (mock) => mock.product_id !== productId
    ),
  };
}

/**
 * Memperbarui profil sanggar milik seller yang sedang login.
 */
export function updateSellerShop(db, currentAccountId, shopInput) {
  const { myShop } = verifyOwnership(db, currentAccountId);
  const digits = String(shopInput.number || myShop.number).replace(/\D/g, '');
  const normalizedWa = digits.startsWith('0')
    ? `62${digits.slice(1)}`
    : digits.startsWith('62')
    ? digits
    : `62${digits}`;

  const updatedShops = (db.shop || []).map((s) => {
    if (s.id !== myShop.id) return s;
    return {
      ...s,
      name: String(shopInput.name || s.name).trim(),
      address: String(shopInput.address || s.address).trim(),
      number: normalizedWa,
      instagram: String(shopInput.instagram || '').trim(),
      online_shop: String(shopInput.online_shop || '').trim(),
      gmaps: String(shopInput.gmaps || '').trim(),
      description: String(shopInput.description || '').trim(),
      active_status: shopInput.active_status !== false,
    };
  });

  return {
    ...db,
    shop: updatedShops,
  };
}
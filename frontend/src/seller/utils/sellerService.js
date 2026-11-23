import { INITIAL_DATABASE } from '../../user/data/databaseSeed';

export const DB_STORAGE_KEY = 'batik_wicara_db_v1';
export const SELLER_SESSION_KEY = 'batik_wicara_seller_session_v1';

export const BACKEND_BASE_URL = String(
  import.meta.env.BACKEND_BASE_URL || 'http://localhost:3002'
).replace(/\/+$/, '');

// =========================================================================
// HELPER PARSE RESPONS BACKEND (PORT 3002 — HTTPONLY COOKIE)
// =========================================================================

async function parseApiResponse(response, fallbackMessage) {
  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    let message = fallbackMessage;
    if (payload) {
      if (typeof payload.message === 'string' && payload.message.trim()) {
        message = payload.message;
      } else if (typeof payload.detail === 'string' && payload.detail.trim()) {
        message = payload.detail;
      } else if (Array.isArray(payload.detail) && payload.detail.length > 0) {
        message = payload.detail
          .map((item) => item?.msg || String(item))
          .filter(Boolean)
          .join(', ');
      }
    }
    const err = new Error(message);
    err.status = response.status;
    err.payload = payload;
    throw err;
  }

  return payload;
}

// =========================================================================
// 1. AUTENTIKASI, REGISTRASI & PROFIL TOKO
// =========================================================================

export function getGoogleLoginUrl() {
  return `${BACKEND_BASE_URL}/auth/google/login`;
}

export async function fetchPendingRegistration() {
  const response = await fetch(`${BACKEND_BASE_URL}/auth/pending`, {
    method: 'GET',
    credentials: 'include',
  });
  const payload = await parseApiResponse(
    response,
    'Sesi pendaftaran tidak ditemukan atau sudah berakhir.'
  );
  return payload?.data || null;
}

export async function registerSellerShop(shopForm, profileImageFile = null) {
  const formData = new FormData();
  formData.append('name', String(shopForm.name || '').trim());

  const optionalTextFields = [
    'address',
    'number',
    'instagram',
    'online_shop',
    'gmaps',
    'description',
  ];

  optionalTextFields.forEach((field) => {
    const val = String(shopForm[field] ?? '').trim();
    if (val) {
      formData.append(field, val);
    }
  });

  if (profileImageFile) {
    formData.append('profile_image', profileImageFile);
  }

  const response = await fetch(`${BACKEND_BASE_URL}/shop/register`, {
    method: 'POST',
    credentials: 'include',
    body: formData,
  });

  const payload = await parseApiResponse(
    response,
    'Gagal mendaftarkan sanggar. Periksa kembali data yang diisi.'
  );
  return payload?.data || null;
}

export async function fetchMyShop() {
  const response = await fetch(`${BACKEND_BASE_URL}/shop/me`, {
    method: 'GET',
    credentials: 'include',
  });
  const payload = await parseApiResponse(response, 'Sesi login tidak ditemukan.');
  return payload?.data || null;
}

export async function updateMyShop(
  shopForm,
  { profileImageFile = null, removeProfile = false } = {}
) {
  const formData = new FormData();
  formData.append('name', String(shopForm.name || '').trim());
  formData.append('address', String(shopForm.address ?? '').trim());
  formData.append('number', String(shopForm.number ?? '').trim());
  formData.append('instagram', String(shopForm.instagram ?? '').trim());
  formData.append('online_shop', String(shopForm.online_shop ?? '').trim());
  formData.append('gmaps', String(shopForm.gmaps ?? '').trim());
  formData.append('description', String(shopForm.description ?? '').trim());

  if (typeof shopForm.active_status === 'boolean') {
    formData.append('active_status', String(shopForm.active_status));
  }

  formData.append('remove_profile', String(Boolean(removeProfile && !profileImageFile)));

  if (profileImageFile) {
    formData.append('profile_image', profileImageFile);
  }

  const response = await fetch(`${BACKEND_BASE_URL}/shop/me`, {
    method: 'PATCH',
    credentials: 'include',
    body: formData,
  });

  const payload = await parseApiResponse(
    response,
    'Gagal memperbarui profil sanggar. Periksa kembali data yang diisi.'
  );
  return payload?.data || null;
}

export async function logoutSeller() {
  const response = await fetch(`${BACKEND_BASE_URL}/auth/logout`, {
    method: 'POST',
    credentials: 'include',
  });
  return parseApiResponse(response, 'Gagal keluar dari sesi.');
}

// =========================================================================
// 2. KATEGORI & CRUD PRODUK SELLER (BACKEND 3002 -> STORAGE 3003)
// =========================================================================

export async function fetchProductCategories() {
  const response = await fetch(`${BACKEND_BASE_URL}/product/categories`, {
    method: 'GET',
    credentials: 'include',
  });
  const payload = await parseApiResponse(response, 'Gagal memuat daftar kategori.');
  return Array.isArray(payload?.data) ? payload.data : [];
}

export async function fetchMyProducts({
  q = '',
  activeStatus = null,
  categorySlug = '',
  page = 1,
  limit = 100,
} = {}) {
  const params = new URLSearchParams();
  if (q && q.trim()) params.set('q', q.trim());
  if (typeof activeStatus === 'boolean') params.set('active_status', String(activeStatus));
  if (categorySlug && categorySlug !== 'ALL') params.set('category_slug', categorySlug);
  params.set('page', String(page));
  params.set('limit', String(limit));

  const response = await fetch(`${BACKEND_BASE_URL}/product/me?${params.toString()}`, {
    method: 'GET',
    credentials: 'include',
  });
  const payload = await parseApiResponse(response, 'Gagal memuat daftar produk sanggar.');
  return {
    items: Array.isArray(payload?.data?.items) ? payload.data.items : [],
    pagination: payload?.data?.pagination || {
      page,
      limit,
      total: 0,
      total_pages: 0,
    },
  };
}

/**
 * Menambahkan produk baru beserta multiple display_images & single mockup_image (POST /product).
 */
export async function createSellerProductApi(
  productInput,
  { displayFiles = [], mockupFile = null } = {}
) {
  const formData = new FormData();
  formData.append('name', String(productInput.name || '').trim());
  formData.append('price', String(Number(productInput.price) || 0));

  if (productInput.category_id) {
    formData.append('category_id', String(productInput.category_id));
  }
  if (productInput.description !== undefined && productInput.description !== null) {
    formData.append('description', String(productInput.description).trim());
  }
  if (productInput.additional_attribute) {
    formData.append('additional_attribute', JSON.stringify(productInput.additional_attribute));
  }
  formData.append('active_status', String(productInput.active_status !== false));
  if (productInput.product_link && String(productInput.product_link).trim()) {
    formData.append('product_link', String(productInput.product_link).trim());
  }
  formData.append('mockup_output_format', 'webp');

  (displayFiles || []).forEach((file) => {
    if (file) formData.append('display_images', file);
  });

  if (mockupFile) {
    formData.append('mockup_image', mockupFile);
  }

  const response = await fetch(`${BACKEND_BASE_URL}/product`, {
    method: 'POST',
    credentials: 'include',
    body: formData,
  });

  const payload = await parseApiResponse(
    response,
    'Gagal menerbitkan produk baru. Periksa kembali isian dan gambar.'
  );
  return payload?.data || null;
}

/**
 * Memperbarui produk + sinkronisasi tambah/hapus gambar di storage 3003 (PATCH /product/{id}).
 */
export async function updateSellerProductApi(
  productId,
  productInput,
  {
    newDisplayFiles = [],
    deleteDisplayImageIds = [],
    displayImageOrders = [],
    newMockupFile = null,
    removeMockup = false,
  } = {}
) {
  const formData = new FormData();
  formData.append('name', String(productInput.name || '').trim());
  formData.append('price', String(Number(productInput.price) || 0));

  if (productInput.category_id) {
    formData.append('category_id', String(productInput.category_id));
  }
  formData.append('description', String(productInput.description ?? '').trim());
  formData.append(
    'additional_attribute',
    JSON.stringify(productInput.additional_attribute || {})
  );
  formData.append('active_status', String(productInput.active_status !== false));
  formData.append('product_link', String(productInput.product_link ?? '').trim());
  formData.append('mockup_output_format', 'webp');
  formData.append('remove_mockup', String(Boolean(removeMockup && !newMockupFile)));

  if (Array.isArray(deleteDisplayImageIds) && deleteDisplayImageIds.length > 0) {
    formData.append('delete_display_image_ids', JSON.stringify(deleteDisplayImageIds));
  }

  if (Array.isArray(displayImageOrders) && displayImageOrders.length > 0) {
    formData.append('display_image_orders', JSON.stringify(displayImageOrders));
  }

  (newDisplayFiles || []).forEach((file) => {
    if (file) formData.append('new_display_images', file);
  });

  if (newMockupFile) {
    formData.append('new_mockup_image', newMockupFile);
  }

  const response = await fetch(`${BACKEND_BASE_URL}/product/${productId}`, {
    method: 'PATCH',
    credentials: 'include',
    body: formData,
  });

  const payload = await parseApiResponse(
    response,
    'Gagal memperbarui produk. Periksa kembali isian dan gambar.'
  );
  return payload?.data || null;
}

export async function updateProductStatus(productId, activeStatus) {
  const response = await fetch(`${BACKEND_BASE_URL}/product/${productId}/status`, {
    method: 'PATCH',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ active_status: Boolean(activeStatus) }),
  });
  const payload = await parseApiResponse(response, 'Gagal mengubah status produk.');
  return payload?.data || null;
}

export async function deleteSellerProductApi(productId, permanent = true) {
  const params = new URLSearchParams({ permanent: String(Boolean(permanent)) });
  const response = await fetch(`${BACKEND_BASE_URL}/product/${productId}?${params.toString()}`, {
    method: 'DELETE',
    credentials: 'include',
  });
  const payload = await parseApiResponse(response, 'Gagal menghapus produk.');
  return payload?.data || null;
}

// =========================================================================
// 3. HELPER LOCALSTORAGE LAMA (SEMENTARA UNTUK /user DI App.jsx HINGGA TAHAP 3)
// =========================================================================

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
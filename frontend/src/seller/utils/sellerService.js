// frontend/src/seller/utils/sellerService.js
import { INITIAL_DATABASE } from '../../user/data/databaseSeed';
import {
  BACKEND_URL,
  backendFetch,
  buildBackendUrl,
} from '../../utils/url_controller';

export const DB_STORAGE_KEY = 'batik_wicara_db_v1';
export const SELLER_SESSION_KEY = 'batik_wicara_seller_session_v1';

// Alias kompatibilitas ke URL aktif dari url_controller
export const BACKEND_BASE_URL = BACKEND_URL;
export const GOOGLE_CLIENT_ID = String(import.meta.env.GOOGLE_CLIENT_ID || '').trim();

let gsiScriptPromise = null;

// =========================================================================
// HELPER PARSE RESPONS BACKEND (HTTPONLY COOKIE)
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
  return buildBackendUrl('/auth/google/login');
}

/**
 * Memastikan script Google Identity Services sudah termuat sebelum tombol diklik.
 */
export function preloadGoogleGsiScript() {
  if (typeof window === 'undefined') return Promise.resolve();
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  if (gsiScriptPromise) return gsiScriptPromise;

  gsiScriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector(
      'script[src="https://accounts.google.com/gsi/client"]'
    );
    if (existing) {
      if (window.google?.accounts?.oauth2) {
        resolve();
        return;
      }
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener(
        'error',
        () => reject(new Error('Gagal memuat layanan login Google.')),
        { once: true }
      );
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Gagal memuat layanan login Google.'));
    document.head.appendChild(script);
  });

  return gsiScriptPromise;
}

/**
 * Menukar authorization code Google ke backend via backendFetch
 * (otomatis membawa header ngrok-skip-browser-warning dan cookie HttpOnly).
 */
export async function exchangeGoogleAuthCode(code) {
  const response = await backendFetch('/auth/google/exchange', {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ code }),
  });

  const payload = await parseApiResponse(
    response,
    'Autentikasi Google gagal diproses oleh server.'
  );

  return {
    status: payload?.status || 'success', // 'success' | 'need_registration'
    data: payload?.data || null,
  };
}

/**
 * Membuka popup login Google secara sinkron dalam event click (scope ketat: openid email).
 */
export function openGoogleCodePopup({ onCode, onError, onCancel }) {
  if (!GOOGLE_CLIENT_ID) {
    onError?.('GOOGLE_CLIENT_ID belum dikonfigurasi di frontend.');
    return;
  }

  const oauth2 = window.google?.accounts?.oauth2;
  if (!oauth2) {
    onError?.('Layanan Google masih dimuat. Tunggu sebentar lalu klik kembali.');
    preloadGoogleGsiScript().catch(() => {});
    return;
  }

  const client = oauth2.initCodeClient({
    client_id: GOOGLE_CLIENT_ID,
    scope: 'openid email',
    ux_mode: 'popup',
    select_account: true,
    callback: (resp) => {
      if (resp?.error) {
        if (resp.error === 'access_denied') {
          onCancel?.();
        } else {
          onError?.('Proses masuk dengan Google dibatalkan atau gagal. Silakan coba kembali.');
        }
        return;
      }
      if (!resp?.code) {
        onError?.('Kode autentikasi dari Google tidak diterima.');
        return;
      }
      onCode?.(resp.code);
    },
    error_callback: (err) => {
      if (err?.type === 'popup_closed') {
        onCancel?.();
      } else if (err?.type === 'popup_failed_to_open') {
        onError?.('Popup Google diblokir oleh browser. Izinkan popup untuk situs ini lalu coba lagi.');
      } else {
        onError?.('Gagal membuka jendela login Google. Silakan coba lagi.');
      }
    },
  });

  client.requestCode();
}

export async function fetchPendingRegistration() {
  const response = await backendFetch('/auth/pending', {
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

  const response = await backendFetch('/shop/register', {
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
  const response = await backendFetch('/shop/me', {
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

  const response = await backendFetch('/shop/me', {
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
  const response = await backendFetch('/auth/logout', {
    method: 'POST',
    credentials: 'include',
  });
  return parseApiResponse(response, 'Gagal keluar dari sesi.');
}

// =========================================================================
// 2. KATEGORI & CRUD PRODUK SELLER (BACKEND -> STORAGE)
// =========================================================================

export async function fetchProductCategories() {
  const response = await backendFetch('/product/categories', {
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

  const response = await backendFetch(`/product/me?${params.toString()}`, {
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

  const response = await backendFetch('/product', {
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
 * Memperbarui produk + sinkronisasi tambah/hapus gambar di storage (PATCH /product/{id}).
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

  const response = await backendFetch(`/product/${productId}`, {
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
  const response = await backendFetch(`/product/${productId}/status`, {
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
  const response = await backendFetch(`/product/${productId}?${params.toString()}`, {
    method: 'DELETE',
    credentials: 'include',
  });
  const payload = await parseApiResponse(response, 'Gagal menghapus produk.');
  return payload?.data || null;
}

// =========================================================================
// 3. HELPER LOCALSTORAGE LAMA (KOMPATIBILITAS)
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
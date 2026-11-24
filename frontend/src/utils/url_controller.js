// frontend/src/utils/url_controller.js

// =========================================================================
// SWITCH MANUAL: ubah ke 'remote' atau 'base'
// =========================================================================
export const BACKEND_MODE = 'base'; // 'remote' | 'base'

const URL_MAP = {
  base: String(import.meta.env.BACKEND_BASE_URL || 'http://localhost:3002').replace(/\/+$/, ''),
  remote: String(import.meta.env.BACKEND_REMOTE_URL || '').replace(/\/+$/, ''),
};

if (!URL_MAP[BACKEND_MODE]) {
  throw new Error(
    `[urlController] URL untuk BACKEND_MODE="${BACKEND_MODE}" belum diset di .env`
  );
}

export const BACKEND_URL = URL_MAP[BACKEND_MODE];
export const IS_REMOTE_BACKEND = BACKEND_MODE === 'remote';

// Daftar prefix backend yang dikenali untuk normalisasi URL media
const KNOWN_BACKEND_BASES = Array.from(
  new Set(
    [
      URL_MAP.base,
      URL_MAP.base.replace('://localhost:', '://127.0.0.1:'),
      URL_MAP.base.replace('://127.0.0.1:', '://localhost:'),
      URL_MAP.remote,
    ].filter(Boolean)
  )
);

/**
 * Rakit URL penuh ke endpoint backend (cocok untuk redirect OAuth / link).
 */
export function buildBackendUrl(path = '') {
  const cleanPath = String(path).startsWith('/') ? path : `/${path}`;
  return `${BACKEND_URL}${cleanPath}`;
}

/**
 * Wrapper tipis untuk fetch ke backend (tanpa fallback).
 * Otomatis menyertakan header skip warning ngrok jika mode === 'remote'.
 */
export function backendFetch(path, options = {}) {
  const headers = new Headers(options.headers || {});
  if (IS_REMOTE_BACKEND) {
    headers.set('ngrok-skip-browser-warning', 'true');
  }
  return fetch(buildBackendUrl(path), {
    ...options,
    headers,
  });
}

/**
 * Normalisasi URL media agar selalu mengikuti BACKEND_URL aktif di url_controller.
 * - URL backend lama (base/remote) -> dialihkan ke BACKEND_URL aktif
 * - Path '/storage/...' -> dirakit dengan BACKEND_URL
 * - Path relatif DB 'uploads/...' -> dirakit ke '/storage/files/uploads/...'
 * - URL eksternal / blob / data URI -> dikembalikan apa adanya
 */
export function resolveBackendMediaUrl(urlOrPath = '') {
  const raw = String(urlOrPath || '').trim();
  if (!raw) return '';
  if (raw.startsWith('blob:') || raw.startsWith('data:')) return raw;

  for (const base of KNOWN_BACKEND_BASES) {
    if (raw === base || raw.startsWith(`${base}/`)) {
      const suffix = raw.slice(base.length);
      return buildBackendUrl(suffix || '/');
    }
  }

  if (raw.startsWith('http://') || raw.startsWith('https://')) {
    return raw;
  }

  if (raw.startsWith('/storage/')) {
    return buildBackendUrl(raw);
  }

  const cleaned = raw.replace(/^\/+/, '');
  if (cleaned.startsWith('uploads/')) {
    return buildBackendUrl(`/storage/files/${cleaned}`);
  }

  return buildBackendUrl(raw);
}

/**
 * Ambil file gambar/tekstur lewat backendFetch lalu bungkus sebagai Blob URL lokal.
 * Dipakai oleh WebGL / Three.js agar request membawa header `ngrok-skip-browser-warning`
 * dan bebas dari error CORS canvas/WebGL.
 */
export async function fetchBackendMediaBlobUrl(urlOrPath, { signal } = {}) {
  const resolvedUrl = resolveBackendMediaUrl(urlOrPath);
  if (!resolvedUrl) {
    throw new Error('URL media kosong.');
  }

  if (resolvedUrl.startsWith('blob:') || resolvedUrl.startsWith('data:')) {
    return { url: resolvedUrl, revoke: () => {} };
  }

  // URL milik backend aktif -> tarik lewat backendFetch agar membawa header ngrok
  if (resolvedUrl === BACKEND_URL || resolvedUrl.startsWith(`${BACKEND_URL}/`)) {
    const relativePath = resolvedUrl.slice(BACKEND_URL.length) || '/';
    const response = await backendFetch(relativePath, {
      method: 'GET',
      signal,
    });

    if (!response.ok) {
      throw new Error(`Gagal memuat media backend (HTTP ${response.status}).`);
    }

    const contentType = (response.headers.get('content-type') || '').toLowerCase();
    // Proxy storage bisa mengirim image/webp maupun application/octet-stream,
    // namun text/html (interstitial ngrok) atau application/json (error API) pasti bukan gambar.
    if (contentType.includes('text/html') || contentType.includes('application/json')) {
      throw new Error(`Respons media tidak valid (${contentType}).`);
    }

    const blob = await response.blob();
    if (!blob || blob.size === 0) {
      throw new Error('File media dari backend kosong.');
    }

    const objectUrl = URL.createObjectURL(blob);
    return {
      url: objectUrl,
      revoke: () => URL.revokeObjectURL(objectUrl),
    };
  }

  // URL eksternal di luar backend (misal seed/CDN pihak ketiga)
  return { url: resolvedUrl, revoke: () => {} };
}
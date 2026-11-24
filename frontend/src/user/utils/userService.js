// frontend/src/user/utils/userService.js
import { formatAttributeLabel, formatAttributeValue } from './helpers';
import { BACKEND_URL, backendFetch } from '../../utils/url_controller';

// Alias kompatibilitas ke URL aktif dari url_controller
export const BACKEND_BASE_URL = BACKEND_URL;

// =========================================================================
// HELPER PARSE RESPONS BACKEND (PUBLIC API)
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
// 1. ENDPOINT PUBLIK SANGGAR, PRODUK & KATEGORI
// =========================================================================

export async function fetchPublicShops({ q = '', page = 1, limit = 100 } = {}) {
  const params = new URLSearchParams();
  if (q && q.trim()) params.set('q', q.trim());
  params.set('page', String(page));
  params.set('limit', String(limit));

  const response = await backendFetch(`/shop?${params.toString()}`, {
    method: 'GET',
  });
  const payload = await parseApiResponse(response, 'Gagal memuat daftar sanggar.');
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

export async function fetchPublicShopById(shopId) {
  const response = await backendFetch(`/shop/${shopId}`, {
    method: 'GET',
  });
  const payload = await parseApiResponse(response, 'Gagal memuat detail sanggar.');
  return payload?.data || null;
}

export async function fetchPublicCategories() {
  const response = await backendFetch('/product/categories', {
    method: 'GET',
  });
  const payload = await parseApiResponse(response, 'Gagal memuat daftar kategori.');
  return Array.isArray(payload?.data) ? payload.data : [];
}

export async function fetchPublicProducts({
  q = '',
  motif = '',
  shopId = '',
  categorySlug = '',
  minPrice = null,
  maxPrice = null,
  sortBy = 'newest',
  page = 1,
  limit = 100,
} = {}) {
  const params = new URLSearchParams();
  if (q && q.trim()) params.set('q', q.trim());
  if (motif && motif.trim()) params.set('motif', motif.trim());
  if (shopId) params.set('shop_id', String(shopId));
  if (categorySlug && categorySlug !== 'ALL') params.set('category_slug', categorySlug);
  if (minPrice !== null && minPrice !== undefined && minPrice !== '') {
    params.set('min_price', String(minPrice));
  }
  if (maxPrice !== null && maxPrice !== undefined && maxPrice !== '') {
    params.set('max_price', String(maxPrice));
  }
  if (sortBy) params.set('sort_by', sortBy);
  params.set('page', String(page));
  params.set('limit', String(limit));

  const response = await backendFetch(`/product?${params.toString()}`, {
    method: 'GET',
  });
  const payload = await parseApiResponse(response, 'Gagal memuat daftar produk.');
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

export async function fetchPublicProductById(productId) {
  const response = await backendFetch(`/product/${productId}`, {
    method: 'GET',
  });
  const payload = await parseApiResponse(response, 'Gagal memuat detail produk.');
  return payload?.data || null;
}

// =========================================================================
// 2. LOADER LENGKAP & NORMALISASI KATALOG PENGUNJUNG
// =========================================================================

async function fetchAllPublicShops() {
  const first = await fetchPublicShops({ page: 1, limit: 100 });
  const totalPages = Number(first.pagination?.total_pages) || 1;
  if (totalPages <= 1) return first.items;

  const rest = await Promise.all(
    Array.from({ length: totalPages - 1 }, (_, i) =>
      fetchPublicShops({ page: i + 2, limit: 100 }).then((res) => res.items)
    )
  );
  return [...first.items, ...rest.flat()];
}

async function fetchAllPublicProducts() {
  const first = await fetchPublicProducts({ page: 1, limit: 100, sortBy: 'newest' });
  const totalPages = Number(first.pagination?.total_pages) || 1;
  if (totalPages <= 1) return first.items;

  const rest = await Promise.all(
    Array.from({ length: totalPages - 1 }, (_, i) =>
      fetchPublicProducts({ page: i + 2, limit: 100, sortBy: 'newest' }).then(
        (res) => res.items
      )
    )
  );
  return [...first.items, ...rest.flat()];
}

function normalizeShop(rawShop) {
  if (!rawShop) return null;
  return {
    ...rawShop,
    id: String(rawShop.id),
    account_id: rawShop.account_id ? String(rawShop.account_id) : '',
    name: rawShop.name || 'Sanggar Batik',
    address: rawShop.address || '',
    number: rawShop.number || '',
    instagram: rawShop.instagram || '',
    online_shop: rawShop.online_shop || '',
    gmaps: rawShop.gmaps || '',
    description: rawShop.description || '',
    profile: rawShop.profile || '',
    profile_public_url: rawShop.profile_public_url || '',
    active_status: rawShop.active_status !== false,
  };
}

export function buildCatalogFromBackend({
  shops = [],
  products = [],
  categories = [],
} = {}) {
  const activeShops = shops
    .map(normalizeShop)
    .filter((s) => s && s.active_status !== false);

  const shopById = new Map(activeShops.map((s) => [s.id, s]));
  const categoryById = new Map(
    (categories || []).map((c) => [
      String(c.id),
      {
        ...c,
        id: String(c.id),
        name: c.name || 'Batik',
        slug: c.slug || 'batik',
        attributes: Array.isArray(c.attributes) ? c.attributes : [],
      },
    ])
  );

  const enrichedProducts = (products || [])
    .filter((p) => p && p.active_status !== false)
    .map((p) => {
      const shopObj =
        shopById.get(String(p.shop_id)) ||
        normalizeShop(p.shop) || {
          id: String(p.shop_id || ''),
          account_id: '',
          name: 'Sanggar Batik',
          address: '',
          number: '',
          instagram: '',
          online_shop: '',
          gmaps: '',
          description: '',
          profile: '',
          profile_public_url: '',
          active_status: true,
        };

      const catObj = categoryById.get(String(p.category_id)) || {
        id: String(p.category_id || ''),
        name: p.category_name || 'Batik',
        slug: p.category_slug || 'batik',
        attributes: [],
      };

      const schemas = [...(catObj.attributes || [])].sort(
        (a, b) => (a.order ?? 0) - (b.order ?? 0)
      );
      const rawAttrs =
        p.additional_attribute && typeof p.additional_attribute === 'object'
          ? p.additional_attribute
          : {};

      const formattedAttributes = schemas
        .filter(
          (s) =>
            rawAttrs[s.name] !== undefined &&
            rawAttrs[s.name] !== null &&
            rawAttrs[s.name] !== ''
        )
        .map((s) => ({
          name: s.name,
          label: formatAttributeLabel(s.name),
          required: Boolean(s.required),
          displayValue: formatAttributeValue(s, rawAttrs[s.name]),
        }));

      const schemaNames = new Set(schemas.map((s) => s.name));
      Object.entries(rawAttrs).forEach(([key, val]) => {
        if (!schemaNames.has(key) && val !== undefined && val !== null && val !== '') {
          formattedAttributes.push({
            name: key,
            label: formatAttributeLabel(key),
            required: false,
            displayValue: formatAttributeValue(
              {
                name: key,
                type:
                  typeof val === 'boolean'
                    ? 'boolean'
                    : typeof val === 'number'
                    ? 'number'
                    : 'string',
              },
              val
            ),
          });
        }
      });

      const displayImages = [...(p.display_images || [])]
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
        .map((img) => {
          const resolvedUrl = img.public_url || img.image_url || '';
          return {
            ...img,
            storage_path: img.image_url || '',
            image_url: resolvedUrl,
            public_url: resolvedUrl,
          };
        });

      const mockupImage = p.mockup_image
        ? {
            ...p.mockup_image,
            storage_path: p.mockup_image.image_url || '',
            image_url: p.mockup_image.public_url || p.mockup_image.image_url || '',
            public_url: p.mockup_image.public_url || p.mockup_image.image_url || '',
          }
        : null;

      return {
        ...p,
        id: String(p.id),
        shop_id: shopObj.id,
        category_id: catObj.id,
        price: Number(p.price) || 0,
        description: p.description || '',
        product_link: p.product_link || '',
        additional_attribute: rawAttrs,
        shop: shopObj,
        category: catObj,
        formattedAttributes,
        displayImages,
        primaryImageUrl: displayImages[0]?.public_url || '',
        mockupImage,
        mockupImageUrl: mockupImage?.public_url || '',
      };
    });

  const productsByShopId = new Map();
  enrichedProducts.forEach((prod) => {
    const list = productsByShopId.get(prod.shop_id) || [];
    list.push(prod);
    productsByShopId.set(prod.shop_id, list);
  });

  const shopBooks = activeShops.map((shop) => ({
    shop,
    account: null,
    products: productsByShopId.get(shop.id) || [],
  }));

  return {
    activeShops,
    categories: Array.from(categoryById.values()),
    enrichedProducts,
    shopBooks,
  };
}

/**
 * Memuat seluruh data publik katalog pengunjung (sanggar, produk aktif, kategori)
 * secara paralel dari backend aktif.
 */
export async function fetchUserCatalogData() {
  const [shops, products, categories] = await Promise.all([
    fetchAllPublicShops(),
    fetchAllPublicProducts(),
    fetchPublicCategories(),
  ]);

  return buildCatalogFromBackend({ shops, products, categories });
}
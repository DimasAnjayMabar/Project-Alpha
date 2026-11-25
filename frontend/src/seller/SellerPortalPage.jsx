import React, { useState, useMemo, useCallback, useEffect } from 'react';
import {
  Plus,
  Pencil,
  Trash2,
  LogOut,
  ShieldCheck,
  Package,
  ExternalLink,
  Search,
  Settings,
  Check,
  Eye,
  EyeOff,
  Phone,
  MapPin,
  Loader2,
  AlertCircle,
  RefreshCw,
  Store,
} from 'lucide-react';
import FadeIn from '../components/FadeIn';
import ProductArtwork from '../user/components/ProductArtwork';
import {
  formatRupiah,
  formatAttributeLabel,
  formatAttributeValue,
} from '../user/utils/helpers';
import {
  fetchMyShop,
  updateMyShop,
  fetchMyProducts,
  fetchProductCategories,
  createSellerProductApi,
  updateSellerProductApi,
  updateProductStatus,
  deleteSellerProductApi,
  logoutSeller,
} from './utils/sellerService';
import SellerLoginView from './components/SellerLoginView';
import SellerProductFormModal from './components/SellerProductFormModal';
import SellerShopSettingsModal from './components/SellerShopSettingsModal';
import { useBackendMediaUrl } from '../utils/useBackendMediaUrl';

function ShopAvatar({ src, name, sizeClass = 'w-10 h-10', iconClass = 'w-5 h-5' }) {
  const { src: resolvedSrc, failed } = useBackendMediaUrl(src);
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    setImgError(false);
  }, [resolvedSrc]);

  if (resolvedSrc && !failed && !imgError) {
    return (
      <img
        src={resolvedSrc}
        alt={`Logo ${name || 'Sanggar'}`}
        onError={() => setImgError(true)}
        className={`${sizeClass} rounded-md object-cover border border-[#C4A46B]/40 bg-[#EFEAE0] shrink-0`}
      />
    );
  }

  return (
    <div
      className={`${sizeClass} rounded-md border border-[#C4A46B]/35 bg-[#C4A46B]/12 flex items-center justify-center shrink-0`}
      aria-hidden="true"
    >
      <Store className={`${iconClass} text-[#C4A46B]`} />
    </div>
  );
}

export default function SellerPortalPage({ onOpenUserCatalog }) {
  const [authStatus, setAuthStatus] = useState('checking'); // 'checking' | 'authenticated' | 'unauthenticated' | 'error'
  const [loadError, setLoadError] = useState('');
  const [shop, setShop] = useState(null);
  const [categories, setCategories] = useState([]);
  const [rawProducts, setRawProducts] = useState([]);

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [busyProductId, setBusyProductId] = useState(null);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [isShopModalOpen, setIsShopModalOpen] = useState(false);
  const [toastMsg, setToastMsg] = useState('');

  const showToast = useCallback((msg) => {
    setToastMsg(msg);
    setTimeout(() => {
      setToastMsg((prev) => (prev === msg ? '' : prev));
    }, 3200);
  }, []);

  const handleUnauthorized = useCallback(() => {
    setShop(null);
    setRawProducts([]);
    setEditingProduct(null);
    setIsProductModalOpen(false);
    setIsShopModalOpen(false);
    setAuthStatus('unauthenticated');
  }, []);

  // Muat sesi toko (cookie access_token), kategori, dan produk sanggar dari backend
  const loadDashboardData = useCallback(
    async ({ silent = false } = {}) => {
      if (silent) {
        setIsRefreshing(true);
      } else {
        setAuthStatus('checking');
        setLoadError('');
      }

      try {
        const myShop = await fetchMyShop();
        if (!myShop) {
          handleUnauthorized();
          return;
        }

        const [cats, prodRes] = await Promise.all([
          fetchProductCategories(),
          fetchMyProducts({ page: 1, limit: 100 }),
        ]);

        setShop(myShop);
        setCategories(cats);
        setRawProducts(prodRes.items);
        setAuthStatus('authenticated');
        setLoadError('');
      } catch (err) {
        if (err?.status === 401) {
          handleUnauthorized();
        } else {
          setLoadError(
            err?.message ||
              'Tidak dapat terhubung ke server backend. Pastikan server backend (port 3002) sedang aktif.'
          );
          if (!silent) {
            setAuthStatus('error');
          } else {
            showToast(err?.message || 'Gagal menyegarkan data sanggar.');
          }
        }
      } finally {
        if (silent) setIsRefreshing(false);
      }
    },
    [handleUnauthorized, showToast]
  );

  useEffect(() => {
    loadDashboardData();
  }, [loadDashboardData]);

  // Ratakan category_attribute untuk form modal produk
  const flattenedCategoryAttributes = useMemo(() => {
    return categories.flatMap((cat) =>
      (cat.attributes || []).map((attr) => ({
        ...attr,
        category_id: cat.id,
      }))
    );
  }, [categories]);

  // Normalisasi produk dari respons GET /product/me untuk ditampilkan pada kartu katalog
  const myProducts = useMemo(() => {
    const categoryById = new Map(categories.map((c) => [c.id, c]));

    return rawProducts.map((p) => {
      const catObj = categoryById.get(p.category_id) || {
        id: p.category_id,
        name: p.category_name || 'Batik',
        slug: p.category_slug || 'batik',
        attributes: [],
      };

      const schemas = [...(catObj.attributes || [])].sort(
        (a, b) => (a.order ?? 0) - (b.order ?? 0)
      );
      const rawAttrs = p.additional_attribute || {};

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
          displayValue: formatAttributeValue(s, rawAttrs[s.name]),
        }));

      const schemaNames = new Set(schemas.map((s) => s.name));
      Object.entries(rawAttrs).forEach(([key, val]) => {
        if (!schemaNames.has(key) && val !== undefined && val !== null && val !== '') {
          formattedAttributes.push({
            name: key,
            label: formatAttributeLabel(key),
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

      const displayImages = [...(p.display_images || [])].sort(
        (a, b) => (a.order ?? 0) - (b.order ?? 0)
      );

      return {
        ...p,
        description: p.description || '',
        category: catObj,
        formattedAttributes,
        displayImages,
        primaryImageUrl: displayImages[0]?.public_url || '',
      };
    });
  }, [rawProducts, categories]);

  const filteredMyProducts = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return myProducts.filter((p) => {
      const matchCat = categoryFilter === 'ALL' || p.category_id === categoryFilter;
      const matchQ =
        !q ||
        (p.name || '').toLowerCase().includes(q) ||
        (p.description || '').toLowerCase().includes(q) ||
        (p.category?.name || '').toLowerCase().includes(q);
      return matchCat && matchQ;
    });
  }, [myProducts, categoryFilter, searchQuery]);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await logoutSeller();
    } catch {
      // Tetap kosongkan state lokal meski request logout gagal
    } finally {
      setIsLoggingOut(false);
      handleUnauthorized();
    }
  };

  const handleToggleProductVisibility = async (product) => {
    const nextStatus = !(product.active_status !== false);
    setBusyProductId(product.id);
    try {
      const updated = await updateProductStatus(product.id, nextStatus);
      setRawProducts((prev) =>
        prev.map((item) =>
          item.id === product.id
            ? { ...(updated || item), active_status: nextStatus }
            : item
        )
      );
      showToast(
        nextStatus
          ? `"${product.name}" ditampilkan kembali di etalase.`
          : `"${product.name}" disembunyikan sementara (Draft).`
      );
    } catch (err) {
      if (err?.status === 401) {
        handleUnauthorized();
      } else {
        showToast(err?.message || 'Gagal mengubah status tayang produk.');
      }
    } finally {
      setBusyProductId(null);
    }
  };

  const handleDeleteProduct = async (product) => {
    const confirmed = window.confirm(
      `Hapus permanen produk "${product.name}" beserta seluruh gambarnya dari katalog ${shop?.name || 'sanggar Anda'}?`
    );
    if (!confirmed) return;

    setBusyProductId(product.id);
    try {
      await deleteSellerProductApi(product.id, true);
      setRawProducts((prev) => prev.filter((item) => item.id !== product.id));
      showToast(`Produk "${product.name}" telah dihapus permanen.`);
    } catch (err) {
      if (err?.status === 401) {
        handleUnauthorized();
      } else {
        showToast(err?.message || 'Gagal menghapus produk.');
      }
    } finally {
      setBusyProductId(null);
    }
  };

  const handleSaveShopSettings = async (shopInput, options) => {
    try {
      const updatedShop = await updateMyShop(shopInput, options);
      if (updatedShop) {
        setShop(updatedShop);
      }
      setIsShopModalOpen(false);
      showToast('Profil & logo sanggar berhasil diperbarui.');
    } catch (err) {
      if (err?.status === 401) {
        handleUnauthorized();
        return;
      }
      throw err;
    }
  };

  const handleOpenAddModal = () => {
    setEditingProduct(null);
    setIsProductModalOpen(true);
  };

  const handleOpenEditModal = (product) => {
    setEditingProduct(product);
    setIsProductModalOpen(true);
  };

  const handleSaveProduct = async (productInput, mediaOptions) => {
    try {
      if (editingProduct) {
        const updated = await updateSellerProductApi(editingProduct.id, productInput, {
          newDisplayFiles: mediaOptions?.displayFiles || [],
          deleteDisplayImageIds: mediaOptions?.deleteDisplayImageIds || [],
          displayImageOrders: mediaOptions?.displayImageOrders || [],
          newMockupFile: mediaOptions?.mockupFile || null,
          removeMockup: Boolean(mediaOptions?.removeMockup),
        });
        if (updated) {
          setRawProducts((prev) =>
            prev.map((item) => (item.id === editingProduct.id ? updated : item))
          );
        }
        showToast(`Produk "${productInput.name}" berhasil diperbarui.`);
      } else {
        const created = await createSellerProductApi(productInput, {
          displayFiles: mediaOptions?.displayFiles || [],
          mockupFile: mediaOptions?.mockupFile || null,
        });
        if (created) {
          setRawProducts((prev) => [created, ...prev]);
        }
        showToast(`Produk "${productInput.name}" ditambahkan ke ${shop.name}.`);
      }

      setIsProductModalOpen(false);
      setEditingProduct(null);
    } catch (err) {
      if (err?.status === 401) {
        handleUnauthorized();
        return;
      }
      throw err;
    }
  };

  // 1. Sedang memeriksa cookie access_token via GET /shop/me
  if (authStatus === 'checking') {
    return (
      <div className="min-h-screen bg-[#F7F4EE] text-[#1C1917] flex flex-col items-center justify-center gap-3 px-4">
        <Loader2 className="w-7 h-7 animate-spin text-[#7C3219]" />
        <p className="font-serif text-lg text-[#1C1917]">
          Memeriksa sesi Portal Perajin...
        </p>
      </div>
    );
  }

  // 2. Gagal koneksi ke backend (bukan 401)
  if (authStatus === 'error') {
    return (
      <div className="min-h-screen bg-[#F7F4EE] text-[#1C1917] flex items-center justify-center px-4">
        <div className="max-w-md w-full rounded-lg bg-[#FCFBF8] border border-[#1C1917]/12 p-8 text-center space-y-5">
          <div className="w-12 h-12 rounded-full bg-[#9E2A2B]/10 text-[#9E2A2B] flex items-center justify-center mx-auto">
            <AlertCircle className="w-6 h-6" />
          </div>
          <div className="space-y-2">
            <h1 className="font-serif font-normal text-2xl text-[#1C1917]">
              Gagal Memuat Dasbor Sanggar
            </h1>
            <p className="text-[14px] text-[#575049] leading-relaxed">{loadError}</p>
          </div>
          <div className="flex flex-wrap justify-center gap-3">
            <button
              type="button"
              onClick={() => loadDashboardData()}
              className="taste-btn-primary"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Coba Lagi</span>
            </button>
            <button
              type="button"
              onClick={() => onOpenUserCatalog(null)}
              className="taste-btn-secondary"
            >
              <span>Kembali ke Etalase</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 3. Belum login (401 dari GET /shop/me)
  // 3. Belum login (401 dari GET /shop/me)
  if (authStatus === 'unauthenticated' || !shop) {
    return (
      <SellerLoginView
        onBackToCatalog={() => onOpenUserCatalog(null)}
        onLoginSuccess={() => loadDashboardData()}
      />
    );
  }

  const activeCount = myProducts.filter((p) => p.active_status !== false).length;

  return (
    <div className="min-h-screen bg-[#F7F4EE] text-[#1C1917]">
      {toastMsg && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-5 right-5 z-50 px-4 py-3 rounded-md bg-[#1B1714] text-[#F5F1E8] text-[13px] font-medium shadow-lg flex items-center gap-2.5 border border-white/15 fade-panel"
        >
          <Check className="w-4 h-4 text-[#C4A46B] shrink-0" />
          <span>{toastMsg}</span>
        </div>
      )}

      {/* Navbar Seller */}
      <header className="sticky top-0 z-40 bg-[#1B1714] text-[#F5F1E8] border-b border-white/12">
        <div className="taste-wrap h-[72px] flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <ShopAvatar
              src={shop.profile_public_url}
              name={shop.name}
              sizeClass="w-10 h-10"
              iconClass="w-5 h-5"
            />
            <div className="min-w-0">
              <span className="font-aksara text-[17px] sm:text-[19px] text-[#C4A46B] block leading-none truncate">
                Batik Wicara Trenggalek
              </span>
              <span className="text-[13px] text-[#F5F1E8]/90 flex items-center gap-1.5 mt-1 truncate">
                <ShieldCheck className="w-3.5 h-3.5 text-[#C4A46B] shrink-0" />
                <span className="truncate">{shop.name}</span>
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => onOpenUserCatalog(shop.id)}
              className="inline-flex items-center gap-1.5 min-h-[44px] px-4 py-2 rounded-md border border-white/20 text-[#F5F1E8] hover:bg-white/10 text-[13px] font-medium transition-colors cursor-pointer"
            >
              <ExternalLink className="w-4 h-4 text-[#C4A46B]" />
              <span className="hidden sm:inline">Lihat Buku Katalog Saya</span>
              <span className="sm:hidden">Lihat Buku</span>
            </button>

            <button
              type="button"
              onClick={handleLogout}
              disabled={isLoggingOut}
              className="inline-flex items-center gap-1.5 min-h-[44px] px-4 py-2 rounded-md bg-[#9E2A2B] hover:bg-[#7F2021] disabled:opacity-70 text-white text-[13px] font-medium transition-colors cursor-pointer"
            >
              {isLoggingOut ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <LogOut className="w-4 h-4" />
              )}
              <span>Keluar</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="taste-wrap py-10 lg:py-14 space-y-8">
        <FadeIn>
          {/* Kartu Identitas Sanggar & Status Isolasi */}
          <div className="rounded-lg bg-[#FCFBF8] border border-[#1C1917]/12 p-6 sm:p-8 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            <div className="flex items-start gap-4 sm:gap-5 min-w-0">
              <ShopAvatar
                src={shop.profile_public_url}
                name={shop.name}
                sizeClass="w-16 h-16 sm:w-20 sm:h-20"
                iconClass="w-7 h-7 sm:w-8 sm:h-8"
              />

              <div className="space-y-2.5 min-w-0">
                <div className="flex flex-wrap items-center gap-3 text-[13px]">
                  <span
                    className={`inline-flex items-center gap-1.5 font-medium ${
                      shop.active_status !== false ? 'text-[#1F5E3B]' : 'text-[#9E2A2B]'
                    }`}
                  >
                    <ShieldCheck className="w-4 h-4 shrink-0" />
                    <span>
                      {shop.active_status !== false ? 'Sanggar Aktif' : 'Sanggar Nonaktif'}
                    </span>
                  </span>
                  <span className="text-[#575049] tabular-nums">
                    {activeCount} aktif dari {myProducts.length} produk
                  </span>
                </div>

                <h1 className="font-serif font-normal text-2xl sm:text-4xl text-[#1C1917] tracking-[-0.02em] break-words">
                  Dasbor Katalog {shop.name}
                </h1>

                <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[14px] text-[#575049]">
                  <span className="flex items-center gap-1.5">
                    <MapPin className="w-4 h-4 text-[#7C3219] shrink-0" />
                    <span>{shop.address || 'Alamat sanggar belum diatur'}</span>
                  </span>
                  <span className="flex items-center gap-1.5 font-mono text-[13px] text-[#1C1917] tabular-nums">
                    <Phone className="w-3.5 h-3.5 text-[#7C3219] shrink-0" />
                    <span>
                      {shop.number ? `+${shop.number}` : 'Nomor WhatsApp belum diatur'}
                    </span>
                  </span>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2.5 shrink-0">
              <button
                type="button"
                onClick={() => loadDashboardData({ silent: true })}
                disabled={isRefreshing}
                className="taste-btn-secondary"
                title="Muat ulang data dari server"
              >
                <RefreshCw
                  className={`w-4 h-4 text-[#7C3219] ${isRefreshing ? 'animate-spin' : ''}`}
                />
                <span>Segarkan</span>
              </button>

              <button
                type="button"
                onClick={() => setIsShopModalOpen(true)}
                className="taste-btn-secondary"
              >
                <Settings className="w-4 h-4 text-[#7C3219]" />
                <span>Profil &amp; WhatsApp</span>
              </button>

              <button
                type="button"
                onClick={handleOpenAddModal}
                className="taste-btn-primary"
              >
                <Plus className="w-4 h-4" />
                <span>Tambah Produk Baru</span>
              </button>
            </div>
          </div>
        </FadeIn>

        {/* Bar Filter & Pencarian Produk Sanggar */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 border-b border-[#1C1917]/12 pb-5">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setCategoryFilter('ALL')}
              className={`min-h-[40px] px-3.5 py-2 rounded-md text-[13px] font-medium border transition-colors cursor-pointer ${
                categoryFilter === 'ALL'
                  ? 'bg-[#1B1714] text-[#F5F1E8] border-[#1B1714]'
                  : 'bg-[#FCFBF8] text-[#575049] border-[#1C1917]/15 hover:text-[#1C1917]'
              }`}
            >
              Semua Kategori ({myProducts.length})
            </button>
            {categories.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setCategoryFilter(cat.id)}
                className={`min-h-[40px] px-3.5 py-2 rounded-md text-[13px] font-medium border transition-colors cursor-pointer ${
                  categoryFilter === cat.id
                    ? 'bg-[#1B1714] text-[#F5F1E8] border-[#1B1714]'
                    : 'bg-[#FCFBF8] text-[#575049] border-[#1C1917]/15 hover:text-[#1C1917]'
                }`}
              >
                {cat.name}
              </button>
            ))}
          </div>

          <div className="relative w-full sm:w-72">
            <label htmlFor="seller-search" className="sr-only">
              Cari produk di sanggar Anda
            </label>
            <Search className="w-4 h-4 text-[#575049] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              id="seller-search"
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari produk di sanggar Anda..."
              className="w-full min-h-[44px] pl-10 pr-4 py-2 rounded-md bg-[#FCFBF8] border border-[#1C1917]/20 text-[14px] text-[#1C1917]"
            />
          </div>
        </div>

        {/* Daftar Produk Milik Sanggar Ini */}
        {filteredMyProducts.length === 0 ? (
          <div className="rounded-lg bg-[#FCFBF8] border border-[#1C1917]/12 p-12 text-center space-y-3">
            <Package className="w-9 h-9 text-[#7C3219] mx-auto opacity-85" />
            <h2 className="font-serif font-normal text-xl text-[#1C1917]">
              Belum ada produk pada filter ini
            </h2>
            <p className="text-[14px] text-[#575049] max-w-md mx-auto">
              Klik tombol &ldquo;Tambah Produk Baru&rdquo; untuk menerbitkan karya batik ke buku
              katalog {shop.name}.
            </p>
            <button
              type="button"
              onClick={handleOpenAddModal}
              className="taste-btn-primary"
            >
              <Plus className="w-4 h-4" />
              <span>Tambah Produk Pertama</span>
            </button>
          </div>
        ) : (
          <div
            key={categoryFilter}
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 fade-swap"
          >
            {filteredMyProducts.map((prod, idx) => {
              const isVisible = prod.active_status !== false;
              const isBusy = busyProductId === prod.id;
              return (
                <article
                  key={prod.id}
                  style={{ animationDelay: `${Math.min(idx, 5) * 75}ms` }}
                  className={`rounded-lg border bg-[#FCFBF8] overflow-hidden flex flex-col justify-between taste-card fade-card-in ${
                    isVisible ? 'border-[#1C1917]/12' : 'border-[#1C1917]/20 opacity-80'
                  }`}
                >
                  <div>
                    <div className="aspect-[4/3] border-b border-[#1C1917]/10 overflow-hidden bg-[#EFEAE0] taste-zoom-frame">
                      <ProductArtwork
                        product={prod}
                        imageUrl={prod.primaryImageUrl}
                        size={400}
                        className="w-full h-full"
                      />
                    </div>

                    <div className="p-5 space-y-3">
                      <div className="flex items-center justify-between gap-2 text-[13px]">
                        <span className="font-medium text-[#7C3219]">{prod.category.name}</span>
                        <span
                          className={`font-medium ${
                            isVisible ? 'text-[#1F5E3B]' : 'text-[#575049]'
                          }`}
                        >
                          {isVisible ? 'Tayang' : 'Draft'}
                        </span>
                      </div>

                      <div className="flex items-baseline justify-between gap-2">
                        <h3 className="font-serif text-[20px] font-medium text-[#1C1917] leading-snug">
                          {prod.name}
                        </h3>
                        <span className="text-[15px] font-semibold text-[#1C1917] tabular-nums shrink-0">
                          {formatRupiah(prod.price)}
                        </span>
                      </div>

                      <p className="text-[14px] text-[#575049] line-clamp-2 leading-relaxed">
                        {prod.description || 'Belum ada deskripsi produk.'}
                      </p>

                      {prod.formattedAttributes.length > 0 && (
                        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 pt-3 border-t border-[#1C1917]/10 text-[13px]">
                          {prod.formattedAttributes.slice(0, 4).map((attr) => (
                            <div key={attr.name} className="min-w-0">
                              <dt className="text-[#575049] truncate">{attr.label}</dt>
                              <dd className="font-medium text-[#1C1917] truncate">
                                {attr.displayValue}
                              </dd>
                            </div>
                          ))}
                        </dl>
                      )}
                    </div>
                  </div>

                  {/* Kontrol CRUD Khusus Pemilik */}
                  <div className="px-5 pb-5 pt-1 grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => handleToggleProductVisibility(prod)}
                      className="min-h-[40px] px-2.5 rounded-md bg-[#F7F4EE] hover:bg-[#EFEAE0] disabled:opacity-60 border border-[#1C1917]/15 text-[13px] font-medium text-[#575049] hover:text-[#1C1917] flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
                      title={isVisible ? 'Sembunyikan dari katalog' : 'Tampilkan di katalog'}
                    >
                      {isBusy ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : isVisible ? (
                        <EyeOff className="w-3.5 h-3.5" />
                      ) : (
                        <Eye className="w-3.5 h-3.5" />
                      )}
                      <span>{isVisible ? 'Draft' : 'Tayang'}</span>
                    </button>

                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => handleOpenEditModal(prod)}
                      className="min-h-[40px] px-2.5 rounded-md bg-[#F7F4EE] hover:bg-[#EFEAE0] disabled:opacity-60 border border-[#1C1917]/20 text-[13px] font-medium text-[#7C3219] flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                      <span>Edit</span>
                    </button>

                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => handleDeleteProduct(prod)}
                      className="min-h-[40px] px-2.5 rounded-md bg-[#FCFBF8] hover:bg-[#9E2A2B]/10 disabled:opacity-60 border border-[#9E2A2B]/30 text-[13px] font-medium text-[#9E2A2B] flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Hapus</span>
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </main>

      {/* Modal Tambah / Edit Produk (POST /product & PATCH /product/{id}) */}
      {isProductModalOpen && (
        <SellerProductFormModal
          key={editingProduct ? editingProduct.id : 'new-product'}
          isOpen={isProductModalOpen}
          onClose={() => {
            setIsProductModalOpen(false);
            setEditingProduct(null);
          }}
          initialProduct={editingProduct}
          categories={categories}
          categoryAttributes={flattenedCategoryAttributes}
          shopId={shop.id}
          onSaveProduct={handleSaveProduct}
        />
      )}

      {/* Modal Edit Profil & Logo Sanggar (PATCH /shop/me) */}
      {isShopModalOpen && (
        <SellerShopSettingsModal
          key={shop.id}
          isOpen={isShopModalOpen}
          onClose={() => setIsShopModalOpen(false)}
          shop={shop}
          onSaveShop={handleSaveShopSettings}
        />
      )}
    </div>
  );
}
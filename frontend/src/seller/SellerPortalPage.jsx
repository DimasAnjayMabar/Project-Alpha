import React, { useState, useMemo, useCallback } from 'react';
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
} from 'lucide-react';
import FadeIn from '../components/FadeIn';
import ProductArtwork from '../user/components/ProductArtwork';
import {
  formatRupiah,
  formatAttributeLabel,
  formatAttributeValue,
} from '../user/utils/helpers';
import {
  getSavedSellerAccountId,
  saveSellerSession,
  createSellerProduct,
  updateSellerProduct,
  deleteSellerProduct,
  updateSellerShop,
} from './utils/sellerService';
import SellerLoginView from './components/SellerLoginView';
import SellerProductFormModal from './components/SellerProductFormModal';
import SellerShopSettingsModal from './components/SellerShopSettingsModal';

export default function SellerPortalPage({ db, setDb, onOpenUserCatalog }) {
  const [currentAccountId, setCurrentAccountId] = useState(() => getSavedSellerAccountId());
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
    }, 3000);
  }, []);

  // Resolusi akun & toko milik seller yang sedang login
  const currentSession = useMemo(() => {
    if (!currentAccountId) return null;
    const account = (db.account || []).find(
      (a) => a.id === currentAccountId && a.role === 'penjual'
    );
    if (!account) return null;
    const shop = (db.shop || []).find((s) => s.account_id === account.id);
    if (!shop) return null;
    return { account, shop };
  }, [db, currentAccountId]);

  const handleLoginSuccess = (account, shop, updatedDb) => {
    if (updatedDb && updatedDb !== db) {
      setDb(updatedDb);
    }
    saveSellerSession(account.id);
    setCurrentAccountId(account.id);
    showToast(`Selamat datang, ${account.display_name} (${shop.name})`);
  };

  const handleLogout = () => {
    saveSellerSession(null);
    setCurrentAccountId(null);
    setEditingProduct(null);
    setIsProductModalOpen(false);
  };

  // ISOLASI DATA: Hanya ambil produk milik shop.id dari seller yang login
  const myProducts = useMemo(() => {
    if (!currentSession) return [];
    const { shop } = currentSession;
    const categoryById = new Map((db.category || []).map((c) => [c.id, c]));

    const attrsByCatId = new Map();
    (db.category_attribute || []).forEach((attr) => {
      if (!attrsByCatId.has(attr.category_id)) attrsByCatId.set(attr.category_id, []);
      attrsByCatId.get(attr.category_id).push(attr);
    });

    const imgsByProdId = new Map();
    (db.product_display_image || []).forEach((img) => {
      if (!imgsByProdId.has(img.product_id)) imgsByProdId.set(img.product_id, []);
      imgsByProdId.get(img.product_id).push(img);
    });
    imgsByProdId.forEach((list) => list.sort((a, b) => (a.order ?? 0) - (b.order ?? 0)));

    return (db.product || [])
      .filter((p) => p.shop_id === shop.id)
      .map((p) => {
        const catObj = categoryById.get(p.category_id) || { id: p.category_id, name: 'Umum' };
        const schemas = attrsByCatId.get(p.category_id) || [];
        const rawAttrs = p.additional_attribute || {};
        const formattedAttributes = schemas
          .filter((s) => rawAttrs[s.name] !== undefined)
          .map((s) => ({
            name: s.name,
            label: formatAttributeLabel(s.name),
            displayValue: formatAttributeValue(s, rawAttrs[s.name]),
          }));
        const displayImages = imgsByProdId.get(p.id) || [];

        return {
          ...p,
          category: catObj,
          formattedAttributes,
          displayImages,
          primaryImageUrl: displayImages[0]?.image_url || '',
        };
      });
  }, [db, currentSession]);

  const filteredMyProducts = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return myProducts.filter((p) => {
      const matchCat = categoryFilter === 'ALL' || p.category_id === categoryFilter;
      const matchQ =
        !q ||
        p.name.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        p.category.name.toLowerCase().includes(q);
      return matchCat && matchQ;
    });
  }, [myProducts, categoryFilter, searchQuery]);

  // Jika belum login, tampilkan halaman Login / Registrasi Seller
  if (!currentSession) {
    return (
      <SellerLoginView
        db={db}
        onLoginSuccess={handleLoginSuccess}
        onBackToCatalog={onOpenUserCatalog}
      />
    );
  }

  const { account, shop } = currentSession;

  const handleOpenAddModal = () => {
    setEditingProduct(null);
    setIsProductModalOpen(true);
  };

  const handleOpenEditModal = (product) => {
    if (product.shop_id !== shop.id) {
      showToast('Akses ditolak: Produk ini bukan milik sanggar Anda.');
      return;
    }
    setEditingProduct(product);
    setIsProductModalOpen(true);
  };

  const handleSaveProduct = (productInput, imageUrls) => {
    try {
      if (editingProduct) {
        const nextDb = updateSellerProduct(
          db,
          account.id,
          editingProduct.id,
          productInput,
          imageUrls
        );
        setDb(nextDb);
        showToast(`Produk "${productInput.name}" berhasil diperbarui.`);
      } else {
        const nextDb = createSellerProduct(db, account.id, productInput, imageUrls);
        setDb(nextDb);
        showToast(`Produk "${productInput.name}" ditambahkan ke ${shop.name}.`);
      }
      setIsProductModalOpen(false);
      setEditingProduct(null);
    } catch (err) {
      showToast(err.message);
    }
  };

  const handleDeleteProduct = (product) => {
    if (product.shop_id !== shop.id) {
      showToast('Akses ditolak: Anda tidak bisa menghapus barang UMKM lain.');
      return;
    }
    const confirmed = window.confirm(
      `Hapus produk "${product.name}" dari buku katalog ${shop.name}?`
    );
    if (!confirmed) return;

    try {
      const nextDb = deleteSellerProduct(db, account.id, product.id);
      setDb(nextDb);
      showToast(`Produk "${product.name}" telah dihapus.`);
    } catch (err) {
      showToast(err.message);
    }
  };

  const handleToggleProductVisibility = (product) => {
    try {
      const nextDb = updateSellerProduct(
        db,
        account.id,
        product.id,
        {
          ...product,
          active_status: !product.active_status,
        },
        product.displayImages.map((i) => i.image_url)
      );
      setDb(nextDb);
      showToast(
        !product.active_status
          ? `"${product.name}" ditampilkan kembali di etalase.`
          : `"${product.name}" disembunyikan sementara (Draft).`
      );
    } catch (err) {
      showToast(err.message);
    }
  };

  const handleSaveShopSettings = (shopInput) => {
    try {
      const nextDb = updateSellerShop(db, account.id, shopInput);
      setDb(nextDb);
      setIsShopModalOpen(false);
      showToast('Profil sanggar & nomor WhatsApp berhasil diperbarui.');
    } catch (err) {
      showToast(err.message);
    }
  };

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
            <svg
              width="24"
              height="24"
              viewBox="0 0 32 32"
              fill="none"
              aria-hidden="true"
              className="shrink-0"
            >
              <path d="M16 4L28 16L16 28L4 16L16 4Z" stroke="#C4A46B" strokeWidth="2" />
              <circle cx="16" cy="16" r="3.5" fill="#C4A46B" />
            </svg>
            <div className="min-w-0">
              <span className="font-aksara text-[17px] sm:text-[19px] text-[#C4A46B] block leading-none truncate">
                Batik Wicara Trenggalek
              </span>
              <span className="text-[13px] text-[#F5F1E8]/90 flex items-center gap-1.5 mt-1 truncate">
                <ShieldCheck className="w-3.5 h-3.5 text-[#C4A46B] shrink-0" />
                <span className="truncate">
                  {shop.name} · Pengelola: {account.display_name}
                </span>
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
              className="inline-flex items-center gap-1.5 min-h-[44px] px-4 py-2 rounded-md bg-[#9E2A2B] hover:bg-[#7F2021] text-white text-[13px] font-medium transition-colors cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
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
            <div className="space-y-2.5">
              <div className="flex flex-wrap items-center gap-3 text-[13px]">
                <span className="inline-flex items-center gap-1.5 font-medium text-[#1F5E3B]">
                  <ShieldCheck className="w-4 h-4 shrink-0" />
                  <span>Akses terisolasi: {shop.id}</span>
                </span>
                <span className="text-[#575049] tabular-nums">
                  {activeCount} aktif dari {myProducts.length} produk
                </span>
              </div>

              <h1 className="font-serif font-normal text-2xl sm:text-4xl text-[#1C1917] tracking-[-0.02em]">
                Dasbor Katalog {shop.name}
              </h1>

              <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[14px] text-[#575049]">
                <span className="flex items-center gap-1.5">
                  <MapPin className="w-4 h-4 text-[#7C3219] shrink-0" />
                  <span>{shop.address}</span>
                </span>
                <span className="flex items-center gap-1.5 font-mono text-[13px] text-[#1C1917] tabular-nums">
                  <Phone className="w-3.5 h-3.5 text-[#7C3219] shrink-0" />+{shop.number}
                </span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2.5 shrink-0">
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
            {(db.category || []).map((cat) => (
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
          <div key={categoryFilter} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 fade-swap">
            {filteredMyProducts.map((prod, idx) => {
              const isVisible = prod.active_status !== false;
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
                        {prod.description}
                      </p>

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
                    </div>
                  </div>

                  {/* Kontrol CRUD Khusus Pemilik */}
                  <div className="px-5 pb-5 pt-1 grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => handleToggleProductVisibility(prod)}
                      className="min-h-[40px] px-2.5 rounded-md bg-[#F7F4EE] hover:bg-[#EFEAE0] border border-[#1C1917]/15 text-[13px] font-medium text-[#575049] hover:text-[#1C1917] flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
                      title={isVisible ? 'Sembunyikan dari katalog' : 'Tampilkan di katalog'}
                    >
                      {isVisible ? (
                        <EyeOff className="w-3.5 h-3.5" />
                      ) : (
                        <Eye className="w-3.5 h-3.5" />
                      )}
                      <span>{isVisible ? 'Draft' : 'Tayang'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleOpenEditModal(prod)}
                      className="min-h-[40px] px-2.5 rounded-md bg-[#F7F4EE] hover:bg-[#EFEAE0] border border-[#1C1917]/20 text-[13px] font-medium text-[#7C3219] flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                      <span>Edit</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleDeleteProduct(prod)}
                      className="min-h-[40px] px-2.5 rounded-md bg-[#FCFBF8] hover:bg-[#9E2A2B]/10 border border-[#9E2A2B]/30 text-[13px] font-medium text-[#9E2A2B] flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
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

      {/* Modal Tambah / Edit Produk */}
      {isProductModalOpen && (
        <SellerProductFormModal
          key={editingProduct ? editingProduct.id : 'new-product'}
          isOpen={isProductModalOpen}
          onClose={() => {
            setIsProductModalOpen(false);
            setEditingProduct(null);
          }}
          initialProduct={editingProduct}
          categories={db.category || []}
          categoryAttributes={db.category_attribute || []}
          shopId={shop.id}
          onSaveProduct={handleSaveProduct}
        />
      )}

      {/* Modal Edit Profil Sanggar */}
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

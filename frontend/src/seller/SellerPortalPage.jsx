import React, { useState, useMemo, useCallback } from 'react';
import {
  Plus,
  Pencil,
  Trash2,
  LogOut,
  ShieldCheck,
  Store,
  Package,
  ExternalLink,
  Search,
  Settings,
  Sparkles,
  Eye,
  EyeOff,
  Phone,
  MapPin,
} from 'lucide-react';
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
    <div className="min-h-screen bg-[#FAF7F2] text-[#2C241E]">
      {toastMsg && (
        <div className="fixed bottom-5 right-5 z-50 px-4 py-3 rounded-2xl bg-[#2C241E] text-white text-xs font-bold shadow-lg flex items-center gap-2 border border-white/10">
          <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
          <span>{toastMsg}</span>
        </div>
      )}

      {/* Navbar Seller */}
      <header className="sticky top-0 z-40 bg-[#2C241E] text-white border-b border-white/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-400 text-[#2C241E] flex items-center justify-center font-serif font-bold text-lg">
              S
            </div>
            <div>
              <span className="font-serif font-bold text-sm sm:text-base block leading-tight">
                {shop.name}
              </span>
              <span className="text-[10px] text-amber-300 flex items-center gap-1">
                <ShieldCheck className="w-3 h-3" />
                <span>Pengelola: {account.display_name}</span>
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onOpenUserCatalog(shop.id)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-amber-200 text-xs font-bold cursor-pointer"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Lihat Buku Katalog Saya</span>
              <span className="sm:hidden">Lihat Buku</span>
            </button>

            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-red-600/90 hover:bg-red-600 text-white text-xs font-bold cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Keluar</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        {/* Kartu Identitas Sanggar & Status Isolasi */}
        <div className="rounded-3xl bg-white border border-[#E6DDD0] p-6 shadow-2xs flex flex-col lg:flex-row lg:items-center justify-between gap-5">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-[11px] font-bold">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                <span>Akses Terkunci Eksklusif: ID Toko {shop.id}</span>
              </span>
              <span className="px-2.5 py-1 rounded-full bg-[#FAF7F2] border border-[#E6DDD0] text-[11px] font-bold text-[#8B3A1E]">
                {activeCount} Aktif / {myProducts.length} Total Produk
              </span>
            </div>

            <h1 className="font-serif text-2xl sm:text-3xl font-bold text-[#2C241E]">
              Dasbor Katalog {shop.name}
            </h1>

            <div className="flex flex-wrap items-center gap-4 text-xs text-[#6B5B4E]">
              <span className="flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-[#8B3A1E]" />
                <span>{shop.address}</span>
              </span>
              <span className="flex items-center gap-1.5 font-mono font-bold text-emerald-700">
                <Phone className="w-3.5 h-3.5" />+{shop.number}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => setIsShopModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#FAF7F2] hover:bg-amber-50 border border-[#DFD2BC] text-xs font-bold text-[#2C241E] cursor-pointer"
            >
              <Settings className="w-4 h-4 text-[#8B3A1E]" />
              <span>Profil &amp; WhatsApp Sanggar</span>
            </button>

            <button
              type="button"
              onClick={handleOpenAddModal}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#8B3A1E] hover:bg-[#A34424] text-white text-xs font-bold shadow-xs cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Tambah Produk Baru</span>
            </button>
          </div>
        </div>

        {/* Bar Filter & Pencarian Produk Sanggar */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setCategoryFilter('ALL')}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold border transition-colors cursor-pointer ${
                categoryFilter === 'ALL'
                  ? 'bg-[#2C241E] text-white border-[#2C241E]'
                  : 'bg-white text-[#6B5B4E] border-[#E6DDD0]'
              }`}
            >
              Semua Kategori ({myProducts.length})
            </button>
            {(db.category || []).map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setCategoryFilter(cat.id)}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold border transition-colors cursor-pointer ${
                  categoryFilter === cat.id
                    ? 'bg-[#8B3A1E] text-white border-[#8B3A1E]'
                    : 'bg-white text-[#6B5B4E] border-[#E6DDD0]'
                }`}
              >
                {cat.name}
              </button>
            ))}
          </div>

          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 text-[#6B5B4E] absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari produk di sanggar Anda..."
              className="w-full pl-9 pr-3.5 py-2 rounded-xl bg-white border border-[#E6DDD0] text-xs"
            />
          </div>
        </div>

        {/* Daftar Produk Milik Sanggar Ini */}
        {filteredMyProducts.length === 0 ? (
          <div className="rounded-3xl bg-white border border-[#E6DDD0] p-12 text-center space-y-3">
            <Package className="w-10 h-10 text-[#8B3A1E] mx-auto opacity-80" />
            <h2 className="font-serif text-xl font-bold text-[#2C241E]">
              Belum ada produk pada filter ini
            </h2>
            <p className="text-xs text-[#6B5B4E] max-w-md mx-auto">
              Klik tombol &ldquo;Tambah Produk Baru&rdquo; untuk menerbitkan karya batik ke buku katalog {shop.name}.
            </p>
            <button
              type="button"
              onClick={handleOpenAddModal}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#8B3A1E] text-white text-xs font-bold cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Tambah Produk Pertama</span>
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {filteredMyProducts.map((prod) => {
              const isVisible = prod.active_status !== false;
              return (
                <div
                  key={prod.id}
                  className={`rounded-3xl border bg-white overflow-hidden flex flex-col justify-between transition-all ${
                    isVisible ? 'border-[#E6DDD0]' : 'border-stone-300 opacity-75'
                  }`}
                >
                  <div>
                    <div className="relative aspect-[16/10] border-b border-[#E6DDD0] overflow-hidden">
                      <ProductArtwork
                        product={prod}
                        imageUrl={prod.primaryImageUrl}
                        size={360}
                        className="w-full h-full"
                      />
                      <span className="absolute top-3 left-3 px-2.5 py-1 rounded-full bg-white/95 text-[10px] font-bold text-[#2C241E] border border-[#E6DDD0]">
                        {prod.category.name}
                      </span>
                      <span
                        className={`absolute top-3 right-3 px-2.5 py-1 rounded-full text-[10px] font-bold ${
                          isVisible
                            ? 'bg-emerald-600 text-white'
                            : 'bg-stone-700 text-stone-200'
                        }`}
                      >
                        {isVisible ? 'Tayang' : 'Draft'}
                      </span>
                    </div>

                    <div className="p-5 space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="font-serif text-lg font-bold text-[#2C241E] leading-snug">
                          {prod.name}
                        </h3>
                        <span className="text-sm font-bold text-[#8B3A1E] shrink-0">
                          {formatRupiah(prod.price)}
                        </span>
                      </div>

                      <p className="text-xs text-[#6B5B4E] line-clamp-2 leading-relaxed">
                        {prod.description}
                      </p>

                      <div className="grid grid-cols-2 gap-1.5 pt-2 border-t border-[#E6DDD0]">
                        {prod.formattedAttributes.slice(0, 4).map((attr) => (
                          <div key={attr.name} className="p-1.5 rounded-lg bg-[#FAF7F2]">
                            <span className="block text-[9px] font-bold text-[#6B5B4E]">
                              {attr.label}
                            </span>
                            <span className="block text-[10.5px] font-bold text-[#2C241E] truncate">
                              {attr.displayValue}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Kontrol CRUD Khusus Pemilik */}
                  <div className="p-4 pt-0 grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => handleToggleProductVisibility(prod)}
                      className="py-2 px-2.5 rounded-xl bg-[#FAF7F2] hover:bg-stone-200/70 border border-[#E6DDD0] text-[11px] font-bold text-[#5C4D40] flex items-center justify-center gap-1 cursor-pointer"
                      title={isVisible ? 'Sembunyikan dari katalog' : 'Tampilkan di katalog'}
                    >
                      {isVisible ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      <span>{isVisible ? 'Draft' : 'Tayang'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleOpenEditModal(prod)}
                      className="py-2 px-2.5 rounded-xl bg-amber-50 hover:bg-amber-100 border border-amber-200 text-[11px] font-bold text-[#8B3A1E] flex items-center justify-center gap-1 cursor-pointer"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                      <span>Edit</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleDeleteProduct(prod)}
                      className="py-2 px-2.5 rounded-xl bg-red-50 hover:bg-red-100 border border-red-200 text-[11px] font-bold text-red-700 flex items-center justify-center gap-1 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Hapus</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Modal Tambah / Edit Produk */}
      <SellerProductFormModal
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

      {/* Modal Edit Profil Sanggar */}
      <SellerShopSettingsModal
        isOpen={isShopModalOpen}
        onClose={() => setIsShopModalOpen(false)}
        shop={shop}
        onSaveShop={handleSaveShopSettings}
      />
    </div>
  );
}
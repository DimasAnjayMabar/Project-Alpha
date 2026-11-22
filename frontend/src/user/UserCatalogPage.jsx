import React, { useState, useMemo, useCallback, useRef, lazy, Suspense } from 'react';
import {
  Sparkles,
  MessageCircle,
  BookOpen,
  Compass,
  Search,
  Upload,
  Download,
  MapPin,
  Layers,
  Menu,
  Store,
  Database,
} from 'lucide-react';
import { INITIAL_DATABASE } from './data/databaseSeed';
import {
  formatRupiah,
  buildWhatsAppUrl,
  buildProductOrderWaUrl,
  buildRelationalCatalog,
} from './utils/helpers';
import ProductArtwork from './components/ProductArtwork';
import PhysicalCatalogBookSection from './components/PhysicalCatalogBook';

const Batik3DStudio = lazy(() => import('./components/Batik3DStudio'));
const BatikChatbotWidget = lazy(() => import('./components/BatikChatbotWidget'));

export default function UserCatalogPage() {
  const [db, setDb] = useState(INITIAL_DATABASE);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState('ALL');
  const [catalogShopTab, setCatalogShopTab] = useState('ALL');
  const [selectedBookShopId, setSelectedBookShopId] = useState(INITIAL_DATABASE.shop[0].id);
  const [activeProductId, setActiveProductId] = useState(INITIAL_DATABASE.product[0].id);
  const [activeModel, setActiveModel] = useState('shirt');
  const [bookPageIndex, setBookPageIndex] = useState(0);
  const [highlightedProductId, setHighlightedProductId] = useState(null);
  const [customWaMap, setCustomWaMap] = useState({});
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [toastMsg, setToastMsg] = useState('');

  const jsonInputRef = useRef(null);

  const showToast = useCallback((msg) => {
    setToastMsg(msg);
    setTimeout(() => {
      setToastMsg((prev) => (prev === msg ? '' : prev));
    }, 2600);
  }, []);

  const getEffectiveWa = useCallback(
    (shopId, fallbackWa) => customWaMap[shopId] || fallbackWa,
    [customWaMap]
  );

  const handleUpdateShopWa = useCallback(
    (shopId, newWa) => {
      setCustomWaMap((prev) => ({ ...prev, [shopId]: newWa }));
      showToast('Nomor WhatsApp sanggar berhasil diperbarui.');
    },
    [showToast]
  );

  const { activeShops, enrichedProducts, shopBooks } = useMemo(
    () => buildRelationalCatalog(db),
    [db]
  );

  const groupedCatalogByShop = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return shopBooks
      .filter((bk) => catalogShopTab === 'ALL' || bk.shop.id === catalogShopTab)
      .map((bk) => {
        const filteredProds = bk.products.filter((p) => {
          const matchCat = selectedCategoryId === 'ALL' || p.category_id === selectedCategoryId;
          const attrText = p.formattedAttributes
            .map((a) => `${a.label} ${a.displayValue}`)
            .join(' ')
            .toLowerCase();
          const matchQuery =
            !q ||
            p.name.toLowerCase().includes(q) ||
            p.description.toLowerCase().includes(q) ||
            bk.shop.name.toLowerCase().includes(q) ||
            bk.shop.address.toLowerCase().includes(q) ||
            attrText.includes(q);
          return matchCat && matchQuery;
        });
        return {
          ...bk,
          products: filteredProds,
        };
      })
      .filter((bk) => bk.products.length > 0);
  }, [shopBooks, catalogShopTab, selectedCategoryId, searchQuery]);

  const handleJsonImport = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(String(ev.target?.result || '{}'));
        if (Array.isArray(parsed.shop) && Array.isArray(parsed.product)) {
          setDb({
            account: parsed.account || [],
            shop: parsed.shop || [],
            category: parsed.category || [],
            category_attribute: parsed.category_attribute || [],
            product: parsed.product || [],
            product_display_image: parsed.product_display_image || [],
            product_mockup_image: parsed.product_mockup_image || [],
          });
          if (parsed.shop[0]) setSelectedBookShopId(parsed.shop[0].id);
          if (parsed.product[0]) setActiveProductId(parsed.product[0].id);
          setBookPageIndex(0);
          setCatalogShopTab('ALL');
          showToast(`Database JSON (${parsed.shop.length} toko, ${parsed.product.length} produk) dimuat.`);
        } else {
          showToast('JSON harus memiliki tabel "shop" dan "product".');
        }
      } catch {
        showToast('File JSON tidak valid.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleJsonExport = () => {
    const blob = new Blob([JSON.stringify(db, null, 2)], {
      type: 'application/json;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'batik_trenggalek_7_tables_db.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleTryIn3D = useCallback(
    (productId) => {
      const prod = enrichedProducts.find((p) => p.id === productId);
      setActiveProductId(productId);
      if (prod?.category?.slug === 'kemeja-batik-jadi') {
        setActiveModel('shirt');
      } else if (prod?.category?.slug === 'kain-batik' || prod?.category?.slug === 'batik-partai-kiloan') {
        setActiveModel('fabric');
      }
      const el = document.getElementById('mockup-3d');
      if (el) el.scrollIntoView({ behavior: 'smooth' });
    },
    [enrichedProducts]
  );

  const handleOpenBookProduct = useCallback(
    (shopId, productId = null) => {
      const book = shopBooks.find((b) => b.shop.id === shopId);
      setSelectedBookShopId(shopId);
      setHighlightedProductId(productId);

      if (productId && book) {
        const idxInBook = book.products.findIndex((p) => p.id === productId);
        setBookPageIndex(idxInBook >= 0 ? idxInBook + 1 : 1);
      } else {
        setBookPageIndex(1);
      }

      const el = document.getElementById('buku-katalog');
      if (el) el.scrollIntoView({ behavior: 'smooth' });
    },
    [shopBooks]
  );

  const activeHighlightProduct = useMemo(
    () => enrichedProducts.find((p) => p.id === activeProductId) || enrichedProducts[0],
    [enrichedProducts, activeProductId]
  );

  const activeSelectedShop = useMemo(
    () => activeShops.find((s) => s.id === selectedBookShopId) || activeShops[0],
    [activeShops, selectedBookShopId]
  );

  const navbarWaUrl = useMemo(() => {
    if (!activeSelectedShop) return '#buku-katalog';
    const wa = getEffectiveWa(activeSelectedShop.id, activeSelectedShop.number);
    return buildWhatsAppUrl(
      wa,
      `Halo *${activeSelectedShop.name}*, saya mengunjungi katalog *Batik Wicara Trenggalek* dan ingin memesan produk Anda.`
    );
  }, [activeSelectedShop, getEffectiveWa]);

  return (
    <div className="min-h-screen bg-[#FAF7F2] text-[#2C241E] font-sans selection:bg-[#8B3A1E] selection:text-white">
      {toastMsg && (
        <div className="fixed bottom-20 right-5 z-50 px-4 py-3 rounded-2xl bg-[#2C241E] text-white text-xs font-bold shadow-lg flex items-center gap-2 border border-white/10">
          <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
          <span>{toastMsg}</span>
        </div>
      )}

      {/* 1. NAVBAR */}
      <header className="sticky top-0 z-40 bg-[#FAF7F2]/90 backdrop-blur-md border-b border-[#E6DDD0]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <a href="#" className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[#8B3A1E] text-white flex items-center justify-center font-serif font-bold text-lg shadow-xs">
              B
            </div>
            <div>
              <span className="font-serif font-bold text-base sm:text-lg tracking-tight block leading-none">
                Batik Wicara
              </span>
              <span className="text-[10px] font-bold uppercase tracking-widest text-[#8B3A1E]">
                Trenggalek Showcase
              </span>
            </div>
          </a>

          <nav className="hidden md:flex items-center gap-6 text-xs font-bold text-[#6B5B4E]">
            <a href="#buku-katalog" className="hover:text-[#8B3A1E] transition-colors">
              Buku Katalog Per UMKM
            </a>
            <a href="#katalog" className="hover:text-[#8B3A1E] transition-colors">
              Etalase Per Sanggar
            </a>
            <a href="#mockup-3d" className="hover:text-[#8B3A1E] transition-colors">
              Studio Mockup 3D
            </a>
          </nav>

          <div className="flex items-center gap-2">
            <a
              href={navbarWaUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-colors shadow-xs"
            >
              <MessageCircle className="w-4 h-4 shrink-0" />
              <span className="hidden sm:inline">Pesan via WhatsApp</span>
              <span className="sm:hidden">WhatsApp</span>
            </a>

            <button
              type="button"
              onClick={() => setMobileMenuOpen((v) => !v)}
              className="md:hidden p-2 rounded-xl bg-white border border-[#E6DDD0] text-[#2C241E]"
              aria-label="Menu Navigasi"
            >
              <Menu className="w-4 h-4" />
            </button>
          </div>
        </div>

        {mobileMenuOpen && (
          <div className="md:hidden px-4 py-3 bg-white border-b border-[#E6DDD0] flex flex-col gap-2 text-xs font-bold">
            <a href="#buku-katalog" onClick={() => setMobileMenuOpen(false)} className="py-1.5 text-[#2C241E]">
              Buku Katalog Per UMKM
            </a>
            <a href="#katalog" onClick={() => setMobileMenuOpen(false)} className="py-1.5 text-[#2C241E]">
              Etalase Per Sanggar
            </a>
            <a href="#mockup-3d" onClick={() => setMobileMenuOpen(false)} className="py-1.5 text-[#2C241E]">
              Studio Mockup 3D
            </a>
          </div>
        )}
      </header>

      {/* 2. HERO SECTION */}
      <section className="relative overflow-hidden py-14 sm:py-20 px-4 sm:px-6 bg-gradient-to-br from-[#2C241E] via-[#3A2B20] to-[#562917] text-white">
        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
          <div className="lg:col-span-7 space-y-5">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/10 border border-white/15 text-amber-300 text-xs font-bold">
              <Database className="w-3.5 h-3.5" />
              <span>
                {activeShops.length} Buku Toko UMKM • {enrichedProducts.length} Produk Aktif • Pesan Langsung WhatsApp
              </span>
            </div>

            <h1 className="font-serif text-3xl sm:text-5xl font-bold leading-tight">
              Setiap Goresan Malam <span className="text-amber-300">Menuturkan Kisah</span> Bumi Menak Sopal
            </h1>

            <p className="text-sm sm:text-base text-stone-200 max-w-2xl leading-relaxed">
              Jelajahi buku katalog eksklusif per sentra UMKM Trenggalek lengkap dengan profil pengelola sanggar, spesifikasi kategori tervalidasi, simulasi busana 3D, dan pemesanan langsung ke WhatsApp perajin.
            </p>

            <div className="flex flex-wrap gap-3 pt-2">
              <a
                href="#buku-katalog"
                className="inline-flex items-center gap-2 px-5 py-3 rounded-2xl bg-[#8B3A1E] hover:bg-[#A34424] text-white text-xs sm:text-sm font-bold shadow-md transition-colors"
              >
                <BookOpen className="w-4 h-4" />
                <span>Pilih Buku UMKM</span>
              </a>
              <a
                href="#mockup-3d"
                className="inline-flex items-center gap-2 px-5 py-3 rounded-2xl bg-white/10 hover:bg-white/20 border border-white/20 text-white text-xs sm:text-sm font-bold transition-colors"
              >
                <Compass className="w-4 h-4" />
                <span>Buka Studio Mockup 3D</span>
              </a>
            </div>
          </div>

          {activeHighlightProduct && (
            <div className="lg:col-span-5">
              <div className="rounded-3xl bg-white/10 backdrop-blur-md border border-white/15 p-5 space-y-4">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-amber-300 uppercase tracking-wider">
                    {activeHighlightProduct.category.name}
                  </span>
                  <span className="text-stone-300 truncate max-w-[210px]">
                    {activeHighlightProduct.shop.name}
                  </span>
                </div>
                <div className="aspect-[16/10] rounded-2xl overflow-hidden border border-white/20">
                  <ProductArtwork
                    product={activeHighlightProduct}
                    imageUrl={activeHighlightProduct.primaryImageUrl}
                    size={512}
                    className="w-full h-full"
                  />
                </div>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="font-serif text-lg font-bold text-white">
                      {activeHighlightProduct.name}
                    </h2>
                    <p className="text-xs text-amber-200">
                      {formatRupiah(activeHighlightProduct.price)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleTryIn3D(activeHighlightProduct.id)}
                    className="px-3.5 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-[#2C241E] text-xs font-bold cursor-pointer"
                  >
                    Simulasi 3D &rarr;
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* 3. BUKU KATALOG FISIK 3D PER UMKM */}
      <PhysicalCatalogBookSection
        shopBooks={shopBooks}
        selectedShopId={selectedBookShopId}
        onSelectShop={setSelectedBookShopId}
        bookPageIndex={bookPageIndex}
        highlightedProductId={highlightedProductId}
        onChangeBookPage={setBookPageIndex}
        onTryIn3D={handleTryIn3D}
        getEffectiveWa={getEffectiveWa}
        onUpdateShopWa={handleUpdateShopWa}
      />

      {/* 4. ETALASE KATALOG TERKELOMPOK PER SANGGAR */}
      <section id="katalog" className="py-14 sm:py-16 px-4 sm:px-6 bg-white border-t border-[#E6DDD0]">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 mb-6">
            <div>
              <span className="text-xs font-bold uppercase tracking-widest text-[#8B3A1E] block mb-1.5">
                Direktori Etalase Per Toko ({enrichedProducts.length} Produk Aktif)
              </span>
              <h2 className="font-serif text-2xl sm:text-4xl font-bold text-[#2C241E]">
                Etalase Produk Per Sentra UMKM
              </h2>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <input
                ref={jsonInputRef}
                type="file"
                accept=".json"
                onChange={handleJsonImport}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => jsonInputRef.current?.click()}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#FAF7F2] hover:bg-[#F3ECE1] border border-[#E6DDD0] text-xs font-bold text-[#2C241E] cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5 text-[#8B3A1E]" />
                <span>Impor JSON DB</span>
              </button>
              <button
                type="button"
                onClick={handleJsonExport}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#FAF7F2] hover:bg-[#F3ECE1] border border-[#E6DDD0] text-xs font-bold text-[#6B5B4E] cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Ekspor JSON DB</span>
              </button>
            </div>
          </div>

          <div className="p-3 rounded-2xl bg-[#FAF7F2] border border-[#E6DDD0] mb-5">
            <span className="text-[10px] font-bold uppercase tracking-widest text-[#6B5B4E] block mb-2 px-1">
              Filter Sentra UMKM ({shopBooks.length} Toko Aktif)
            </span>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setCatalogShopTab('ALL')}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                  catalogShopTab === 'ALL'
                    ? 'bg-[#2C241E] text-white border-[#2C241E] shadow-xs'
                    : 'bg-white text-[#6B5B4E] border-[#E6DDD0] hover:border-[#8B3A1E]'
                }`}
              >
                Semua Toko ({enrichedProducts.length} Produk)
              </button>
              {shopBooks.map((bk) => (
                <button
                  key={bk.shop.id}
                  type="button"
                  onClick={() => setCatalogShopTab(bk.shop.id)}
                  className={`px-3.5 py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                    catalogShopTab === bk.shop.id
                      ? 'bg-[#8B3A1E] text-white border-[#8B3A1E] shadow-xs'
                      : 'bg-white text-[#2C241E] border-[#E6DDD0] hover:border-[#8B3A1E]'
                  }`}
                >
                  {bk.shop.name} ({bk.products.length})
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col md:flex-row gap-3 justify-between mb-8">
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setSelectedCategoryId('ALL')}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold border transition-colors cursor-pointer ${
                  selectedCategoryId === 'ALL'
                    ? 'bg-[#8B3A1E] text-white border-[#8B3A1E]'
                    : 'bg-[#FAF7F2] text-[#6B5B4E] border-[#E6DDD0] hover:border-[#8B3A1E]'
                }`}
              >
                Semua Kategori
              </button>
              {(db.category || []).map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setSelectedCategoryId(cat.id)}
                  className={`px-3.5 py-2 rounded-xl text-xs font-bold border transition-colors cursor-pointer ${
                    selectedCategoryId === cat.id
                      ? 'bg-[#8B3A1E] text-white border-[#8B3A1E]'
                      : 'bg-[#FAF7F2] text-[#6B5B4E] border-[#E6DDD0] hover:border-[#8B3A1E]'
                  }`}
                >
                  {cat.name}
                </button>
              ))}
            </div>

            <div className="relative w-full md:w-72">
              <Search className="w-4 h-4 text-[#6B5B4E] absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari produk, sanggar, bahan..."
                className="w-full pl-9 pr-3.5 py-2 rounded-xl bg-[#FAF7F2] border border-[#E6DDD0] text-xs text-[#2C241E] focus:outline-none focus:border-[#8B3A1E]"
              />
            </div>
          </div>

          {groupedCatalogByShop.length === 0 ? (
            <div className="rounded-3xl border border-[#E6DDD0] bg-[#FAF7F2] p-10 text-center space-y-2">
              <p className="font-serif text-lg font-bold text-[#2C241E]">Produk tidak ditemukan</p>
              <p className="text-xs text-[#6B5B4E]">
                Coba ubah kata kunci pencarian atau pilih tab &ldquo;Semua Toko&rdquo;.
              </p>
            </div>
          ) : (
            <div className="space-y-10">
              {groupedCatalogByShop.map((bk) => {
                const shopWa = getEffectiveWa(bk.shop.id, bk.shop.number);
                const directShopWaUrl = buildWhatsAppUrl(
                  shopWa,
                  `Halo *${bk.shop.name}*, saya melihat katalog produk Anda di *Batik Wicara Trenggalek* dan ingin menanyakan ketersediaan stok.`
                );

                return (
                  <div
                    key={bk.shop.id}
                    className="rounded-3xl border border-[#E6DDD0] bg-[#FAF7F2]/70 p-5 sm:p-7 space-y-6"
                  >
                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-5 border-b border-[#E6DDD0]">
                      <div className="space-y-1.5">
                        <div className="flex flex-wrap items-center gap-2">
                          {bk.account && (
                            <span className="px-2.5 py-0.5 rounded-full bg-[#2C241E] text-amber-300 text-[10px] font-bold">
                              Pengelola: {bk.account.display_name}
                            </span>
                          )}
                          <span className="text-xs font-bold text-[#8B3A1E]">
                            {bk.products.length} Produk Aktif
                          </span>
                        </div>
                        <h3 className="font-serif text-xl sm:text-2xl font-bold text-[#2C241E]">
                          {bk.shop.name}
                        </h3>
                        <p className="text-xs text-[#6B5B4E] flex items-center gap-1.5">
                          <MapPin className="w-3.5 h-3.5 text-[#8B3A1E] shrink-0" />
                          <span>{bk.shop.address}</span>
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleOpenBookProduct(bk.shop.id, null)}
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white hover:bg-amber-50 border border-[#E6DDD0] text-xs font-bold text-[#2C241E] cursor-pointer"
                        >
                          <BookOpen className="w-3.5 h-3.5 text-[#8B3A1E]" />
                          <span>Buka Buku UMKM Ini</span>
                        </button>
                        {bk.shop.online_shop && (
                          <a
                            href={bk.shop.online_shop}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white hover:bg-amber-50 border border-[#E6DDD0] text-xs font-bold text-[#2C241E]"
                          >
                            <Store className="w-3.5 h-3.5 text-[#8B3A1E]" />
                            <span>Toko Online</span>
                          </a>
                        )}
                        <a
                          href={directShopWaUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-colors"
                        >
                          <MessageCircle className="w-3.5 h-3.5" />
                          <span>Hubungi Sanggar</span>
                        </a>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                      {bk.products.map((prod) => {
                        const prodWaUrl = buildProductOrderWaUrl(
                          bk.shop,
                          shopWa,
                          prod,
                          `Etalase ${bk.shop.name}`
                        );

                        return (
                          <div
                            key={prod.id}
                            className="rounded-2xl border border-[#E6DDD0] bg-white overflow-hidden flex flex-col justify-between hover:shadow-md transition-shadow"
                          >
                            <div>
                              <div className="relative aspect-[16/11] overflow-hidden border-b border-[#E6DDD0]">
                                <ProductArtwork
                                  product={prod}
                                  imageUrl={prod.primaryImageUrl}
                                  size={360}
                                  className="w-full h-full"
                                />
                                <span className="absolute top-3 left-3 px-2.5 py-1 rounded-full bg-white/95 backdrop-blur-xs text-[10px] font-bold text-[#2C241E] border border-[#E6DDD0]">
                                  {prod.category.name}
                                </span>
                              </div>

                              <div className="p-4 space-y-2.5">
                                <div className="flex items-start justify-between gap-2">
                                  <h4 className="font-serif text-lg font-bold text-[#2C241E] leading-snug">
                                    {prod.name}
                                  </h4>
                                  <span className="text-sm font-bold text-[#8B3A1E] shrink-0">
                                    {formatRupiah(prod.price)}
                                  </span>
                                </div>

                                <p className="text-[11px] text-[#6B5B4E] line-clamp-2 leading-relaxed">
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

                            <div className="p-4 pt-0 flex flex-col gap-2">
                              <div className="grid grid-cols-2 gap-2">
                                <button
                                  type="button"
                                  onClick={() => handleTryIn3D(prod.id)}
                                  className="py-2 px-2.5 rounded-xl bg-[#FAF7F2] hover:bg-amber-50 border border-[#E6DDD0] text-[11px] font-bold text-[#2C241E] flex items-center justify-center gap-1 cursor-pointer"
                                >
                                  <Layers className="w-3.5 h-3.5 text-[#8B3A1E]" />
                                  <span>Simulasi 3D</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleOpenBookProduct(prod.shop.id, prod.id)}
                                  className="py-2 px-2.5 rounded-xl bg-[#FAF7F2] hover:bg-amber-50 border border-[#E6DDD0] text-[11px] font-bold text-[#6B5B4E] cursor-pointer"
                                >
                                  Buka di Buku
                                </button>
                              </div>
                              <a
                                href={prodWaUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="w-full py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-colors flex items-center justify-center gap-1.5"
                              >
                                <MessageCircle className="w-3.5 h-3.5 shrink-0" />
                                <span>Pesan via WhatsApp</span>
                              </a>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* 5. STUDIO MOCKUP 3D (LAZY-LOADED) */}
      <Suspense
        fallback={
          <section
            id="mockup-3d"
            className="py-16 px-4 sm:px-6 bg-[#FAF7F2] border-t border-[#E6DDD0] text-center"
          >
            <p className="font-serif text-lg font-bold text-[#2C241E]">
              Memuat Studio Mockup 3D Batik Trenggalek...
            </p>
          </section>
        }
      >
        <Batik3DStudio
          enrichedProducts={enrichedProducts}
          activeShops={activeShops}
          activeProductId={activeProductId}
          activeModel={activeModel}
          onSelectProduct={setActiveProductId}
          onSelectModel={setActiveModel}
          onOpenBookProduct={handleOpenBookProduct}
          getEffectiveWa={getEffectiveWa}
        />
      </Suspense>

      {/* 6. FOOTER */}
      <footer className="bg-[#2C241E] text-stone-300 py-10 px-4 sm:px-6 border-t border-white/10">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-xs">
          <div>
            <span className="font-serif font-bold text-white text-base block">
              Batik Wicara — Trenggalek Showcase
            </span>
            <span className="text-stone-400">
              Buku Katalog Per UMKM • Pemesanan Terintegrasi Langsung WhatsApp Sanggar
            </span>
          </div>
          <span className="text-stone-400">Kabupaten Trenggalek, Jawa Timur</span>
        </div>
      </footer>

      {/* 7. ASISTEN CHATBOT MELAYANG (LAZY-LOADED) */}
      <Suspense fallback={null}>
        <BatikChatbotWidget
          enrichedProducts={enrichedProducts}
          shopBooks={shopBooks}
          getEffectiveWa={getEffectiveWa}
          onOpenBookProduct={handleOpenBookProduct}
          onTryIn3D={handleTryIn3D}
        />
      </Suspense>
    </div>
  );
}
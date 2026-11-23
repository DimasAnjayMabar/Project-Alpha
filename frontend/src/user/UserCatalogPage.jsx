import React, { useState, useEffect, useMemo, useCallback, useRef, lazy, Suspense } from 'react';
import {
  Check,
  MessageCircle,
  BookOpen,
  Search,
  Upload,
  Download,
  MapPin,
  Layers,
  Menu,
  X,
  Store,
  ArrowRight,
} from 'lucide-react';
import { INITIAL_DATABASE } from './data/databaseSeed';
import {
  formatRupiah,
  buildWhatsAppUrl,
  buildProductOrderWaUrl,
  buildRelationalCatalog,
} from './utils/helpers';
import FadeIn from '../components/FadeIn';
import ProductArtwork from './components/ProductArtwork';
import PhysicalCatalogBookSection from './components/PhysicalCatalogBook';

const Batik3DStudio = lazy(() => import('./components/Batik3DStudio'));
const BatikChatbotWidget = lazy(() => import('./components/BatikChatbotWidget'));

export default function UserCatalogPage({
  externalDb,
  onExternalDbChange,
  initialFocusShopId,
  onOpenSellerPortal,
} = {}) {
  const [localDb, setLocalDb] = useState(INITIAL_DATABASE);
  const db = externalDb ?? localDb;
  const setDb = onExternalDbChange ?? setLocalDb;

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState('ALL');
  const [catalogShopTab, setCatalogShopTab] = useState('ALL');
  const [selectedBookShopId, setSelectedBookShopId] = useState(
    () => initialFocusShopId || db.shop?.[0]?.id || INITIAL_DATABASE.shop[0].id
  );
  const [activeProductId, setActiveProductId] = useState(
    () => db.product?.[0]?.id || INITIAL_DATABASE.product[0].id
  );
  const [activeModel, setActiveModel] = useState('shirt');
  const [bookPageIndex, setBookPageIndex] = useState(() => (initialFocusShopId ? 1 : 0));
  const [highlightedProductId, setHighlightedProductId] = useState(null);
  const [customWaMap, setCustomWaMap] = useState({});
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [toastMsg, setToastMsg] = useState('');

  const [gridCols, setGridCols] = useState(() => {
    if (typeof window === 'undefined') return 3;
    if (window.innerWidth >= 1024) return 3;
    if (window.innerWidth >= 640) return 2;
    return 1;
  });

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 1024) setGridCols(3);
      else if (window.innerWidth >= 640) setGridCols(2);
      else setGridCols(1);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

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

  const minPrice = useMemo(() => {
    if (!enrichedProducts.length) return 0;
    return Math.min(...enrichedProducts.map((p) => Number(p.price) || 0));
  }, [enrichedProducts]);

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

  const totalFilteredCount = useMemo(
    () => groupedCatalogByShop.reduce((sum, bk) => sum + bk.products.length, 0),
    [groupedCatalogByShop]
  );

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
          showToast(
            `Database JSON (${parsed.shop.length} sanggar, ${parsed.product.length} produk) dimuat.`
          );
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
      } else if (
        prod?.category?.slug === 'kain-batik' ||
        prod?.category?.slug === 'batik-partai-kiloan'
      ) {
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
    <div className="min-h-screen bg-[#F7F4EE] text-[#1C1917] font-sans selection:bg-[#7C3219] selection:text-white">
      {toastMsg && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-20 right-5 z-50 px-4 py-3 rounded-md bg-[#1B1714] text-[#F5F1E8] text-[13px] font-medium shadow-lg flex items-center gap-2.5 border border-white/15 fade-panel"
        >
          <Check className="w-4 h-4 text-[#C4A46B] shrink-0" />
          <span>{toastMsg}</span>
        </div>
      )}

      {/* 1. NAVBAR (Opaque, fixed-feel sticky with 1px hairline) */}
      <header className="sticky top-0 z-40 bg-[#F7F4EE] border-b border-[#1C1917]/12">
        <div className="taste-wrap h-[72px] flex items-center justify-between gap-4">
          <a href="#konten-utama" className="skip-link">
            Lewati ke konten utama
          </a>

          <a href="#konten-utama" className="flex items-center gap-3 shrink-0">
            <svg
              width="24"
              height="24"
              viewBox="0 0 32 32"
              fill="none"
              aria-hidden="true"
              className="shrink-0"
            >
              <path d="M16 4L28 16L16 28L4 16L16 4Z" stroke="#7C3219" strokeWidth="2" />
              <circle cx="16" cy="16" r="3.5" fill="#7C3219" />
              <circle cx="16" cy="9.5" r="1.4" fill="#1C1917" />
              <circle cx="16" cy="22.5" r="1.4" fill="#1C1917" />
              <circle cx="9.5" cy="16" r="1.4" fill="#1C1917" />
              <circle cx="22.5" cy="16" r="1.4" fill="#1C1917" />
            </svg>
            <div className="leading-none">
              <span className="font-aksara text-[22px] sm:text-[25px] text-[#1C1917] block">
                Batik Wicara
              </span>
              <span className="font-aksara text-[14px] text-[#7C3219] block mt-0.5">
                Trenggalek
              </span>
            </div>
          </a>

          <nav
            aria-label="Navigasi utama"
            className="hidden md:flex items-center gap-7 text-[15px] font-medium text-[#1C1917]"
          >
            <a href="#buku-katalog" className="taste-nav-link">
              Buku Katalog
            </a>
            <a href="#katalog" className="taste-nav-link">
              Etalase
            </a>
            <a href="#mockup-3d" className="taste-nav-link">
              Studio 3D
            </a>
            {onOpenSellerPortal && (
              <button
                type="button"
                onClick={onOpenSellerPortal}
                className="taste-nav-link text-[#575049] hover:text-[#1C1917] cursor-pointer"
              >
                Portal Perajin
              </button>
            )}
          </nav>

          <div className="flex items-center gap-2.5">
            <a
              href={navbarWaUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="taste-btn-primary"
            >
              <MessageCircle className="w-4 h-4 shrink-0" />
              <span className="hidden sm:inline">Pesan via WhatsApp</span>
              <span className="sm:hidden">WhatsApp</span>
            </a>

            <button
              type="button"
              onClick={() => setMobileMenuOpen((v) => !v)}
              aria-expanded={mobileMenuOpen}
              aria-label={mobileMenuOpen ? 'Tutup menu navigasi' : 'Buka menu navigasi'}
              className="md:hidden min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-md bg-[#FCFBF8] border border-[#1C1917]/20 text-[#1C1917] cursor-pointer"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {mobileMenuOpen && (
          <nav
            aria-label="Navigasi ponsel"
            className="md:hidden bg-[#F7F4EE] border-t border-[#1C1917]/12 px-5 py-3 flex flex-col divide-y divide-[#1C1917]/10 fade-panel"
          >
            <a
              href="#buku-katalog"
              onClick={() => setMobileMenuOpen(false)}
              className="min-h-[48px] flex items-center text-[15px] font-medium text-[#1C1917]"
            >
              Buku Katalog
            </a>
            <a
              href="#katalog"
              onClick={() => setMobileMenuOpen(false)}
              className="min-h-[48px] flex items-center text-[15px] font-medium text-[#1C1917]"
            >
              Etalase Produk
            </a>
            <a
              href="#mockup-3d"
              onClick={() => setMobileMenuOpen(false)}
              className="min-h-[48px] flex items-center text-[15px] font-medium text-[#1C1917]"
            >
              Studio Mockup 3D
            </a>
            {onOpenSellerPortal && (
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  onOpenSellerPortal();
                }}
                className="min-h-[48px] flex items-center text-left text-[15px] font-medium text-[#7C3219] cursor-pointer"
              >
                Portal Perajin UMKM
              </button>
            )}
          </nav>
        )}
      </header>

      <main id="konten-utama">
        {/* 2. HERO SECTION */}
        <section className="bg-[#F7F4EE] pt-10 pb-14 lg:pt-14 lg:pb-20">
          <div className="taste-wrap grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-start">
            <div className="lg:col-span-6 space-y-5">
              <p className="text-[13px] font-medium text-[#7C3219] hero-enter-step-1">
                Kabupaten Trenggalek · {activeShops.length} sanggar aktif · {enrichedProducts.length}{' '}
                koleksi
              </p>

              <h1 className="font-serif font-normal text-[clamp(2.4rem,4.4vw,3.9rem)] leading-[1.06] tracking-[-0.03em] text-[#1C1917] hero-enter-title">
                Katalog Wastra Batik Perajin Trenggalek
              </h1>

              <p className="text-[16px] sm:text-[17px] leading-[1.6] text-[#575049] max-w-[46ch] hero-enter-step-1">
                Telusuri kain tulis, kemeja jadi, dan batik cap langsung dari lima sanggar di
                Trenggalek. Pratinjau motif pada busana 3D lalu pesan langsung ke perajin lewat
                WhatsApp.
              </p>

              <div className="flex flex-wrap items-center gap-3 pt-1 hero-enter-step-2">
                <a href="#buku-katalog" className="taste-btn-primary">
                  <BookOpen className="w-4 h-4 shrink-0" />
                  <span>Buka Buku Katalog</span>
                </a>
                <a href="#mockup-3d" className="taste-btn-secondary">
                  <Layers className="w-4 h-4 shrink-0" />
                  <span>Coba Studio 3D</span>
                </a>
              </div>

              <div className="border-t border-[#1C1917]/12 pt-6 mt-8 grid grid-cols-1 sm:grid-cols-3 gap-4 hero-enter-step-3">
                <div>
                  <span className="block text-[13px] text-[#575049]">Rentang harga</span>
                  <span className="block text-[15px] font-medium text-[#1C1917] tabular-nums mt-0.5">
                    Mulai {formatRupiah(minPrice)}
                  </span>
                </div>
                <div>
                  <span className="block text-[13px] text-[#575049]">Sentra pengrajin</span>
                  <span className="block text-[15px] font-medium text-[#1C1917] mt-0.5">
                    Suruh, Kelutan, Kampak, Durenan
                  </span>
                </div>
                <div>
                  <span className="block text-[13px] text-[#575049]">Pemesanan</span>
                  <span className="block text-[15px] font-medium text-[#1C1917] mt-0.5">
                    Langsung ke WhatsApp sanggar
                  </span>
                </div>
              </div>
            </div>

            {activeHighlightProduct && (
              <div className="lg:col-span-6">
                <div className="aspect-[4/3] rounded-lg overflow-hidden border border-[#1C1917]/12 bg-[#FCFBF8]">
                  <div className="w-full h-full hero-enter-media">
                    <ProductArtwork
                      product={activeHighlightProduct}
                      imageUrl={activeHighlightProduct.primaryImageUrl}
                      size={640}
                      className="w-full h-full"
                    />
                  </div>
                </div>

                <div className="pt-4 flex flex-wrap items-center justify-between gap-3 hero-enter-step-2">
                  <div>
                    <p className="font-serif text-[20px] font-medium text-[#1C1917] leading-snug">
                      {activeHighlightProduct.name}
                    </p>
                    <p className="text-[14px] text-[#575049] tabular-nums mt-0.5">
                      {activeHighlightProduct.shop.name} ·{' '}
                      {formatRupiah(activeHighlightProduct.price)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleTryIn3D(activeHighlightProduct.id)}
                    className="taste-link text-[14px] font-medium text-[#7C3219] min-h-[44px] cursor-pointer"
                  >
                    <span>Simulasi 3D</span>
                    <ArrowRight className="w-4 h-4 m-arrow" />
                  </button>
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
        <section id="katalog" className="bg-[#F7F4EE] border-t border-[#1C1917]/12 py-16 lg:py-24">
          <div className="taste-wrap">
            <FadeIn>
              <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 mb-8">
                <div>
                  <span className="text-[13px] font-medium text-[#7C3219] block mb-2">
                    Direktori koleksi aktif · {enrichedProducts.length} produk
                  </span>
                  <h2 className="font-serif font-normal text-[clamp(1.85rem,3vw,2.65rem)] leading-[1.12] tracking-[-0.025em] text-[#1C1917]">
                    Etalase Produk Per Sanggar
                  </h2>
                </div>

                <div className="w-full lg:w-80">
                  <label htmlFor="etalase-search" className="sr-only">
                    Cari motif, sanggar, atau bahan
                  </label>
                  <div className="relative">
                    <Search className="w-4 h-4 text-[#575049] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      id="etalase-search"
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Cari motif, sanggar, atau bahan..."
                      className="w-full min-h-[44px] pl-10 pr-4 py-2 rounded-md bg-[#FCFBF8] border border-[#1C1917]/20 text-[14px] text-[#1C1917] placeholder:text-[#575049]/75"
                    />
                  </div>
                </div>
              </div>

              <div className="mb-10 space-y-4">
                {/* Row 1: Sanggar Tabs */}
                <div className="flex flex-wrap gap-x-6 gap-y-1 border-b border-[#1C1917]/12">
                  <button
                    type="button"
                    onClick={() => setCatalogShopTab('ALL')}
                    className={`min-h-[44px] inline-flex items-center text-[14px] font-medium border-b-2 -mb-px transition-colors cursor-pointer ${
                      catalogShopTab === 'ALL'
                        ? 'border-[#7C3219] text-[#1C1917]'
                        : 'border-transparent text-[#575049] hover:text-[#1C1917]'
                    }`}
                  >
                    Semua Sanggar ({enrichedProducts.length})
                  </button>
                  {shopBooks.map((bk) => (
                    <button
                      key={bk.shop.id}
                      type="button"
                      onClick={() => setCatalogShopTab(bk.shop.id)}
                      className={`min-h-[44px] inline-flex items-center text-[14px] font-medium border-b-2 -mb-px transition-colors cursor-pointer ${
                        catalogShopTab === bk.shop.id
                          ? 'border-[#7C3219] text-[#1C1917]'
                          : 'border-transparent text-[#575049] hover:text-[#1C1917]'
                      }`}
                    >
                      {bk.shop.name} ({bk.products.length})
                    </button>
                  ))}
                </div>

                {/* Row 2: Category Filter & Result Count */}
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setSelectedCategoryId('ALL')}
                      className={`min-h-[40px] px-3.5 py-2 rounded-md text-[13px] font-medium border transition-colors cursor-pointer ${
                        selectedCategoryId === 'ALL'
                          ? 'bg-[#1B1714] text-[#F5F1E8] border-[#1B1714]'
                          : 'bg-[#FCFBF8] text-[#575049] border-[#1C1917]/15 hover:border-[#1C1917]/35 hover:text-[#1C1917]'
                      }`}
                    >
                      Semua Kategori
                    </button>
                    {(db.category || []).map((cat) => (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => setSelectedCategoryId(cat.id)}
                        className={`min-h-[40px] px-3.5 py-2 rounded-md text-[13px] font-medium border transition-colors cursor-pointer ${
                          selectedCategoryId === cat.id
                            ? 'bg-[#1B1714] text-[#F5F1E8] border-[#1B1714]'
                            : 'bg-[#FCFBF8] text-[#575049] border-[#1C1917]/15 hover:border-[#1C1917]/35 hover:text-[#1C1917]'
                        }`}
                      >
                        {cat.name}
                      </button>
                    ))}
                  </div>

                  <span className="text-[13px] text-[#575049] tabular-nums">
                    Menampilkan {totalFilteredCount} koleksi
                  </span>
                </div>
              </div>
            </FadeIn>

            {groupedCatalogByShop.length === 0 ? (
              <div className="rounded-lg border border-[#1C1917]/15 bg-[#FCFBF8] p-12 text-center space-y-2">
                <p className="font-serif text-xl text-[#1C1917]">Koleksi tidak ditemukan</p>
                <p className="text-[14px] text-[#575049]">
                  Ubah kata kunci pencarian atau pilih tab &ldquo;Semua Sanggar&rdquo;.
                </p>
              </div>
            ) : (
              <div
                key={`${catalogShopTab}-${selectedCategoryId}`}
                className="space-y-14 fade-swap"
              >
                {groupedCatalogByShop.map((bk) => {
                  const shopWa = getEffectiveWa(bk.shop.id, bk.shop.number);
                  const directShopWaUrl = buildWhatsAppUrl(
                    shopWa,
                    `Halo *${bk.shop.name}*, saya melihat katalog produk Anda di *Batik Wicara Trenggalek* dan ingin menanyakan ketersediaan stok.`
                  );

                  // Kelompokkan produk per baris sesuai jumlah kolom (3 di desktop, 2 di tablet, 1 di HP)
                  const productRows = [];
                  for (let i = 0; i < bk.products.length; i += gridCols) {
                    productRows.push(bk.products.slice(i, i + gridCols));
                  }

                  return (
                    <div key={bk.shop.id} className="border-t border-[#1C1917]/15 pt-8 space-y-6">
                      <FadeIn className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
                        <div className="space-y-1.5">
                          <p className="text-[13px] text-[#575049]">
                            {bk.account ? `Pengelola: ${bk.account.display_name} · ` : ''}
                            {bk.products.length} koleksi aktif
                          </p>
                          <h3 className="font-serif font-normal text-2xl sm:text-[28px] leading-tight text-[#1C1917]">
                            {bk.shop.name}
                          </h3>
                          <p className="text-[14px] text-[#575049] flex items-center gap-1.5">
                            <MapPin className="w-4 h-4 text-[#7C3219] shrink-0" />
                            <span>{bk.shop.address}</span>
                          </p>
                        </div>

                        <div className="flex flex-wrap items-center gap-2.5">
                          <button
                            type="button"
                            onClick={() => handleOpenBookProduct(bk.shop.id, null)}
                            className="taste-btn-secondary"
                          >
                            <BookOpen className="w-4 h-4 text-[#7C3219] shrink-0" />
                            <span>Buka Buku Sanggar</span>
                          </button>
                          {bk.shop.online_shop && (
                            <a
                              href={bk.shop.online_shop}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="taste-btn-secondary"
                            >
                              <Store className="w-4 h-4 text-[#7C3219] shrink-0" />
                              <span>Toko Online</span>
                            </a>
                          )}
                          <a
                            href={directShopWaUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="taste-btn-dark"
                          >
                            <MessageCircle className="w-4 h-4 shrink-0" />
                            <span>Hubungi Sanggar</span>
                          </a>
                        </div>
                      </FadeIn>

                      <div className="space-y-6 lg:space-y-8">
                        {productRows.map((rowProducts, rowIdx) => (
                          <FadeIn
                            key={`${bk.shop.id}-row-${rowIdx}`}
                            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8 fade-row"
                          >
                            {rowProducts.map((prod, colIdx) => {
                              const prodWaUrl = buildProductOrderWaUrl(
                                bk.shop,
                                shopWa,
                                prod,
                                `Etalase ${bk.shop.name}`
                              );

                              return (
                                <div
                                  key={prod.id}
                                  style={{ transitionDelay: `${colIdx * 130}ms` }}
                                  className="fade-row-card"
                                >
                                  <article className="h-full rounded-lg border border-[#1C1917]/12 bg-[#FCFBF8] overflow-hidden flex flex-col justify-between taste-card">
                                    <div>
                                      <div className="aspect-[4/3] overflow-hidden border-b border-[#1C1917]/10 bg-[#EFEAE0] taste-zoom-frame">
                                        <ProductArtwork
                                          product={prod}
                                          imageUrl={prod.primaryImageUrl}
                                          size={400}
                                          className="w-full h-full"
                                        />
                                      </div>

                                      <div className="p-5 space-y-3">
                                        <div className="flex items-baseline justify-between gap-3">
                                          <span className="text-[13px] font-medium text-[#7C3219]">
                                            {prod.category.name}
                                          </span>
                                          <span className="text-[15px] font-semibold text-[#1C1917] tabular-nums shrink-0">
                                            {formatRupiah(prod.price)}
                                          </span>
                                        </div>

                                        <h4 className="font-serif text-[20px] font-medium text-[#1C1917] leading-snug">
                                          {prod.name}
                                        </h4>

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

                                    <div className="px-5 pb-5 pt-1 flex flex-col gap-2">
                                      <a
                                        href={prodWaUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="taste-btn-primary w-full"
                                      >
                                        <MessageCircle className="w-4 h-4 shrink-0" />
                                        <span>Pesan via WhatsApp</span>
                                      </a>

                                      <div className="grid grid-cols-2 gap-2">
                                        <button
                                          type="button"
                                          onClick={() => handleTryIn3D(prod.id)}
                                          className="taste-btn-secondary w-full"
                                        >
                                          <Layers className="w-3.5 h-3.5 text-[#7C3219] shrink-0" />
                                          <span>Simulasi 3D</span>
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => handleOpenBookProduct(prod.shop.id, prod.id)}
                                          className="taste-btn-secondary w-full"
                                        >
                                          <span>Buka di Buku</span>
                                        </button>
                                      </div>
                                    </div>
                                  </article>
                                </div>
                              );
                            })}
                          </FadeIn>
                        ))}
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
              className="py-16 lg:py-24 bg-[#EFEAE0] border-t border-[#1C1917]/12 text-center"
            >
              <div className="taste-wrap">
                <p className="font-serif text-xl text-[#1C1917]">
                  Memuat Studio Mockup 3D Batik Trenggalek...
                </p>
              </div>
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
      </main>

      {/* 6. FOOTER */}
      <footer className="bg-[#1B1714] text-[#F5F1E8] py-14 lg:py-20 border-t border-[#1C1917]/15 overflow-hidden">
        <FadeIn className="taste-wrap">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-10 pb-10 border-b border-white/12">
            <div className="md:col-span-5 space-y-3">
              <span className="font-serif font-normal text-3xl tracking-[-0.02em] text-[#F5F1E8] block">
                Batik Wicara
              </span>
              <p className="text-[14px] text-[#B5ACA2] max-w-sm leading-relaxed">
                Katalog digital sentra batik Kabupaten Trenggalek dengan buku katalog per sanggar
                dan pratinjau busana 3D.
              </p>
            </div>

            <div className="md:col-span-4 space-y-3">
              <h3 className="text-[13px] font-medium text-[#B5ACA2]">Navigasi</h3>
              <ul className="space-y-2.5 text-[14px]">
                <li>
                  <a href="#buku-katalog" className="taste-nav-link text-[#F5F1E8]">
                    Buku Katalog Per Sanggar
                  </a>
                </li>
                <li>
                  <a href="#katalog" className="taste-nav-link text-[#F5F1E8]">
                    Etalase Produk
                  </a>
                </li>
                <li>
                  <a href="#mockup-3d" className="taste-nav-link text-[#F5F1E8]">
                    Studio Mockup 3D
                  </a>
                </li>
                {onOpenSellerPortal && (
                  <li>
                    <button
                      type="button"
                      onClick={onOpenSellerPortal}
                      className="taste-nav-link text-[#F5F1E8] cursor-pointer"
                    >
                      Portal Perajin UMKM
                    </button>
                  </li>
                )}
              </ul>
            </div>

            <div className="md:col-span-3 space-y-3">
              <h3 className="text-[13px] font-medium text-[#B5ACA2]">Data Katalog</h3>
              <input
                ref={jsonInputRef}
                type="file"
                accept=".json"
                onChange={handleJsonImport}
                className="hidden"
              />
              <div className="flex flex-col items-start gap-2.5">
                <button
                  type="button"
                  onClick={() => jsonInputRef.current?.click()}
                  className="inline-flex items-center gap-2 min-h-[40px] px-3.5 py-2 rounded-md border border-white/18 text-[13px] font-medium text-[#F5F1E8] hover:bg-white/10 transition-colors cursor-pointer"
                >
                  <Upload className="w-3.5 h-3.5 text-[#C4A46B]" />
                  <span>Impor JSON DB</span>
                </button>
                <button
                  type="button"
                  onClick={handleJsonExport}
                  className="inline-flex items-center gap-2 min-h-[40px] px-3.5 py-2 rounded-md border border-white/18 text-[13px] font-medium text-[#F5F1E8] hover:bg-white/10 transition-colors cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5 text-[#C4A46B]" />
                  <span>Ekspor JSON DB</span>
                </button>
              </div>
            </div>
          </div>

          <div className="pt-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-[13px] text-[#B5ACA2]">
            <span>© 2026 Batik Wicara — Kabupaten Trenggalek, Jawa Timur</span>
            <span>Pemesanan terhubung langsung ke WhatsApp masing-masing sanggar</span>
          </div>
        </FadeIn>
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

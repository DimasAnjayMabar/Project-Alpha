import React, { useState, useEffect, useMemo, useCallback, useRef, lazy, Suspense } from 'react';
import {
  MessageCircle,
  BookOpen,
  Search,
  MapPin,
  Layers,
  Menu,
  X,
  Store,
  ArrowRight,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  RotateCcw,
  Loader2,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';
import {
  formatRupiah,
  buildWhatsAppUrl,
  buildProductOrderWaUrl,
} from './utils/helpers';
import { fetchUserCatalogData } from './utils/userService';
import FadeIn from '../components/FadeIn';
import ProductArtwork from './components/ProductArtwork';
import PhysicalCatalogBookSection from './components/PhysicalCatalogBook';

const Batik3DStudio = lazy(() => import('./components/Batik3DStudio'));
const BatikChatbotWidget = lazy(() => import('./components/BatikChatbotWidget'));

export default function UserCatalogPage({
  initialFocusShopId = null,
} = {}) {
  // State Data Backend
  const [catalogData, setCatalogData] = useState({
    activeShops: [],
    categories: [],
    enrichedProducts: [],
    shopBooks: [],
  });
  const [loadStatus, setLoadStatus] = useState('loading'); // 'loading' | 'ready' | 'error'
  const [loadError, setLoadError] = useState('');

  // State Pencarian & Filter Multi-Atribut
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState('ALL');
  const [selectedBatikType, setSelectedBatikType] = useState('ALL');
  const [selectedMaterial, setSelectedMaterial] = useState('ALL');
  const [catalogShopTab, setCatalogShopTab] = useState('ALL');

  // State Buku Katalog & Studio 3D
  const [selectedBookShopId, setSelectedBookShopId] = useState(
    () => initialFocusShopId || null
  );
  const [activeProductId, setActiveProductId] = useState(null);
  const [activeModel, setActiveModel] = useState('fabric');
  const [bookPageIndex, setBookPageIndex] = useState(0);
  const [highlightedProductId, setHighlightedProductId] = useState(null);

  // State Menu & Popover Header
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [sanggarContactOpen, setSanggarContactOpen] = useState(false);
  const [heroSlideIdx, setHeroSlideIdx] = useState(0);
  const [heroInteracting, setHeroInteracting] = useState(false);

  const headerRef = useRef(null);
  const didAutoFocusRef = useRef(false);
  const heroSwipeRef = useRef({ active: false, startX: 0, startY: 0 });

  const [gridCols, setGridCols] = useState(() => {
    if (typeof window === 'undefined') return 3;
    if (window.innerWidth >= 1024) return 3;
    if (window.innerWidth >= 640) return 2;
    return 1;
  });

  // Muat data sanggar, kategori, dan produk aktif dari backend port 3002
  const loadCatalog = useCallback(async () => {
    setLoadStatus('loading');
    setLoadError('');

    try {
      const data = await fetchUserCatalogData();
      setCatalogData(data);

      const focusedBook = initialFocusShopId
        ? data.shopBooks.find((b) => b.shop.id === initialFocusShopId)
        : null;

      setSelectedBookShopId((prev) => {
        if (focusedBook) return focusedBook.shop.id;
        if (prev && data.shopBooks.some((b) => b.shop.id === prev)) return prev;
        return data.shopBooks[0]?.shop.id || null;
      });

      setActiveProductId((prev) => {
        if (prev && data.enrichedProducts.some((p) => p.id === prev)) return prev;
        if (focusedBook?.products?.[0]) return focusedBook.products[0].id;
        return data.enrichedProducts[0]?.id || null;
      });

      if (focusedBook && !didAutoFocusRef.current) {
        didAutoFocusRef.current = true;
        setBookPageIndex(1);
        setTimeout(() => {
          const el = document.getElementById('buku-katalog');
          if (el) el.scrollIntoView({ behavior: 'smooth' });
        }, 120);
      }

      setLoadStatus('ready');
      setLoadError('');
    } catch (err) {
      const msg =
        err?.message ||
        'Tidak dapat terhubung ke server backend. Pastikan server backend (port 3002) sedang aktif.';
      setLoadError(msg);
      setLoadStatus('error');
    }
  }, [initialFocusShopId]);

  useEffect(() => {
    didAutoFocusRef.current = false;
    loadCatalog();
  }, [loadCatalog]);

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 1024) setGridCols(3);
      else if (window.innerWidth >= 640) setGridCols(2);
      else setGridCols(1);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Tutup popover header saat klik di luar atau menekan Escape
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (headerRef.current && !headerRef.current.contains(e.target)) {
        setSanggarContactOpen(false);
      }
    };
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setSanggarContactOpen(false);
        setMobileMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const getEffectiveWa = useCallback((_shopId, fallbackWa) => fallbackWa || '', []);

  const { activeShops, categories, enrichedProducts, shopBooks } = catalogData;

  const minPrice = useMemo(() => {
    if (!enrichedProducts.length) return 0;
    return Math.min(...enrichedProducts.map((p) => Number(p.price) || 0));
  }, [enrichedProducts]);

  // Ekstrak opsi Tipe Batik & Material/Bahan secara dinamis dari atribut produk
  const { batikTypeOptions, materialOptions } = useMemo(() => {
    const typeSet = new Set();
    const matSet = new Set();

    enrichedProducts.forEach((p) => {
      (p.formattedAttributes || []).forEach((attr) => {
        const keyLower = `${attr.name} ${attr.label}`.toLowerCase();
        const val = String(attr.displayValue || '').trim();
        if (!val || val === '-') return;

        if (/jenis|tipe|teknik|proses/.test(keyLower)) {
          typeSet.add(val);
        }
        if (/bahan|material|kain/.test(keyLower)) {
          matSet.add(val);
        }
      });

      const text = `${p.name} ${p.description}`.toLowerCase();
      if (text.includes('batik tulis') || text.includes('kain tulis')) {
        typeSet.add('Batik Tulis');
      }
      if (text.includes('batik cap')) {
        typeSet.add('Batik Cap');
      }
      if (text.includes('kombinasi')) {
        typeSet.add('Batik Kombinasi');
      }
    });

    return {
      batikTypeOptions: Array.from(typeSet).sort((a, b) => a.localeCompare(b, 'id')),
      materialOptions: Array.from(matSet).sort((a, b) => a.localeCompare(b, 'id')),
    };
  }, [enrichedProducts]);

  const hasActiveFilters =
    searchQuery.trim() !== '' ||
    selectedCategoryId !== 'ALL' ||
    selectedBatikType !== 'ALL' ||
    selectedMaterial !== 'ALL' ||
    catalogShopTab !== 'ALL';

  const handleResetFilters = useCallback(() => {
    setSearchQuery('');
    setSelectedCategoryId('ALL');
    setSelectedBatikType('ALL');
    setSelectedMaterial('ALL');
    setCatalogShopTab('ALL');
  }, []);

  const groupedCatalogByShop = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    const typeTarget = selectedBatikType.toLowerCase();
    const matTarget = selectedMaterial.toLowerCase();

    return shopBooks
      .filter((bk) => catalogShopTab === 'ALL' || bk.shop.id === catalogShopTab)
      .map((bk) => {
        const filteredProds = bk.products.filter((p) => {
          const matchCat = selectedCategoryId === 'ALL' || p.category_id === selectedCategoryId;

          const attrs = p.formattedAttributes || [];
          const attrText = attrs
            .map((a) => `${a.label} ${a.displayValue}`)
            .join(' ')
            .toLowerCase();
          const fullText = `${p.name} ${p.description} ${bk.shop.name} ${bk.shop.address} ${attrText}`.toLowerCase();

          const matchQuery = !q || fullText.includes(q);

          const matchBatikType =
            selectedBatikType === 'ALL' ||
            attrs.some(
              (a) =>
                /jenis|tipe|teknik|proses/i.test(`${a.name} ${a.label}`) &&
                String(a.displayValue).toLowerCase().includes(typeTarget)
            ) ||
            `${p.name} ${p.description}`.toLowerCase().includes(typeTarget);

          const matchMaterial =
            selectedMaterial === 'ALL' ||
            attrs.some(
              (a) =>
                /bahan|material|kain/i.test(`${a.name} ${a.label}`) &&
                String(a.displayValue).toLowerCase().includes(matTarget)
            ) ||
            `${p.name} ${p.description}`.toLowerCase().includes(matTarget);

          return matchCat && matchQuery && matchBatikType && matchMaterial;
        });
        return {
          ...bk,
          products: filteredProds,
        };
      })
      .filter((bk) => bk.products.length > 0);
  }, [
    shopBooks,
    catalogShopTab,
    selectedCategoryId,
    selectedBatikType,
    selectedMaterial,
    searchQuery,
  ]);

  const totalFilteredCount = useMemo(
    () => groupedCatalogByShop.reduce((sum, bk) => sum + bk.products.length, 0),
    [groupedCatalogByShop]
  );

  const handleTryIn3D = useCallback(
    (productId) => {
      const prod = enrichedProducts.find((p) => p.id === productId);
      setActiveProductId(productId);

      const bentuk = String(prod?.additional_attribute?.bentuk || '').toLowerCase();
      const prodName = String(prod?.name || '').toLowerCase();
      const catSlug = String(prod?.category?.slug || '').toLowerCase();
      const combined = `${bentuk} ${prodName} ${catSlug}`;

      if (/kebaya|kutubaru|kartini|encim|blouse|blus/.test(combined)) {
        setActiveModel('kebaya');
      } else if (
        catSlug === 'kemeja-batik-jadi' ||
        /baju|kemeja|hem|dress/.test(combined)
      ) {
        setActiveModel('shirt');
      } else if (/tas|selendang|syal/.test(combined)) {
        setActiveModel('tote');
      } else {
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
        setBookPageIndex(idxInBook >= 0 ? idxInBook + 2 : 1);
      } else {
        setBookPageIndex(1);
      }

      const el = document.getElementById('buku-katalog');
      if (el) el.scrollIntoView({ behavior: 'smooth' });
    },
    [shopBooks]
  );

  const heroSlides = useMemo(() => {
    const picked = [];
    const seenIds = new Set();

    shopBooks.forEach((bk) => {
      if (picked.length >= 6) return;
      const lead = bk.products?.[0];
      if (lead && !seenIds.has(lead.id)) {
        picked.push(lead);
        seenIds.add(lead.id);
      }
    });

    enrichedProducts.forEach((p) => {
      if (picked.length >= 6) return;
      if (!seenIds.has(p.id)) {
        picked.push(p);
        seenIds.add(p.id);
      }
    });

    return picked;
  }, [shopBooks, enrichedProducts]);

  const safeHeroIdx = heroSlides.length > 0 ? heroSlideIdx % heroSlides.length : 0;
  const currentHeroSlide = heroSlides[safeHeroIdx] || null;

  useEffect(() => {
    if (heroSlides.length <= 1 || heroInteracting) return undefined;
    const timer = setInterval(() => {
      setHeroSlideIdx((prev) => (prev + 1) % heroSlides.length);
    }, 4500);
    return () => clearInterval(timer);
  }, [heroSlides.length, heroInteracting]);

  const stepHeroSlide = useCallback(
    (delta) => {
      if (heroSlides.length <= 1) return;
      setHeroSlideIdx((prev) => (prev + delta + heroSlides.length) % heroSlides.length);
    },
    [heroSlides.length]
  );

  const handleHeroPointerDown = (e) => {
    if (heroSlides.length <= 1) return;
    if (e.target.closest('button, a')) return;
    heroSwipeRef.current = { active: true, startX: e.clientX, startY: e.clientY };
  };

  const handleHeroPointerUp = (e) => {
    const swipe = heroSwipeRef.current;
    if (!swipe.active) return;
    swipe.active = false;
    const dx = e.clientX - swipe.startX;
    const dy = e.clientY - swipe.startY;
    if (Math.abs(dx) < 40 || Math.abs(dx) < Math.abs(dy) * 1.2) return;
    if (dx < 0) stepHeroSlide(1);
    else stepHeroSlide(-1);
  };

  // State 1: Memuat data dari backend
  if (loadStatus === 'loading') {
    return (
      <div className="min-h-screen bg-[#F7F4EE] text-[#1C1917] flex flex-col items-center justify-center gap-3 px-4">
        <Loader2 className="w-7 h-7 animate-spin text-[#7C3219]" />
        <p className="font-serif text-lg text-[#1C1917]">
          Memuat Katalog Wastra Batik Trenggalek...
        </p>
      </div>
    );
  }

  // State 2: Gagal memuat data dari backend
  if (loadStatus === 'error') {
    return (
      <div className="min-h-screen bg-[#F7F4EE] text-[#1C1917] flex items-center justify-center px-4">
        <div className="max-w-md w-full rounded-xl bg-[#FCFBF8] border border-[#1C1917]/12 p-8 text-center space-y-5">
          <div className="w-12 h-12 rounded-full bg-[#9E2A2B]/10 text-[#9E2A2B] flex items-center justify-center mx-auto">
            <AlertCircle className="w-6 h-6" />
          </div>
          <div className="space-y-2">
            <h1 className="font-serif font-normal text-2xl text-[#1C1917]">
              Gagal Memuat Katalog
            </h1>
            <p className="text-[14px] text-[#575049] leading-relaxed">{loadError}</p>
          </div>
          <div className="flex flex-wrap justify-center gap-3">
            <button
              type="button"
              onClick={() => loadCatalog()}
              className="taste-btn-primary"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Coba Lagi</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F7F4EE] text-[#1C1917] font-sans selection:bg-[#7C3219] selection:text-white">

      {/* 1. NAVBAR */}
      <header
        ref={headerRef}
        className="sticky top-0 z-40 bg-[#F7F4EE] border-b border-[#1C1917]/12"
      >
        <div className="taste-wrap h-[72px] flex items-center justify-between gap-4">
          <a href="#konten-utama" className="skip-link">
            Lewati ke konten utama
          </a>

          <a href="#konten-utama" className="flex items-center gap-3 shrink-0">
            <img
              src="/favicon.png"
              alt="Logo Batik Wicara"
              className="w-9 h-9 object-contain shrink-0 drop-shadow-[0_1px_1px_rgba(28,25,23,0.22)]"
            />
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
            className="hidden lg:flex items-center gap-7 text-[15px] font-medium text-[#1C1917]"
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
          </nav>

          {/* Aksi Header: Kontak WhatsApp Sanggar */}
          <div className="flex items-center gap-2">
            <div className="relative">
              <button
                type="button"
                onClick={() => setSanggarContactOpen((v) => !v)}
                aria-expanded={sanggarContactOpen}
                className="taste-btn-wa"
              >
                <MessageCircle className="w-4 h-4 shrink-0" />
                <span>WhatsApp</span>
                <ChevronDown
                  className={`w-4 h-4 transition-transform ${
                    sanggarContactOpen ? 'rotate-180' : ''
                  }`}
                />
              </button>

              {sanggarContactOpen && (
                <div className="absolute right-0 mt-2 w-[310px] sm:w-[350px] rounded-xl bg-[#FCFBF8] border border-[#1C1917]/15 shadow-[0_18px_40px_rgba(28,25,23,0.18)] p-3 z-50 fade-panel">
                  <div className="px-2 pb-2 mb-2 border-b border-[#1C1917]/10">
                    <span className="text-[12px] font-medium text-[#1D6B44] block">
                      WhatsApp Langsung Perajin
                    </span>
                    <p className="text-[13px] text-[#575049]">
                      Pilih sanggar UMKM yang ingin Anda hubungi:
                    </p>
                  </div>
                  {activeShops.length === 0 ? (
                    <p className="px-2 py-4 text-[13px] text-[#575049] text-center">
                      Belum ada sanggar aktif terdaftar.
                    </p>
                  ) : (
                    <div className="divide-y divide-[#1C1917]/10 max-h-72 overflow-y-auto">
                      {activeShops.map((s) => {
                        const waNum = getEffectiveWa(s.id, s.number);
                        const waLink = waNum
                          ? buildWhatsAppUrl(
                              waNum,
                              `Halo *${s.name}*, saya mengunjungi katalog *Batik Wicara Trenggalek* dan ingin menanyakan produk batik Anda.`
                            )
                          : '';
                        return (
                          <div
                            key={s.id}
                            className="py-2.5 px-2 flex items-center justify-between gap-3"
                          >
                            <div className="min-w-0">
                              <span className="text-[13.5px] font-medium text-[#1C1917] block leading-snug">
                                {s.name}
                              </span>
                              <span className="text-[12px] text-[#575049] block truncate">
                                {s.address || 'Kabupaten Trenggalek'}
                              </span>
                            </div>
                            {waLink ? (
                              <a
                                href={waLink}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={() => setSanggarContactOpen(false)}
                                className="shrink-0 min-h-[36px] px-3 py-1.5 rounded-[10px] bg-[#1D6B44] hover:bg-[#165233] text-white text-[12.5px] font-medium inline-flex items-center gap-1.5 transition-colors"
                              >
                                <MessageCircle className="w-3.5 h-3.5" />
                                <span>WA</span>
                              </a>
                            ) : (
                              <span className="shrink-0 text-[12px] text-[#575049]">
                                Belum ada WA
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => setMobileMenuOpen((v) => !v)}
              aria-expanded={mobileMenuOpen}
              aria-label={mobileMenuOpen ? 'Tutup menu navigasi' : 'Buka menu navigasi'}
              className="lg:hidden min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-[10px] bg-[#FCFBF8] border border-[#1C1917]/20 text-[#1C1917] cursor-pointer"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {mobileMenuOpen && (
          <nav
            aria-label="Navigasi ponsel"
            className="lg:hidden bg-[#F7F4EE] border-t border-[#1C1917]/12 px-5 py-3 flex flex-col divide-y divide-[#1C1917]/10 fade-panel"
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
          </nav>
        )}
      </header>

      <main id="konten-utama">
        {/* 2. HERO SECTION */}
        <section className="relative overflow-hidden bg-[#F7F4EE] pt-10 pb-14 lg:pt-14 lg:pb-20">
          <img
            src="/ornaments/mega-mendung-gold.png"
            alt=""
            aria-hidden="true"
            className="hidden md:block pointer-events-none select-none absolute -top-8 -right-14 w-[400px] lg:w-[540px] opacity-[0.24]"
          />
          <img
            src="/ornaments/kawung-sogan.png"
            alt=""
            aria-hidden="true"
            className="hidden md:block pointer-events-none select-none absolute -bottom-10 -left-10 w-60 lg:w-80 opacity-[0.14]"
          />
          <div className="taste-wrap relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-start">
            <div className="lg:col-span-6 space-y-5">
              <h1 className="font-serif font-normal text-[clamp(2.4rem,4.4vw,3.9rem)] leading-[1.06] tracking-[-0.03em] text-[#1C1917] hero-enter-title">
                Katalog Wastra Batik Perajin Trenggalek
              </h1>

              <p className="text-[16px] sm:text-[17px] leading-[1.6] text-[#575049] max-w-[46ch] hero-enter-step-1">
                Telusuri koleksi batik tulis, batik cap, dan kombinasi langsung dari{' '}
                {activeShops.length > 0 ? `${activeShops.length} sanggar UMKM` : 'para perajin'} di
                Kabupaten Trenggalek. Pratinjau motif pada busana 3D lalu pesan langsung ke perajin
                lewat WhatsApp.
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
                    {minPrice > 0 ? `Mulai ${formatRupiah(minPrice)}` : 'Belum ada koleksi'}
                  </span>
                </div>
                <div>
                  <span className="block text-[13px] text-[#575049]">Koleksi terdaftar</span>
                  <span className="block text-[15px] font-medium text-[#1C1917] tabular-nums mt-0.5">
                    {activeShops.length} sanggar · {enrichedProducts.length} produk
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

            {currentHeroSlide && (
              <div
                className="lg:col-span-6"
                onMouseEnter={() => setHeroInteracting(true)}
                onMouseLeave={() => setHeroInteracting(false)}
                onFocus={() => setHeroInteracting(true)}
                onBlur={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget)) {
                    setHeroInteracting(false);
                  }
                }}
              >
                <div
                  onPointerDown={handleHeroPointerDown}
                  onPointerUp={handleHeroPointerUp}
                  onPointerCancel={() => {
                    heroSwipeRef.current.active = false;
                  }}
                  className="relative aspect-[4/3] rounded-lg overflow-hidden border border-[#1C1917]/12 bg-[#FCFBF8] touch-pan-y select-none hero-enter-media"
                >
                  <div
                    style={{ transform: `translateX(-${safeHeroIdx * 100}%)` }}
                    className="flex h-full transition-transform duration-500 ease-out will-change-transform"
                  >
                    {heroSlides.map((slide) => (
                      <div key={slide.id} className="w-full h-full shrink-0">
                        <ProductArtwork
                          product={slide}
                          imageUrl={slide.primaryImageUrl}
                          size={640}
                          className="w-full h-full"
                        />
                      </div>
                    ))}
                  </div>

                  {heroSlides.length > 1 && (
                    <>
                      <button
                        type="button"
                        onClick={() => stepHeroSlide(-1)}
                        aria-label="Produk sorotan sebelumnya"
                        className="w-10 h-10 rounded-full bg-[#FCFBF8]/92 hover:bg-[#FCFBF8] border border-[#1C1917]/15 shadow-md text-[#1C1917] flex items-center justify-center absolute top-1/2 -translate-y-1/2 left-3 z-10 cursor-pointer transition-colors"
                      >
                        <ChevronLeft className="w-5 h-5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => stepHeroSlide(1)}
                        aria-label="Produk sorotan berikutnya"
                        className="w-10 h-10 rounded-full bg-[#FCFBF8]/92 hover:bg-[#FCFBF8] border border-[#1C1917]/15 shadow-md text-[#1C1917] flex items-center justify-center absolute top-1/2 -translate-y-1/2 right-3 z-10 cursor-pointer transition-colors"
                      >
                        <ChevronRight className="w-5 h-5" />
                      </button>
                    </>
                  )}
                </div>

                <div className="pt-4 flex flex-wrap items-center justify-between gap-3 hero-enter-step-2">
                  <div key={currentHeroSlide.id} className="fade-swap">
                    <p className="font-serif text-[20px] font-medium text-[#1C1917] leading-snug">
                      {currentHeroSlide.name}
                    </p>
                    <p className="text-[14px] text-[#575049] tabular-nums mt-0.5">
                      {currentHeroSlide.shop.name} ·{' '}
                      {formatRupiah(currentHeroSlide.price)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleTryIn3D(currentHeroSlide.id)}
                    className="taste-link text-[14px] font-medium text-[#7C3219] min-h-[44px] cursor-pointer"
                  >
                    <span>Simulasi 3D</span>
                    <ArrowRight className="w-4 h-4 m-arrow" />
                  </button>
                </div>

                {heroSlides.length > 1 && (
                  <div className="pt-3 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-1.5">
                      {heroSlides.map((slide, idx) => (
                        <button
                          key={slide.id}
                          type="button"
                          onClick={() => setHeroSlideIdx(idx)}
                          aria-label={`Lihat sorotan ${idx + 1}: ${slide.name}`}
                          className={`h-2 rounded-full transition-all cursor-pointer ${
                            idx === safeHeroIdx
                              ? 'w-6 bg-[#7C3219]'
                              : 'w-2 bg-[#1C1917]/20 hover:bg-[#7C3219]/50'
                          }`}
                        />
                      ))}
                    </div>

                    <div className="text-[12.5px] text-[#575049] tabular-nums">
                      {safeHeroIdx + 1} / {heroSlides.length}
                    </div>
                  </div>
                )}
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
        />

        {/* 4. ETALASE KATALOG TERKELOMPOK PER SANGGAR */}
        <section
          id="katalog"
          className="relative overflow-hidden bg-[#F7F4EE] border-t border-[#1C1917]/12 py-10 lg:py-12"
        >
          <img
            src="/ornaments/mega-mendung-maroon.png"
            alt=""
            aria-hidden="true"
            className="hidden md:block pointer-events-none select-none absolute -top-6 -right-14 w-[420px] lg:w-[540px] opacity-[0.16]"
          />
          <img
            src="/ornaments/kawung-sogan.png"
            alt=""
            aria-hidden="true"
            className="hidden lg:block pointer-events-none select-none absolute bottom-12 -left-12 w-72 lg:w-96 opacity-[0.10]"
          />
          <div className="taste-wrap relative z-10">
            <FadeIn>
              <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-5 mb-6">
                <div>
                  <h2 className="font-serif font-normal text-[clamp(1.85rem,3vw,2.65rem)] leading-[1.12] tracking-[-0.025em] text-[#1C1917]">
                    Etalase Produk Per Sanggar
                  </h2>
                </div>

                {/* Bar Pencarian + Filter Tipe Batik + Filter Material */}
                <div className="grid grid-cols-1 sm:grid-cols-3 lg:flex lg:flex-wrap items-center gap-2.5">
                  <div className="relative sm:col-span-3 lg:w-64">
                    <label htmlFor="etalase-search" className="sr-only">
                      Cari motif, sanggar, atau bahan
                    </label>
                    <Search className="w-4 h-4 text-[#575049] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      id="etalase-search"
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Cari motif, sanggar, bahan..."
                      className="w-full min-h-[44px] pl-10 pr-3.5 py-2 rounded-[10px] bg-[#FCFBF8] border border-[#1C1917]/20 text-[13.5px] text-[#1C1917] placeholder:text-[#575049]/75"
                    />
                  </div>

                  <div className="relative">
                    <select
                      aria-label="Filter Tipe Batik"
                      value={selectedBatikType}
                      onChange={(e) => setSelectedBatikType(e.target.value)}
                      className={`w-full appearance-none min-h-[44px] pl-3.5 pr-9 py-2 rounded-[10px] border text-[13.5px] font-medium cursor-pointer transition-colors ${
                        selectedBatikType !== 'ALL'
                          ? 'bg-[#F3E9E2] border-[#7C3219] text-[#7C3219]'
                          : 'bg-[#FCFBF8] border-[#1C1917]/20 text-[#1C1917]'
                      }`}
                    >
                      <option value="ALL">Tipe Batik: Semua</option>
                      {batikTypeOptions.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                    <ChevronDown
                      className={`w-4 h-4 pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 ${
                        selectedBatikType !== 'ALL' ? 'text-[#7C3219]' : 'text-[#575049]'
                      }`}
                    />
                  </div>

                  <div className="relative">
                    <select
                      aria-label="Filter Material atau Bahan"
                      value={selectedMaterial}
                      onChange={(e) => setSelectedMaterial(e.target.value)}
                      className={`w-full appearance-none min-h-[44px] pl-3.5 pr-9 py-2 rounded-[10px] border text-[13.5px] font-medium cursor-pointer transition-colors ${
                        selectedMaterial !== 'ALL'
                          ? 'bg-[#F3E9E2] border-[#7C3219] text-[#7C3219]'
                          : 'bg-[#FCFBF8] border-[#1C1917]/20 text-[#1C1917]'
                      }`}
                    >
                      <option value="ALL">Material: Semua</option>
                      {materialOptions.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                    <ChevronDown
                      className={`w-4 h-4 pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 ${
                        selectedMaterial !== 'ALL' ? 'text-[#7C3219]' : 'text-[#575049]'
                      }`}
                    />
                  </div>

                  {hasActiveFilters && (
                    <button
                      type="button"
                      onClick={handleResetFilters}
                      className="min-h-[44px] px-3.5 py-2 rounded-[10px] bg-[#FCFBF8] hover:bg-[#EFEAE0] border border-[#1C1917]/20 text-[13px] font-medium text-[#7C3219] inline-flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Reset</span>
                    </button>
                  )}
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
                        ? 'border-[#7C3219] text-[#7C3219]'
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
                          ? 'border-[#7C3219] text-[#7C3219]'
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
                      className={`min-h-[40px] px-3.5 py-2 rounded-[10px] text-[13px] font-medium border transition-colors cursor-pointer ${
                        selectedCategoryId === 'ALL'
                          ? 'bg-[#7C3219] text-white border-[#7C3219]'
                          : 'bg-[#FCFBF8] text-[#575049] border-[#1C1917]/15 hover:border-[#7C3219]/40 hover:text-[#1C1917]'
                      }`}
                    >
                      Semua Kategori
                    </button>
                    {categories.map((cat) => (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => setSelectedCategoryId(cat.id)}
                        className={`min-h-[40px] px-3.5 py-2 rounded-[10px] text-[13px] font-medium border transition-colors cursor-pointer ${
                          selectedCategoryId === cat.id
                            ? 'bg-[#7C3219] text-white border-[#7C3219]'
                            : 'bg-[#FCFBF8] text-[#575049] border-[#1C1917]/15 hover:border-[#7C3219]/40 hover:text-[#1C1917]'
                        }`}
                      >
                        {cat.name}
                      </button>
                    ))}
                  </div>

                  <span className="text-[13px] text-[#575049] tabular-nums">
                    Menampilkan{' '}
                    <strong className="text-[#1C1917] font-medium">{totalFilteredCount}</strong>{' '}
                    koleksi
                  </span>
                </div>
              </div>
            </FadeIn>

            {groupedCatalogByShop.length === 0 ? (
              <div className="rounded-lg border border-[#1C1917]/15 bg-[#FCFBF8] p-12 text-center space-y-3">
                <p className="font-serif text-xl text-[#1C1917]">
                  {enrichedProducts.length === 0
                    ? 'Belum ada produk tayang di katalog'
                    : 'Koleksi tidak ditemukan'}
                </p>
                <p className="text-[14px] text-[#575049]">
                  {enrichedProducts.length === 0
                    ? 'Koleksi batik dari sanggar UMKM Kabupaten Trenggalek akan segera tampil di sini.'
                    : 'Tidak ada batik yang cocok dengan kombinasi filter saat ini.'}
                </p>
                {hasActiveFilters && (
                  <button
                    type="button"
                    onClick={handleResetFilters}
                    className="taste-btn-secondary mt-2"
                  >
                    <RotateCcw className="w-4 h-4 text-[#7C3219]" />
                    <span>Reset Semua Filter</span>
                  </button>
                )}
              </div>
            ) : (
              <div
                key={`${catalogShopTab}-${selectedCategoryId}-${selectedBatikType}-${selectedMaterial}`}
                className="space-y-14 fade-swap"
              >
                {groupedCatalogByShop.map((bk) => {
                  const shopWa = getEffectiveWa(bk.shop.id, bk.shop.number);
                  const directShopWaUrl = shopWa
                    ? buildWhatsAppUrl(
                        shopWa,
                        `Halo *${bk.shop.name}*, saya melihat katalog produk Anda di *Batik Wicara Trenggalek* dan ingin menanyakan ketersediaan stok.`
                      )
                    : '';

                  const productRows = [];
                  for (let i = 0; i < bk.products.length; i += gridCols) {
                    productRows.push(bk.products.slice(i, i + gridCols));
                  }

                  return (
                    <div key={bk.shop.id} className="border-t border-[#1C1917]/15 pt-8 space-y-6">
                      <FadeIn className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
                        <div className="space-y-1.5">
                          <p className="text-[13px] text-[#575049]">
                            {bk.products.length} koleksi
                          </p>
                          <h3 className="font-serif font-normal text-2xl sm:text-[28px] leading-tight text-[#1C1917]">
                            {bk.shop.name}
                          </h3>
                          {bk.shop.address && (
                            <p className="text-[14px] text-[#575049] flex items-center gap-1.5">
                              <MapPin className="w-4 h-4 text-[#7C3219] shrink-0" />
                              <span>{bk.shop.address}</span>
                            </p>
                          )}
                        </div>

                        {/* Hierarki Tombol Sanggar */}
                        <div className="flex flex-wrap items-center gap-3">
                          {bk.shop.online_shop && (
                            <a
                              href={bk.shop.online_shop}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="taste-link text-[13.5px] font-medium text-[#575049] hover:text-[#1C1917] mr-1"
                            >
                              <Store className="w-4 h-4 text-[#7C3219] shrink-0" />
                              <span>Toko Online</span>
                              <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                            </a>
                          )}
                          <button
                            type="button"
                            onClick={() => handleOpenBookProduct(bk.shop.id, null)}
                            className="taste-btn-secondary"
                          >
                            <BookOpen className="w-4 h-4 text-[#7C3219] shrink-0" />
                            <span>Buka Buku Sanggar</span>
                          </button>
                          {directShopWaUrl && (
                            <a
                              href={directShopWaUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="taste-btn-wa"
                            >
                              <MessageCircle className="w-4 h-4 shrink-0" />
                              <span>Hubungi Sanggar</span>
                            </a>
                          )}
                        </div>
                      </FadeIn>

                      <div className="space-y-6 lg:space-y-8">
                        {productRows.map((rowProducts, rowIdx) => (
                          <FadeIn
                            key={`${bk.shop.id}-row-${rowIdx}`}
                            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8 fade-row"
                          >
                            {rowProducts.map((prod, colIdx) => {
                              const prodWaUrl = shopWa
                                ? buildProductOrderWaUrl(
                                    bk.shop,
                                    shopWa,
                                    prod,
                                    `Etalase ${bk.shop.name}`
                                  )
                                : '';

                              return (
                                <div
                                  key={prod.id}
                                  style={{ transitionDelay: `${colIdx * 130}ms` }}
                                  className="fade-row-card"
                                >
                                  <article className="h-full rounded-xl border border-[#1C1917]/12 bg-[#FCFBF8] overflow-hidden flex flex-col justify-between taste-card">
                                    <div>
                                      <button
                                        type="button"
                                        onClick={() => handleOpenBookProduct(prod.shop.id, prod.id)}
                                        aria-label={`Lihat detail ${prod.name}`}
                                        className="block w-full text-left aspect-[4/3] overflow-hidden border-b border-[#1C1917]/10 bg-[#EFEAE0] taste-zoom-frame cursor-pointer"
                                      >
                                        <ProductArtwork
                                          product={prod}
                                          imageUrl={prod.primaryImageUrl}
                                          size={400}
                                          className="w-full h-full"
                                        />
                                      </button>

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
                                          <button
                                            type="button"
                                            onClick={() =>
                                              handleOpenBookProduct(prod.shop.id, prod.id)
                                            }
                                            className="text-left hover:text-[#7C3219] transition-colors cursor-pointer"
                                          >
                                            {prod.name}
                                          </button>
                                        </h4>

                                        <p className="text-[14px] text-[#575049] line-clamp-2 leading-relaxed">
                                          {prod.description || 'Karya batik khas Kabupaten Trenggalek.'}
                                        </p>

                                        {prod.formattedAttributes.length > 0 && (
                                          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 pt-3 border-t border-[#1C1917]/10 text-[13px]">
                                            {prod.formattedAttributes.slice(0, 4).map((attr) => (
                                              <div key={attr.name} className="min-w-0">
                                                <dt className="text-[#575049] truncate">
                                                  {attr.label}
                                                </dt>
                                                <dd className="font-medium text-[#1C1917] truncate">
                                                  {attr.displayValue}
                                                </dd>
                                              </div>
                                            ))}
                                          </dl>
                                        )}
                                      </div>
                                    </div>

                                    <div className="px-5 pb-5 pt-1 flex flex-col gap-2">
                                      {prodWaUrl ? (
                                        <a
                                          href={prodWaUrl}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="taste-btn-wa w-full"
                                        >
                                          <MessageCircle className="w-4 h-4 shrink-0" />
                                          <span>Pesan via WhatsApp</span>
                                        </a>
                                      ) : (
                                        <span className="min-h-[44px] px-4 py-2 rounded-[10px] bg-[#EFEAE0] text-[#575049] text-[13px] font-medium inline-flex items-center justify-center">
                                          WhatsApp sanggar belum tersedia
                                        </span>
                                      )}

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
                                          <BookOpen className="w-3.5 h-3.5 text-[#7C3219] shrink-0" />
                                          <span>Lihat Detail</span>
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
      <footer className="relative bg-[#1B1714] text-[#F5F1E8] py-14 lg:py-20 border-t border-[#1C1917]/15 overflow-hidden">
        <img
          src="/ornaments/mega-mendung-gold.png"
          alt=""
          aria-hidden="true"
          className="pointer-events-none select-none absolute top-4 -right-10 w-[340px] lg:w-[440px] opacity-[0.16]"
        />
        <FadeIn className="taste-wrap relative z-10">
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
              </ul>
            </div>

            <div className="md:col-span-3 space-y-3">
              <h3 className="text-[13px] font-medium text-[#B5ACA2]">Sentra UMKM</h3>
              <p className="text-[13px] text-[#B5ACA2] leading-relaxed">
                Menghubungkan pengunjung langsung dengan perajin batik asli Kabupaten Trenggalek.
              </p>
              <p className="text-[13px] font-medium text-[#F5F1E8] tabular-nums">
                {activeShops.length} sanggar · {enrichedProducts.length} koleksi
              </p>
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
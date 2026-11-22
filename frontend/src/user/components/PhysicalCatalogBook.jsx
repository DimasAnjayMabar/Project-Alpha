import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  MessageCircle,
  BookOpen,
  Check,
  ChevronLeft,
  ChevronRight,
  MapPin,
  Phone,
  Edit3,
  Award,
  Bookmark,
  ExternalLink,
  Store,
  User,
} from 'lucide-react';
import ProductArtwork from './ProductArtwork';
import {
  formatRupiah,
  buildWhatsAppUrl,
  buildProductOrderWaUrl,
} from '../utils/helpers';

function InstagramIcon({ className = 'w-3.5 h-3.5' }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
    </svg>
  );
}

export default function PhysicalCatalogBookSection({
  shopBooks,
  selectedShopId,
  onSelectShop,
  bookPageIndex,
  highlightedProductId,
  onChangeBookPage,
  onTryIn3D,
  getEffectiveWa,
  onUpdateShopWa,
}) {
  const [flipState, setFlipState] = useState(null);
  const [cornerHover, setCornerHover] = useState(null);
  const [editingWa, setEditingWa] = useState(false);
  const [waInput, setWaInput] = useState('');
  const [activeGalleryMap, setActiveGalleryMap] = useState({});

  const bookContainerRef = useRef(null);
  const dragStartRef = useRef({
    active: false,
    startX: 0,
    startY: 0,
    direction: null,
    hasMoved: false,
  });
  const animFrameRef = useRef(null);

  const activeBook = useMemo(() => {
    if (!shopBooks || shopBooks.length === 0) return null;
    return shopBooks.find((b) => b.shop.id === selectedShopId) || shopBooks[0];
  }, [shopBooks, selectedShopId]);

  useEffect(() => {
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, []);

  const productCount = activeBook ? activeBook.products.length : 0;
  const totalBookPages = productCount + 2;
  const backCoverPage = totalBookPages - 1;
  const safePage = Math.max(0, Math.min(backCoverPage, bookPageIndex));

  const animatePaperFlip = useCallback(
    (direction, fromPage, toPage, startProgress = 0, completeTurn = true) => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      setEditingWa(false);
      setCornerHover(null);

      const targetProgress = completeTurn ? 1 : 0;
      const duration = Math.max(280, Math.abs(targetProgress - startProgress) * 700);
      const startTime = performance.now();

      const step = (now) => {
        const elapsed = now - startTime;
        const rawT = Math.min(1, elapsed / duration);
        const eased =
          rawT < 0.5 ? 4 * rawT * rawT * rawT : 1 - Math.pow(-2 * rawT + 2, 3) / 2;
        const currentProgress = startProgress + (targetProgress - startProgress) * eased;

        setFlipState({
          direction,
          fromPage,
          toPage,
          progress: currentProgress,
          isDragging: false,
        });

        if (rawT < 1) {
          animFrameRef.current = requestAnimationFrame(step);
        } else {
          if (completeTurn) {
            onChangeBookPage(toPage);
          }
          setFlipState(null);
        }
      };

      animFrameRef.current = requestAnimationFrame(step);
    },
    [onChangeBookPage]
  );

  const triggerFlip = useCallback(
    (targetPage) => {
      const clamped = Math.max(0, Math.min(backCoverPage, targetPage));
      if (clamped === safePage || flipState) return;
      const direction = clamped > safePage ? 'next' : 'prev';
      animatePaperFlip(direction, safePage, clamped, 0, true);
    },
    [safePage, backCoverPage, flipState, animatePaperFlip]
  );

  const handleSwitchShopBook = (shopId) => {
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    setFlipState(null);
    setEditingWa(false);
    setCornerHover(null);
    onSelectShop(shopId);
    onChangeBookPage(0);
  };

  if (!activeBook) return null;

  const { shop, account, products } = activeBook;
  const shopWa = getEffectiveWa(shop.id, shop.number);
  const leadProduct = products[0] || null;

  const handleBookPointerDown = (e) => {
    if (flipState) return;
    if (e.target.closest('button, a, input, select')) return;

    const rect = bookContainerRef.current?.getBoundingClientRect();
    if (!rect) return;

    if (safePage === 0) {
      dragStartRef.current = {
        active: true,
        startX: e.clientX,
        startY: e.clientY,
        direction: 'next',
        hasMoved: false,
      };
      return;
    }

    if (safePage === backCoverPage) {
      dragStartRef.current = {
        active: true,
        startX: e.clientX,
        startY: e.clientY,
        direction: 'prev',
        hasMoved: false,
      };
      return;
    }

    const relX = e.clientX - rect.left;
    const isRightHalf = relX > rect.width * 0.5;
    dragStartRef.current = {
      active: true,
      startX: e.clientX,
      startY: e.clientY,
      direction: isRightHalf ? 'next' : 'prev',
      hasMoved: false,
    };
  };

  const handleBookPointerMove = (e) => {
    const drag = dragStartRef.current;
    if (!drag.active) return;

    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;

    if (Math.abs(dy) > Math.abs(dx) && Math.abs(dx) < 14) {
      drag.active = false;
      return;
    }

    if (Math.abs(dx) > 6) {
      drag.hasMoved = true;
    }

    const rect = bookContainerRef.current?.getBoundingClientRect();
    const leafWidth =
      safePage === 0 || safePage === backCoverPage
        ? Math.min(rect?.width || 560, 620)
        : (rect?.width || 800) * 0.52;

    const progress =
      drag.direction === 'next'
        ? Math.max(0, Math.min(0.98, -dx / leafWidth))
        : Math.max(0, Math.min(0.98, dx / leafWidth));

    if (progress > 0.02) {
      const toPage = drag.direction === 'next' ? safePage + 1 : safePage - 1;
      setFlipState({
        direction: drag.direction,
        fromPage: safePage,
        toPage,
        progress,
        isDragging: true,
      });
    }
  };

  const handleBookPointerUp = () => {
    const drag = dragStartRef.current;
    if (!drag.active) return;
    const wasMoved = drag.hasMoved;
    drag.active = false;

    if (flipState && flipState.isDragging) {
      const shouldComplete = flipState.progress > 0.26;
      animatePaperFlip(
        flipState.direction,
        flipState.fromPage,
        flipState.toPage,
        flipState.progress,
        shouldComplete
      );
      return;
    }

    if (!wasMoved) {
      if (safePage === 0) triggerFlip(1);
      else if (safePage === backCoverPage) triggerFlip(backCoverPage - 1);
    }
  };

  const renderFrontCoverFace = (interactive = true) => (
    <div
      onClick={() => interactive && triggerFlip(1)}
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      onKeyDown={(e) => interactive && e.key === 'Enter' && triggerFlip(1)}
      className="group relative h-full min-h-[560px] rounded-r-3xl rounded-l-lg bg-gradient-to-br from-[#3A1D12] via-[#2B150D] to-[#1D0E08] text-amber-100 p-6 sm:p-10 border-2 border-[#B8860B]/65 shadow-[18px_22px_45px_rgba(30,18,10,0.45)] cursor-pointer overflow-hidden flex flex-col justify-between"
    >
      <div className="absolute inset-y-0 left-0 w-7 bg-gradient-to-r from-black/70 via-amber-950/40 to-transparent border-r border-amber-400/25 pointer-events-none" />
      <div className="absolute inset-y-0 left-7 w-1.5 bg-black/35 pointer-events-none" />
      <div className="absolute inset-y-2.5 right-0 w-3 bg-[repeating-linear-gradient(to_left,#E6DAC5_0px,#F9F5EC_1px,#CFC0A8_2px)] rounded-r-2xl opacity-95 pointer-events-none" />

      <div className="relative ml-4 flex-1 border-2 border-amber-400/50 rounded-2xl p-6 sm:p-8 flex flex-col justify-between bg-[radial-gradient(circle_at_top,rgba(212,160,56,0.16),transparent_65%)]">
        <div className="text-center space-y-2">
          <span className="inline-block px-3 py-1 rounded-full border border-amber-400/40 text-[10px] font-bold uppercase tracking-[0.22em] text-amber-300">
            Katalog Resmi Sanggar • Kabupaten Trenggalek
          </span>
          <h3 className="font-serif text-2xl sm:text-3xl font-bold text-amber-200 tracking-wide pt-2 leading-snug">
            {shop.name}
          </h3>
          <p className="text-xs text-amber-100/75 max-w-sm mx-auto leading-relaxed">
            {shop.address}
          </p>
        </div>

        <div className="my-4 mx-auto w-40 h-40 sm:w-44 sm:h-44 rounded-full p-2 border-2 border-amber-400/60 shadow-inner bg-[#1F100A]">
          {leadProduct && (
            <ProductArtwork
              product={leadProduct}
              imageUrl={leadProduct.primaryImageUrl}
              size={240}
              className="w-full h-full rounded-full"
            />
          )}
        </div>

        <div className="text-center space-y-3">
          {account && (
            <p className="text-[11px] text-amber-200/80">
              Pengelola Sanggar: <span className="font-bold">{account.display_name}</span>
            </p>
          )}
          <p className="text-xs text-amber-100/80 font-serif italic">
            Memuat {products.length} Koleksi Produk Aktif
            {products.length > 0 &&
              ` • Mulai ${formatRupiah(Math.min(...products.map((p) => Number(p.price))))}`}
          </p>
          <div className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-amber-400 group-hover:bg-amber-300 text-[#2C241E] text-xs font-bold shadow-md transition-colors">
            <BookOpen className="w-4 h-4" />
            <span>Buka Buku Katalog &rarr;</span>
          </div>
        </div>
      </div>

      {interactive && (
        <div
          style={{
            background:
              'linear-gradient(315deg, #D9C4A3 0%, #EFE2CC 44%, #FFFDF8 50%, rgba(0,0,0,0.35) 53%, transparent 58%)',
          }}
          className="w-11 h-11 absolute bottom-0 right-0 rounded-tl-xl opacity-85 group-hover:w-14 group-hover:h-14 transition-all pointer-events-none"
        />
      )}
    </div>
  );

  const renderBackCoverFace = (interactive = true) => {
    const lastProduct = products[products.length - 1] || leadProduct;
    return (
      <div className="group relative h-full min-h-[560px] rounded-l-3xl rounded-r-lg bg-gradient-to-bl from-[#3A1D12] via-[#2B150D] to-[#1D0E08] text-amber-100 p-6 sm:p-10 border-2 border-[#B8860B]/65 shadow-[-18px_22px_45px_rgba(30,18,10,0.45)] overflow-hidden flex flex-col justify-between cursor-pointer">
        <div className="absolute inset-y-0 right-0 w-7 bg-gradient-to-l from-black/70 via-amber-950/40 to-transparent border-l border-amber-400/25 pointer-events-none" />
        <div className="absolute inset-y-0 right-7 w-1.5 bg-black/35 pointer-events-none" />
        <div className="absolute inset-y-2.5 left-0 w-3 bg-[repeating-linear-gradient(to_right,#E6DAC5_0px,#F9F5EC_1px,#CFC0A8_2px)] rounded-l-2xl opacity-95 pointer-events-none" />

        <div className="relative mr-4 flex-1 border-2 border-amber-400/45 rounded-2xl p-6 sm:p-8 text-center flex flex-col justify-between bg-[radial-gradient(circle_at_bottom,rgba(212,160,56,0.14),transparent_65%)]">
          <div className="space-y-2">
            <span className="inline-block px-3 py-1 rounded-full border border-amber-400/40 text-[10px] font-bold uppercase tracking-[0.22em] text-amber-300">
              Sampul Penutup Katalog Sanggar
            </span>
            <h3 className="font-serif text-2xl sm:text-3xl font-bold text-amber-200 pt-2">
              {shop.name}
            </h3>
            <p className="text-xs text-amber-100/75">{shop.address}</p>
          </div>

          <div className="my-4 space-y-4">
            {lastProduct && (
              <div className="mx-auto w-24 h-24 rounded-full p-1.5 border border-amber-400/50 bg-[#1F100A]">
                <ProductArtwork
                  product={lastProduct}
                  imageUrl={lastProduct.primaryImageUrl}
                  size={140}
                  className="w-full h-full rounded-full"
                />
              </div>
            )}

            <p className="text-xs sm:text-sm font-serif text-amber-100/85 leading-relaxed">
              {shop.description}
            </p>

            <div className="flex flex-wrap justify-center gap-2">
              <a
                href={buildWhatsAppUrl(
                  shopWa,
                  `Halo *${shop.name}*, saya telah membaca buku katalog Anda di *Batik Wicara Trenggalek* dan ingin memesan produk Anda.`
                )}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-md transition-colors"
              >
                <MessageCircle className="w-3.5 h-3.5" />
                <span>Pesan via WhatsApp (+{shopWa})</span>
              </a>

              {shop.online_shop && (
                <a
                  href={shop.online_shop}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/40 text-amber-200 text-xs font-bold"
                >
                  <Store className="w-3.5 h-3.5" />
                  <span>Toko Online</span>
                </a>
              )}

              {shop.instagram && (
                <a
                  href={shop.instagram}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-white/10 hover:bg-white/20 border border-amber-400/30 text-amber-100 text-xs font-bold"
                >
                  <InstagramIcon className="w-3.5 h-3.5" />
                  <span>Instagram</span>
                </a>
              )}
            </div>
          </div>

          <div className="flex flex-wrap justify-center gap-2 pt-2">
            <button
              type="button"
              disabled={!interactive}
              onClick={() => interactive && triggerFlip(backCoverPage - 1)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-white/15 hover:bg-white/25 border border-amber-400/45 text-amber-200 text-xs font-bold cursor-pointer"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              <span>Halaman Terakhir</span>
            </button>
            <button
              type="button"
              disabled={!interactive}
              onClick={() => interactive && triggerFlip(0)}
              className="px-4 py-2 rounded-full bg-amber-400 hover:bg-amber-300 text-[#2C241E] text-xs font-bold cursor-pointer"
            >
              Tutup ke Sampul Depan
            </button>
          </div>
        </div>

        {interactive && (
          <div
            style={{
              background:
                'linear-gradient(45deg, #D9C4A3 0%, #EFE2CC 44%, #FFFDF8 50%, rgba(0,0,0,0.35) 53%, transparent 58%)',
            }}
            className="w-11 h-11 absolute bottom-0 left-0 rounded-tr-xl opacity-85 group-hover:w-14 group-hover:h-14 transition-all pointer-events-none"
          />
        )}
      </div>
    );
  };

  const renderProductMediaGallery = (prod, aspectClass = 'aspect-[16/9]', interactive = true) => {
    const gallery = prod.displayImages || [];
    const selectedIdx = Math.min(activeGalleryMap[prod.id] || 0, Math.max(0, gallery.length - 1));
    const currentImage = gallery[selectedIdx];

    return (
      <div className="space-y-2">
        <div className={`relative ${aspectClass} rounded-xl overflow-hidden border border-[#DFD2BC] bg-white`}>
          <ProductArtwork
            product={prod}
            imageUrl={currentImage?.image_url || prod.primaryImageUrl}
            size={480}
            className="w-full h-full"
          />
          {prod.mockupImage && (
            <span className="absolute bottom-2.5 right-2.5 px-2.5 py-1 rounded-full bg-[#2C241E]/85 text-amber-300 text-[10px] font-bold backdrop-blur-xs">
              3D Mockup Siap
            </span>
          )}
        </div>

        {gallery.length > 1 && (
          <div className="flex items-center gap-2">
            {gallery.map((imgRow, idx) => (
              <button
                key={imgRow.id}
                type="button"
                disabled={!interactive}
                onClick={() =>
                  interactive &&
                  setActiveGalleryMap((prev) => ({ ...prev, [prod.id]: idx }))
                }
                className={`w-12 h-10 rounded-lg overflow-hidden border transition-all cursor-pointer ${
                  idx === selectedIdx
                    ? 'border-[#8B3A1E] ring-2 ring-[#8B3A1E]/30'
                    : 'border-[#DFD2BC] opacity-75 hover:opacity-100'
                }`}
              >
                <ProductArtwork
                  product={prod}
                  imageUrl={imgRow.image_url}
                  size={80}
                  className="w-full h-full"
                />
              </button>
            ))}
            <span className="text-[10px] text-[#6B5B4E] ml-auto">
              Foto {selectedIdx + 1}/{gallery.length}
            </span>
          </div>
        )}
      </div>
    );
  };

  const renderCompactProductCard = (prod, idxInShop, interactive = true) => {
    if (!prod) return null;
    const isHighlighted = prod.id === highlightedProductId;
    const productWaHref = buildProductOrderWaUrl(
      shop,
      shopWa,
      prod,
      `Buku Katalog ${shop.name} (Halaman 2)`
    );

    return (
      <div
        className={`rounded-2xl bg-white/95 border p-4 sm:p-5 space-y-3 transition-all ${
          isHighlighted ? 'border-[#8B3A1E] ring-2 ring-[#8B3A1E]/25' : 'border-[#DFD2BC]'
        }`}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="px-2.5 py-0.5 rounded-full bg-[#8B3A1E]/10 text-[#8B3A1E] text-[10px] font-bold">
            Produk #{idxInShop + 1} dari {products.length} • {prod.category.name}
          </span>
          <span className="text-sm font-bold text-[#8B3A1E]">{formatRupiah(prod.price)}</span>
        </div>

        {renderProductMediaGallery(prod, 'aspect-[16/9]', interactive)}

        <div className="space-y-1">
          <h4 className="font-serif text-xl font-bold text-[#2C241E]">{prod.name}</h4>
          <p className="text-xs font-serif italic text-[#4F4136] line-clamp-2 leading-relaxed">
            “{prod.description}”
          </p>
        </div>

        <div className="grid grid-cols-2 gap-1.5">
          {prod.formattedAttributes.slice(0, 4).map((attr) => (
            <div key={attr.name} className="py-1.5 px-2.5 rounded-xl bg-[#FAF6EE] border border-[#E8DEC8]">
              <span className="block text-[9px] font-bold uppercase text-[#6B5B4E]">
                {attr.label}
              </span>
              <span className="block text-[11px] font-bold text-[#2C241E] truncate">
                {attr.displayValue}
              </span>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-2 pt-1">
          <button
            type="button"
            disabled={!interactive}
            onClick={() => interactive && onTryIn3D(prod.id)}
            className="py-2.5 px-3 rounded-xl bg-[#FAF6EE] hover:bg-amber-50 border border-[#DFD2BC] text-xs font-bold text-[#2C241E] cursor-pointer"
          >
            Simulasi 3D
          </button>
          <a
            href={productWaHref}
            target="_blank"
            rel="noopener noreferrer"
            className="py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center justify-center gap-1.5"
          >
            <MessageCircle className="w-3.5 h-3.5 shrink-0" />
            <span>Pesan via WA</span>
          </a>
        </div>
      </div>
    );
  };

  const renderSpreadSide = (pageIdx, side, interactive = true) => {
    const productIndexForPage = pageIdx - 1;
    const currentProd = products[productIndexForPage] || products[0];

    if (pageIdx === 1) {
      if (side === 'left') {
        return (
          <div className="h-full p-6 sm:p-8 lg:pr-11 flex flex-col justify-between space-y-3.5 paper-surface">
            <div className="space-y-3.5">
              <div className="flex items-center justify-between text-[11px] font-serif italic text-[#8B3A1E] border-b border-[#E2D6C3] pb-2">
                <span>Profil Sanggar &amp; Pengelola</span>
                <span>Halaman 1</span>
              </div>

              <div className="space-y-1.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#8B3A1E]/10 text-[#8B3A1E] text-[10px] font-bold">
                    <Award className="w-3 h-3" />
                    <span>Sentra Batik Trenggalek</span>
                  </span>

                  {account && (
                    <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-[#5C4D40]">
                      {account.profile ? (
                        <img
                          src={account.profile}
                          alt={account.display_name}
                          className="w-4 h-4 rounded-full object-cover"
                        />
                      ) : (
                        <User className="w-3.5 h-3.5 text-[#8B3A1E]" />
                      )}
                      <span>{account.display_name}</span>
                    </span>
                  )}
                </div>

                <h3 className="font-serif text-2xl sm:text-3xl font-bold text-[#2C241E] leading-tight">
                  {shop.name}
                </h3>

                <p className="text-xs text-[#4F4136] leading-relaxed">{shop.description}</p>

                <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-xs text-[#5C4D40]">
                  <span className="flex items-start gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-[#8B3A1E] shrink-0 mt-0.5" />
                    <span>{shop.address}</span>
                  </span>
                  {shop.gmaps && (
                    <a
                      href={shop.gmaps}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white border border-[#DFD2BC] text-[10.5px] font-bold text-[#8B3A1E] hover:bg-amber-50 shrink-0"
                    >
                      <span>Google Maps</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
              </div>

              <div className="p-3 rounded-2xl bg-[#F4ECE0] border border-[#DFD2BC] space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="text-[10px] uppercase tracking-wider font-bold text-[#8B3A1E] block">
                      WhatsApp Pemesanan Resmi
                    </span>
                    {interactive && editingWa ? (
                      <div className="flex items-center gap-1.5 mt-1">
                        <input
                          type="text"
                          value={waInput}
                          onChange={(e) => setWaInput(e.target.value)}
                          className="px-2.5 py-1 rounded-lg bg-white border border-[#CBBBA4] text-xs font-bold text-[#2C241E]"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            if (waInput.trim()) onUpdateShopWa(shop.id, waInput.trim());
                            setEditingWa(false);
                          }}
                          className="p-1.5 rounded-lg bg-emerald-600 text-white cursor-pointer"
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <span className="text-xs font-mono font-bold text-[#2C241E] flex items-center gap-1.5 mt-0.5">
                        <Phone className="w-3.5 h-3.5 text-emerald-700" />+{shopWa}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5">
                    {interactive && !editingWa && (
                      <button
                        type="button"
                        onClick={() => {
                          setWaInput(shopWa);
                          setEditingWa(true);
                        }}
                        className="px-2.5 py-1.5 rounded-lg bg-white border border-[#DFD2BC] text-[10.5px] font-bold text-[#5C4D40] hover:text-[#2C241E] cursor-pointer"
                      >
                        <Edit3 className="w-3 h-3 inline mr-1" />
                        Ubah WA
                      </button>
                    )}
                    <a
                      href={buildWhatsAppUrl(
                        shopWa,
                        `Halo *${shop.name}*, saya membaca buku katalog Anda di *Batik Wicara Trenggalek* dan ingin berkonsultasi pemesanan.`
                      )}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[10.5px] font-bold"
                    >
                      Chat WA
                    </a>
                  </div>
                </div>

                {(shop.online_shop || shop.instagram) && (
                  <div className="flex flex-wrap gap-2 pt-2 border-t border-[#DFD2BC]">
                    {shop.online_shop && (
                      <a
                        href={shop.online_shop}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white hover:bg-amber-50 border border-[#DFD2BC] text-[10.5px] font-bold text-[#2C241E]"
                      >
                        <Store className="w-3 h-3 text-[#8B3A1E]" />
                        <span>Toko Online</span>
                        <ExternalLink className="w-2.5 h-2.5 text-[#6B5B4E]" />
                      </a>
                    )}
                    {shop.instagram && (
                      <a
                        href={shop.instagram}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white hover:bg-amber-50 border border-[#DFD2BC] text-[10.5px] font-bold text-[#2C241E]"
                      >
                        <InstagramIcon className="w-3 h-3 text-[#8B3A1E]" />
                        <span>Instagram Sanggar</span>
                        <ExternalLink className="w-2.5 h-2.5 text-[#6B5B4E]" />
                      </a>
                    )}
                  </div>
                )}
              </div>

              <div className="space-y-1.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#8B3A1E] block">
                  Daftar Koleksi Produk ({products.length} Karya Aktif)
                </span>
                <div className="divide-y divide-[#E6DDD0] rounded-2xl border border-[#DFD2BC] bg-white/85 overflow-hidden">
                  {products.map((p, idx) => (
                    <button
                      key={p.id}
                      type="button"
                      disabled={!interactive || idx === 0}
                      onClick={() => interactive && idx > 0 && triggerFlip(idx + 1)}
                      className={`w-full px-3.5 py-2 text-left flex items-center justify-between gap-2 transition-colors ${
                        idx === 0
                          ? 'bg-amber-50/80 text-[#8B3A1E]'
                          : 'hover:bg-[#F4ECE0]/70 text-[#2C241E] cursor-pointer'
                      }`}
                    >
                      <div className="min-w-0">
                        <span className="font-serif font-bold text-xs block truncate">
                          0{idx + 1}. {p.name}
                        </span>
                        <span className="text-[10px] text-[#6B5B4E]">
                          {p.category.name} • {formatRupiah(p.price)}
                        </span>
                      </div>
                      <span className="shrink-0 text-[11px] font-bold text-[#8B3A1E]">
                        {idx === 0 ? 'Hal. 2 (Tampil)' : `Hal. ${idx * 2 + 1} →`}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="text-[11px] font-serif italic text-[#6B5B4E] flex items-center justify-between pt-2 border-t border-[#E2D6C3]">
              <span>{shop.name}</span>
              <span>Halaman 1 dari {Math.max(2, products.length * 2)}</span>
            </div>
          </div>
        );
      }

      return (
        <div className="h-full p-6 sm:p-8 lg:pl-11 flex flex-col justify-between space-y-3.5 paper-surface">
          <div className="space-y-3">
            <div className="flex items-center justify-between text-[11px] font-serif italic text-[#8B3A1E] border-b border-[#E2D6C3] pb-2">
              <span>Lembar Koleksi Utama Sanggar</span>
              <span>Halaman 2</span>
            </div>
            {currentProd ? (
              renderCompactProductCard(currentProd, 0, interactive)
            ) : (
              <div className="p-8 text-center text-xs text-[#6B5B4E]">
                Belum ada produk aktif pada sanggar ini.
              </div>
            )}
          </div>

          <div className="text-[11px] font-serif italic text-[#6B5B4E] flex items-center justify-between pt-2 border-t border-[#E2D6C3]">
            <span>Seret atau klik sudut kanan untuk membalik</span>
            <span>Halaman 2 dari {Math.max(2, products.length * 2)}</span>
          </div>
        </div>
      );
    }

    const leftPageNum = (pageIdx - 1) * 2 + 1;
    const rightPageNum = (pageIdx - 1) * 2 + 2;
    const isHighlighted = currentProd?.id === highlightedProductId;

    if (side === 'left') {
      return (
        <div className="h-full p-6 sm:p-8 lg:pr-11 flex flex-col justify-between space-y-3.5 paper-surface">
          <div className="space-y-3.5">
            <div className="flex items-center justify-between text-[11px] font-serif italic text-[#8B3A1E] border-b border-[#E2D6C3] pb-2">
              <span>
                {shop.name} • Koleksi #0{productIndexForPage + 1}
              </span>
              <span>Halaman {leftPageNum}</span>
            </div>

            <div
              className={`rounded-2xl border bg-white p-2.5 shadow-xs ${
                isHighlighted ? 'border-[#8B3A1E] ring-2 ring-[#8B3A1E]/25' : 'border-[#DFD2BC]'
              }`}
            >
              {renderProductMediaGallery(currentProd, 'aspect-[4/3]', interactive)}
            </div>

            <div className="space-y-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#8B3A1E]">
                Deskripsi &amp; Filosofi Wastra
              </span>
              <p className="text-xs sm:text-sm font-serif italic text-[#4F4136] leading-relaxed">
                “{currentProd.description}”
              </p>
            </div>
          </div>

          <div className="text-[11px] font-serif italic text-[#6B5B4E] flex items-center justify-between pt-2 border-t border-[#E2D6C3]">
            <span>Galeri Produk ({currentProd.displayImages.length} Foto)</span>
            <span>
              Halaman {leftPageNum} dari {products.length * 2}
            </span>
          </div>
        </div>
      );
    }

    const detailWaHref = buildProductOrderWaUrl(
      shop,
      shopWa,
      currentProd,
      `Buku Katalog ${shop.name} (Halaman ${rightPageNum})`
    );

    return (
      <div className="h-full p-6 sm:p-8 lg:pl-11 flex flex-col justify-between space-y-3.5 paper-surface">
        <div className="space-y-3.5">
          <div className="flex items-center justify-between text-[11px] font-serif italic text-[#8B3A1E] border-b border-[#E2D6C3] pb-2">
            <span>Spesifikasi Kategori &amp; Pemesanan WhatsApp</span>
            <span>Halaman {rightPageNum}</span>
          </div>

          <div className="space-y-1">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="inline-block px-2.5 py-0.5 rounded-full bg-[#8B3A1E]/10 text-[#8B3A1E] text-[10px] font-bold">
                {currentProd.category.name} ({currentProd.category.slug})
              </span>
              <span className="text-lg font-bold text-[#8B3A1E]">
                {formatRupiah(currentProd.price)}
              </span>
            </div>
            <h3 className="font-serif text-2xl sm:text-3xl font-bold text-[#2C241E]">
              {currentProd.name}
            </h3>
            <p className="text-xs text-[#6B5B4E]">Karya {shop.name}</p>
          </div>

          <div className="space-y-2 pt-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#8B3A1E] block">
              Spesifikasi Produk (Tervalidasi Skema Kategori)
            </span>
            <div className="rounded-2xl border border-[#DFD2BC] bg-white divide-y divide-[#EFE7DA] overflow-hidden">
              {currentProd.formattedAttributes.map((attr) => (
                <div
                  key={attr.name}
                  className="px-3.5 py-2 flex items-center justify-between gap-3 text-xs"
                >
                  <span className="text-[#6B5B4E] font-medium">
                    {attr.label}
                    {attr.required && <span className="text-[#8B3A1E] ml-0.5">*</span>}
                  </span>
                  <span className="font-bold text-[#2C241E] text-right">{attr.displayValue}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-2 pt-1">
            <a
              href={detailWaHref}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm font-bold shadow-xs flex items-center justify-center gap-2 transition-colors"
            >
              <MessageCircle className="w-4 h-4 shrink-0" />
              <span>Pesan Produk Ini via WhatsApp</span>
            </a>

            <div className={`grid ${currentProd.product_link ? 'grid-cols-2' : 'grid-cols-1'} gap-2`}>
              <button
                type="button"
                disabled={!interactive}
                onClick={() => interactive && onTryIn3D(currentProd.id)}
                className="py-2.5 px-3 rounded-xl bg-white hover:bg-amber-50 border border-[#DFD2BC] text-xs font-bold text-[#2C241E] cursor-pointer"
              >
                Coba di Studio 3D
              </button>

              {currentProd.product_link && (
                <a
                  href={currentProd.product_link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="py-2.5 px-3 rounded-xl bg-[#2C241E] hover:bg-[#3F342B] text-amber-300 text-xs font-bold flex items-center justify-center gap-1.5"
                >
                  <Store className="w-3.5 h-3.5 shrink-0" />
                  <span>Marketplace</span>
                  <ExternalLink className="w-3 h-3 shrink-0" />
                </a>
              )}
            </div>
          </div>
        </div>

        <div className="text-[11px] font-serif italic text-[#6B5B4E] flex items-center justify-between pt-2 border-t border-[#E2D6C3]">
          <span>
            {pageIdx === backCoverPage - 1
              ? 'Balik ke kanan untuk menutup Sampul Belakang'
              : 'Balik ke kanan untuk koleksi berikutnya'}
          </span>
          <span>
            Halaman {rightPageNum} dari {products.length * 2}
          </span>
        </div>
      </div>
    );
  };

  const isSpreadPage = (p) => p >= 1 && p <= backCoverPage - 1;

  const isTurningBetweenSpreads =
    flipState && isSpreadPage(flipState.fromPage) && isSpreadPage(flipState.toPage);

  const isFrontCoverTransition =
    flipState &&
    ((flipState.fromPage === 0 && isSpreadPage(flipState.toPage)) ||
      (flipState.toPage === 0 && isSpreadPage(flipState.fromPage)));

  const isBackCoverTransition =
    flipState &&
    ((flipState.toPage === backCoverPage && isSpreadPage(flipState.fromPage)) ||
      (flipState.fromPage === backCoverPage && isSpreadPage(flipState.toPage)));

  const frontSpreadTarget = isFrontCoverTransition
    ? flipState.fromPage === 0
      ? flipState.toPage
      : flipState.fromPage
    : 1;
  const frontOpenAmount = isFrontCoverTransition
    ? flipState.fromPage === 0
      ? flipState.progress
      : 1 - flipState.progress
    : 0;
  const frontArch = Math.sin(frontOpenAmount * Math.PI);

  const backSpreadTarget = isBackCoverTransition
    ? flipState.toPage === backCoverPage
      ? flipState.fromPage
      : flipState.toPage
    : backCoverPage - 1;
  const backClosedAmount = isBackCoverTransition
    ? flipState.toPage === backCoverPage
      ? flipState.progress
      : 1 - flipState.progress
    : 0;
  const backArch = Math.sin(backClosedAmount * Math.PI);

  const baseLeftSpread = isTurningBetweenSpreads
    ? flipState.direction === 'next'
      ? flipState.fromPage
      : flipState.toPage
    : safePage;

  const baseRightSpread = isTurningBetweenSpreads
    ? flipState.direction === 'next'
      ? flipState.toPage
      : flipState.fromPage
    : safePage;

  const turnAngle = isTurningBetweenSpreads
    ? flipState.direction === 'next'
      ? -flipState.progress * 180
      : flipState.progress * 180
    : 0;
  const archIntensity = isTurningBetweenSpreads ? Math.sin(flipState.progress * Math.PI) : 0;

  return (
    <section
      id="buku-katalog"
      className="py-14 sm:py-20 px-4 sm:px-6 bg-gradient-to-b from-[#EFE7DA] via-[#E6DAC7] to-[#DDD0BC] border-t border-[#D8CBB8] overflow-hidden"
    >
      <style>{`
        .paper-surface {
          background-color: #FCF9F2;
          background-image:
            radial-gradient(rgba(139, 58, 30, 0.032) 1px, transparent 0),
            linear-gradient(to bottom, rgba(255,255,255,0.75), rgba(243,234,218,0.45));
          background-size: 18px 18px, 100% 100%;
        }
        .book-3d-stage {
          perspective: 2400px;
        }
        .book-turning-leaf {
          transform-style: preserve-3d;
          will-change: transform;
        }
        .book-leaf-face {
          backface-visibility: hidden;
          -webkit-backface-visibility: hidden;
        }
        .book-leaf-back {
          transform: rotateY(180deg);
        }
      `}</style>

      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-5">
          <div>
            <span className="text-xs font-bold uppercase tracking-widest text-[#8B3A1E] block mb-1.5">
              Buku Katalog Per Toko • Pemesanan Langsung WhatsApp
            </span>
            <h2 className="font-serif text-2xl sm:text-4xl font-bold text-[#2C241E]">
              Buku Katalog: {shop.name}
            </h2>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={safePage === 0 || Boolean(flipState)}
              onClick={() => triggerFlip(safePage - 1)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white/90 hover:bg-white disabled:opacity-40 border border-[#CBBBA4] text-xs font-bold text-[#2C241E] shadow-xs cursor-pointer disabled:cursor-not-allowed"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>Sebelumnya</span>
            </button>

            <span className="px-3.5 py-2 rounded-xl bg-[#2C241E] text-amber-300 text-xs font-bold shadow-xs">
              {safePage === 0
                ? 'Sampul Depan'
                : safePage === backCoverPage
                ? 'Sampul Belakang'
                : `Hal. ${(safePage - 1) * 2 + 1}–${(safePage - 1) * 2 + 2}`}
            </span>

            <button
              type="button"
              disabled={safePage === backCoverPage || Boolean(flipState)}
              onClick={() => triggerFlip(safePage + 1)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white/90 hover:bg-white disabled:opacity-40 border border-[#CBBBA4] text-xs font-bold text-[#2C241E] shadow-xs cursor-pointer disabled:cursor-not-allowed"
            >
              <span>Balik Halaman</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Rak Pemilihan Buku Per UMKM */}
        <div className="p-3 rounded-2xl bg-white/75 backdrop-blur-xs border border-[#CBBBA4] mb-4">
          <span className="text-[10px] font-bold uppercase tracking-widest text-[#8B3A1E] block mb-2 px-1">
            Pilih Buku Katalog Sentra UMKM ({shopBooks.length} Toko Aktif):
          </span>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
            {shopBooks.map((bk, idx) => {
              const isSelectedBook = bk.shop.id === shop.id;
              return (
                <button
                  key={bk.shop.id}
                  type="button"
                  onClick={() => handleSwitchShopBook(bk.shop.id)}
                  className={`p-2.5 rounded-xl border text-left transition-all flex items-center gap-2.5 cursor-pointer ${
                    isSelectedBook
                      ? 'bg-[#3A1D12] text-amber-100 border-[#3A1D12] shadow-sm'
                      : 'bg-[#FAF7F2] hover:bg-white text-[#2C241E] border-[#D8CBB8]'
                  }`}
                >
                  <div
                    className={`w-8 h-10 rounded-r-md rounded-l-xs border flex items-center justify-center shrink-0 font-serif font-bold text-xs ${
                      isSelectedBook
                        ? 'bg-amber-400 text-[#2C241E] border-amber-300'
                        : 'bg-[#8B3A1E] text-white border-[#6E2C15]'
                    }`}
                  >
                    0{idx + 1}
                  </div>
                  <div className="min-w-0">
                    <span
                      className={`block text-[11px] font-bold truncate ${
                        isSelectedBook ? 'text-amber-300' : 'text-[#2C241E]'
                      }`}
                    >
                      {bk.shop.name}
                    </span>
                    <span
                      className={`block text-[10px] truncate ${
                        isSelectedBook ? 'text-amber-100/75' : 'text-[#6B5B4E]'
                      }`}
                    >
                      {bk.products.length} Koleksi Produk
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Pita Pembatas Halaman */}
        <div className="flex flex-wrap items-center gap-1.5 mb-5">
          <button
            type="button"
            disabled={Boolean(flipState)}
            onClick={() => triggerFlip(0)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-t-xl rounded-b-md text-[11px] font-bold border transition-all cursor-pointer ${
              safePage === 0
                ? 'bg-[#3D1E12] text-amber-300 border-[#3D1E12] shadow-sm -translate-y-0.5'
                : 'bg-white/80 text-[#5C4D40] border-[#CBBBA4] hover:bg-white'
            }`}
          >
            <Bookmark className="w-3 h-3" />
            <span>Sampul Depan</span>
          </button>

          {products.map((p, idx) => {
            const pageNum = idx + 1;
            const isActive = safePage === pageNum;
            return (
              <button
                key={p.id}
                type="button"
                disabled={Boolean(flipState)}
                onClick={() => triggerFlip(pageNum)}
                className={`px-3 py-1.5 rounded-t-xl rounded-b-md text-[11px] font-bold border transition-all cursor-pointer ${
                  isActive
                    ? 'bg-[#8B3A1E] text-white border-[#8B3A1E] shadow-sm -translate-y-0.5'
                    : 'bg-white/80 text-[#2C241E] border-[#CBBBA4] hover:bg-white'
                }`}
              >
                {idx === 0 ? `Profil & ${p.name}` : `${idx + 1}. ${p.name}`}
              </button>
            );
          })}

          <button
            type="button"
            disabled={Boolean(flipState)}
            onClick={() => triggerFlip(backCoverPage)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-t-xl rounded-b-md text-[11px] font-bold border transition-all cursor-pointer ${
              safePage === backCoverPage
                ? 'bg-[#3D1E12] text-amber-300 border-[#3D1E12] shadow-sm -translate-y-0.5'
                : 'bg-white/80 text-[#5C4D40] border-[#CBBBA4] hover:bg-white'
            }`}
          >
            <span>Sampul Belakang</span>
          </button>
        </div>

        {/* Panggung 3D Buku Fisik */}
        <div
          ref={bookContainerRef}
          onPointerDown={handleBookPointerDown}
          onPointerMove={handleBookPointerMove}
          onPointerUp={handleBookPointerUp}
          onPointerLeave={handleBookPointerUp}
          className="book-3d-stage relative mx-auto select-none"
        >
          {isFrontCoverTransition ? (
            <div
              style={{
                transform: `translateX(${-(1 - frontOpenAmount) * 25}%)`,
              }}
              className="relative mx-auto"
            >
              <div className="relative grid grid-cols-1 lg:grid-cols-2 min-h-[560px]">
                <div className="hidden lg:block pointer-events-none" />

                <div className="relative rounded-2xl lg:rounded-l-none lg:rounded-r-2xl overflow-hidden bg-[#FCF9F2] border border-[#5A3422] shadow-[0_24px_50px_rgba(32,19,12,0.35)]">
                  {renderSpreadSide(frontSpreadTarget, 'right', false)}
                  <div
                    className="pointer-events-none absolute inset-0 z-20"
                    style={{
                      opacity: Math.max(0, (1 - frontOpenAmount) * 0.55),
                      background:
                        'linear-gradient(to right, rgba(24,14,8,0.5) 0%, rgba(24,14,8,0.18) 55%, transparent 100%)',
                    }}
                  />
                </div>

                <div
                  style={{
                    left: '50%',
                    width: '50%',
                    transformOrigin: 'left center',
                    transform: `rotateY(${-frontOpenAmount * 180}deg) skewY(${-frontArch * 1.1}deg)`,
                  }}
                  className="hidden lg:block book-turning-leaf pointer-events-none absolute top-0 bottom-0 z-30"
                >
                  <div className="book-leaf-face absolute inset-0">
                    {renderFrontCoverFace(false)}
                    <div
                      className="absolute inset-0 rounded-r-3xl rounded-l-lg pointer-events-none"
                      style={{
                        opacity: frontArch * 0.65,
                        background:
                          'linear-gradient(90deg, rgba(0,0,0,0.28) 0%, rgba(255,245,220,0.32) 48%, rgba(0,0,0,0.18) 100%)',
                      }}
                    />
                  </div>

                  <div className="book-leaf-face book-leaf-back absolute inset-0 rounded-l-2xl overflow-hidden bg-[#FCF9F2] border border-[#5A3422] shadow-[0_18px_40px_rgba(25,15,8,0.32)]">
                    {renderSpreadSide(frontSpreadTarget, 'left', false)}
                    <div
                      className="absolute inset-0 pointer-events-none"
                      style={{
                        opacity: frontArch * 0.6,
                        background:
                          'linear-gradient(270deg, rgba(25,15,10,0.28) 0%, rgba(255,255,255,0.4) 45%, rgba(44,36,30,0.12) 100%)',
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>
          ) : isBackCoverTransition ? (
            <div
              style={{
                transform: `translateX(${backClosedAmount * 25}%)`,
              }}
              className="relative mx-auto"
            >
              <div className="relative grid grid-cols-1 lg:grid-cols-2 min-h-[560px]">
                <div className="relative rounded-2xl lg:rounded-r-none lg:rounded-l-2xl overflow-hidden bg-[#FCF9F2] border border-[#5A3422] shadow-[0_24px_50px_rgba(32,19,12,0.35)]">
                  {renderSpreadSide(backSpreadTarget, 'left', false)}
                  <div
                    className="pointer-events-none absolute inset-0 z-20"
                    style={{
                      opacity: Math.max(0, backClosedAmount * 0.55),
                      background:
                        'linear-gradient(to left, rgba(24,14,8,0.5) 0%, rgba(24,14,8,0.18) 55%, transparent 100%)',
                    }}
                  />
                </div>

                <div className="hidden lg:block pointer-events-none" />

                <div
                  style={{
                    left: '0%',
                    width: '50%',
                    transformOrigin: 'right center',
                    transform: `rotateY(${(1 - backClosedAmount) * 180}deg) skewY(${
                      backArch * 1.1
                    }deg)`,
                  }}
                  className="hidden lg:block book-turning-leaf pointer-events-none absolute top-0 bottom-0 z-30"
                >
                  <div className="book-leaf-face absolute inset-0">
                    {renderBackCoverFace(false)}
                    <div
                      className="absolute inset-0 rounded-l-3xl rounded-r-lg pointer-events-none"
                      style={{
                        opacity: backArch * 0.65,
                        background:
                          'linear-gradient(270deg, rgba(0,0,0,0.28) 0%, rgba(255,245,220,0.32) 48%, rgba(0,0,0,0.18) 100%)',
                      }}
                    />
                  </div>

                  <div className="book-leaf-face book-leaf-back absolute inset-0 rounded-r-2xl overflow-hidden bg-[#FCF9F2] border border-[#5A3422] shadow-[0_18px_40px_rgba(25,15,8,0.32)]">
                    {renderSpreadSide(backSpreadTarget, 'right', false)}
                    <div
                      className="absolute inset-0 pointer-events-none"
                      style={{
                        opacity: backArch * 0.6,
                        background:
                          'linear-gradient(90deg, rgba(25,15,10,0.28) 0%, rgba(255,255,255,0.4) 45%, rgba(44,36,30,0.12) 100%)',
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>
          ) : safePage === 0 ? (
            <div className="w-full lg:w-1/2 mx-auto">{renderFrontCoverFace(true)}</div>
          ) : safePage === backCoverPage ? (
            <div className="w-full lg:w-1/2 mx-auto">{renderBackCoverFace(true)}</div>
          ) : (
            <div className="relative rounded-3xl bg-[#381E13] p-2 sm:p-3.5 shadow-[0_28px_60px_rgba(32,19,12,0.42)] border border-[#5A3422]">
              <div className="hidden lg:block absolute inset-y-5 left-2 w-3 bg-[repeating-linear-gradient(to_right,#E4D7C0_0px,#FAF6ED_1px,#D2C3AA_2px)] rounded-l-lg z-10 shadow-inner" />
              <div className="hidden lg:block absolute inset-y-5 right-2 w-3 bg-[repeating-linear-gradient(to_left,#E4D7C0_0px,#FAF6ED_1px,#D2C3AA_2px)] rounded-r-lg z-10 shadow-inner" />

              <div className="relative grid grid-cols-1 lg:grid-cols-2 rounded-2xl overflow-hidden bg-[#FCF9F2] min-h-[560px]">
                <div className="relative border-b lg:border-b-0 lg:border-r border-[#E2D6C3]">
                  {renderSpreadSide(baseLeftSpread, 'left', !flipState)}

                  {isTurningBetweenSpreads && flipState.direction === 'next' && (
                    <div
                      className="pointer-events-none absolute inset-0 z-20"
                      style={{
                        opacity: Math.max(0, (flipState.progress - 0.35) * 1.1),
                        background:
                          'linear-gradient(to left, rgba(28,18,12,0.28) 0%, rgba(44,36,30,0.06) 45%, transparent 100%)',
                      }}
                    />
                  )}
                </div>

                <div className="relative">
                  {renderSpreadSide(baseRightSpread, 'right', !flipState)}

                  {isTurningBetweenSpreads && (
                    <div
                      className="pointer-events-none absolute inset-0 z-20"
                      style={{
                        opacity:
                          flipState.direction === 'next'
                            ? Math.max(0, (0.65 - flipState.progress) * 1.1)
                            : Math.max(0, (flipState.progress - 0.35) * 1.1),
                        background:
                          'linear-gradient(to right, rgba(28,18,12,0.3) 0%, rgba(44,36,30,0.08) 45%, transparent 100%)',
                      }}
                    />
                  )}
                </div>

                <div
                  className="hidden lg:block pointer-events-none absolute inset-y-0 left-1/2 -translate-x-1/2 w-16 z-20"
                  style={{
                    background:
                      'linear-gradient(to right, rgba(44,36,30,0) 0%, rgba(44,36,30,0.09) 38%, rgba(24,15,10,0.26) 50%, rgba(44,36,30,0.09) 62%, rgba(44,36,30,0) 100%)',
                  }}
                />

                {isTurningBetweenSpreads && (
                  <div
                    style={{
                      left: flipState.direction === 'next' ? '50%' : '0%',
                      width: '50%',
                      transformOrigin:
                        flipState.direction === 'next' ? 'left center' : 'right center',
                      transform: `rotateY(${turnAngle}deg) skewY(${
                        (flipState.direction === 'next' ? -1 : 1) * archIntensity * 1.35
                      }deg)`,
                    }}
                    className="hidden lg:block book-turning-leaf pointer-events-none absolute top-0 bottom-0 z-30"
                  >
                    <div className="book-leaf-face absolute inset-0 overflow-hidden bg-[#FCF9F2] shadow-[0_18px_42px_rgba(25,15,8,0.34)] border-l border-[#DFD2BC]">
                      {renderSpreadSide(
                        flipState.fromPage,
                        flipState.direction === 'next' ? 'right' : 'left',
                        false
                      )}
                      <div
                        className="absolute inset-0 pointer-events-none"
                        style={{
                          opacity: 0.25 + archIntensity * 0.75,
                          background:
                            flipState.direction === 'next'
                              ? `linear-gradient(90deg,
                                  rgba(25,15,10,0.28) 0%,
                                  rgba(255,255,255,0.48) ${Math.max(12, 55 - flipState.progress * 38)}%,
                                  rgba(44,36,30,0.16) ${Math.max(25, 76 - flipState.progress * 32)}%,
                                  rgba(255,255,255,0.25) 100%)`
                              : `linear-gradient(270deg,
                                  rgba(25,15,10,0.28) 0%,
                                  rgba(255,255,255,0.48) ${Math.max(12, 55 - flipState.progress * 38)}%,
                                  rgba(44,36,30,0.16) ${Math.max(25, 76 - flipState.progress * 32)}%,
                                  rgba(255,255,255,0.25) 100%)`,
                        }}
                      />
                    </div>

                    <div className="book-leaf-face book-leaf-back absolute inset-0 overflow-hidden bg-[#FCF9F2] shadow-[0_18px_42px_rgba(25,15,8,0.34)] border-r border-[#DFD2BC]">
                      {renderSpreadSide(
                        flipState.toPage,
                        flipState.direction === 'next' ? 'left' : 'right',
                        false
                      )}
                      <div
                        className="absolute inset-0 pointer-events-none"
                        style={{
                          opacity: 0.25 + archIntensity * 0.75,
                          background:
                            flipState.direction === 'next'
                              ? `linear-gradient(270deg,
                                  rgba(25,15,10,0.26) 0%,
                                  rgba(255,255,255,0.46) ${Math.min(88, 22 + flipState.progress * 42)}%,
                                  rgba(44,36,30,0.14) ${Math.min(96, 44 + flipState.progress * 38)}%,
                                  rgba(255,255,255,0.2) 100%)`
                              : `linear-gradient(90deg,
                                  rgba(25,15,10,0.26) 0%,
                                  rgba(255,255,255,0.46) ${Math.min(88, 22 + flipState.progress * 42)}%,
                                  rgba(44,36,30,0.14) ${Math.min(96, 44 + flipState.progress * 38)}%,
                                  rgba(255,255,255,0.2) 100%)`,
                        }}
                      />
                    </div>
                  </div>
                )}

                {!flipState && (
                  <button
                    type="button"
                    onMouseEnter={() => setCornerHover('left')}
                    onMouseLeave={() => setCornerHover(null)}
                    onClick={() => triggerFlip(safePage - 1)}
                    title={
                      safePage === 1
                        ? 'Tutup ke Sampul Depan'
                        : 'Klik untuk membalik ke halaman sebelumnya'
                    }
                    style={{
                      width: cornerHover === 'left' ? '82px' : '54px',
                      height: cornerHover === 'left' ? '82px' : '54px',
                      background:
                        'linear-gradient(45deg, #E5D7C1 0%, #EFE5D3 44%, #FFFDF8 50%, rgba(44,36,30,0.16) 52%, transparent 56%)',
                      boxShadow:
                        cornerHover === 'left'
                          ? '6px -6px 14px rgba(44,36,30,0.18)'
                          : '2px -2px 6px rgba(44,36,30,0.08)',
                    }}
                    className="hidden lg:flex items-end justify-start p-2.5 absolute bottom-0 left-0 z-30 rounded-tr-xl transition-all duration-300 cursor-pointer"
                  >
                    <ChevronLeft className="w-3.5 h-3.5 text-[#8B3A1E]" />
                  </button>
                )}

                {!flipState && (
                  <button
                    type="button"
                    onMouseEnter={() => setCornerHover('right')}
                    onMouseLeave={() => setCornerHover(null)}
                    onClick={() => triggerFlip(safePage + 1)}
                    title={
                      safePage === backCoverPage - 1
                        ? 'Tutup ke Sampul Belakang'
                        : 'Klik untuk membalik ke halaman berikutnya'
                    }
                    style={{
                      width: cornerHover === 'right' ? '82px' : '54px',
                      height: cornerHover === 'right' ? '82px' : '54px',
                      background:
                        'linear-gradient(315deg, #E5D7C1 0%, #EFE5D3 44%, #FFFDF8 50%, rgba(44,36,30,0.16) 52%, transparent 56%)',
                      boxShadow:
                        cornerHover === 'right'
                          ? '-6px -6px 14px rgba(44,36,30,0.18)'
                          : '-2px -2px 6px rgba(44,36,30,0.08)',
                    }}
                    className="hidden lg:flex items-end justify-end p-2.5 absolute bottom-0 right-0 z-30 rounded-tl-xl transition-all duration-300 cursor-pointer"
                  >
                    <ChevronRight className="w-3.5 h-3.5 text-[#8B3A1E]" />
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
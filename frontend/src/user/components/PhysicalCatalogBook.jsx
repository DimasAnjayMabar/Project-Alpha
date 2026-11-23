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
  ExternalLink,
  Store,
  User,
} from 'lucide-react';
import FadeIn from '../../components/FadeIn';
import ProductArtwork from './ProductArtwork';
import {
  formatRupiah,
  buildWhatsAppUrl,
  buildProductOrderWaUrl,
} from '../utils/helpers';

function InstagramIcon({ className = 'w-4 h-4' }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
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
      if (
        typeof window !== 'undefined' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches
      ) {
        setEditingWa(false);
        setCornerHover(null);
        onChangeBookPage(clamped);
        return;
      }
      const direction = clamped > safePage ? 'next' : 'prev';
      animatePaperFlip(direction, safePage, clamped, 0, true);
    },
    [safePage, backCoverPage, flipState, animatePaperFlip, onChangeBookPage]
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
  const minShopPrice =
    products.length > 0 ? Math.min(...products.map((p) => Number(p.price) || 0)) : 0;

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
      className="group relative h-full min-h-[560px] rounded-r-lg rounded-l-sm bg-[#1F1814] text-[#F5F1E8] p-6 sm:p-10 border border-[#C4A46B]/40 shadow-[14px_18px_38px_rgba(24,18,14,0.34)] cursor-pointer overflow-hidden flex flex-col justify-between"
    >
      <div className="absolute inset-y-0 left-0 w-6 bg-black/35 border-r border-[#C4A46B]/20 pointer-events-none" />
      <div className="absolute inset-y-3 right-0 w-2.5 bg-[repeating-linear-gradient(to_left,#E6DEC8_0px,#FAF8F3_1px,#D4C8B2_2px)] rounded-r-sm opacity-95 pointer-events-none" />

      <div className="relative ml-4 flex-1 border border-[#C4A46B]/35 rounded-sm p-6 sm:p-8 flex flex-col justify-between">
        <div className="text-center space-y-2.5">
          <span className="inline-block text-[13px] font-medium text-[#C4A46B]">
            Katalog Resmi Sanggar · Kabupaten Trenggalek
          </span>
          <h3 className="font-serif font-normal text-2xl sm:text-3xl text-[#F5F1E8] tracking-[-0.02em] leading-snug pt-1">
            {shop.name}
          </h3>
          <p className="text-[14px] text-[#B5ACA2] max-w-sm mx-auto leading-relaxed">
            {shop.address}
          </p>
        </div>

        <div className="my-5 mx-auto w-56 sm:w-64 aspect-[4/3] rounded-sm overflow-hidden border border-[#C4A46B]/35 bg-[#1B1714]">
          {leadProduct && (
            <ProductArtwork
              product={leadProduct}
              imageUrl={leadProduct.primaryImageUrl}
              size={320}
              className="w-full h-full"
            />
          )}
        </div>

        <div className="text-center space-y-3.5">
          {account && (
            <p className="text-[13px] text-[#B5ACA2]">
              Pengelola sanggar:{' '}
              <span className="font-medium text-[#F5F1E8]">{account.display_name}</span>
            </p>
          )}
          <p className="text-[14px] text-[#F5F1E8]/90 font-serif italic tabular-nums">
            {products.length} koleksi aktif
            {products.length > 0 && ` · Mulai ${formatRupiah(minShopPrice)}`}
          </p>
          <div className="inline-flex items-center justify-center gap-2 min-h-[44px] px-5 py-2.5 rounded-md bg-[#FCFBF8] group-hover:bg-[#EFEAE0] text-[#1C1917] text-[14px] font-medium transition-colors">
            <BookOpen className="w-4 h-4 text-[#7C3219]" />
            <span>Buka Buku Katalog</span>
          </div>
        </div>
      </div>

      {interactive && (
        <div
          style={{
            background:
              'linear-gradient(315deg, #D9CBB4 0%, #EFE6D5 44%, #FAF8F3 50%, rgba(0,0,0,0.3) 53%, transparent 58%)',
          }}
          className="w-11 h-11 absolute bottom-0 right-0 opacity-85 group-hover:w-14 group-hover:h-14 transition-all pointer-events-none"
        />
      )}
    </div>
  );

  const renderBackCoverFace = (interactive = true) => {
    const lastProduct = products[products.length - 1] || leadProduct;
    return (
      <div className="group relative h-full min-h-[560px] rounded-l-lg rounded-r-sm bg-[#1F1814] text-[#F5F1E8] p-6 sm:p-10 border border-[#C4A46B]/40 shadow-[-14px_18px_38px_rgba(24,18,14,0.34)] overflow-hidden flex flex-col justify-between cursor-pointer">
        <div className="absolute inset-y-0 right-0 w-6 bg-black/35 border-l border-[#C4A46B]/20 pointer-events-none" />
        <div className="absolute inset-y-3 left-0 w-2.5 bg-[repeating-linear-gradient(to_right,#E6DEC8_0px,#FAF8F3_1px,#D4C8B2_2px)] rounded-l-sm opacity-95 pointer-events-none" />

        <div className="relative mr-4 flex-1 border border-[#C4A46B]/35 rounded-sm p-6 sm:p-8 text-center flex flex-col justify-between">
          <div className="space-y-2">
            <span className="inline-block text-[13px] font-medium text-[#C4A46B]">
              Sampul Penutup Katalog
            </span>
            <h3 className="font-serif font-normal text-2xl sm:text-3xl text-[#F5F1E8] pt-1">
              {shop.name}
            </h3>
            <p className="text-[14px] text-[#B5ACA2]">{shop.address}</p>
          </div>

          <div className="my-4 space-y-4">
            {lastProduct && (
              <div className="mx-auto w-28 aspect-[4/3] rounded-sm overflow-hidden border border-[#C4A46B]/35 bg-[#1B1714]">
                <ProductArtwork
                  product={lastProduct}
                  imageUrl={lastProduct.primaryImageUrl}
                  size={180}
                  className="w-full h-full"
                />
              </div>
            )}

            <p className="text-[14px] font-serif text-[#F5F1E8]/85 leading-relaxed max-w-md mx-auto">
              {shop.description}
            </p>

            <div className="flex flex-wrap justify-center gap-2.5">
              <a
                href={buildWhatsAppUrl(
                  shopWa,
                  `Halo *${shop.name}*, saya telah membaca buku katalog Anda di *Batik Wicara Trenggalek* dan ingin memesan produk Anda.`
                )}
                target="_blank"
                rel="noopener noreferrer"
                className="taste-btn-primary"
              >
                <MessageCircle className="w-4 h-4 shrink-0" />
                <span className="tabular-nums">Pesan via WhatsApp (+{shopWa})</span>
              </a>

              {shop.online_shop && (
                <a
                  href={shop.online_shop}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 min-h-[44px] px-4 py-2 rounded-md border border-white/20 text-[#F5F1E8] hover:bg-white/10 text-[14px] font-medium transition-colors"
                >
                  <Store className="w-4 h-4 text-[#C4A46B]" />
                  <span>Toko Online</span>
                </a>
              )}

              {shop.instagram && (
                <a
                  href={shop.instagram}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 min-h-[44px] px-4 py-2 rounded-md border border-white/20 text-[#F5F1E8] hover:bg-white/10 text-[14px] font-medium transition-colors"
                >
                  <InstagramIcon className="w-4 h-4 text-[#C4A46B]" />
                  <span>Instagram</span>
                </a>
              )}
            </div>
          </div>

          <div className="flex flex-wrap justify-center gap-2.5 pt-2">
            <button
              type="button"
              disabled={!interactive}
              onClick={() => interactive && triggerFlip(backCoverPage - 1)}
              className="inline-flex items-center gap-1.5 min-h-[44px] px-4 py-2 rounded-md border border-white/20 text-[#F5F1E8] hover:bg-white/10 text-[13px] font-medium cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>Halaman Terakhir</span>
            </button>
            <button
              type="button"
              disabled={!interactive}
              onClick={() => interactive && triggerFlip(0)}
              className="inline-flex items-center justify-center min-h-[44px] px-4 py-2 rounded-md bg-[#FCFBF8] hover:bg-[#EFEAE0] text-[#1C1917] text-[13px] font-medium cursor-pointer"
            >
              Tutup ke Sampul Depan
            </button>
          </div>
        </div>

        {interactive && (
          <div
            style={{
              background:
                'linear-gradient(45deg, #D9CBB4 0%, #EFE6D5 44%, #FAF8F3 50%, rgba(0,0,0,0.3) 53%, transparent 58%)',
            }}
            className="w-11 h-11 absolute bottom-0 left-0 opacity-85 group-hover:w-14 group-hover:h-14 transition-all pointer-events-none"
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
      <div className="space-y-2.5">
        <div
          className={`relative ${aspectClass} rounded-md overflow-hidden border border-[#1C1917]/12 bg-[#EFEAE0]`}
        >
          <ProductArtwork
            product={prod}
            imageUrl={currentImage?.image_url || prod.primaryImageUrl}
            size={480}
            className="w-full h-full"
          />
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
                aria-label={`Lihat foto ${idx + 1} untuk ${prod.name}`}
                className={`w-12 h-10 rounded-sm overflow-hidden border transition-opacity cursor-pointer ${
                  idx === selectedIdx
                    ? 'border-[#7C3219] ring-1 ring-[#7C3219]'
                    : 'border-[#1C1917]/15 opacity-70 hover:opacity-100'
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
            <span className="text-[13px] text-[#575049] ml-auto tabular-nums">
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
        className={`space-y-4 ${
          isHighlighted ? 'pt-3 border-t-2 border-[#7C3219]' : ''
        }`}
      >
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-[13px] font-medium text-[#7C3219]">
            Koleksi #{idxInShop + 1} dari {products.length} · {prod.category.name}
          </span>
          <span className="text-[15px] font-semibold text-[#1C1917] tabular-nums">
            {formatRupiah(prod.price)}
          </span>
        </div>

        {renderProductMediaGallery(prod, 'aspect-[16/10]', interactive)}

        <div className="space-y-1.5">
          <h4 className="font-serif text-[22px] font-normal text-[#1C1917] leading-snug">
            {prod.name}
          </h4>
          <p className="text-[14px] font-serif italic text-[#575049] line-clamp-2 leading-relaxed">
            “{prod.description}”
          </p>
        </div>

        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 py-2.5 border-y border-[#1C1917]/12 text-[13px]">
          {prod.formattedAttributes.slice(0, 4).map((attr) => (
            <div key={attr.name} className="min-w-0">
              <dt className="text-[#575049] truncate">{attr.label}</dt>
              <dd className="font-medium text-[#1C1917] truncate">{attr.displayValue}</dd>
            </div>
          ))}
        </dl>

        <div className="grid grid-cols-2 gap-2.5 pt-1">
          <button
            type="button"
            disabled={!interactive}
            onClick={() => interactive && onTryIn3D(prod.id)}
            className="taste-btn-secondary w-full"
          >
            Simulasi 3D
          </button>
          <a
            href={productWaHref}
            target="_blank"
            rel="noopener noreferrer"
            className="taste-btn-primary w-full"
          >
            <MessageCircle className="w-4 h-4 shrink-0" />
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
          <div className="h-full p-6 sm:p-8 lg:pr-11 flex flex-col justify-between space-y-4 paper-surface">
            <div className="space-y-4">
              <div className="flex items-center justify-between text-[13px] font-serif italic text-[#7C3219] border-b border-[#1C1917]/12 pb-2">
                <span>Profil Sanggar &amp; Pengelola</span>
                <span className="tabular-nums">Halaman 1</span>
              </div>

              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[13px] font-medium text-[#7C3219]">
                    Sentra Batik Trenggalek
                  </span>

                  {account && (
                    <span className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[#575049]">
                      {account.profile ? (
                        <img
                          src={account.profile}
                          alt={account.display_name}
                          className="w-4 h-4 rounded-full object-cover"
                        />
                      ) : (
                        <User className="w-3.5 h-3.5 text-[#7C3219]" />
                      )}
                      <span>{account.display_name}</span>
                    </span>
                  )}
                </div>

                <h3 className="font-serif font-normal text-2xl sm:text-3xl text-[#1C1917] leading-tight">
                  {shop.name}
                </h3>

                <p className="text-[14px] text-[#575049] leading-relaxed">{shop.description}</p>

                <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-[13px] text-[#575049]">
                  <span className="flex items-start gap-1.5">
                    <MapPin className="w-4 h-4 text-[#7C3219] shrink-0 mt-0.5" />
                    <span>{shop.address}</span>
                  </span>
                  {shop.gmaps && (
                    <a
                      href={shop.gmaps}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="taste-link text-[13px] font-medium text-[#7C3219] shrink-0"
                    >
                      <span>Google Maps</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  )}
                </div>
              </div>

              <div className="py-3 border-y border-[#1C1917]/12 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="text-[13px] font-medium text-[#7C3219] block">
                      WhatsApp pemesanan resmi
                    </span>
                    {interactive && editingWa ? (
                      <div className="flex items-center gap-1.5 mt-1">
                        <input
                          type="text"
                          value={waInput}
                          onChange={(e) => setWaInput(e.target.value)}
                          aria-label="Nomor WhatsApp Sanggar"
                          className="min-h-[38px] px-2.5 py-1 rounded-md bg-[#FCFBF8] border border-[#1C1917]/25 text-[13px] font-mono text-[#1C1917]"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            if (waInput.trim()) onUpdateShopWa(shop.id, waInput.trim());
                            setEditingWa(false);
                          }}
                          aria-label="Simpan nomor WhatsApp"
                          className="min-h-[38px] min-w-[38px] inline-flex items-center justify-center rounded-md bg-[#7C3219] text-white cursor-pointer"
                        >
                          <Check className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <span className="text-[14px] font-mono font-medium text-[#1C1917] flex items-center gap-1.5 mt-0.5 tabular-nums">
                        <Phone className="w-3.5 h-3.5 text-[#7C3219]" />+{shopWa}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    {interactive && !editingWa && (
                      <button
                        type="button"
                        onClick={() => {
                          setWaInput(shopWa);
                          setEditingWa(true);
                        }}
                        className="inline-flex items-center gap-1 min-h-[38px] px-3 py-1.5 rounded-md bg-[#FCFBF8] border border-[#1C1917]/20 text-[13px] font-medium text-[#575049] hover:text-[#1C1917] cursor-pointer"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        <span>Ubah WA</span>
                      </button>
                    )}
                    <a
                      href={buildWhatsAppUrl(
                        shopWa,
                        `Halo *${shop.name}*, saya membaca buku katalog Anda di *Batik Wicara Trenggalek* dan ingin berkonsultasi pemesanan.`
                      )}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center justify-center min-h-[38px] px-3.5 py-1.5 rounded-md bg-[#7C3219] hover:bg-[#632612] text-white text-[13px] font-medium transition-colors"
                    >
                      Chat WA
                    </a>
                  </div>
                </div>

                {(shop.online_shop || shop.instagram) && (
                  <div className="flex flex-wrap gap-3 pt-2">
                    {shop.online_shop && (
                      <a
                        href={shop.online_shop}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="taste-link text-[13px] font-medium text-[#1C1917]"
                      >
                        <Store className="w-3.5 h-3.5 text-[#7C3219]" />
                        <span>Toko Online</span>
                      </a>
                    )}
                    {shop.instagram && (
                      <a
                        href={shop.instagram}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="taste-link text-[13px] font-medium text-[#1C1917]"
                      >
                        <InstagramIcon className="w-3.5 h-3.5 text-[#7C3219]" />
                        <span>Instagram Sanggar</span>
                      </a>
                    )}
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <span className="text-[13px] font-medium text-[#7C3219] block">
                  Daftar isi koleksi ({products.length} karya aktif)
                </span>
                <div className="divide-y divide-[#1C1917]/10 border-t border-b border-[#1C1917]/12">
                  {products.map((p, idx) => (
                    <button
                      key={p.id}
                      type="button"
                      disabled={!interactive || idx === 0}
                      onClick={() => interactive && idx > 0 && triggerFlip(idx + 1)}
                      className={`w-full py-2.5 text-left flex items-center justify-between gap-3 transition-colors ${
                        idx === 0
                          ? 'text-[#7C3219]'
                          : 'hover:bg-[#EFEAE0]/60 text-[#1C1917] cursor-pointer'
                      }`}
                    >
                      <div className="min-w-0">
                        <span className="font-serif font-medium text-[14px] block truncate">
                          0{idx + 1}. {p.name}
                        </span>
                        <span className="text-[13px] text-[#575049] tabular-nums">
                          {p.category.name} · {formatRupiah(p.price)}
                        </span>
                      </div>
                      <span className="shrink-0 text-[13px] font-medium text-[#7C3219] tabular-nums">
                        {idx === 0 ? 'Hal. 2' : `Hal. ${idx * 2 + 1} →`}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="text-[13px] font-serif italic text-[#575049] flex items-center justify-between pt-2.5 border-t border-[#1C1917]/12 tabular-nums">
              <span>{shop.name}</span>
              <span>Halaman 1 dari {Math.max(2, products.length * 2)}</span>
            </div>
          </div>
        );
      }

      return (
        <div className="h-full p-6 sm:p-8 lg:pl-11 flex flex-col justify-between space-y-4 paper-surface">
          <div className="space-y-4">
            <div className="flex items-center justify-between text-[13px] font-serif italic text-[#7C3219] border-b border-[#1C1917]/12 pb-2">
              <span>Lembar Koleksi Utama Sanggar</span>
              <span className="tabular-nums">Halaman 2</span>
            </div>
            {currentProd ? (
              renderCompactProductCard(currentProd, 0, interactive)
            ) : (
              <div className="p-8 text-center text-[14px] text-[#575049]">
                Belum ada produk aktif pada sanggar ini.
              </div>
            )}
          </div>

          <div className="text-[13px] font-serif italic text-[#575049] flex items-center justify-between pt-2.5 border-t border-[#1C1917]/12 tabular-nums">
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
        <div className="h-full p-6 sm:p-8 lg:pr-11 flex flex-col justify-between space-y-4 paper-surface">
          <div className="space-y-4">
            <div className="flex items-center justify-between text-[13px] font-serif italic text-[#7C3219] border-b border-[#1C1917]/12 pb-2">
              <span>
                {shop.name} · Koleksi #0{productIndexForPage + 1}
              </span>
              <span className="tabular-nums">Halaman {leftPageNum}</span>
            </div>

            <div className={isHighlighted ? 'ring-2 ring-[#7C3219] rounded-md' : ''}>
              {renderProductMediaGallery(currentProd, 'aspect-[4/3]', interactive)}
            </div>

            <div className="space-y-1.5">
              <span className="text-[13px] font-medium text-[#7C3219] block">
                Deskripsi &amp; filosofi motif
              </span>
              <p className="text-[14px] sm:text-[15px] font-serif italic text-[#1C1917]/85 leading-relaxed">
                “{currentProd.description}”
              </p>
            </div>
          </div>

          <div className="text-[13px] font-serif italic text-[#575049] flex items-center justify-between pt-2.5 border-t border-[#1C1917]/12 tabular-nums">
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
      <div className="h-full p-6 sm:p-8 lg:pl-11 flex flex-col justify-between space-y-4 paper-surface">
        <div className="space-y-4">
          <div className="flex items-center justify-between text-[13px] font-serif italic text-[#7C3219] border-b border-[#1C1917]/12 pb-2">
            <span>Spesifikasi &amp; Pemesanan</span>
            <span className="tabular-nums">Halaman {rightPageNum}</span>
          </div>

          <div className="space-y-1.5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="text-[13px] font-medium text-[#7C3219]">
                {currentProd.category.name}
              </span>
              <span className="text-lg font-semibold text-[#1C1917] tabular-nums">
                {formatRupiah(currentProd.price)}
              </span>
            </div>
            <h3 className="font-serif font-normal text-2xl sm:text-3xl text-[#1C1917] leading-tight">
              {currentProd.name}
            </h3>
            <p className="text-[13px] text-[#575049]">Karya {shop.name}</p>
          </div>

          <div className="space-y-2 pt-1">
            <span className="text-[13px] font-medium text-[#7C3219] block">
              Spesifikasi produk
            </span>
            <dl className="border-t border-b border-[#1C1917]/12 divide-y divide-[#1C1917]/10">
              {currentProd.formattedAttributes.map((attr) => (
                <div
                  key={attr.name}
                  className="py-2.5 flex items-center justify-between gap-3 text-[13px]"
                >
                  <dt className="text-[#575049]">
                    {attr.label}
                    {attr.required && <span className="text-[#7C3219] ml-0.5">*</span>}
                  </dt>
                  <dd className="font-medium text-[#1C1917] text-right">{attr.displayValue}</dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="space-y-2.5 pt-1">
            <a
              href={detailWaHref}
              target="_blank"
              rel="noopener noreferrer"
              className="taste-btn-primary w-full"
            >
              <MessageCircle className="w-4 h-4 shrink-0" />
              <span>Pesan Produk Ini via WhatsApp</span>
            </a>

            <div className={`grid ${currentProd.product_link ? 'grid-cols-2' : 'grid-cols-1'} gap-2`}>
              <button
                type="button"
                disabled={!interactive}
                onClick={() => interactive && onTryIn3D(currentProd.id)}
                className="taste-btn-secondary w-full"
              >
                Coba di Studio 3D
              </button>

              {currentProd.product_link && (
                <a
                  href={currentProd.product_link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="taste-btn-dark w-full"
                >
                  <Store className="w-4 h-4 text-[#C4A46B] shrink-0" />
                  <span>Marketplace</span>
                  <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                </a>
              )}
            </div>
          </div>
        </div>

        <div className="text-[13px] font-serif italic text-[#575049] flex items-center justify-between pt-2.5 border-t border-[#1C1917]/12 tabular-nums">
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
      className="py-16 lg:py-24 bg-[#EFEAE0] border-t border-[#1C1917]/12 overflow-hidden"
    >
      <style>{`
        .paper-surface {
          background-color: #FAF8F3;
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

      <div className="taste-wrap">
        <FadeIn>
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-6">
          <div>
            <span className="text-[13px] font-medium text-[#7C3219] block mb-2">
              Buku katalog per sanggar · Pemesanan langsung WhatsApp
            </span>
            <h2 className="font-serif font-normal text-[clamp(1.85rem,3vw,2.65rem)] leading-[1.12] tracking-[-0.025em] text-[#1C1917]">
              Buku Katalog — {shop.name}
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              disabled={safePage === 0 || Boolean(flipState)}
              onClick={() => triggerFlip(safePage - 1)}
              className="taste-btn-secondary whitespace-nowrap shrink-0"
            >
              <ChevronLeft className="w-4 h-4 shrink-0" />
              <span>Sebelumnya</span>
            </button>

            <span className="min-h-[44px] px-3.5 inline-flex items-center justify-center rounded-md bg-[#FCFBF8] border border-[#1C1917]/15 text-[13px] font-medium text-[#1C1917] tabular-nums whitespace-nowrap shrink-0">
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
              className="taste-btn-secondary whitespace-nowrap shrink-0"
            >
              <span>Berikutnya</span>
              <ChevronRight className="w-4 h-4 shrink-0" />
            </button>
          </div>
        </div>

        {/* Pilihan Buku Per Sanggar UMKM */}
        <div className="mb-5">
          <span className="text-[13px] font-medium text-[#575049] block mb-2.5">
            Pilih sanggar UMKM ({shopBooks.length} sanggar aktif)
          </span>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
            {shopBooks.map((bk, idx) => {
              const isSelectedBook = bk.shop.id === shop.id;
              return (
                <button
                  key={bk.shop.id}
                  type="button"
                  onClick={() => handleSwitchShopBook(bk.shop.id)}
                  className={`min-h-[54px] px-3.5 py-2.5 rounded-md border text-left transition-colors flex items-center gap-3 cursor-pointer ${
                    isSelectedBook
                      ? 'bg-[#1B1714] text-[#F5F1E8] border-[#1B1714]'
                      : 'bg-[#FCFBF8] hover:bg-white text-[#1C1917] border-[#1C1917]/15'
                  }`}
                >
                  <span
                    className={`font-mono text-[13px] tabular-nums shrink-0 ${
                      isSelectedBook ? 'text-[#C4A46B]' : 'text-[#7C3219]'
                    }`}
                  >
                    0{idx + 1}
                  </span>
                  <div className="min-w-0">
                    <span className="block text-[14px] font-medium truncate">{bk.shop.name}</span>
                    <span
                      className={`block text-[13px] truncate ${
                        isSelectedBook ? 'text-[#B5ACA2]' : 'text-[#575049]'
                      }`}
                    >
                      {bk.products.length} koleksi
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Daftar Halaman Buku */}
        <div className="flex flex-wrap items-center gap-1.5 mb-6 pb-3 border-b border-[#1C1917]/12">
          <button
            type="button"
            disabled={Boolean(flipState)}
            onClick={() => triggerFlip(0)}
            className={`min-h-[38px] px-3.5 py-1.5 rounded-md text-[13px] font-medium border transition-colors cursor-pointer ${
              safePage === 0
                ? 'bg-[#7C3219] text-white border-[#7C3219]'
                : 'bg-[#FCFBF8] text-[#575049] border-[#1C1917]/15 hover:text-[#1C1917]'
            }`}
          >
            Sampul Depan
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
                className={`min-h-[38px] px-3.5 py-1.5 rounded-md text-[13px] font-medium border transition-colors cursor-pointer ${
                  isActive
                    ? 'bg-[#7C3219] text-white border-[#7C3219]'
                    : 'bg-[#FCFBF8] text-[#575049] border-[#1C1917]/15 hover:text-[#1C1917]'
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
            className={`min-h-[38px] px-3.5 py-1.5 rounded-md text-[13px] font-medium border transition-colors cursor-pointer ${
              safePage === backCoverPage
                ? 'bg-[#7C3219] text-white border-[#7C3219]'
                : 'bg-[#FCFBF8] text-[#575049] border-[#1C1917]/15 hover:text-[#1C1917]'
            }`}
          >
            Sampul Belakang
          </button>
        </div>
        </FadeIn>

        {/* Panggung 3D Buku Fisik */}
        <FadeIn variant="scale" delay={140}>
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

                <div className="relative rounded-lg lg:rounded-l-none lg:rounded-r-lg overflow-hidden bg-[#FAF8F3] border border-[#1C1917]/20 shadow-[0_20px_45px_rgba(24,18,14,0.28)]">
                  {renderSpreadSide(frontSpreadTarget, 'right', false)}
                  <div
                    className="pointer-events-none absolute inset-0 z-20"
                    style={{
                      opacity: Math.max(0, (1 - frontOpenAmount) * 0.55),
                      background:
                        'linear-gradient(to right, rgba(24,14,8,0.45) 0%, rgba(24,14,8,0.16) 55%, transparent 100%)',
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
                      className="absolute inset-0 rounded-r-lg rounded-l-sm pointer-events-none"
                      style={{
                        opacity: frontArch * 0.65,
                        background:
                          'linear-gradient(90deg, rgba(0,0,0,0.28) 0%, rgba(255,245,220,0.28) 48%, rgba(0,0,0,0.18) 100%)',
                      }}
                    />
                  </div>

                  <div className="book-leaf-face book-leaf-back absolute inset-0 rounded-l-lg overflow-hidden bg-[#FAF8F3] border border-[#1C1917]/20 shadow-[0_18px_36px_rgba(24,18,14,0.28)]">
                    {renderSpreadSide(frontSpreadTarget, 'left', false)}
                    <div
                      className="absolute inset-0 pointer-events-none"
                      style={{
                        opacity: frontArch * 0.6,
                        background:
                          'linear-gradient(270deg, rgba(25,15,10,0.25) 0%, rgba(255,255,255,0.35) 45%, rgba(44,36,30,0.12) 100%)',
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
                <div className="relative rounded-lg lg:rounded-r-none lg:rounded-l-lg overflow-hidden bg-[#FAF8F3] border border-[#1C1917]/20 shadow-[0_20px_45px_rgba(24,18,14,0.28)]">
                  {renderSpreadSide(backSpreadTarget, 'left', false)}
                  <div
                    className="pointer-events-none absolute inset-0 z-20"
                    style={{
                      opacity: Math.max(0, backClosedAmount * 0.55),
                      background:
                        'linear-gradient(to left, rgba(24,14,8,0.45) 0%, rgba(24,14,8,0.16) 55%, transparent 100%)',
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
                      className="absolute inset-0 rounded-l-lg rounded-r-sm pointer-events-none"
                      style={{
                        opacity: backArch * 0.65,
                        background:
                          'linear-gradient(270deg, rgba(0,0,0,0.28) 0%, rgba(255,245,220,0.28) 48%, rgba(0,0,0,0.18) 100%)',
                      }}
                    />
                  </div>

                  <div className="book-leaf-face book-leaf-back absolute inset-0 rounded-r-lg overflow-hidden bg-[#FAF8F3] border border-[#1C1917]/20 shadow-[0_18px_36px_rgba(24,18,14,0.28)]">
                    {renderSpreadSide(backSpreadTarget, 'right', false)}
                    <div
                      className="absolute inset-0 pointer-events-none"
                      style={{
                        opacity: backArch * 0.6,
                        background:
                          'linear-gradient(90deg, rgba(25,15,10,0.25) 0%, rgba(255,255,255,0.35) 45%, rgba(44,36,30,0.12) 100%)',
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
            <div className="relative rounded-lg bg-[#2B201A] p-2 sm:p-3 shadow-[0_24px_54px_rgba(24,18,14,0.34)] border border-[#1C1917]/25">
              <div className="hidden lg:block absolute inset-y-4 left-2 w-2.5 bg-[repeating-linear-gradient(to_right,#E4DCC9_0px,#FAF8F3_1px,#D2C6B0_2px)] rounded-l-sm z-10 shadow-inner" />
              <div className="hidden lg:block absolute inset-y-4 right-2 w-2.5 bg-[repeating-linear-gradient(to_left,#E4DCC9_0px,#FAF8F3_1px,#D2C6B0_2px)] rounded-r-sm z-10 shadow-inner" />

              <div className="relative grid grid-cols-1 lg:grid-cols-2 rounded-md overflow-hidden bg-[#FAF8F3] min-h-[560px]">
                <div className="relative border-b lg:border-b-0 lg:border-r border-[#1C1917]/12">
                  {renderSpreadSide(baseLeftSpread, 'left', !flipState)}

                  {isTurningBetweenSpreads && flipState.direction === 'next' && (
                    <div
                      className="pointer-events-none absolute inset-0 z-20"
                      style={{
                        opacity: Math.max(0, (flipState.progress - 0.35) * 1.1),
                        background:
                          'linear-gradient(to left, rgba(28,18,12,0.25) 0%, rgba(44,36,30,0.06) 45%, transparent 100%)',
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
                          'linear-gradient(to right, rgba(28,18,12,0.28) 0%, rgba(44,36,30,0.08) 45%, transparent 100%)',
                      }}
                    />
                  )}
                </div>

                <div
                  className="hidden lg:block pointer-events-none absolute inset-y-0 left-1/2 -translate-x-1/2 w-14 z-20"
                  style={{
                    background:
                      'linear-gradient(to right, rgba(28,25,23,0) 0%, rgba(28,25,23,0.07) 38%, rgba(24,15,10,0.22) 50%, rgba(28,25,23,0.07) 62%, rgba(28,25,23,0) 100%)',
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
                    <div className="book-leaf-face absolute inset-0 overflow-hidden bg-[#FAF8F3] shadow-[0_18px_40px_rgba(24,18,14,0.3)] border-l border-[#1C1917]/15">
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
                                  rgba(25,15,10,0.25) 0%,
                                  rgba(255,255,255,0.45) ${Math.max(12, 55 - flipState.progress * 38)}%,
                                  rgba(44,36,30,0.14) ${Math.max(25, 76 - flipState.progress * 32)}%,
                                  rgba(255,255,255,0.22) 100%)`
                              : `linear-gradient(270deg,
                                  rgba(25,15,10,0.25) 0%,
                                  rgba(255,255,255,0.45) ${Math.max(12, 55 - flipState.progress * 38)}%,
                                  rgba(44,36,30,0.14) ${Math.max(25, 76 - flipState.progress * 32)}%,
                                  rgba(255,255,255,0.22) 100%)`,
                        }}
                      />
                    </div>

                    <div className="book-leaf-face book-leaf-back absolute inset-0 overflow-hidden bg-[#FAF8F3] shadow-[0_18px_40px_rgba(24,18,14,0.3)] border-r border-[#1C1917]/15">
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
                                  rgba(25,15,10,0.24) 0%,
                                  rgba(255,255,255,0.42) ${Math.min(88, 22 + flipState.progress * 42)}%,
                                  rgba(44,36,30,0.12) ${Math.min(96, 44 + flipState.progress * 38)}%,
                                  rgba(255,255,255,0.18) 100%)`
                              : `linear-gradient(90deg,
                                  rgba(25,15,10,0.24) 0%,
                                  rgba(255,255,255,0.42) ${Math.min(88, 22 + flipState.progress * 42)}%,
                                  rgba(44,36,30,0.12) ${Math.min(96, 44 + flipState.progress * 38)}%,
                                  rgba(255,255,255,0.18) 100%)`,
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
                    aria-label={
                      safePage === 1 ? 'Tutup ke Sampul Depan' : 'Halaman sebelumnya'
                    }
                    title={
                      safePage === 1
                        ? 'Tutup ke Sampul Depan'
                        : 'Klik untuk membalik ke halaman sebelumnya'
                    }
                    style={{
                      width: cornerHover === 'left' ? '82px' : '54px',
                      height: cornerHover === 'left' ? '82px' : '54px',
                      background:
                        'linear-gradient(45deg, #E5D7C1 0%, #EFE5D3 44%, #FAF8F3 50%, rgba(28,25,23,0.15) 52%, transparent 56%)',
                      boxShadow:
                        cornerHover === 'left'
                          ? '6px -6px 14px rgba(28,25,23,0.16)'
                          : '2px -2px 6px rgba(28,25,23,0.08)',
                    }}
                    className="hidden lg:flex items-end justify-start p-2.5 absolute bottom-0 left-0 z-30 rounded-tr-md transition-all duration-300 cursor-pointer"
                  >
                    <ChevronLeft className="w-4 h-4 text-[#7C3219]" />
                  </button>
                )}

                {!flipState && (
                  <button
                    type="button"
                    onMouseEnter={() => setCornerHover('right')}
                    onMouseLeave={() => setCornerHover(null)}
                    onClick={() => triggerFlip(safePage + 1)}
                    aria-label={
                      safePage === backCoverPage - 1
                        ? 'Tutup ke Sampul Belakang'
                        : 'Halaman berikutnya'
                    }
                    title={
                      safePage === backCoverPage - 1
                        ? 'Tutup ke Sampul Belakang'
                        : 'Klik untuk membalik ke halaman berikutnya'
                    }
                    style={{
                      width: cornerHover === 'right' ? '82px' : '54px',
                      height: cornerHover === 'right' ? '82px' : '54px',
                      background:
                        'linear-gradient(315deg, #E5D7C1 0%, #EFE5D3 44%, #FAF8F3 50%, rgba(28,25,23,0.15) 52%, transparent 56%)',
                      boxShadow:
                        cornerHover === 'right'
                          ? '-6px -6px 14px rgba(28,25,23,0.16)'
                          : '-2px -2px 6px rgba(28,25,23,0.08)',
                    }}
                    className="hidden lg:flex items-end justify-end p-2.5 absolute bottom-0 right-0 z-30 rounded-tl-md transition-all duration-300 cursor-pointer"
                  >
                    <ChevronRight className="w-4 h-4 text-[#7C3219]" />
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
        </FadeIn>
      </div>
    </section>
  );
}

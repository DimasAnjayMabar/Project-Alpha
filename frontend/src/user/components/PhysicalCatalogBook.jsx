import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  MessageCircle,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  MapPin,
  Phone,
  ExternalLink,
  Store,
  User,
  Clock,
  Calendar,
  X,
} from 'lucide-react';
import FadeIn from '../../components/FadeIn';
import ProductArtwork from './ProductArtwork';
import { useBackendMediaUrl } from '../../utils/useBackendMediaUrl';
import {
  formatRupiah,
  buildWhatsAppUrl,
  buildProductOrderWaUrl,
} from '../utils/helpers';

// Tinggi seragam untuk semua lembar buku di mobile & desktop (tanpa internal scrollbar)
const BOOK_FRAME_HEIGHT = 'h-[560px] sm:h-[580px] lg:h-[clamp(540px,68vh,640px)]';

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

function normalizeSocialUrl(rawValue, baseUrl) {
  const raw = String(rawValue || '').trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return raw;
  const handle = raw.replace(/^@+/, '').replace(/^\/+/, '');
  if (!handle) return '';
  return `${baseUrl.replace(/\/+$/, '')}/${handle}`;
}

function detectMarketplaceLabel(url) {
  const lower = String(url || '').toLowerCase();
  if (lower.includes('shopee')) return 'Shopee';
  if (lower.includes('tokopedia')) return 'Tokopedia';
  if (lower.includes('lazada')) return 'Lazada';
  if (lower.includes('blibli')) return 'Blibli';
  return 'Toko Online';
}

function firstSentence(text, maxLen = 115) {
  const cleaned = String(text || '').replace(/\s+/g, ' ').trim();
  if (!cleaned) return '';
  const match = cleaned.match(/^.+?[.!?](?=\s|$)/);
  const sentence = match ? match[0].trim() : cleaned;
  if (sentence.length <= maxLen) return sentence;
  return `${sentence.slice(0, maxLen - 1).trimEnd()}…`;
}

function splitParagraphs(text) {
  const raw = String(text || '').trim();
  if (!raw) return [];
  const blocks = raw
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  return blocks.length > 0 ? blocks : [raw];
}

function pickKeyAttributes(formattedAttributes = []) {
  const priorityPatterns = [
    /motif/i,
    /teknik|jenis|tipe|proses/i,
    /bahan|material|kain/i,
    /bentuk|berat/i,
  ];
  const chosen = [];
  const usedNames = new Set();

  priorityPatterns.forEach((pattern) => {
    const found = formattedAttributes.find(
      (attr) => !usedNames.has(attr.name) && pattern.test(`${attr.name} ${attr.label}`)
    );
    if (found) {
      chosen.push(found);
      usedNames.add(found.name);
    }
  });

  formattedAttributes.forEach((attr) => {
    if (chosen.length < 4 && !usedNames.has(attr.name)) {
      chosen.push(attr);
      usedNames.add(attr.name);
    }
  });

  return chosen.slice(0, 4);
}

function deriveShopInsights(shop, products) {
  let signatureMotifs = [];
  if (Array.isArray(shop.signature_motifs) && shop.signature_motifs.length > 0) {
    signatureMotifs = shop.signature_motifs
      .slice(0, 3)
      .map((item) => ({
        name: item?.name || item?.title || String(item || ''),
        meaning: item?.meaning || item?.description || '',
        spreadIdx: null,
      }))
      .filter((item) => item.name);
  } else {
    const seen = new Set();
    products.forEach((prod, idx) => {
      if (signatureMotifs.length >= 3) return;
      const motifAttr = (prod.formattedAttributes || []).find((a) =>
        /motif/i.test(`${a.name} ${a.label}`)
      );
      const motifName = String(motifAttr?.displayValue || prod.name || '').trim();
      const key = motifName.toLowerCase();
      if (!motifName || seen.has(key)) return;
      seen.add(key);
      signatureMotifs.push({
        name: motifName,
        meaning:
          firstSentence(prod.description) ||
          `Koleksi ${prod.category?.name || 'batik'} khas ${shop.name}.`,
        spreadIdx: idx + 2,
      });
    });
  }

  let techniques = [];
  if (Array.isArray(shop.techniques) && shop.techniques.length > 0) {
    techniques = shop.techniques.map((t) => String(t).trim()).filter(Boolean);
  } else if (typeof shop.techniques === 'string' && shop.techniques.trim()) {
    techniques = shop.techniques
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
  } else {
    const techSet = new Set();
    products.forEach((prod) => {
      (prod.formattedAttributes || []).forEach((attr) => {
        if (/teknik|jenis|tipe|proses/i.test(`${attr.name} ${attr.label}`)) {
          const val = String(attr.displayValue || '').trim();
          if (val && val !== '-') techSet.add(val);
        }
      });
    });
    techniques = Array.from(techSet);
  }

  let materials = [];
  if (Array.isArray(shop.materials) && shop.materials.length > 0) {
    materials = shop.materials.map((m) => String(m).trim()).filter(Boolean);
  } else if (typeof shop.materials === 'string' && shop.materials.trim()) {
    materials = shop.materials
      .split(',')
      .map((m) => m.trim())
      .filter(Boolean);
  } else {
    const matSet = new Set();
    let usesNaturalDye = false;
    products.forEach((prod) => {
      (prod.formattedAttributes || []).forEach((attr) => {
        if (/bahan|material|kain/i.test(`${attr.name} ${attr.label}`)) {
          const val = String(attr.displayValue || '').trim();
          if (val && val !== '-') matSet.add(val);
        }
        if (/pewarna_alami/i.test(attr.name) && String(attr.displayValue).toLowerCase() === 'ya') {
          usesNaturalDye = true;
        }
      });
    });
    if (usesNaturalDye) matSet.add('Pewarna Alami');
    materials = Array.from(matSet);
  }

  const docPhotos =
    Array.isArray(shop.process_photos) && shop.process_photos.length > 0
      ? shop.process_photos.slice(0, 2).map((url, idx) => ({
          id: `proc-${idx}`,
          imageUrl: typeof url === 'string' ? url : url?.public_url || url?.image_url || '',
          product: products[idx] || products[0] || null,
        }))
      : products.slice(0, 2).map((prod) => ({
          id: prod.id,
          imageUrl: prod.primaryImageUrl,
          product: prod,
        }));

  return { signatureMotifs, techniques, materials, docPhotos };
}

function ShopAvatar({ profileUrl, shopName }) {
  const { src, failed } = useBackendMediaUrl(profileUrl);
  const [errorSrc, setErrorSrc] = useState('');

  if (src && !failed && errorSrc !== src) {
    return (
      <img
        src={src}
        alt={shopName}
        onError={() => setErrorSrc(src)}
        className="w-10 h-10 rounded-full object-cover border border-[#1C1917]/15 shrink-0"
      />
    );
  }
  return (
    <div className="w-10 h-10 rounded-full bg-[#EFEAE0] border border-[#1C1917]/15 text-[#7C3219] flex items-center justify-center shrink-0">
      <Store className="w-4 h-4" />
    </div>
  );
}

function ShopCoverArtwork({ profileUrl, shopName, fallbackProduct, size = 320 }) {
  const { src, failed } = useBackendMediaUrl(profileUrl);
  const [errorSrc, setErrorSrc] = useState('');

  if (src && !failed && errorSrc !== src) {
    return (
      <img
        src={src}
        alt={shopName}
        onError={() => setErrorSrc(src)}
        className="w-full h-full object-contain p-2"
      />
    );
  }

  if (fallbackProduct) {
    return (
      <ProductArtwork
        product={fallbackProduct}
        imageUrl={fallbackProduct.primaryImageUrl}
        size={size}
        className="w-full h-full"
      />
    );
  }

  return (
    <img
      src="/favicon.png"
      alt={shopName}
      className="w-full h-full object-contain p-5 opacity-90"
    />
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
}) {
  const [flipState, setFlipState] = useState(null);
  const [cornerHover, setCornerHover] = useState(null);
  const [activeGalleryMap, setActiveGalleryMap] = useState({});
  const [detailModal, setDetailModal] = useState(null);
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(max-width: 1023px)').matches : false
  );

  const bookContainerRef = useRef(null);
  const mobileStageRef = useRef(null);
  const suppressNextClickRef = useRef(false);
  const dragStartRef = useRef({
    active: false,
    startX: 0,
    startY: 0,
    direction: null,
    hasMoved: false,
  });
  const mobileDragRef = useRef({
    active: false,
    startX: 0,
    startY: 0,
    direction: null,
    hasMoved: false,
  });
  const animFrameRef = useRef(null);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const mq = window.matchMedia('(max-width: 1023px)');
    const handleViewportChange = (e) => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }
      setFlipState(null);
      setIsMobile(e.matches);
    };
    mq.addEventListener('change', handleViewportChange);
    return () => mq.removeEventListener('change', handleViewportChange);
  }, []);

  useEffect(() => {
    if (!detailModal) return undefined;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') setDetailModal(null);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [detailModal]);

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
  // Indeks buku terpadu (desktop & mobile):
  // 0 = Sampul Depan
  // 1 = Profil Sanggar (Desktop: Cerita Kiri | Info Praktis Kanan; Mobile: 1 Lembar Ringkas)
  // 2..productCount+1 = Produk #1..#N
  // backCoverPage = productCount + 2 = Sampul Belakang
  const totalBookPages = productCount + 3;
  const backCoverPage = totalBookPages - 1;
  const totalInnerPages = (productCount + 1) * 2;
  const safePage = Math.max(0, Math.min(backCoverPage, bookPageIndex));

  const shop = activeBook?.shop || null;
  const account = activeBook?.account || null;
  const products = useMemo(() => activeBook?.products || [], [activeBook]);

  const animatePaperFlip = useCallback(
    (direction, fromPage, toPage, startProgress = 0, completeTurn = true) => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      setCornerHover(null);

      const targetProgress = completeTurn ? 1 : 0;
      const duration = Math.max(260, Math.abs(targetProgress - startProgress) * 580);
      const startTime = performance.now();

      const step = (now) => {
        const elapsed = now - startTime;
        const rawT = Math.min(1, elapsed / duration);
        const eased =
          rawT < 0.5 ? 4 * rawT * rawT * rawT : 1 - Math.pow(-2 * rawT + 2, 3) / 2;
        const currentProgress = startProgress + (targetProgress - startProgress) * eased;

        if (rawT < 1) {
          setFlipState({
            direction,
            fromPage,
            toPage,
            progress: currentProgress,
            isDragging: false,
          });
          animFrameRef.current = requestAnimationFrame(step);
        } else {
          animFrameRef.current = null;
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
      setDetailModal(null);
      if (clamped === safePage || flipState) return;
      if (
        !isMobile &&
        ((safePage === 0 && clamped === backCoverPage) ||
          (safePage === backCoverPage && clamped === 0))
      ) {
        setCornerHover(null);
        onChangeBookPage(clamped);
        return;
      }
      if (
        typeof window !== 'undefined' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches
      ) {
        setCornerHover(null);
        onChangeBookPage(clamped);
        return;
      }
      const direction = clamped > safePage ? 'next' : 'prev';
      animatePaperFlip(direction, safePage, clamped, 0, true);
    },
    [isMobile, safePage, backCoverPage, flipState, animatePaperFlip, onChangeBookPage]
  );

  const handleSwitchShopBook = (shopId) => {
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    setFlipState(null);
    setCornerHover(null);
    setDetailModal(null);
    onSelectShop(shopId);
    onChangeBookPage(0);
  };

  const insights = useMemo(
    () => (shop ? deriveShopInsights(shop, products) : null),
    [shop, products]
  );

  if (!activeBook || !shop || !insights) return null;

  const shopWa = getEffectiveWa(shop.id, shop.number);
  const leadProduct = products[0] || null;
  const minShopPrice =
    products.length > 0 ? Math.min(...products.map((p) => Number(p.price) || 0)) : 0;

  const instagramUrl = normalizeSocialUrl(shop.instagram, 'https://instagram.com');
  const tiktokUrl = normalizeSocialUrl(shop.tiktok, 'https://tiktok.com/@');
  const facebookUrl = normalizeSocialUrl(shop.facebook, 'https://facebook.com');
  const marketplaceLabel = detectMarketplaceLabel(shop.online_shop);

  const shopWaDirectHref = shopWa
    ? buildWhatsAppUrl(
        shopWa,
        `Halo *${shop.name}*, saya membaca buku katalog Anda di *Batik Wicara Trenggalek* dan ingin berkonsultasi pemesanan.`
      )
    : '';

  // Drag handler Desktop
  const handleBookPointerDown = (e) => {
    if (isMobile || flipState) return;
    suppressNextClickRef.current = false;
    if (e.target.closest('button, a, input, select')) return;

    const rect = bookContainerRef.current?.getBoundingClientRect();
    if (!rect) return;

    const relX = (e.clientX - rect.left) / rect.width;
    let direction = null;
    if (safePage === 0 && relX > 0.3) {
      direction = 'next';
    } else if (safePage === backCoverPage && relX < 0.7) {
      direction = 'prev';
    } else if (relX > 0.62 && safePage < backCoverPage) {
      direction = 'next';
    } else if (relX < 0.38 && safePage > 0) {
      direction = 'prev';
    }

    if (!direction) return;
    dragStartRef.current = {
      active: true,
      startX: e.clientX,
      startY: e.clientY,
      direction,
      hasMoved: false,
    };
  };

  const handleBookPointerMove = (e) => {
    const drag = dragStartRef.current;
    if (!drag.active) return;

    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    if (!drag.hasMoved && Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
    if (!drag.hasMoved && Math.abs(dy) > Math.abs(dx) * 1.35) {
      drag.active = false;
      return;
    }

    if (!drag.hasMoved) {
      drag.hasMoved = true;
      try {
        e.currentTarget.setPointerCapture?.(e.pointerId);
      } catch {
        // abaikan jika pointer capture tidak didukung
      }
    }
    const rect = bookContainerRef.current?.getBoundingClientRect();
    const halfWidth = rect ? Math.max(220, rect.width * 0.45) : 340;
    const rawProgress = drag.direction === 'next' ? -dx / halfWidth : dx / halfWidth;
    const progress = Math.max(0.02, Math.min(0.96, rawProgress));
    const toPage = drag.direction === 'next' ? safePage + 1 : safePage - 1;

    if (toPage >= 0 && toPage <= backCoverPage) {
      setFlipState({
        direction: drag.direction,
        fromPage: safePage,
        toPage,
        progress,
        isDragging: true,
      });
    }
  };

  const handleBookPointerUp = (e) => {
    const drag = dragStartRef.current;
    if (!drag.active) return;
    const wasMoved = drag.hasMoved;
    drag.active = false;
    try {
      if (e.currentTarget?.hasPointerCapture?.(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch {
      // abaikan
    }

    if (wasMoved) {
      suppressNextClickRef.current = true;
    }

    if (flipState && flipState.isDragging) {
      const shouldComplete = flipState.progress > 0.26;
      animatePaperFlip(
        flipState.direction,
        flipState.fromPage,
        flipState.toPage,
        flipState.progress,
        shouldComplete
      );
    }
  };

  // Swipe drag handler Mobile (menggerakkan animasi 3D langsung)
  const handleMobilePointerDown = (e) => {
    if (!isMobile || flipState) return;
    suppressNextClickRef.current = false;
    if (e.target.closest('button, a, input, select')) return;
    mobileDragRef.current = {
      active: true,
      startX: e.clientX,
      startY: e.clientY,
      direction: null,
      hasMoved: false,
    };
  };

  const handleMobilePointerMove = (e) => {
    const drag = mobileDragRef.current;
    if (!drag.active) return;

    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;

    if (!drag.hasMoved) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      if (Math.abs(dy) > Math.abs(dx) * 1.25) {
        drag.active = false;
        return;
      }
      const dir = dx < 0 ? 'next' : 'prev';
      if (dir === 'next' && safePage >= backCoverPage) {
        drag.active = false;
        return;
      }
      if (dir === 'prev' && safePage <= 0) {
        drag.active = false;
        return;
      }
      drag.direction = dir;
      drag.hasMoved = true;
      try {
        e.currentTarget.setPointerCapture?.(e.pointerId);
      } catch {
        // abaikan jika pointer capture tidak didukung
      }
    }

    const rect = mobileStageRef.current?.getBoundingClientRect();
    const width = rect ? Math.max(220, rect.width * 0.72) : 260;
    const rawProgress = drag.direction === 'next' ? -dx / width : dx / width;
    const progress = Math.max(0.02, Math.min(0.96, rawProgress));
    const toPage = drag.direction === 'next' ? safePage + 1 : safePage - 1;

    if (toPage >= 0 && toPage <= backCoverPage) {
      setFlipState({
        direction: drag.direction,
        fromPage: safePage,
        toPage,
        progress,
        isDragging: true,
      });
    }
  };

  const handleMobilePointerUp = (e) => {
    const drag = mobileDragRef.current;
    if (!drag.active) return;
    const wasMoved = drag.hasMoved;
    drag.active = false;
    try {
      if (e.currentTarget?.hasPointerCapture?.(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch {
      // abaikan
    }

    if (wasMoved) {
      suppressNextClickRef.current = true;
    }

    if (flipState && flipState.isDragging) {
      const shouldComplete = flipState.progress > 0.22;
      animatePaperFlip(
        flipState.direction,
        flipState.fromPage,
        flipState.toPage,
        flipState.progress,
        shouldComplete
      );
    }
  };

  const renderFrontCoverFace = (interactive = true) => (
    <div
      onClick={() => {
        if (!interactive) return;
        if (suppressNextClickRef.current) {
          suppressNextClickRef.current = false;
          return;
        }
        triggerFlip(1);
      }}
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      onKeyDown={(e) => interactive && e.key === 'Enter' && triggerFlip(1)}
      className="group relative h-full rounded-r-lg rounded-l-sm bg-[#1F1814] text-[#F5F1E8] p-4 sm:p-6 border border-[#C4A46B]/40 shadow-[14px_18px_38px_rgba(24,18,14,0.34)] cursor-pointer overflow-hidden flex flex-col justify-between"
    >
      <div className="absolute inset-y-0 left-0 w-5 bg-black/35 border-r border-[#C4A46B]/20 pointer-events-none" />
      <div className="absolute inset-y-3 right-0 w-2 bg-[repeating-linear-gradient(to_left,#E6DEC8_0px,#FAF8F3_1px,#D4C8B2_2px)] rounded-r-sm opacity-95 pointer-events-none" />

      <div className="relative ml-3 flex-1 border border-[#C4A46B]/35 rounded-sm p-4 sm:p-6 flex flex-col justify-between overflow-hidden">
        <img
          src="/ornaments/ukiran-corner-gold.png"
          alt=""
          aria-hidden="true"
          className="pointer-events-none select-none absolute top-2 left-2 w-12 sm:w-14 -scale-x-100 opacity-70"
        />
        <img
          src="/ornaments/ukiran-corner-gold.png"
          alt=""
          aria-hidden="true"
          className="pointer-events-none select-none absolute top-2 right-2 w-12 sm:w-14 opacity-70"
        />
        <div className="relative z-10 text-center space-y-1.5">
          <span className="inline-block text-[12px] sm:text-[12.5px] font-medium text-[#C4A46B]">
            Katalog Resmi Sanggar · Kabupaten Trenggalek
          </span>
          <h3 className="font-serif font-normal text-2xl sm:text-[28px] text-[#F5F1E8] tracking-[-0.02em] leading-snug pt-0.5 line-clamp-2">
            {shop.name}
          </h3>
          {shop.address && (
            <p className="text-[12px] sm:text-[12.5px] text-[#B5ACA2] max-w-sm mx-auto leading-relaxed line-clamp-2">
              {shop.address}
            </p>
          )}
        </div>

        <div className="my-2 mx-auto w-44 sm:w-52 aspect-[4/3] rounded-sm overflow-hidden border border-[#C4A46B]/35 bg-[#1B1714] shrink-0">
          <ShopCoverArtwork
            profileUrl={shop.profile_public_url}
            shopName={shop.name}
            fallbackProduct={leadProduct}
            size={320}
          />
        </div>

        <div className="text-center space-y-2.5">
          <p className="text-[13px] sm:text-[13.5px] text-[#F5F1E8]/90 font-serif italic tabular-nums">
            {products.length} koleksi aktif
            {products.length > 0 && ` · Mulai ${formatRupiah(minShopPrice)}`}
          </p>
          <div className="inline-flex items-center justify-center gap-2 min-h-[42px] px-5 py-2 rounded-[10px] bg-[#FCFBF8] group-hover:bg-[#EFEAE0] text-[#1C1917] text-[13.5px] font-medium transition-colors">
            <BookOpen className="w-4 h-4 text-[#7C3219]" />
            <span>Buka Buku Katalog</span>
          </div>
        </div>
      </div>

      {interactive && !isMobile && (
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
      <div className="group relative h-full rounded-l-lg rounded-r-sm bg-[#1F1814] text-[#F5F1E8] p-4 sm:p-6 border border-[#C4A46B]/40 shadow-[-14px_18px_38px_rgba(24,18,14,0.34)] overflow-hidden flex flex-col justify-between">
        <div className="absolute inset-y-0 right-0 w-5 bg-black/35 border-l border-[#C4A46B]/20 pointer-events-none" />
        <div className="absolute inset-y-3 left-0 w-2 bg-[repeating-linear-gradient(to_right,#E6DEC8_0px,#FAF8F3_1px,#D4C8B2_2px)] rounded-l-sm opacity-95 pointer-events-none" />

        <div className="relative mr-3 flex-1 border border-[#C4A46B]/35 rounded-sm p-4 sm:p-6 text-center flex flex-col justify-between overflow-hidden">
          <img
            src="/ornaments/ukiran-corner-gold.png"
            alt=""
            aria-hidden="true"
            className="pointer-events-none select-none absolute top-2 left-2 w-12 sm:w-14 -scale-x-100 opacity-70"
          />
          <img
            src="/ornaments/ukiran-corner-gold.png"
            alt=""
            aria-hidden="true"
            className="pointer-events-none select-none absolute top-2 right-2 w-12 sm:w-14 opacity-70"
          />
          <div className="relative z-10 space-y-1">
            <span className="inline-block text-[12px] sm:text-[12.5px] font-medium text-[#C4A46B]">
              Sampul Penutup Katalog
            </span>
            <h3 className="font-serif font-normal text-2xl sm:text-[28px] text-[#F5F1E8] pt-0.5 line-clamp-2">
              {shop.name}
            </h3>
            {shop.address && (
              <p className="text-[12px] text-[#B5ACA2] line-clamp-2">{shop.address}</p>
            )}
          </div>

          <div className="my-2 space-y-2.5">
            <div className="mx-auto w-24 aspect-[4/3] rounded-sm overflow-hidden border border-[#C4A46B]/35 bg-[#1B1714]">
              <ShopCoverArtwork
                profileUrl={shop.profile_public_url}
                shopName={shop.name}
                fallbackProduct={lastProduct}
                size={180}
              />
            </div>

            {shop.description && (
              <p className="text-[13px] font-serif text-[#F5F1E8]/85 leading-relaxed max-w-md mx-auto line-clamp-3">
                {shop.description}
              </p>
            )}

            <div className="flex flex-wrap justify-center gap-2">
              {shopWaDirectHref && (
                <a
                  href={shopWaDirectHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="taste-btn-wa"
                >
                  <MessageCircle className="w-4 h-4 shrink-0" />
                  <span className="tabular-nums">WhatsApp (+{shopWa})</span>
                </a>
              )}

              {shop.online_shop && (
                <a
                  href={shop.online_shop}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 min-h-[42px] px-3.5 py-2 rounded-[10px] border border-white/20 text-[#F5F1E8] hover:bg-white/10 text-[13px] font-medium transition-colors"
                >
                  <Store className="w-4 h-4 text-[#C4A46B]" />
                  <span>{marketplaceLabel}</span>
                </a>
              )}

              {instagramUrl && (
                <a
                  href={instagramUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 min-h-[42px] px-3.5 py-2 rounded-[10px] border border-white/20 text-[#F5F1E8] hover:bg-white/10 text-[13px] font-medium transition-colors"
                >
                  <InstagramIcon className="w-4 h-4 text-[#C4A46B]" />
                  <span>Instagram</span>
                </a>
              )}
            </div>
          </div>

          <div className="flex flex-wrap justify-center gap-2 pt-1">
            <button
              type="button"
              disabled={!interactive}
              onClick={() => interactive && triggerFlip(backCoverPage - 1)}
              className="inline-flex items-center gap-1.5 min-h-[42px] px-4 py-2 rounded-[10px] border border-white/20 text-[#F5F1E8] hover:bg-white/10 text-[13px] font-medium cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>Halaman Terakhir</span>
            </button>
            <button
              type="button"
              disabled={!interactive}
              onClick={() => interactive && triggerFlip(0)}
              className="inline-flex items-center justify-center min-h-[42px] px-4 py-2 rounded-[10px] bg-[#FCFBF8] hover:bg-[#EFEAE0] text-[#1C1917] text-[13px] font-medium cursor-pointer"
            >
              Sampul Depan
            </button>
          </div>
        </div>

        {interactive && !isMobile && (
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

  const renderProductMediaGallery = (
    prod,
    frameHeightClass = 'h-[205px] sm:h-[225px] lg:h-[240px]',
    interactive = true,
    compact = false
  ) => {
    const gallery = prod.displayImages || [];
    const selectedIdx = Math.min(activeGalleryMap[prod.id] || 0, Math.max(0, gallery.length - 1));
    const currentImage = gallery[selectedIdx];

    return (
      <div className="space-y-1.5">
        <div
          className={`relative ${frameHeightClass} rounded-md overflow-hidden border border-[#1C1917]/12 bg-[#EFEAE0]`}
        >
          <ProductArtwork
            product={prod}
            imageUrl={currentImage?.image_url || prod.primaryImageUrl}
            size={480}
            className="w-full h-full"
          />
        </div>

        {gallery.length > 1 && (
          <div className={`flex items-center gap-1.5 ${compact ? 'h-6' : 'h-7'}`}>
            {gallery.slice(0, 5).map((imgRow, idx) => (
              <button
                key={imgRow.id}
                type="button"
                disabled={!interactive}
                onClick={() =>
                  interactive &&
                  setActiveGalleryMap((prev) => ({ ...prev, [prod.id]: idx }))
                }
                aria-label={`Lihat foto ${idx + 1} untuk ${prod.name}`}
                className={`${compact ? 'w-8 h-6' : 'w-9 h-7'} rounded-sm overflow-hidden border transition-opacity cursor-pointer ${
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
            <span className="text-[11.5px] text-[#575049] ml-auto tabular-nums">
              Foto {selectedIdx + 1}/{gallery.length}
            </span>
          </div>
        )}
      </div>
    );
  };

  // DESKTOP Halaman 1 (Kiri): Cerita Toko, Pengelola, Dokumentasi, Motif Khas, Teknik & Bahan
  const renderProfileStoryPage = (interactive = true) => {
    const ownerName = shop.owner_name || account?.display_name || '';
    const ownerRole = shop.owner_role || 'Pendiri & Perajin';
    const fullStory = String(shop.story || shop.description || '').trim();
    const storyParagraphs = splitParagraphs(fullStory);
    const hasLongStory = fullStory.length > 165 || storyParagraphs.length > 1;

    return (
      <div className="h-full p-5 lg:pr-8 flex flex-col justify-between gap-2.5 paper-surface overflow-hidden">
        <div className="shrink-0 flex items-center justify-between text-[13px] font-serif italic text-[#7C3219] border-b border-[#1C1917]/12 pb-1.5">
          <span>Cerita &amp; Ciri Khas Sanggar</span>
          <span className="tabular-nums">Halaman 1</span>
        </div>

        <div className="flex-1 min-h-0 flex flex-col justify-between gap-2.5 overflow-hidden">
          <div className="flex items-start gap-2.5">
            <ShopAvatar profileUrl={shop.profile_public_url} shopName={shop.name} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[11.5px] text-[#7C3219] font-medium">
                <span>Sentra Batik Trenggalek</span>
                {shop.founded_year && (
                  <span className="inline-flex items-center gap-1 text-[#575049]">
                    <Calendar className="w-3 h-3" />
                    Sejak {shop.founded_year}
                  </span>
                )}
              </div>
              <h3 className="font-serif font-normal text-xl text-[#1C1917] leading-tight line-clamp-1">
                {shop.name}
              </h3>
              {(ownerName || shop.address) && (
                <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[12px] text-[#575049] mt-0.5">
                  {ownerName && (
                    <span className="inline-flex items-center gap-1 text-[#1C1917] font-medium line-clamp-1">
                      <User className="w-3 h-3 text-[#7C3219]" />
                      {ownerName} ({ownerRole})
                    </span>
                  )}
                  {shop.address && (
                    <span className="inline-flex items-center gap-1 line-clamp-1">
                      <MapPin className="w-3 h-3 text-[#7C3219] shrink-0" />
                      <span className="truncate">{shop.address}</span>
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>

          {insights.docPhotos.length > 0 && (
            <div
              className={`grid ${
                insights.docPhotos.length > 1 ? 'grid-cols-2' : 'grid-cols-1'
              } gap-2 shrink-0`}
            >
              {insights.docPhotos.map((item) => (
                <div
                  key={item.id}
                  className="h-[108px] rounded-md overflow-hidden border border-[#1C1917]/12 bg-[#EFEAE0]"
                >
                  <ProductArtwork
                    product={item.product || { name: shop.name, shop_id: shop.id }}
                    imageUrl={item.imageUrl}
                    size={300}
                    className="w-full h-full"
                  />
                </div>
              ))}
            </div>
          )}

          {storyParagraphs.length > 0 && (
            <div className="space-y-1">
              <p className="text-[13px] text-[#443E38] leading-relaxed font-serif line-clamp-3">
                {storyParagraphs[0]}
              </p>
              {hasLongStory && interactive && (
                <button
                  type="button"
                  onClick={() => setDetailModal({ type: 'story' })}
                  className="text-[12px] font-medium text-[#7C3219] hover:underline underline-offset-2 cursor-pointer"
                >
                  Baca cerita lengkap →
                </button>
              )}
            </div>
          )}

          {insights.signatureMotifs.length > 0 && (
            <div className="space-y-1 pt-1.5 border-t border-[#1C1917]/10">
              <span className="text-[12px] font-medium text-[#7C3219] block">
                Motif khas sanggar
              </span>
              <ul className="space-y-1">
                {insights.signatureMotifs.map((motif) => (
                  <li
                    key={motif.name}
                    className="text-[12px] leading-snug text-[#575049] line-clamp-1"
                  >
                    {motif.spreadIdx && interactive ? (
                      <button
                        type="button"
                        onClick={() => triggerFlip(motif.spreadIdx)}
                        className="font-medium text-[#1C1917] hover:text-[#7C3219] underline decoration-[#1C1917]/25 underline-offset-2 cursor-pointer mr-1"
                      >
                        {motif.name}:
                      </button>
                    ) : (
                      <strong className="font-medium text-[#1C1917] mr-1">{motif.name}:</strong>
                    )}
                    <span>{motif.meaning}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {(insights.techniques.length > 0 || insights.materials.length > 0) && (
            <dl className="grid grid-cols-2 gap-x-3 gap-y-1 pt-1.5 border-t border-[#1C1917]/10 text-[12px]">
              {insights.techniques.length > 0 && (
                <div className="min-w-0">
                  <dt className="text-[#575049]">Teknik yang dikuasai</dt>
                  <dd className="font-medium text-[#1C1917] line-clamp-2 mt-0.5">
                    {insights.techniques.join(', ')}
                  </dd>
                </div>
              )}
              {insights.materials.length > 0 && (
                <div className="min-w-0">
                  <dt className="text-[#575049]">Bahan &amp; pewarna</dt>
                  <dd className="font-medium text-[#1C1917] line-clamp-2 mt-0.5">
                    {insights.materials.join(', ')}
                  </dd>
                </div>
              )}
            </dl>
          )}
        </div>

        <div className="shrink-0 text-[12px] font-serif italic text-[#575049] flex items-center justify-between pt-1.5 border-t border-[#1C1917]/12 tabular-nums">
          <span className="truncate">{shop.name}</span>
          <span className="shrink-0">Halaman 1 dari {totalInnerPages}</span>
        </div>
      </div>
    );
  };

  // DESKTOP Halaman 2 (Kanan): Info Praktis & Kontak + Daftar Isi Koleksi (tanpa QR)
  const renderPracticalInfoPage = (interactive = true) => {
    const visibleTocProducts = products.slice(0, 6);
    const hasMoreToc = products.length > 6;

    return (
      <div className="h-full p-5 lg:pl-8 flex flex-col justify-between gap-2.5 paper-surface overflow-hidden">
        <div className="shrink-0 flex items-center justify-between text-[13px] font-serif italic text-[#7C3219] border-b border-[#1C1917]/12 pb-1.5">
          <span>Info Praktis &amp; Kontak</span>
          <span className="tabular-nums">Halaman 2</span>
        </div>

        <div className="flex-1 min-h-0 flex flex-col justify-between gap-2.5 overflow-hidden">
          <div className="p-2.5 rounded-lg bg-[#F5F1E8] border border-[#1C1917]/12 flex flex-wrap items-center justify-between gap-2">
            <div>
              <span className="text-[11.5px] font-medium text-[#7C3219] block">
                WhatsApp pemesanan resmi
              </span>
              {shopWa ? (
                <span className="text-[13.5px] font-mono font-medium text-[#1C1917] flex items-center gap-1.5 mt-0.5 tabular-nums">
                  <Phone className="w-3.5 h-3.5 text-[#7C3219]" />+{shopWa}
                </span>
              ) : (
                <span className="text-[12.5px] text-[#575049] block mt-0.5">
                  Nomor WhatsApp belum tersedia
                </span>
              )}
            </div>

            {shopWaDirectHref && (
              <a
                href={shopWaDirectHref}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-1.5 min-h-[38px] px-3 py-1.5 rounded-[10px] bg-[#1D6B44] hover:bg-[#165233] text-white text-[12.5px] font-medium transition-colors"
              >
                <MessageCircle className="w-3.5 h-3.5" />
                <span>Chat WhatsApp</span>
              </a>
            )}
          </div>

          <div className="space-y-1 text-[12.5px]">
            <div className="flex items-start justify-between gap-2">
              <span className="flex items-start gap-1.5 text-[#575049] min-w-0">
                <MapPin className="w-3.5 h-3.5 text-[#7C3219] shrink-0 mt-0.5" />
                <span className="line-clamp-2">
                  {shop.address || 'Kabupaten Trenggalek, Jawa Timur'}
                </span>
              </span>
              {shop.gmaps && (
                <a
                  href={shop.gmaps}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="taste-link text-[12px] font-medium text-[#7C3219] shrink-0"
                >
                  <span>Google Maps</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>

            {shop.operating_hours && (
              <div className="flex items-center gap-1.5 text-[#575049]">
                <Clock className="w-3.5 h-3.5 text-[#7C3219] shrink-0" />
                <span className="line-clamp-1">{shop.operating_hours}</span>
              </div>
            )}

            {(shop.order_info || shop.custom_order_info) && (
              <div className="pt-1 space-y-0.5 text-[12px] text-[#575049]">
                {shop.order_info && <p className="line-clamp-1">{shop.order_info}</p>}
                {shop.custom_order_info && <p className="line-clamp-1">{shop.custom_order_info}</p>}
              </div>
            )}
          </div>

          {(instagramUrl || tiktokUrl || facebookUrl || shop.online_shop) && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 py-1.5 border-y border-[#1C1917]/10 text-[12.5px]">
              {shop.online_shop && (
                <a
                  href={shop.online_shop}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="taste-link font-medium text-[#1C1917]"
                >
                  <Store className="w-3.5 h-3.5 text-[#7C3219]" />
                  <span>{marketplaceLabel}</span>
                </a>
              )}
              {instagramUrl && (
                <a
                  href={instagramUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="taste-link font-medium text-[#1C1917]"
                >
                  <InstagramIcon className="w-3.5 h-3.5 text-[#7C3219]" />
                  <span>Instagram</span>
                </a>
              )}
              {tiktokUrl && (
                <a
                  href={tiktokUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="taste-link font-medium text-[#1C1917]"
                >
                  <span>TikTok</span>
                  <ExternalLink className="w-3 h-3 text-[#7C3219]" />
                </a>
              )}
              {facebookUrl && (
                <a
                  href={facebookUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="taste-link font-medium text-[#1C1917]"
                >
                  <span>Facebook</span>
                  <ExternalLink className="w-3 h-3 text-[#7C3219]" />
                </a>
              )}
            </div>
          )}

          {/* Daftar Isi Koleksi lebar penuh (maks 6 item sebelum modal) */}
          <div className="space-y-1 min-w-0">
            <span className="text-[12px] font-medium text-[#7C3219] block">
              Daftar isi koleksi ({products.length})
            </span>
            {products.length === 0 ? (
              <p className="text-[12px] text-[#575049]">Belum ada koleksi aktif.</p>
            ) : (
              <>
                <div className="divide-y divide-[#1C1917]/10 border-t border-b border-[#1C1917]/12">
                  {visibleTocProducts.map((p, idx) => {
                    const targetSpread = idx + 2;
                    const targetLeftPageNum = idx * 2 + 3;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        disabled={!interactive}
                        onClick={() => interactive && triggerFlip(targetSpread)}
                        className="w-full py-1.5 text-left flex items-center justify-between gap-2 hover:bg-[#EFEAE0]/70 text-[#1C1917] transition-colors cursor-pointer"
                      >
                        <span className="font-serif text-[13px] truncate">
                          {idx + 1}. {p.name}
                        </span>
                        <span className="shrink-0 text-[12px] font-medium text-[#7C3219] tabular-nums">
                          {formatRupiah(p.price)} · Hal. {targetLeftPageNum} →
                        </span>
                      </button>
                    );
                  })}
                </div>
                {hasMoreToc && interactive && (
                  <button
                    type="button"
                    onClick={() => setDetailModal({ type: 'toc' })}
                    className="text-[12px] font-medium text-[#7C3219] hover:underline underline-offset-2 pt-0.5 cursor-pointer"
                  >
                    Lihat semua {products.length} koleksi →
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        <div className="shrink-0 text-[12px] font-serif italic text-[#575049] flex items-center justify-between pt-1.5 border-t border-[#1C1917]/12 tabular-nums">
          <span className="truncate">
            {products.length > 0
              ? 'Balik kanan untuk melihat koleksi'
              : 'Balik kanan untuk Sampul Belakang'}
          </span>
          <span className="shrink-0">Halaman 2 dari {totalInnerPages}</span>
        </div>
      </div>
    );
  };

  // DESKTOP Halaman Produk (Kiri: Galeri & Deskripsi | Kanan: SEMUA Spesifikasi + Pemesanan)
  const renderProductPage = (productIdx, side, interactive = true) => {
    const currentProd = products[productIdx];
    if (!currentProd) return null;

    const leftPageNum = productIdx * 2 + 3;
    const rightPageNum = productIdx * 2 + 4;
    const isHighlighted = currentProd.id === highlightedProductId;

    if (side === 'left') {
      const desc = String(currentProd.description || '').trim();
      const hasLongDesc = desc.length > 180;

      return (
        <div className="h-full p-5 lg:pr-8 flex flex-col justify-between gap-2.5 paper-surface overflow-hidden">
          <div className="shrink-0 flex items-center justify-between text-[13px] font-serif italic text-[#7C3219] border-b border-[#1C1917]/12 pb-1.5">
            <span className="truncate">
              {shop.name} · Koleksi #{String(productIdx + 1).padStart(2, '0')}
            </span>
            <span className="tabular-nums shrink-0">Halaman {leftPageNum}</span>
          </div>

          <div className="flex-1 min-h-0 flex flex-col justify-between gap-2.5 overflow-hidden">
            <div className={isHighlighted ? 'ring-2 ring-[#7C3219] rounded-md' : ''}>
              {renderProductMediaGallery(
                currentProd,
                'h-[220px] xl:h-[245px]',
                interactive
              )}
            </div>

            <div className="space-y-1">
              <span className="text-[12px] font-medium text-[#7C3219] block">
                Deskripsi &amp; filosofi motif
              </span>
              <p className="text-[13.5px] font-serif italic text-[#1C1917]/85 leading-relaxed line-clamp-4">
                “{desc || 'Karya batik khas Kabupaten Trenggalek.'}”
              </p>
              {hasLongDesc && interactive && (
                <button
                  type="button"
                  onClick={() => setDetailModal({ type: 'product-story', product: currentProd })}
                  className="text-[12px] font-medium text-[#7C3219] hover:underline underline-offset-2 cursor-pointer"
                >
                  Baca filosofi lengkap →
                </button>
              )}
            </div>
          </div>

          <div className="shrink-0 text-[12px] font-serif italic text-[#575049] flex items-center justify-between pt-1.5 border-t border-[#1C1917]/12 tabular-nums">
            <span>Galeri Produk ({currentProd.displayImages.length} Foto)</span>
            <span>
              Halaman {leftPageNum} dari {totalInnerPages}
            </span>
          </div>
        </div>
      );
    }

    const detailWaHref = shopWa
      ? buildProductOrderWaUrl(
          shop,
          shopWa,
          currentProd,
          `Buku Katalog ${shop.name} (Halaman ${rightPageNum})`
        )
      : '';

    return (
      <div className="relative h-full p-5 lg:pl-8 flex flex-col justify-between gap-2.5 paper-surface overflow-hidden">
        <img
          src="/ornaments/kawung-sogan.png"
          alt=""
          aria-hidden="true"
          className="pointer-events-none select-none absolute bottom-8 -right-4 w-36 opacity-[0.08]"
        />

        <div className="relative z-10 shrink-0 flex items-center justify-between text-[13px] font-serif italic text-[#7C3219] border-b border-[#1C1917]/12 pb-1.5">
          <span>Spesifikasi &amp; Pemesanan</span>
          <span className="tabular-nums">Halaman {rightPageNum}</span>
        </div>

        <div className="relative z-10 flex-1 min-h-0 flex flex-col justify-between gap-2.5 overflow-hidden">
          <div className="space-y-0.5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="text-[12px] font-medium text-[#7C3219]">
                {currentProd.category.name}
              </span>
              <span className="text-[17px] font-semibold text-[#1C1917] tabular-nums">
                {formatRupiah(currentProd.price)}
              </span>
            </div>
            <h3 className="font-serif font-normal text-2xl text-[#1C1917] leading-tight line-clamp-2">
              {currentProd.name}
            </h3>
            <p className="text-[12px] text-[#575049]">Karya {shop.name}</p>
          </div>

          {currentProd.formattedAttributes.length > 0 && (
            <div className="space-y-1">
              <span className="text-[12px] font-medium text-[#7C3219] block">
                Spesifikasi produk
              </span>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 py-2 border-y border-[#1C1917]/12 text-[12.5px]">
                {currentProd.formattedAttributes.map((attr) => (
                  <div key={attr.name} className="min-w-0">
                    <dt className="text-[#575049] truncate">
                      {attr.label}
                      {attr.required && <span className="text-[#7C3219] ml-0.5">*</span>}
                    </dt>
                    <dd className="font-medium text-[#1C1917] truncate mt-0.5">
                      {attr.displayValue}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          )}

          <div className="space-y-2 mt-auto">
            {detailWaHref ? (
              <a
                href={detailWaHref}
                target="_blank"
                rel="noopener noreferrer"
                className="taste-btn-wa w-full"
              >
                <MessageCircle className="w-4 h-4 shrink-0" />
                <span>Pesan Produk Ini via WhatsApp</span>
              </a>
            ) : (
              <span className="min-h-[44px] px-4 py-2 rounded-[10px] bg-[#EFEAE0] text-[#575049] text-[13px] font-medium inline-flex items-center justify-center w-full">
                WhatsApp sanggar belum tersedia
              </span>
            )}

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
                  className="taste-btn-secondary w-full"
                >
                  <Store className="w-4 h-4 text-[#7C3219] shrink-0" />
                  <span>{detectMarketplaceLabel(currentProd.product_link)}</span>
                  <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                </a>
              )}
            </div>
          </div>
        </div>

        <div className="relative z-10 shrink-0 text-[12px] font-serif italic text-[#575049] flex items-center justify-between pt-1.5 border-t border-[#1C1917]/12 tabular-nums">
          <span className="truncate">
            {productIdx === products.length - 1
              ? 'Balik ke kanan untuk Sampul Belakang'
              : 'Balik ke kanan untuk koleksi berikutnya'}
          </span>
          <span className="shrink-0">
            Halaman {rightPageNum} dari {totalInnerPages}
          </span>
        </div>
      </div>
    );
  };

  const renderSpreadSide = (spreadIdx, side, interactive = true) => {
    if (spreadIdx === 1) {
      return side === 'left'
        ? renderProfileStoryPage(interactive)
        : renderPracticalInfoPage(interactive);
    }
    const productIdx = spreadIdx - 2;
    return renderProductPage(productIdx, side, interactive);
  };

  // MOBILE Lembar 1: Profil & Info Praktis Sanggar (1 halaman ringkas + modal lengkap)
  const renderMobileProfilePage = (interactive = true) => {
    const ownerName = shop.owner_name || account?.display_name || '';
    const ownerRole = shop.owner_role || 'Pendiri & Perajin';
    const fullStory = String(shop.story || shop.description || '').trim();

    return (
      <div className="h-full p-3.5 flex flex-col justify-between gap-2 paper-surface overflow-hidden">
        <div className="shrink-0 flex items-center justify-between text-[12px] font-serif italic text-[#7C3219] border-b border-[#1C1917]/12 pb-1.5">
          <span>Profil Sanggar</span>
          <span className="tabular-nums">Halaman 1</span>
        </div>

        <div className="flex-1 min-h-0 flex flex-col justify-between gap-2 overflow-hidden">
          <div className="flex items-start gap-2.5">
            <ShopAvatar profileUrl={shop.profile_public_url} shopName={shop.name} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2 text-[11px] text-[#7C3219] font-medium">
                <span>Sentra Batik Trenggalek</span>
                {shop.founded_year && (
                  <span className="text-[#575049]">· Sejak {shop.founded_year}</span>
                )}
              </div>
              <h3 className="font-serif font-normal text-lg text-[#1C1917] leading-tight line-clamp-1">
                {shop.name}
              </h3>
              <p className="text-[11.5px] text-[#575049] line-clamp-1 mt-0.5">
                {ownerName ? `${ownerName} (${ownerRole}) · ` : ''}
                {shop.address || 'Kabupaten Trenggalek'}
              </p>
            </div>
          </div>

          {insights.docPhotos.length > 0 && (
            <div
              className={`grid ${
                insights.docPhotos.length > 1 ? 'grid-cols-2' : 'grid-cols-1'
              } gap-2 shrink-0`}
            >
              {insights.docPhotos.map((item) => (
                <div
                  key={item.id}
                  className="h-[84px] rounded-md overflow-hidden border border-[#1C1917]/12 bg-[#EFEAE0]"
                >
                  <ProductArtwork
                    product={item.product || { name: shop.name, shop_id: shop.id }}
                    imageUrl={item.imageUrl}
                    size={260}
                    className="w-full h-full"
                  />
                </div>
              ))}
            </div>
          )}

          {fullStory && (
            <p className="text-[12.5px] font-serif text-[#443E38] leading-relaxed line-clamp-2">
              {fullStory}
            </p>
          )}

          {(insights.techniques.length > 0 || insights.materials.length > 0) && (
            <dl className="grid grid-cols-2 gap-x-3 py-1.5 border-y border-[#1C1917]/10 text-[11.5px] leading-tight">
              {insights.techniques.length > 0 && (
                <div className="min-w-0">
                  <dt className="text-[#575049]">Teknik</dt>
                  <dd className="font-medium text-[#1C1917] line-clamp-1 mt-0.5">
                    {insights.techniques.join(', ')}
                  </dd>
                </div>
              )}
              {insights.materials.length > 0 && (
                <div className="min-w-0">
                  <dt className="text-[#575049]">Bahan &amp; pewarna</dt>
                  <dd className="font-medium text-[#1C1917] line-clamp-1 mt-0.5">
                    {insights.materials.join(', ')}
                  </dd>
                </div>
              )}
            </dl>
          )}

          <div className="space-y-1.5 mt-auto">
            {shopWaDirectHref ? (
              <a
                href={shopWaDirectHref}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-1.5 w-full h-[38px] px-3 rounded-[9px] bg-[#1D6B44] hover:bg-[#165233] text-white text-[13px] font-medium transition-colors"
              >
                <MessageCircle className="w-4 h-4 shrink-0" />
                <span>Chat WhatsApp Sanggar</span>
              </a>
            ) : (
              <span className="h-[38px] px-3 rounded-[9px] bg-[#EFEAE0] text-[#575049] text-[12px] font-medium inline-flex items-center justify-center w-full">
                WhatsApp sanggar belum tersedia
              </span>
            )}

            <button
              type="button"
              disabled={!interactive}
              onClick={() => interactive && setDetailModal({ type: 'shop-full' })}
              className="inline-flex items-center justify-center w-full h-[36px] px-3 rounded-[9px] bg-[#FCFBF8] hover:bg-[#EFEAE0] border border-[#1C1917]/20 text-[#1C1917] text-[12.5px] font-medium transition-colors cursor-pointer"
            >
              <span>Detail Profil &amp; Daftar Isi ({products.length})</span>
            </button>
          </div>
        </div>

        <div className="shrink-0 text-[11px] font-serif italic text-[#575049] flex items-center justify-between pt-1.5 border-t border-[#1C1917]/12 tabular-nums">
          <span className="truncate">{shop.name}</span>
          <span className="shrink-0">
            Lembar 2 / {totalBookPages}
          </span>
        </div>
      </div>
    );
  };

  // MOBILE Lembar Produk: 1 Halaman Utuh (Foto + Harga + 4 Info Kunci + Deskripsi + Modal Lengkap)
  const renderMobileProductPage = (productIdx, interactive = true) => {
    const currentProd = products[productIdx];
    if (!currentProd) return null;

    const isHighlighted = currentProd.id === highlightedProductId;
    const keySpecs = pickKeyAttributes(currentProd.formattedAttributes);
    const mobileWaHref = shopWa
      ? buildProductOrderWaUrl(
          shop,
          shopWa,
          currentProd,
          `Buku Katalog ${shop.name} (Koleksi #${productIdx + 1})`
        )
      : '';

    return (
      <div className="h-full p-3.5 flex flex-col justify-between gap-2 paper-surface overflow-hidden">
        <div className="shrink-0 flex items-center justify-between text-[12px] font-serif italic text-[#7C3219] border-b border-[#1C1917]/12 pb-1.5">
          <span className="truncate">
            {shop.name} · Koleksi #{String(productIdx + 1).padStart(2, '0')}
          </span>
          <span className="tabular-nums shrink-0">Halaman {productIdx + 2}</span>
        </div>

        <div className="flex-1 min-h-0 flex flex-col justify-between gap-2 overflow-hidden">
          <div className={isHighlighted ? 'ring-2 ring-[#7C3219] rounded-md' : ''}>
            {renderProductMediaGallery(
              currentProd,
              currentProd.displayImages.length > 1 ? 'h-[138px]' : 'h-[158px]',
              interactive,
              true
            )}
          </div>

          <div className="space-y-0.5">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[11px] font-medium text-[#7C3219]">
                {currentProd.category.name}
              </span>
              <span className="text-[15px] font-semibold text-[#1C1917] tabular-nums shrink-0">
                {formatRupiah(currentProd.price)}
              </span>
            </div>
            <h3 className="font-serif font-normal text-[18px] text-[#1C1917] leading-snug line-clamp-1">
              {currentProd.name}
            </h3>
            <p className="text-[12px] font-serif italic text-[#575049] line-clamp-2 leading-snug">
              “{currentProd.description || 'Karya batik khas Kabupaten Trenggalek.'}”
            </p>
          </div>

          {keySpecs.length > 0 && (
            <dl className="grid grid-cols-2 gap-x-3 gap-y-1 py-1.5 border-y border-[#1C1917]/10 text-[11.5px] leading-tight">
              {keySpecs.map((attr) => (
                <div key={attr.name} className="min-w-0">
                  <dt className="text-[#575049] truncate">{attr.label}</dt>
                  <dd className="font-medium text-[#1C1917] truncate">{attr.displayValue}</dd>
                </div>
              ))}
            </dl>
          )}

          <div className="space-y-1.5 mt-auto">
            {mobileWaHref ? (
              <a
                href={mobileWaHref}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-1.5 w-full h-[38px] px-3 rounded-[9px] bg-[#1D6B44] hover:bg-[#165233] text-white text-[13px] font-medium transition-colors"
              >
                <MessageCircle className="w-4 h-4 shrink-0" />
                <span>Pesan via WhatsApp</span>
              </a>
            ) : (
              <span className="h-[38px] px-3 rounded-[9px] bg-[#EFEAE0] text-[#575049] text-[12px] font-medium inline-flex items-center justify-center w-full">
                WhatsApp sanggar belum tersedia
              </span>
            )}

            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                disabled={!interactive}
                onClick={() =>
                  interactive && setDetailModal({ type: 'product-full', product: currentProd })
                }
                className="inline-flex items-center justify-center w-full h-[36px] px-2.5 rounded-[9px] bg-[#FCFBF8] hover:bg-[#EFEAE0] border border-[#1C1917]/20 text-[#1C1917] text-[12.5px] font-medium transition-colors cursor-pointer"
              >
                <span>Detail &amp; Filosofi</span>
              </button>
              <button
                type="button"
                disabled={!interactive}
                onClick={() => interactive && onTryIn3D(currentProd.id)}
                className="inline-flex items-center justify-center w-full h-[36px] px-2.5 rounded-[9px] bg-[#FCFBF8] hover:bg-[#EFEAE0] border border-[#1C1917]/20 text-[#1C1917] text-[12.5px] font-medium transition-colors cursor-pointer"
              >
                <span>Studio 3D</span>
              </button>
            </div>
          </div>
        </div>

        <div className="shrink-0 text-[11px] font-serif italic text-[#575049] flex items-center justify-between pt-1.5 border-t border-[#1C1917]/12 tabular-nums">
          <span className="truncate">Geser atau tekan panah tepi</span>
          <span className="shrink-0">
            Lembar {productIdx + 3} / {totalBookPages}
          </span>
        </div>
      </div>
    );
  };

  const renderMobileSheetWithFrame = (pageIdx, interactive = true) => {
    if (pageIdx <= 0) return renderFrontCoverFace(interactive);
    if (pageIdx >= backCoverPage) return renderBackCoverFace(interactive);

    return (
      <div className="relative h-full rounded-r-lg rounded-l-sm bg-[#2B201A] p-1.5 pl-2.5 shadow-[0_18px_40px_rgba(24,18,14,0.28)] border border-[#1C1917]/25">
        <div className="absolute inset-y-2.5 right-0.5 w-1.5 bg-[repeating-linear-gradient(to_left,#E6DEC8_0px,#FAF8F3_1px,#D4C8B2_2px)] rounded-r-sm opacity-95 pointer-events-none" />
        <div className="relative h-full rounded-sm overflow-hidden bg-[#FAF8F3]">
          {pageIdx === 1
            ? renderMobileProfilePage(interactive)
            : renderMobileProductPage(pageIdx - 2, interactive)}
        </div>
      </div>
    );
  };

  const getPageTitle = (pageIdx) => {
    if (pageIdx === 0) return 'Sampul Depan';
    if (pageIdx === 1) return 'Profil Sanggar';
    if (pageIdx >= backCoverPage) return 'Sampul Belakang';
    return products[pageIdx - 2]?.name || `Koleksi #${pageIdx - 1}`;
  };

  const isSpreadPage = (p) => p >= 1 && p <= backCoverPage - 1;

  const isTurningBetweenSpreads =
    !isMobile && flipState && isSpreadPage(flipState.fromPage) && isSpreadPage(flipState.toPage);

  const isFrontCoverTransition =
    !isMobile &&
    flipState &&
    ((flipState.fromPage === 0 && isSpreadPage(flipState.toPage)) ||
      (flipState.toPage === 0 && isSpreadPage(flipState.fromPage)));

  const isBackCoverTransition =
    !isMobile &&
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

  // Variabel animasi 3D untuk pembaca mobile 1-lembar
  const mobileIsNext = flipState?.direction === 'next';
  const mobileBasePage = flipState
    ? mobileIsNext
      ? flipState.toPage
      : flipState.fromPage
    : safePage;
  const mobileLeafPage = flipState
    ? mobileIsNext
      ? flipState.fromPage
      : flipState.toPage
    : safePage;
  const mobileLeafAngle = flipState
    ? mobileIsNext
      ? -flipState.progress * 90
      : -(1 - flipState.progress) * 90
    : 0;
  const mobileLeafOpacity = flipState
    ? mobileIsNext
      ? flipState.progress > 0.92
        ? Math.max(0, 1 - (flipState.progress - 0.92) / 0.08)
        : 1
      : flipState.progress < 0.08
        ? Math.max(0, flipState.progress / 0.08)
        : 1
    : 1;
  const mobileLeafArch = flipState
    ? Math.sin((mobileIsNext ? flipState.progress : 1 - flipState.progress) * Math.PI)
    : 0;

  const canGoPrev = safePage > 0;
  const canGoNext = safePage < backCoverPage;

  const renderDetailModal = () => {
    if (!detailModal) return null;

    let title = '';
    let content = null;

    if (detailModal.type === 'story') {
      title = `Cerita & Profil — ${shop.name}`;
      const paragraphs = splitParagraphs(shop.story || shop.description);
      content = (
        <div className="space-y-4">
          {paragraphs.map((para, i) => (
            <p key={i} className="text-[14.5px] font-serif text-[#443E38] leading-relaxed">
              {para}
            </p>
          ))}

          {insights.signatureMotifs.length > 0 && (
            <div className="pt-3 border-t border-[#1C1917]/12 space-y-2">
              <h4 className="text-[13px] font-medium text-[#7C3219]">Motif khas sanggar</h4>
              <ul className="space-y-1.5 text-[13.5px] text-[#575049]">
                {insights.signatureMotifs.map((m) => (
                  <li key={m.name}>
                    <strong className="text-[#1C1917] font-medium">{m.name}:</strong> {m.meaning}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {(insights.techniques.length > 0 || insights.materials.length > 0) && (
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3 border-t border-[#1C1917]/12 text-[13.5px]">
              {insights.techniques.length > 0 && (
                <div>
                  <dt className="text-[#575049]">Teknik yang dikuasai</dt>
                  <dd className="font-medium text-[#1C1917] mt-0.5">
                    {insights.techniques.join(', ')}
                  </dd>
                </div>
              )}
              {insights.materials.length > 0 && (
                <div>
                  <dt className="text-[#575049]">Bahan &amp; pewarna</dt>
                  <dd className="font-medium text-[#1C1917] mt-0.5">
                    {insights.materials.join(', ')}
                  </dd>
                </div>
              )}
            </dl>
          )}
        </div>
      );
    } else if (detailModal.type === 'toc') {
      title = `Daftar Koleksi — ${shop.name}`;
      content = (
        <div className="divide-y divide-[#1C1917]/10 border-t border-b border-[#1C1917]/12">
          {products.map((p, idx) => (
            <button
              key={p.id}
              type="button"
              onClick={() => triggerFlip(idx + 2)}
              className="w-full py-2.5 text-left flex items-center justify-between gap-3 hover:bg-[#EFEAE0]/70 transition-colors cursor-pointer"
            >
              <div className="min-w-0">
                <span className="font-serif text-[14.5px] text-[#1C1917] block truncate">
                  {idx + 1}. {p.name}
                </span>
                <span className="text-[12.5px] text-[#575049] tabular-nums">
                  {p.category.name} · {formatRupiah(p.price)}
                </span>
              </div>
              <span className="shrink-0 text-[12.5px] font-medium text-[#7C3219] tabular-nums">
                Hal. {idx * 2 + 3} →
              </span>
            </button>
          ))}
        </div>
      );
    } else if (detailModal.type === 'product-story' && detailModal.product) {
      const prod = detailModal.product;
      title = prod.name;
      content = (
        <div className="space-y-3">
          <span className="text-[12.5px] font-medium text-[#7C3219] block">
            Deskripsi &amp; filosofi motif
          </span>
          <p className="text-[15px] font-serif italic text-[#1C1917] leading-relaxed">
            “{prod.description}”
          </p>
        </div>
      );
    } else if (detailModal.type === 'shop-full') {
      title = `Profil Lengkap — ${shop.name}`;
      const paragraphs = splitParagraphs(shop.story || shop.description);
      const ownerName = shop.owner_name || account?.display_name || '';
      const ownerRole = shop.owner_role || 'Pendiri & Perajin';
      content = (
        <div className="space-y-4">
          {(ownerName || shop.founded_year || shop.address) && (
            <div className="p-3 rounded-lg bg-[#F5F1E8] border border-[#1C1917]/12 space-y-1.5 text-[13px] text-[#575049]">
              {ownerName && (
                <p className="text-[#1C1917] font-medium">
                  {ownerName} · <span className="font-normal text-[#575049]">{ownerRole}</span>
                </p>
              )}
              {shop.founded_year && <p>Berdiri sejak {shop.founded_year}</p>}
              {shop.address && <p>{shop.address}</p>}
              {shop.operating_hours && <p>{shop.operating_hours}</p>}
            </div>
          )}

          {paragraphs.length > 0 && (
            <div className="space-y-2.5">
              <h4 className="text-[13px] font-medium text-[#7C3219]">Cerita sanggar</h4>
              {paragraphs.map((para, i) => (
                <p key={i} className="text-[14px] font-serif text-[#443E38] leading-relaxed">
                  {para}
                </p>
              ))}
            </div>
          )}

          {insights.signatureMotifs.length > 0 && (
            <div className="pt-3 border-t border-[#1C1917]/12 space-y-1.5">
              <h4 className="text-[13px] font-medium text-[#7C3219]">Motif khas</h4>
              <ul className="space-y-1.5 text-[13px] text-[#575049]">
                {insights.signatureMotifs.map((m) => (
                  <li key={m.name}>
                    {m.spreadIdx ? (
                      <button
                        type="button"
                        onClick={() => triggerFlip(m.spreadIdx)}
                        className="font-medium text-[#1C1917] hover:text-[#7C3219] underline decoration-[#1C1917]/25 underline-offset-2 mr-1 cursor-pointer"
                      >
                        {m.name}:
                      </button>
                    ) : (
                      <strong className="text-[#1C1917] font-medium mr-1">{m.name}:</strong>
                    )}
                    <span>{m.meaning}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {(insights.techniques.length > 0 || insights.materials.length > 0) && (
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3 border-t border-[#1C1917]/12 text-[13px]">
              {insights.techniques.length > 0 && (
                <div>
                  <dt className="text-[#575049]">Teknik yang dikuasai</dt>
                  <dd className="font-medium text-[#1C1917] mt-0.5">
                    {insights.techniques.join(', ')}
                  </dd>
                </div>
              )}
              {insights.materials.length > 0 && (
                <div>
                  <dt className="text-[#575049]">Bahan &amp; pewarna</dt>
                  <dd className="font-medium text-[#1C1917] mt-0.5">
                    {insights.materials.join(', ')}
                  </dd>
                </div>
              )}
            </dl>
          )}

          {(shop.order_info || shop.custom_order_info) && (
            <div className="pt-3 border-t border-[#1C1917]/12 space-y-1.5 text-[13px] text-[#575049]">
              {shop.order_info && <p>{shop.order_info}</p>}
              {shop.custom_order_info && <p>{shop.custom_order_info}</p>}
            </div>
          )}

          <div className="pt-3 border-t border-[#1C1917]/12 flex flex-wrap gap-3 text-[13px]">
            {shopWaDirectHref && (
              <a
                href={shopWaDirectHref}
                target="_blank"
                rel="noopener noreferrer"
                className="taste-btn-wa w-full sm:w-auto"
              >
                <MessageCircle className="w-4 h-4 shrink-0" />
                <span>WhatsApp (+{shopWa})</span>
              </a>
            )}
            {shop.gmaps && (
              <a
                href={shop.gmaps}
                target="_blank"
                rel="noopener noreferrer"
                className="taste-btn-secondary"
              >
                <MapPin className="w-4 h-4 text-[#7C3219]" />
                <span>Google Maps</span>
              </a>
            )}
            {shop.online_shop && (
              <a
                href={shop.online_shop}
                target="_blank"
                rel="noopener noreferrer"
                className="taste-btn-secondary"
              >
                <Store className="w-4 h-4 text-[#7C3219]" />
                <span>{marketplaceLabel}</span>
              </a>
            )}
            {instagramUrl && (
              <a
                href={instagramUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="taste-btn-secondary"
              >
                <InstagramIcon className="w-4 h-4 text-[#7C3219]" />
                <span>Instagram</span>
              </a>
            )}
            {tiktokUrl && (
              <a
                href={tiktokUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="taste-btn-secondary"
              >
                <span>TikTok</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            )}
            {facebookUrl && (
              <a
                href={facebookUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="taste-btn-secondary"
              >
                <span>Facebook</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            )}
          </div>

          {products.length > 0 && (
            <div className="pt-3 border-t border-[#1C1917]/12 space-y-2">
              <h4 className="text-[13px] font-medium text-[#7C3219]">
                Daftar isi koleksi ({products.length})
              </h4>
              <div className="divide-y divide-[#1C1917]/10 border-t border-b border-[#1C1917]/12">
                {products.map((p, idx) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => triggerFlip(idx + 2)}
                    className="w-full py-2 text-left flex items-center justify-between gap-3 hover:bg-[#EFEAE0]/70 transition-colors cursor-pointer"
                  >
                    <span className="font-serif text-[13.5px] text-[#1C1917] truncate">
                      {idx + 1}. {p.name}
                    </span>
                    <span className="shrink-0 text-[12px] font-medium text-[#7C3219] tabular-nums">
                      {formatRupiah(p.price)} →
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      );
    } else if (detailModal.type === 'product-full' && detailModal.product) {
      const prod = detailModal.product;
      title = prod.name;
      const modalWaHref = shopWa
        ? buildProductOrderWaUrl(shop, shopWa, prod, `Buku Katalog ${shop.name}`)
        : '';

      content = (
        <div className="space-y-4">
          <div className="aspect-[16/10] rounded-md overflow-hidden border border-[#1C1917]/12 bg-[#EFEAE0]">
            <ProductArtwork
              product={prod}
              imageUrl={prod.primaryImageUrl}
              size={480}
              className="w-full h-full"
            />
          </div>

          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <span className="text-[12.5px] font-medium text-[#7C3219] block">
                {prod.category.name}
              </span>
              <span className="text-[13px] text-[#575049]">Karya {shop.name}</span>
            </div>
            <span className="text-lg font-semibold text-[#1C1917] tabular-nums">
              {formatRupiah(prod.price)}
            </span>
          </div>

          <div className="space-y-1.5 pt-2 border-t border-[#1C1917]/12">
            <span className="text-[12.5px] font-medium text-[#7C3219] block">
              Deskripsi &amp; filosofi motif
            </span>
            <p className="text-[14.5px] font-serif italic text-[#1C1917] leading-relaxed">
              “{prod.description || 'Karya batik khas Kabupaten Trenggalek.'}”
            </p>
          </div>

          {prod.formattedAttributes.length > 0 && (
            <div className="space-y-1.5 pt-2 border-t border-[#1C1917]/12">
              <span className="text-[12.5px] font-medium text-[#7C3219] block">
                Spesifikasi lengkap
              </span>
              <dl className="divide-y divide-[#1C1917]/10 border-t border-b border-[#1C1917]/12">
                {prod.formattedAttributes.map((attr) => (
                  <div
                    key={attr.name}
                    className="py-2 flex items-center justify-between gap-4 text-[13px]"
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
          )}

          <div className="space-y-2 pt-1">
            {modalWaHref ? (
              <a
                href={modalWaHref}
                target="_blank"
                rel="noopener noreferrer"
                className="taste-btn-wa w-full"
              >
                <MessageCircle className="w-4 h-4 shrink-0" />
                <span>Pesan Produk Ini via WhatsApp</span>
              </a>
            ) : (
              <span className="min-h-[44px] px-4 py-2 rounded-[10px] bg-[#EFEAE0] text-[#575049] text-[13px] font-medium inline-flex items-center justify-center w-full">
                WhatsApp sanggar belum tersedia
              </span>
            )}

            <div className={`grid ${prod.product_link ? 'grid-cols-2' : 'grid-cols-1'} gap-2`}>
              <button
                type="button"
                onClick={() => {
                  setDetailModal(null);
                  onTryIn3D(prod.id);
                }}
                className="taste-btn-secondary w-full"
              >
                Coba di Studio 3D
              </button>
              {prod.product_link && (
                <a
                  href={prod.product_link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="taste-btn-secondary w-full"
                >
                  <Store className="w-4 h-4 text-[#7C3219] shrink-0" />
                  <span>{detectMarketplaceLabel(prod.product_link)}</span>
                  <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                </a>
              )}
            </div>
          </div>
        </div>
      );
    }

    return (
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={() => setDetailModal(null)}
        className="fixed inset-0 z-50 bg-black/55 flex items-center justify-center p-4"
      >
        <div
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-lg rounded-xl bg-[#FAF8F3] border border-[#1C1917]/20 shadow-2xl overflow-hidden fade-panel"
        >
          <div className="px-5 py-3.5 border-b border-[#1C1917]/12 flex items-center justify-between gap-3">
            <h3 className="font-serif text-lg text-[#1C1917] truncate">{title}</h3>
            <button
              type="button"
              onClick={() => setDetailModal(null)}
              aria-label="Tutup jendela baca"
              className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-lg text-[#575049] hover:text-[#1C1917] hover:bg-[#EFEAE0] cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="p-5 max-h-[72vh] overflow-auto">{content}</div>
        </div>
      </div>
    );
  };

  return (
    <section
      id="buku-katalog"
      className="relative py-8 lg:py-10 bg-[#EFEAE0] border-t border-[#1C1917]/12 overflow-hidden"
    >
      <img
        src="/ornaments/mega-mendung-gold.png"
        alt=""
        aria-hidden="true"
        className="hidden lg:block pointer-events-none select-none absolute top-24 -right-16 w-[360px] xl:w-[440px] opacity-[0.15]"
      />
      <img
        src="/ornaments/kawung-sogan.png"
        alt=""
        aria-hidden="true"
        className="hidden lg:block pointer-events-none select-none absolute bottom-6 -left-12 w-64 xl:w-80 opacity-[0.10]"
      />
      <style>{`
        .paper-surface {
          background-color: #FAF8F3;
        }
        .book-3d-stage {
          perspective: 2200px;
        }
        .book-turning-leaf {
          transform-style: preserve-3d;
          will-change: transform;
        }
        .book-leaf-face {
          backface-visibility: hidden;
          -webkit-backface-visibility: hidden;
          transform: translateZ(0.5px);
        }
        .book-leaf-back {
          transform: rotateY(180deg) translateZ(0.5px);
        }
      `}</style>

      <div className="taste-wrap relative z-10">
        <FadeIn>
          <div className="mb-3">
            <h2 className="font-serif font-normal text-[clamp(1.6rem,2.6vw,2.2rem)] leading-[1.12] tracking-[-0.025em] text-[#1C1917]">
              Buku Katalog — {shop.name}
            </h2>
          </div>

          <div className="mb-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
              {shopBooks.map((bk, idx) => {
                const isSelectedBook = bk.shop.id === shop.id;
                return (
                  <button
                    key={bk.shop.id}
                    type="button"
                    onClick={() => handleSwitchShopBook(bk.shop.id)}
                    className={`min-h-[48px] px-3 py-2 rounded-[10px] border text-left transition-colors flex items-center gap-2.5 cursor-pointer ${
                      isSelectedBook
                        ? 'bg-[#7C3219] text-white border-[#7C3219] shadow-sm'
                        : 'bg-[#FCFBF8] hover:bg-white text-[#1C1917] border-[#1C1917]/15 hover:border-[#7C3219]/40'
                    }`}
                  >
                    <span
                      className={`font-mono text-[12px] tabular-nums shrink-0 ${
                        isSelectedBook ? 'text-[#F6EEDB] font-semibold' : 'text-[#B6842C] font-medium'
                      }`}
                    >
                      0{idx + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <span
                        title={bk.shop.name}
                        className="block text-[13px] font-medium leading-snug truncate"
                      >
                        {bk.shop.name}
                      </span>
                      <span
                        className={`block text-[11.5px] ${
                          isSelectedBook ? 'text-white/80' : 'text-[#575049]'
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

          <div className="flex items-center gap-1.5 overflow-x-auto book-strip-scroll mb-4 pb-2.5 border-b border-[#1C1917]/12">
            <button
              type="button"
              disabled={Boolean(flipState)}
              onClick={() => triggerFlip(0)}
              className={`shrink-0 min-h-[36px] px-3 py-1.5 rounded-[10px] text-[12.5px] font-medium border transition-colors cursor-pointer ${
                safePage === 0
                  ? 'bg-[#7C3219] text-white border-[#7C3219]'
                  : 'bg-[#FCFBF8] text-[#575049] border-[#1C1917]/15 hover:text-[#1C1917] hover:border-[#7C3219]/40'
              }`}
            >
              Sampul Depan
            </button>

            <button
              type="button"
              disabled={Boolean(flipState)}
              onClick={() => triggerFlip(1)}
              className={`shrink-0 min-h-[36px] px-3 py-1.5 rounded-[10px] text-[12.5px] font-medium border transition-colors cursor-pointer ${
                safePage === 1
                  ? 'bg-[#7C3219] text-white border-[#7C3219]'
                  : 'bg-[#FCFBF8] text-[#575049] border-[#1C1917]/15 hover:text-[#1C1917] hover:border-[#7C3219]/40'
              }`}
            >
              {isMobile ? 'Profil Sanggar' : 'Cerita & Info Toko'}
            </button>

            {products.map((p, idx) => {
              const pageNum = idx + 2;
              const isActive = safePage === pageNum;
              return (
                <button
                  key={p.id}
                  type="button"
                  disabled={Boolean(flipState)}
                  onClick={() => triggerFlip(pageNum)}
                  className={`shrink-0 min-h-[36px] px-3 py-1.5 rounded-[10px] text-[12.5px] font-medium border transition-colors cursor-pointer ${
                    isActive
                      ? 'bg-[#7C3219] text-white border-[#7C3219]'
                      : 'bg-[#FCFBF8] text-[#575049] border-[#1C1917]/15 hover:text-[#1C1917] hover:border-[#7C3219]/40'
                  }`}
                >
                  {idx + 1}. {p.name}
                </button>
              );
            })}

            <button
              type="button"
              disabled={Boolean(flipState)}
              onClick={() => triggerFlip(backCoverPage)}
              className={`shrink-0 min-h-[36px] px-3 py-1.5 rounded-[10px] text-[12.5px] font-medium border transition-colors cursor-pointer ${
                safePage === backCoverPage
                  ? 'bg-[#7C3219] text-white border-[#7C3219]'
                  : 'bg-[#FCFBF8] text-[#575049] border-[#1C1917]/15 hover:text-[#1C1917] hover:border-[#7C3219]/40'
              }`}
            >
              Sampul Belakang
            </button>
          </div>
        </FadeIn>

        {/* Panggung Buku 3D: Mobile = 1-Lembar Utuh dengan animasi balik halaman | Desktop = 2-Halaman Spread */}
        <FadeIn variant="scale" delay={120}>
          {isMobile ? (
            <div className="relative mx-auto max-w-md px-2.5 sm:px-0">
              <div
                ref={mobileStageRef}
                onPointerDown={handleMobilePointerDown}
                onPointerMove={handleMobilePointerMove}
                onPointerUp={handleMobilePointerUp}
                onPointerCancel={handleMobilePointerUp}
                className={`book-3d-stage relative select-none touch-pan-y ${BOOK_FRAME_HEIGHT}`}
              >
                {/* Lembar dasar yang tersingkap di bawah */}
                <div className="relative h-full">
                  {renderMobileSheetWithFrame(mobileBasePage, !flipState)}

                  {flipState && (
                    <div
                      className="pointer-events-none absolute inset-0 rounded-lg z-20"
                      style={{
                        opacity: mobileIsNext
                          ? (1 - flipState.progress) * 0.42
                          : flipState.progress * 0.42,
                        background:
                          'linear-gradient(to right, rgba(24,14,8,0.45) 0%, rgba(24,14,8,0.12) 45%, transparent 100%)',
                      }}
                    />
                  )}
                </div>

                {/* Lembar kertas 3D yang berputar dari jilid kiri (0deg <-> -90deg) */}
                {flipState && (
                  <div
                    style={{
                      transformOrigin: 'left center',
                      transform: `rotateY(${mobileLeafAngle}deg)`,
                    }}
                    className="book-turning-leaf pointer-events-none absolute inset-0 z-30"
                  >
                    <div
                      style={{ opacity: mobileLeafOpacity }}
                      className="book-leaf-face absolute inset-0"
                    >
                      {renderMobileSheetWithFrame(mobileLeafPage, false)}
                      <div
                        className="absolute inset-0 rounded-lg pointer-events-none"
                        style={{
                          opacity: 0.2 + mobileLeafArch * 0.65,
                          background:
                            'linear-gradient(90deg, rgba(25,15,10,0.22) 0%, rgba(255,250,240,0.38) 48%, rgba(44,36,30,0.12) 100%)',
                        }}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Tombol panah melayang di samping kiri & kanan buku Mobile */}
              {!flipState && safePage > 0 && (
                <button
                  type="button"
                  onClick={() => triggerFlip(safePage - 1)}
                  aria-label="Halaman sebelumnya"
                  className="w-10 h-10 rounded-full bg-[#FCFBF8]/95 border border-[#1C1917]/20 shadow-[0_6px_18px_rgba(24,18,14,0.22)] text-[#7C3219] active:scale-95 flex items-center justify-center absolute top-1/2 -translate-y-1/2 -left-1.5 sm:-left-4 z-40 cursor-pointer"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
              )}

              {!flipState && safePage < backCoverPage && (
                <button
                  type="button"
                  onClick={() => triggerFlip(safePage + 1)}
                  aria-label="Halaman berikutnya"
                  className="w-10 h-10 rounded-full bg-[#FCFBF8]/95 border border-[#1C1917]/20 shadow-[0_6px_18px_rgba(24,18,14,0.22)] text-[#7C3219] active:scale-95 flex items-center justify-center absolute top-1/2 -translate-y-1/2 -right-1.5 sm:-right-4 z-40 cursor-pointer"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              )}
            </div>
          ) : (
            <div
              ref={bookContainerRef}
              onPointerDown={handleBookPointerDown}
              onPointerMove={handleBookPointerMove}
              onPointerUp={handleBookPointerUp}
              onPointerCancel={handleBookPointerUp}
              className="relative mx-auto select-none"
            >
              {isFrontCoverTransition ? (
                <div
                  style={{
                    transform: `translateX(${-(1 - frontOpenAmount) * 25}%)`,
                  }}
                  className="relative mx-auto p-2 sm:p-2.5"
                >
                  <div
                    className={`book-3d-stage relative grid grid-cols-1 lg:grid-cols-2 ${BOOK_FRAME_HEIGHT}`}
                  >
                    <div className="hidden lg:block pointer-events-none" />

                    <div className="relative h-full rounded-lg lg:rounded-l-none lg:rounded-r-lg overflow-hidden bg-[#FAF8F3] border border-[#1C1917]/20 shadow-[0_20px_45px_rgba(24,18,14,0.28)]">
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
                        transform: `rotateY(${-frontOpenAmount * 180}deg)`,
                      }}
                      className="hidden lg:block book-turning-leaf pointer-events-none absolute top-0 bottom-0 z-30"
                    >
                      <div
                        style={{ visibility: frontOpenAmount >= 0.5 ? 'hidden' : 'visible' }}
                        className="book-leaf-face absolute inset-0"
                      >
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

                      <div
                        style={{ visibility: frontOpenAmount < 0.5 ? 'hidden' : 'visible' }}
                        className="book-leaf-face book-leaf-back absolute inset-0 rounded-l-lg overflow-hidden bg-[#FAF8F3] border border-[#1C1917]/20 shadow-[0_18px_36px_rgba(24,18,14,0.28)]"
                      >
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
                  className="relative mx-auto p-2 sm:p-2.5"
                >
                  <div
                    className={`book-3d-stage relative grid grid-cols-1 lg:grid-cols-2 ${BOOK_FRAME_HEIGHT}`}
                  >
                    <div className="relative h-full rounded-lg lg:rounded-r-none lg:rounded-l-lg overflow-hidden bg-[#FAF8F3] border border-[#1C1917]/20 shadow-[0_20px_45px_rgba(24,18,14,0.28)]">
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
                        transform: `rotateY(${(1 - backClosedAmount) * 180}deg)`,
                      }}
                      className="hidden lg:block book-turning-leaf pointer-events-none absolute top-0 bottom-0 z-30"
                    >
                      <div
                        style={{ visibility: backClosedAmount <= 0.5 ? 'hidden' : 'visible' }}
                        className="book-leaf-face absolute inset-0"
                      >
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

                      <div
                        style={{ visibility: backClosedAmount > 0.5 ? 'hidden' : 'visible' }}
                        className="book-leaf-face book-leaf-back absolute inset-0 rounded-r-lg overflow-hidden bg-[#FAF8F3] border border-[#1C1917]/20 shadow-[0_18px_36px_rgba(24,18,14,0.28)]"
                      >
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
                <div className="w-full lg:w-1/2 mx-auto p-2 sm:p-2.5">
                  <div className={BOOK_FRAME_HEIGHT}>{renderFrontCoverFace(true)}</div>
                </div>
              ) : safePage === backCoverPage ? (
                <div className="w-full lg:w-1/2 mx-auto p-2 sm:p-2.5">
                  <div className={BOOK_FRAME_HEIGHT}>{renderBackCoverFace(true)}</div>
                </div>
              ) : (
                <div className="relative rounded-lg bg-[#2B201A] p-2 sm:p-2.5 shadow-[0_24px_54px_rgba(24,18,14,0.34)] border border-[#1C1917]/25">
                  <div className="hidden lg:block absolute inset-y-3.5 left-1.5 w-2 bg-[repeating-linear-gradient(to_right,#E4DCC9_0px,#FAF8F3_1px,#D2C6B0_2px)] rounded-l-sm z-10 shadow-inner" />
                  <div className="hidden lg:block absolute inset-y-3.5 right-1.5 w-2 bg-[repeating-linear-gradient(to_left,#E4DCC9_0px,#FAF8F3_1px,#D2C6B0_2px)] rounded-r-sm z-10 shadow-inner" />

                  <div
                    className={`book-3d-stage relative grid grid-cols-1 lg:grid-cols-2 rounded-md bg-[#FAF8F3] ${BOOK_FRAME_HEIGHT}`}
                  >
                    <div className="relative h-full min-h-0 overflow-hidden lg:rounded-l-md border-b lg:border-b-0 lg:border-r border-[#1C1917]/12">
                      {renderSpreadSide(baseLeftSpread, 'left', !flipState)}

                      {isTurningBetweenSpreads && (
                        <div
                          className="pointer-events-none absolute inset-0 z-20"
                          style={{
                            opacity:
                              flipState.direction === 'next'
                                ? Math.max(0, (flipState.progress - 0.35) * 1.1)
                                : Math.max(0, (0.65 - flipState.progress) * 1.1),
                            background:
                              'linear-gradient(to left, rgba(28,18,12,0.25) 0%, rgba(44,36,30,0.06) 45%, transparent 100%)',
                          }}
                        />
                      )}
                    </div>

                    <div className="relative h-full min-h-0 overflow-hidden lg:rounded-r-md">
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
                          transform: `rotateY(${turnAngle}deg)`,
                        }}
                        className="hidden lg:block book-turning-leaf pointer-events-none absolute top-0 bottom-0 z-30"
                      >
                        <div
                          style={{ visibility: flipState.progress >= 0.5 ? 'hidden' : 'visible' }}
                          className="book-leaf-face absolute inset-0 overflow-hidden bg-[#FAF8F3] shadow-[0_18px_40px_rgba(24,18,14,0.3)] border-l border-[#1C1917]/15"
                        >
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

                        <div
                          style={{ visibility: flipState.progress < 0.5 ? 'hidden' : 'visible' }}
                          className="book-leaf-face book-leaf-back absolute inset-0 overflow-hidden bg-[#FAF8F3] shadow-[0_18px_40px_rgba(24,18,14,0.3)] border-r border-[#1C1917]/15"
                        >
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
                          width: cornerHover === 'left' ? '76px' : '50px',
                          height: cornerHover === 'left' ? '76px' : '50px',
                          background:
                            'linear-gradient(45deg, #E5D7C1 0%, #EFE5D3 44%, #FAF8F3 50%, rgba(28,25,23,0.15) 52%, transparent 56%)',
                          boxShadow:
                            cornerHover === 'left'
                              ? '6px -6px 14px rgba(28,25,23,0.16)'
                              : '2px -2px 6px rgba(28,25,23,0.08)',
                        }}
                        className="hidden lg:flex items-end justify-start p-2 absolute bottom-0 left-0 z-30 rounded-tr-md transition-all duration-300 cursor-pointer"
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
                          width: cornerHover === 'right' ? '76px' : '50px',
                          height: cornerHover === 'right' ? '76px' : '50px',
                          background:
                            'linear-gradient(315deg, #E5D7C1 0%, #EFE5D3 44%, #FAF8F3 50%, rgba(28,25,23,0.15) 52%, transparent 56%)',
                          boxShadow:
                            cornerHover === 'right'
                              ? '-6px -6px 14px rgba(28,25,23,0.16)'
                              : '-2px -2px 6px rgba(28,25,23,0.08)',
                        }}
                        className="hidden lg:flex items-end justify-end p-2 absolute bottom-0 right-0 z-30 rounded-tl-md transition-all duration-300 cursor-pointer"
                      >
                        <ChevronRight className="w-4 h-4 text-[#7C3219]" />
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Kontrol Navigasi Buku */}
          {isMobile ? (
            <div className="mt-3.5 max-w-md mx-auto text-center space-y-2">
              <div className="text-[12.5px] text-[#575049]">
                <strong className="font-medium text-[#1C1917] tabular-nums">
                  Lembar {safePage + 1} / {totalBookPages}
                </strong>
                <span> · {getPageTitle(safePage)}</span>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-1.5">
                {Array.from({ length: totalBookPages }, (_, idx) => (
                  <button
                    key={idx}
                    type="button"
                    disabled={Boolean(flipState)}
                    onClick={() => triggerFlip(idx)}
                    aria-label={getPageTitle(idx)}
                    className={`h-2 rounded-full transition-all cursor-pointer ${
                      idx === safePage
                        ? 'w-5 bg-[#7C3219]'
                        : 'w-2 bg-[#1C1917]/20 hover:bg-[#7C3219]/50'
                    }`}
                  />
                ))}
              </div>
            </div>
          ) : (
            <div className="mt-4 hidden lg:flex items-center justify-between gap-2">
              <button
                type="button"
                disabled={!canGoPrev || Boolean(flipState)}
                onClick={() => triggerFlip(safePage - 1)}
                className="taste-btn-secondary min-h-[44px] px-3.5 text-[13px]"
              >
                <ChevronLeft className="w-4 h-4 shrink-0" />
                <span>Sebelumnya</span>
              </button>

              <span className="text-[13px] text-[#575049] text-center">
                Klik atau seret sudut buku untuk membalik ·{' '}
                <strong className="font-medium text-[#1C1917] tabular-nums">
                  Lembar {safePage + 1} dari {totalBookPages}
                </strong>
              </span>

              <button
                type="button"
                disabled={!canGoNext || Boolean(flipState)}
                onClick={() => triggerFlip(safePage + 1)}
                className="taste-btn-secondary min-h-[44px] px-3.5 text-[13px]"
              >
                <span>Berikutnya</span>
                <ChevronRight className="w-4 h-4 shrink-0" />
              </button>
            </div>
          )}
        </FadeIn>
      </div>

      {renderDetailModal()}
    </section>
  );
}

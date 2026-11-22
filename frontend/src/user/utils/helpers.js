export function formatRupiah(amount) {
  if (amount === null || amount === undefined || Number.isNaN(Number(amount))) return '-';
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(Number(amount));
}

export function buildWhatsAppUrl(phone, message) {
  const digits = String(phone || '6281234567801').replace(/\D/g, '');
  const normalized = digits.startsWith('0')
    ? `62${digits.slice(1)}`
    : digits.startsWith('62')
    ? digits
    : `62${digits}`;
  return `https://wa.me/${normalized}?text=${encodeURIComponent(message)}`;
}

export function buildProductOrderWaUrl(shop, effectiveWa, prod, sourceNote = '') {
  const specLines = (prod.formattedAttributes || [])
    .map((attr) => `  - ${attr.label}: ${attr.displayValue}`)
    .join('\n');

  const sourceLine = sourceNote ? `\n• Sumber Pratinjau: *${sourceNote}*` : '';
  const message =
    `Halo *${shop.name}*, saya ingin memesan produk dari *Batik Wicara Trenggalek*:\n\n` +
    `• Produk: *${prod.name}*\n` +
    `• Kategori: *${prod.category.name}*\n` +
    `• Harga Satuan: *${formatRupiah(prod.price)}*` +
    `${sourceLine}\n` +
    (specLines ? `• Spesifikasi:\n${specLines}\n` : '') +
    `\nMohon informasi ketersediaan stok, jumlah pesanan, dan ongkos kirim. Terima kasih.`;

  return buildWhatsAppUrl(effectiveWa, message);
}

export function formatAttributeLabel(attrName = '') {
  return attrName
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export function formatAttributeValue(attrSchema, rawVal) {
  if (rawVal === undefined || rawVal === null || rawVal === '') return '-';
  if (attrSchema.type === 'boolean') {
    return Boolean(rawVal) ? 'Ya' : 'Tidak';
  }
  if (attrSchema.type === 'number') {
    const num = Number(rawVal);
    if (Number.isNaN(num)) return String(rawVal);
    if (attrSchema.name === 'berat_gram') return `${num.toLocaleString('id-ID')} gram`;
    return num.toLocaleString('id-ID');
  }
  if (attrSchema.type === 'date') {
    const dt = new Date(rawVal);
    if (Number.isNaN(dt.getTime())) return String(rawVal);
    return dt.toLocaleDateString('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  }
  return String(rawVal);
}

export function resolveVisualTheme(productName = '', shopId = '') {
  const lower = productName.toLowerCase();
  let pattern = 'cengkeh';
  if (lower.includes('turonggo')) pattern = 'turonggo';
  else if (lower.includes('cengkeh')) pattern = 'cengkeh';
  else if (lower.includes('gajah')) pattern = 'gajah_nungguk';
  else if (lower.includes('pari')) pattern = 'pari_srono';
  else if (lower.includes('manggis')) pattern = 'manggis';
  else if (lower.includes('batu')) pattern = 'batu_tumpuk';
  else if (lower.includes('kopi')) pattern = 'kopi';

  if (shopId.endsWith('02') || lower.includes('biru') || lower.includes('indigo')) {
    return {
      warna_utama: '#132D46',
      warna_sekunder: '#2E6F9E',
      warna_aksen: '#E6F1F8',
      pola_jenis: pattern,
    };
  }
  if (lower.includes('manggis')) {
    return {
      warna_utama: '#3A1729',
      warna_sekunder: '#8E3B58',
      warna_aksen: '#F5DCE4',
      pola_jenis: pattern,
    };
  }
  if (lower.includes('batu')) {
    return {
      warna_utama: '#2C2A29',
      warna_sekunder: '#7D746D',
      warna_aksen: '#EAE4DC',
      pola_jenis: pattern,
    };
  }
  if (lower.includes('pari srono mas')) {
    return {
      warna_utama: '#241B12',
      warna_sekunder: '#D49B35',
      warna_aksen: '#FFF3D6',
      pola_jenis: pattern,
    };
  }
  if (shopId.endsWith('05') || lower.includes('terakota')) {
    return {
      warna_utama: '#341914',
      warna_sekunder: '#B84A27',
      warna_aksen: '#F7E3C3',
      pola_jenis: pattern,
    };
  }
  return {
    warna_utama: '#2E1A12',
    warna_sekunder: '#C87D32',
    warna_aksen: '#F5E6C8',
    pola_jenis: pattern,
  };
}

export function buildRelationalCatalog(db) {
  const accountById = new Map((db.account || []).map((a) => [a.id, a]));
  const categoryById = new Map((db.category || []).map((c) => [c.id, c]));

  const attrsByCatId = new Map();
  (db.category_attribute || []).forEach((attr) => {
    if (!attrsByCatId.has(attr.category_id)) attrsByCatId.set(attr.category_id, []);
    attrsByCatId.get(attr.category_id).push(attr);
  });
  attrsByCatId.forEach((list) => list.sort((a, b) => (a.order ?? 0) - (b.order ?? 0)));

  const displayImgsByProdId = new Map();
  (db.product_display_image || []).forEach((img) => {
    if (!displayImgsByProdId.has(img.product_id)) displayImgsByProdId.set(img.product_id, []);
    displayImgsByProdId.get(img.product_id).push(img);
  });
  displayImgsByProdId.forEach((list) => list.sort((a, b) => (a.order ?? 0) - (b.order ?? 0)));

  const mockupByProdId = new Map(
    (db.product_mockup_image || []).map((m) => [m.product_id, m])
  );

  const activeShopList = (db.shop || []).filter((s) => s.active_status !== false);
  const shopById = new Map(activeShopList.map((s) => [s.id, s]));

  const enrichedProdList = (db.product || [])
    .filter((p) => p.active_status !== false && shopById.has(p.shop_id))
    .map((p) => {
      const shopObj = shopById.get(p.shop_id);
      const catObj = categoryById.get(p.category_id) || {
        id: p.category_id,
        name: 'Umum',
        slug: 'umum',
      };
      const catAttrs = attrsByCatId.get(p.category_id) || [];
      const rawAttrs = p.additional_attribute || {};

      const formattedAttributes = catAttrs
        .filter((schema) => rawAttrs[schema.name] !== undefined || schema.required)
        .map((schema) => ({
          name: schema.name,
          label: formatAttributeLabel(schema.name),
          type: schema.type,
          required: schema.required,
          rawValue: rawAttrs[schema.name],
          displayValue: formatAttributeValue(schema, rawAttrs[schema.name]),
        }));

      Object.keys(rawAttrs).forEach((key) => {
        if (!catAttrs.some((s) => s.name === key)) {
          formattedAttributes.push({
            name: key,
            label: formatAttributeLabel(key),
            type: typeof rawAttrs[key],
            required: false,
            rawValue: rawAttrs[key],
            displayValue: String(rawAttrs[key]),
          });
        }
      });

      const displayImages = displayImgsByProdId.get(p.id) || [];
      const mockupImage = mockupByProdId.get(p.id) || null;

      return {
        ...p,
        price: Number(p.price),
        shop: shopObj,
        category: catObj,
        formattedAttributes,
        displayImages,
        primaryImageUrl: displayImages[0]?.image_url || '',
        mockupImage,
      };
    });

  const books = activeShopList.map((s) => ({
    shop: s,
    account: accountById.get(s.account_id) || null,
    products: enrichedProdList.filter((p) => p.shop_id === s.id),
  }));

  return {
    activeShops: activeShopList,
    enrichedProducts: enrichedProdList,
    shopBooks: books,
  };
}
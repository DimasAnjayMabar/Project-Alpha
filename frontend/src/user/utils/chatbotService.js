import { formatRupiah } from './helpers';

export const QUICK_PROMPTS = [
  'Batik di bawah Rp 120.000',
  'Rekomendasi kemeja batik',
  'Filosofi Turonggo Yakso',
  'Daftar sentra UMKM',
];

export const INITIAL_CHAT_MESSAGES = [
  {
    id: 'welcome-1',
    sender: 'bot',
    text: 'Sugeng rawuh di Batik Wicara Trenggalek! Saya asisten katalog Anda. Mau cari motif tertentu, kemeja siap pakai, atau rekomendasi sesuai anggaran?',
    products: [],
  },
];

/**
 * Fungsi utama pemroses pesan chatbot.
 * Nanti saat integrasi ke API AI (Gemini / Backend), cukup ganti isi fungsi ini
 * dengan pemanggilan `fetch('/api/chat', ...)` tanpa mengubah komponen UI.
 */
export async function getChatbotResponse(userMessage, context) {
  const { enrichedProducts = [], shopBooks = [] } = context;
  const q = userMessage.toLowerCase().trim();

  // Simulasi jeda respons alami (hapus jika sudah memakai fetch API sungguhan)
  await new Promise((resolve) => setTimeout(resolve, 350));

  // 1. Cek pertanyaan daftar toko / sanggar UMKM
  if (q.includes('toko') || q.includes('sanggar') || q.includes('umkm') || q.includes('alamat')) {
    const shopLines = shopBooks
      .map((b, idx) => `${idx + 1}. ${b.shop.name} (${b.products.length} produk)`)
      .join('\n');
    return {
      text: `Saat ini terdapat ${shopBooks.length} sentra UMKM aktif di Trenggalek:\n${shopLines}\n\nKlik salah satu produk di bawah untuk membuka buku katalog sanggarnya:`,
      products: shopBooks.map((b) => b.products[0]).filter(Boolean).slice(0, 2),
    };
  }

  // 2. Cek filter anggaran / harga (misal: "di bawah 120000" atau "murah")
  const priceMatch = q.replace(/\./g, '').match(/(\d{5,7})/);
  if (priceMatch || q.includes('murah') || q.includes('terjangkau') || q.includes('budget')) {
    const maxBudget = priceMatch ? Number(priceMatch[1]) : 120000;
    const affordable = enrichedProducts
      .filter((p) => Number(p.price) <= maxBudget)
      .sort((a, b) => a.price - b.price);

    if (affordable.length > 0) {
      return {
        text: `Ditemukan ${affordable.length} koleksi dengan harga hingga ${formatRupiah(maxBudget)}:`,
        products: affordable.slice(0, 3),
      };
    }
    return {
      text: `Belum ada produk dengan harga di bawah ${formatRupiah(maxBudget)}. Koleksi paling terjangkau kami mulai dari ${formatRupiah(
        Math.min(...enrichedProducts.map((p) => Number(p.price)))
      )}.`,
      products: [...enrichedProducts].sort((a, b) => a.price - b.price).slice(0, 2),
    };
  }

  // 3. Pencarian kata kunci pada nama produk, kategori, filosofi, atau nama sanggar
  const keywords = q.split(/\s+/).filter((w) => w.length > 2);
  const matched = enrichedProducts.filter((p) => {
    const haystack = `${p.name} ${p.category.name} ${p.description} ${p.shop.name} ${p.shop.address}`.toLowerCase();
    return keywords.some((kw) => haystack.includes(kw));
  });

  if (matched.length > 0) {
    const topMatch = matched[0];
    return {
      text: `Saya menemukan ${matched.length} koleksi yang relevan. Salah satunya "${topMatch.name}" karya ${topMatch.shop.name} (${formatRupiah(topMatch.price)}).`,
      products: matched.slice(0, 3),
    };
  }

  // 4. Fallback jika belum cocok
  return {
    text: 'Maaf, saya belum menemukan kata kunci tersebut. Coba ketik nama motif (misal: Turonggo Yakso, Cengkeh, Manggis, Pari Srono), kategori (Kemeja / Kain), atau batas harga Anda.',
    products: enrichedProducts.slice(0, 2),
  };
}
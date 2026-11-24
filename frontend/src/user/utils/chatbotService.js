// frontend/src/user/utils/chatbotService.js
import { backendFetch } from '../../utils/url_controller';

export const QUICK_PROMPTS = [
  'Rekomendasi batik di bawah 300rb',
  'Rekomendasi batik Turonggo Yakso',
  'Apa filosofi motif Turonggo Yakso?',
  'Bagaimana cara merawat kain batik tulis?',
];

export const INITIAL_CHAT_MESSAGES = [
  {
    id: 'welcome-1',
    sender: 'bot',
    intent: 'social',
    text: 'Sugeng rawuh di Batik Wicara Trenggalek! Saya asisten katalog Anda. Silakan tanya seputar filosofi motif, perawatan kain, atau minta rekomendasi batik sesuai anggaran.',
    products: [],
  },
];

// Simpan pola endpoint /chatbot/answer yang cocok dengan controller backend
// ('query' -> /chatbot/answer?job_id=... | 'path' -> /chatbot/answer/{job_id})
let detectedAnswerMode = 'query';

const POLL_INTERVAL_MS = 1000;
const MAX_POLL_ATTEMPTS = 45; // Maksimal ~45 detik menunggu proses RAG + LLM

async function parseJsonSafe(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function extractErrorMessage(payload, fallback) {
  if (!payload) return fallback;
  if (typeof payload.message === 'string' && payload.message.trim()) {
    return payload.message;
  }
  if (typeof payload.detail === 'string' && payload.detail.trim()) {
    return payload.detail;
  }
  if (Array.isArray(payload.detail) && payload.detail.length > 0) {
    return payload.detail
      .map((item) => item?.msg || String(item))
      .filter(Boolean)
      .join(', ');
  }
  return fallback;
}

function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Permintaan dibatalkan.', 'AbortError'));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException('Permintaan dibatalkan.', 'AbortError'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

// =========================================================================
// 1. ENDPOINT BACKEND CHATBOT (BACKEND -> HARNESS)
// =========================================================================

/**
 * Mengirim pertanyaan ke POST /chatbot/question dan mengembalikan job_id.
 */
export async function submitChatbotQuestion(query, { signal } = {}) {
  const response = await backendFetch('/chatbot/question', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: String(query || '').trim() }),
    signal,
  });

  const payload = await parseJsonSafe(response);

  if (!response.ok) {
    if (response.status === 429) {
      throw new Error(
        'Terlalu banyak pertanyaan dalam waktu singkat. Mohon tunggu sebentar lalu coba lagi.'
      );
    }
    throw new Error(
      extractErrorMessage(payload, 'Gagal mengirim pertanyaan ke asisten chatbot.')
    );
  }

  const data = payload?.data || payload || {};
  const jobId = data.job_id || payload?.job_id;
  if (!jobId) {
    throw new Error('Server tidak mengembalikan job_id untuk pertanyaan ini.');
  }

  return {
    jobId: String(jobId),
    raw: data,
  };
}

/**
 * Mengambil status/hasil jawaban dari GET /chatbot/answer.
 * Otomatis menyesuaikan antara ?job_id=... dan /{job_id}.
 */
export async function fetchChatbotAnswer(jobId, { signal } = {}) {
  const encodedId = encodeURIComponent(String(jobId));
  const primaryMode = detectedAnswerMode;
  const fallbackMode = primaryMode === 'query' ? 'path' : 'query';

  const buildPath = (mode) =>
    mode === 'query'
      ? `/chatbot/answer?job_id=${encodedId}`
      : `/chatbot/answer/${encodedId}`;

  let response = await backendFetch(buildPath(primaryMode), { method: 'GET', signal });

  // Jika rute backend memakai pola satunya (404/405/422), otomatis coba pola alternatif
  if (response.status === 404 || response.status === 405 || response.status === 422) {
    const retryResponse = await backendFetch(buildPath(fallbackMode), { method: 'GET', signal });
    if (retryResponse.ok || retryResponse.status !== 404) {
      detectedAnswerMode = fallbackMode;
      response = retryResponse;
    }
  }

  const payload = await parseJsonSafe(response);

  if (!response.ok) {
    throw new Error(
      extractErrorMessage(payload, 'Gagal mengambil jawaban dari server chatbot.')
    );
  }

  return payload?.data || payload || {};
}

// =========================================================================
// 2. PEMETAAN REKOMENDASI PRODUK KE KARTU KATALOG FRONTEND
// =========================================================================

function mapSourceItemToProduct(src, enrichedProducts) {
  if (!src || typeof src !== 'object') return null;

  // Prioritas 1: Cocokkan langsung dengan produk katalog aktif berdasarkan ID
  if (src.id) {
    const byId = enrichedProducts.find((p) => String(p.id) === String(src.id));
    if (byId) return byId;
  }

  // Prioritas 2: Cocokkan berdasarkan nama motif/produk & nama UMKM
  const srcName = String(src.nama_motif || src.name || '').toLowerCase();
  const srcShop = String(src.nama_umkm || '').toLowerCase();
  if (srcName) {
    const byName = enrichedProducts.find((p) => {
      const prodName = String(p.name || '').toLowerCase();
      const shopName = String(p.shop?.name || '').toLowerCase();
      const nameHit = srcName.includes(prodName) || prodName.includes(srcName);
      const shopHit = !srcShop || shopName.includes(srcShop) || srcShop.includes(shopName);
      return nameHit && shopHit;
    });
    if (byName) return byName;
  }

  // Prioritas 3: Bentuk kartu produk dari metadata source harness jika belum ada di state lokal
  if (src.tipe === 'produk' || src.nama_motif) {
    return {
      id: String(src.id || `chat-prod-${src.nama_motif}`),
      shop_id: String(src.shop_id || ''),
      name: src.nama_motif || 'Koleksi Batik',
      price: Number(src.harga_per_meter) || 0,
      primaryImageUrl: src.thumbnail_url || '',
      formattedAttributes: [],
      category: { name: 'Batik' },
      shop: {
        id: String(src.shop_id || ''),
        name: src.nama_umkm || 'Sanggar Batik Trenggalek',
        number: src.kontak_wa && src.kontak_wa !== '-' ? src.kontak_wa : '',
        address: src.alamat || '',
      },
      _isSynthetic: !src.id || !src.shop_id,
    };
  }

  return null;
}

function resolveRecommendedProducts({ intent, answer, sources, enrichedProducts = [] }) {
  const result = [];
  const seenIds = new Set();

  const pushUnique = (prod) => {
    if (!prod || seenIds.has(prod.id)) return;
    seenIds.add(prod.id);
    result.push(prod);
  };

  // 1. Ambil dari array `sources` bila backend meneruskannya dari harness
  if (Array.isArray(sources) && sources.length > 0) {
    sources.forEach((src) => {
      const mapped = mapSourceItemToProduct(src, enrichedProducts);
      if (mapped) pushUnique(mapped);
    });
  }

  // 2. Fallback: bila intent === 'product' tapi `sources` tidak ikut di-forward backend,
  //    cocokkan nama produk katalog yang disebut di dalam teks jawaban asisten
  if (result.length === 0 && intent === 'product' && answer) {
    const answerLower = String(answer).toLowerCase();
    enrichedProducts.forEach((prod) => {
      const prodName = String(prod.name || '').trim().toLowerCase();
      if (prodName.length >= 4 && answerLower.includes(prodName)) {
        pushUnique(prod);
      }
    });
  }

  return result.slice(0, 3);
}

// =========================================================================
// 3. FUNGSI UTAMA UNTUK KOMPONEN BatikChatbotWidget.jsx
// =========================================================================

export async function getChatbotResponse(userMessage, context = {}, { signal } = {}) {
  const { enrichedProducts = [] } = context;

  // 1. Kirim pertanyaan -> dapatkan job_id
  const { jobId } = await submitChatbotQuestion(userMessage, { signal });

  // 2. Polling sampai status selesai ('done') atau gagal
  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
    if (attempt > 0) {
      await sleep(POLL_INTERVAL_MS, signal);
    }

    const result = await fetchChatbotAnswer(jobId, { signal });
    const jobStatus = String(result.status || '').toLowerCase();

    if (jobStatus === 'done' || jobStatus === 'completed' || jobStatus === 'finished') {
      const answerText =
        (typeof result.answer === 'string' && result.answer.trim()) ||
        'Maaf, asisten belum dapat memberikan jawaban saat ini.';
      const intent = result.intent || 'knowledge';

      const products = resolveRecommendedProducts({
        intent,
        answer: answerText,
        sources: result.sources,
        enrichedProducts,
      });

      return {
        text: answerText,
        intent,
        products,
        jobId,
      };
    }

    if (jobStatus === 'error' || jobStatus === 'failed') {
      throw new Error(
        result.error ||
          result.message ||
          result.answer ||
          'Terjadi kesalahan saat memproses jawaban di server asisten.'
      );
    }

    // Status masih pending / processing / queued -> lanjut polling iterasi berikutnya
  }

  throw new Error(
    'Waktu tunggu respons asisten habis. Pastikan layanan backend (3002) dan harness AI (3001) sedang aktif.'
  );
}
# harness/pipeline.py
"""
Unified DB-First RAG Pipeline.

Alur:
    1. Query masuk
    2. NLP preprocessing (normalisasi, deteksi bahasa, social check,
       ekstraksi filter harga, deteksi rujukan konteks sebelumnya & tipe permintaan)
    3. Cek nama barang / toko / motif ke DB (atau konteks produk sebelumnya)
    4. Retrieve data resmi dari DB (+ pengetahuan pelengkap ChromaDB hanya bila perlu)
    5. Rerank kandidat menggunakan CrossEncoder (BAAI/bge-reranker-v2-m3)
    6. Rangkum dengan LLM (1x call, bahasa dikunci sesuai bahasa query)
    7. Output RAGResponse (intent="product" + sources untuk card rekomendasi;
       intent="product_detail" / "knowledge" tanpa spam card untuk detail & edukasi)
"""

from __future__ import annotations

import hashlib
import logging
import os
import re
import time
from dataclasses import dataclass, field
from difflib import get_close_matches
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import chromadb
import requests
from chromadb.config import Settings
from sentence_transformers import CrossEncoder, SentenceTransformer

from cache import get_cache
from url_controller import ROOT_DIR, build_backend_url, get_backend_headers

# ── Import config dari root project ─────────────────────────────────────
from config import CONFIG  # noqa: E402

logger = logging.getLogger("harness.pipeline")
_LLM_ERROR_ANSWER = "Maaf, terjadi kesalahan saat memproses jawaban."


# ── Konstanta dari CONFIG ───────────────────────────────────────────────
def _resolve(p: str) -> str:
    return p if os.path.isabs(p) else str((ROOT_DIR / p).resolve())


EMBEDDING_MODEL        = CONFIG["embedding_model"]
RERANKER_MODEL         = CONFIG["reranker_model"]
CHROMA_COLLECTION      = CONFIG["chroma_collection"]
INSTRUCTION_COLLECTION = CONFIG["instruction_collection"]
GUARDRAILS_COLLECTION  = CONFIG["guard_rails_collection"]
CHROMA_PATH            = _resolve(CONFIG["chroma_path"])

MAX_CHROMA_K         = int(CONFIG["max_chroma_retrieval_k"])
RERANKED_K           = int(CONFIG["max_reranked_k"])
INSTRUCTION_K        = int(CONFIG.get("instruction_retrieval_k", 2))
GUARDRAILS_K         = int(CONFIG.get("guard_rails_retrieval_k", 2))

KNOWLEDGE_MAX_TOKENS = int(CONFIG["knowledge_max_new_tokens"])
KNOWLEDGE_TEMP       = float(CONFIG["knowledge_temperature"])
KNOWLEDGE_TOP_P      = float(CONFIG["knowledge_top_p"])

SOCIAL_MAX_TOKENS    = int(CONFIG["social_max_new_tokens"])
SOCIAL_TEMP          = float(CONFIG["social_temperature"])
SOCIAL_TOP_P         = float(CONFIG["social_top_p"])

PRODUCT_MAX_TOKENS   = int(CONFIG.get("product_max_new_tokens", 350))

# ── Backend e-commerce (Single Source of Truth) ─────────────────────────
BACKEND_PRODUCT_PATH  = CONFIG.get("backend_product_path", "/chatbot/products/search")
BACKEND_TIMEOUT       = int(CONFIG.get("backend_timeout", 10))
PRODUCT_K             = int(CONFIG.get("product_recommendation_k", 3))
BACKEND_MAX_LIMIT     = 20  # Sesuai validasi Query(..., le=20) di backend


# =========================================================================
# FALLBACK PROMPTS
# =========================================================================

_FALLBACK_GUARD_RAILS = (
    "Kamu hanya boleh menjawab pertanyaan seputar batik dan topik terkait "
    "(motif, sejarah, budaya, produk, UMKM). Tolak dengan sopan pertanyaan "
    "di luar topik tersebut."
)

_FALLBACK_INSTRUCTIONS = (
    "Jawab dengan bahasa yang ramah, natural, dan jelas seperti CS manusia."
)


# =========================================================================
# DATA STRUCTURES
# =========================================================================

@dataclass
class CandidateChunk:
    isi_id:       str
    konten_chunk: str
    vector_score: float
    source_type:  str = "knowledge_base"  # "db" | "knowledge_base"
    product_data: Optional[Dict] = None


@dataclass
class RerankedChunk:
    isi_id:       str
    konten_chunk: str
    vector_score: float
    rerank_score: float
    source_type:  str = "knowledge_base"
    product_data: Optional[Dict] = None


@dataclass
class QueryAnalysis:
    raw:                  str
    normalized:           str
    tokens:               List[str]
    token_set:            set
    language:             str           # "id" | "en"
    is_social:            bool
    wants_recommendation: bool
    is_product_spec:      bool
    is_knowledge_ask:     bool
    has_back_reference:   bool
    ordinal_index:        Optional[int]
    min_harga:            Optional[int]
    max_harga:            Optional[int]
    target_harga:         Optional[int]
    keyword_candidate:    str


@dataclass
class RAGResponse:
    answer:          str
    intent:          str
    sources:         List[Dict] = field(default_factory=list)
    processing_time: float = 0.0
    retrieval_time:  float = 0.0
    rerank_time:     float = 0.0
    generation_time: float = 0.0


# =========================================================================
# MODELS (embedding + reranker + LLM via model_call)
# =========================================================================

class HarnessModels:
    """Embedding + reranker + LLM. Lazy singleton."""

    _instance: Optional["HarnessModels"] = None

    @classmethod
    def get(cls) -> "HarnessModels":
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    def __init__(self):
        logger.info("Loading embedding model: %s", EMBEDDING_MODEL)
        self.embedding_model = SentenceTransformer(EMBEDDING_MODEL)

        logger.info("Loading reranker model: %s", RERANKER_MODEL)
        self.reranker = CrossEncoder(RERANKER_MODEL)

        from model_call import get_llm
        self.llm = get_llm()

        logger.info(
            "Harness models ready (embedding + reranker + llm=%s).",
            CONFIG.get("llm_provider", "groq"),
        )

    def embed(self, text: str) -> List[float]:
        return self.embedding_model.encode(
            text, convert_to_tensor=False, normalize_embeddings=True
        ).tolist()

    def rerank(self, query: str, texts: List[str]) -> List[float]:
        if not texts:
            return []
        pairs  = [[query, t] for t in texts]
        scores = self.reranker.predict(pairs)
        return scores.tolist() if hasattr(scores, "tolist") else list(scores)


# =========================================================================
# CHROMA RETRIEVER (pelengkap pengetahuan umum)
# =========================================================================

class ChromaRetriever:
    def __init__(self):
        logger.info("ChromaDB: %s", CHROMA_PATH)
        self.client = chromadb.PersistentClient(
            path=CHROMA_PATH,
            settings=Settings(anonymized_telemetry=False),
        )
        try:
            self.collection = self.client.get_collection(CHROMA_COLLECTION)
            logger.info(
                "ChromaDB ready — '%s' (%d dokumen)",
                CHROMA_COLLECTION, self.collection.count(),
            )
        except Exception:
            self.collection = None
            logger.warning(
                "ChromaDB koleksi '%s' tidak ditemukan — berjalan hanya dengan DB + rules",
                CHROMA_COLLECTION,
            )

    def retrieve(self, query_embedding: List[float], k: int) -> List[CandidateChunk]:
        if self.collection is None or k <= 0:
            return []

        try:
            total = self.collection.count()
            if total == 0:
                return []

            results = self.collection.query(
                query_embeddings=[query_embedding],
                n_results=min(k, total),
                include=["documents", "metadatas", "distances"],
            )
        except Exception:
            logger.exception("ChromaDB query gagal (k=%d)", k)
            return []

        if not results["ids"] or not results["ids"][0]:
            return []

        out: List[CandidateChunk] = []
        for i, doc_id in enumerate(results["ids"][0]):
            meta = results["metadatas"][0][i] if results["metadatas"] else {}
            dist = float(results["distances"][0][i]) if results["distances"] else 1.0
            out.append(CandidateChunk(
                isi_id=meta.get("source_stem", doc_id) or doc_id,
                konten_chunk=results["documents"][0][i],
                vector_score=dist,
                source_type="knowledge_base",
            ))
        return out


# =========================================================================
# HELPER KOLEKSI ATURAN (instruction & guard_rails)
# =========================================================================

def _get_optional_collection(client: chromadb.ClientAPI, name: str):
    try:
        col = client.get_collection(name)
        logger.info("[Rules] Koleksi '%s' siap (%d chunk)", name, col.count())
        return col
    except Exception:
        logger.warning("[Rules] Koleksi '%s' tidak ada — akan pakai fallback", name)
        return None


# =========================================================================
# PIPELINE
# =========================================================================

class HarnessPipeline:
    """
    Pipeline terpadu (NLP -> DB entity/context check -> Unified Rerank -> LLM).
    """

    def __init__(self):
        self.models = HarnessModels.get()
        self.chroma = ChromaRetriever()

        self.instruction_col = _get_optional_collection(
            self.chroma.client, INSTRUCTION_COLLECTION
        )
        self.guard_rails_col = _get_optional_collection(
            self.chroma.client, GUARDRAILS_COLLECTION
        )

        # Memori ringan konteks produk terakhir per session_id
        self._session_last_products: Dict[str, List[Dict]] = {}
        self._max_sessions = 200

        self.cache = get_cache(CONFIG, harness_dir=Path(__file__).resolve().parent)
        self._cache_last_cleanup = time.time()

        logger.info(
            "[Pipeline] Siap — instruction_k=%d, guard_rails_k=%d, product_k=%d",
            INSTRUCTION_K, GUARDRAILS_K, PRODUCT_K,
        )

    def close(self):
        if getattr(self, "cache", None):
            try:
                self.cache.close()
            except Exception:
                pass

    def _maybe_cleanup_cache(self):
        now = time.time()
        if now - self._cache_last_cleanup > 600:
            self._cache_last_cleanup = now
            self.cache.cleanup()

    def _remember_products(self, session_id: str, products: List[Dict]):
        if not products:
            return
        if len(self._session_last_products) >= self._max_sessions:
            oldest_key = next(iter(self._session_last_products))
            self._session_last_products.pop(oldest_key, None)
        self._session_last_products[session_id] = products[:PRODUCT_K]

    # =====================================================================
    # STEP 1: NLP PREPROCESSING & ANALISIS QUERY
    # =====================================================================

    _SOCIAL_PHRASES = {
        "selamat pagi", "selamat siang", "selamat sore", "selamat malam",
        "terima kasih", "makasih banyak", "apa kabar", "sugeng rawuh",
        "sugeng enjang", "sampai jumpa", "dadah", "permisi", "thank you",
    }
    _SOCIAL_WORDS = {
        "halo", "hai", "hello", "hi", "hey", "hei", "pagi", "siang",
        "sore", "malam", "makasih", "thanks", "thank", "oke", "ok",
        "sip", "siap", "mantap", "bye", "assalamualaikum", "p",
    }

    _RECOMMENDATION_WORDS = {
        "rekomendasi", "rekomendasikan", "rekomendasiin", "rekomen", "rekom",
        "saran", "sarankan", "saranin", "cari", "carikan", "daftar", "list",
        "pilihan", "koleksi", "katalog", "beli", "order", "pesan", "jual",
        "murah", "termurah", "terbaik", "bagus", "populer", "favorit",
        "terlaris", "premium", "budget", "dibawah", "diatas", "max", "maks",
        "maksimal", "minimal", "recommend", "popular", "suggest", "buy",
        "catalog", "available", "above", "over",
    }
    _RECOMMENDATION_PHRASES = (
        "di bawah", "di atas", "kurang dari", "lebih dari", "mulai dari",
        "apa saja", "apa aja",
        "ada batik apa", "ada produk apa", "punya batik apa",
        "jual batik apa", "mau lihat", "lihat produk", "lihat koleksi",
        "batik populer", "batik bagus", "batik murah", "batik premium",
        "show me", "looking for", "under ", "above ", "over ",
    )

    _PRODUCT_SPEC_WORDS = {
        "harga", "harganya", "brp", "berapa", "meter", "cm", "ukuran",
        "ukurannya", "panjang", "panjangnya", "lebar", "lebarnya",
        "perlembar", "lembar", "berat", "beratnya", "gram", "stok",
        "ready", "tersedia", "spek", "spesifikasi", "bahan", "bahannya",
        "teknik", "tekniknya", "bentuk", "bentuknya", "pewarna",
        "toko", "tokonya", "sanggar", "umkm", "wa", "whatsapp",
        "kontak", "alamat", "link", "shopee", "tokopedia", "price", "size",
    }

    _KNOWLEDGE_SIGNALS = (
        "filosofi", "sejarah", "makna", "asal usul", "asal-usul",
        "cara merawat", "cara mencuci", "perawatan", "proses pembuatan",
        "perbedaan", "bedanya", "pengertian", "definisi", "apa itu",
        "ceritakan", "cerita", "arti ", "artinya", "canting", "malam", "sogan",
        "philosophy", "history", "meaning", "how to care", "how to wash",
    )

    _BACK_REF_PHRASES = (
        "yang pertama", "yang kedua", "yang ketiga", "yang tadi",
        "produk pertama", "produk kedua", "produk ketiga",
        "batik pertama", "batik kedua", "batik ketiga",
        "batik ini", "batik itu", "kain ini", "kain itu",
        "produk ini", "produk itu", "barang ini", "barang itu",
    )
    _BACK_REF_WORDS = {
        "ini", "itu", "tersebut", "tadi", "produknya", "batiknya",
        "kainnya", "tokonya", "harganya", "ukurannya", "bahannya",
        "filosofinya", "maknanya", "deskripsinya", "beratnya",
    }

    _EN_MARKERS = {
        "what", "which", "where", "how", "why", "can", "could", "would",
        "please", "recommend", "popular", "price", "size", "about",
        "tell", "show", "looking", "want", "buy", "fabric", "shirt",
        "the", "is", "are", "for", "under", "above", "over", "with",
    }
    _ID_MARKERS = {
        "apa", "apakah", "ada", "aja", "saja", "yang", "ini", "itu",
        "berapa", "bagaimana", "gimana", "dimana", "dong", "kak", "ya",
        "bisa", "mau", "cari", "beli", "pesan", "harga", "ukuran",
        "bahan", "filosofi", "sejarah", "makna", "rekomendasi", "murah",
        "bagus", "populer", "dibawah", "bawah", "diatas", "atas", "toko",
        "sanggar", "perlembar", "lembar", "meter", "untuk", "buat", "dari",
        "dan", "km", "kamu", "yg",
    }

    _STOPWORDS = {
        "admin", "antara", "apa", "apakah", "ada", "aja", "alamat", "alamatnya",
        "atas", "atau", "bagaimana", "bagus", "bahan", "bahannya", "barang",
        "bawah", "beli", "benar", "bener", "bentuk", "bentuknya", "berarti",
        "berapa", "berat", "beratnya", "betul", "bisa", "brp", "budget",
        "buat", "bukan", "cari", "carikan", "cerita", "ceritakan", "ceritanya",
        "cm", "coba", "daftar", "dan", "dana", "dari", "deh", "dengan",
        "deskripsi", "deskripsinya", "detail", "di", "diatas", "dibawah",
        "dimana", "dong", "enggak", "favorit", "filosofi", "filosofinya",
        "ga", "gak", "gimana", "gk", "gram", "harga", "harganya", "hingga",
        "idr", "info", "informasi", "ini", "itu", "iya", "jadi", "jelaskan",
        "jenis", "jual", "juta", "jutaan", "jt", "k", "kah", "kak", "kalau",
        "kalo", "kamu", "kan", "kasih", "katalog", "ke", "kedua", "ketiga",
        "kisaran", "km", "kok", "koleksi", "kontak", "kurang", "lebar",
        "lebarnya", "lebih", "lembar", "lihat", "link", "list", "makna",
        "maknanya", "maks", "maksimal", "mana", "mau", "max", "mengenai",
        "meter", "min", "minimal", "minta", "motif", "motifnya", "mulai",
        "murah", "nggak", "nih", "nya", "nomor", "order", "pakai", "panjang",
        "panjangnya", "penjelasan", "penjual", "per", "perlembar", "pertama",
        "pesan", "pewarna", "pilihan", "populer", "premium", "produk",
        "produknya", "punya", "rb", "rban", "ready", "rekom", "rekomen",
        "rekomendasi", "rekomendasikan", "rekomendasiin", "ribu", "ribuan",
        "rp", "saja", "sama", "sampai", "sanggar", "saran", "sarankan",
        "saranin", "satuan", "saya", "seharga", "sejarah", "sejarahnya",
        "sekitar", "semua", "seputar", "shopee", "sih", "spek", "spesifikasi",
        "stok", "tadi", "tanya", "teknik", "tekniknya", "tentang", "terbaik",
        "terlaris", "tersedia", "tersebut", "tidak", "toko", "tokonya",
        "tokopedia", "tolong", "trenggalek", "tuh", "ukuran", "ukurannya",
        "umkm", "untuk", "wa", "whatsapp", "ya", "yah", "yang", "yg",
        # English filler words
        "a", "above", "an", "and", "are", "around", "buy", "can", "do", "for",
        "give", "have", "how", "i", "in", "is", "it", "looking", "me", "of",
        "on", "over", "please", "popular", "price", "recommend", "show",
        "some", "tell", "the", "this", "that", "to", "under", "want", "what",
        "which", "with", "you",
    }

    @classmethod
    def _detect_language(cls, tokens: set) -> str:
        en_hits = len(tokens & cls._EN_MARKERS)
        id_hits = len(tokens & cls._ID_MARKERS)
        if en_hits >= 2 and en_hits > id_hits:
            return "en"
        return "id"

    @classmethod
    def _normalize_text(cls, text: str) -> str:
        s = (text or "").lower().strip()
        s = re.sub(r"[^\w\s.,/-]", " ", s)
        s = re.sub(r"\s+", " ", s)
        return s

    @staticmethod
    def _clean_llm_output(text: str) -> str:
        """Bersihkan artefak sitasi seperti 【DB-1】, [DB-1], [KB-2] jika masih lolos."""
        if not text:
            return text
        cleaned = re.sub(r"\s*(?:【[^】]*?(?:DB|KB|\d+)[^】]*?】|\[(?:DB|KB)-\d+\])", "", text)
        cleaned = re.sub(r"[ \t]+([.,!?])", r"\1", cleaned)
        return cleaned.strip()

    @classmethod
    def _find_recommendation_tokens(cls, tokens: List[str]) -> set:
        """Deteksi kata rekomendasi termasuk toleransi typo (misal 'rekimendasikan')."""
        fuzzy_pool = [w for w in cls._RECOMMENDATION_WORDS if len(w) >= 6]
        matched = set()
        for tok in tokens:
            if tok in cls._RECOMMENDATION_WORDS:
                matched.add(tok)
            elif len(tok) >= 5 and get_close_matches(tok, fuzzy_pool, n=1, cutoff=0.8):
                matched.add(tok)
        return matched

    @staticmethod
    def _parse_price_value(num_str: str, unit: Optional[str]) -> int:
        if unit in ("rb", "rban", "ribu", "ribuan", "k"):
            return int(round(float(num_str.replace(",", ".")) * 1_000))
        if unit in ("jt", "juta", "jutaan"):
            return int(round(float(num_str.replace(",", ".")) * 1_000_000))
        digits = re.sub(r"[.,]", "", num_str)
        val = int(digits)
        return val * 1_000 if val < 1_000 else val

    @staticmethod
    def _raw_digits_int(num_str: str) -> int:
        digits = re.sub(r"[.,]", "", num_str)
        return int(digits) if digits.isdigit() else 0

    @classmethod
    def _extract_price_filters(
        cls, raw_query: str
    ) -> Tuple[Optional[int], Optional[int], Optional[int]]:
        """
        Ekstrak filter harga dari query mentah.
        Return: (min_harga, max_harga, target_harga).
        """
        text = (raw_query or "").lower()
        # Buang angka ukuran/berat/jumlah agar tidak terbaca sebagai harga
        text = re.sub(
            r"\b\d+(?:[.,]\d+)?\s*"
            r"(?:cm|mm|m|meter|gr|gram|kg|lembar|pcs|buah|potong|hari|jam|tahun)\b",
            " ",
            text,
        )

        unit_pat = r"(rban|ribuan|rb|ribu|k|jutaan|jt|juta)"
        num_pat = (
            r"(?:rp\.?\s*)?"
            r"(\d{1,3}(?:[.,]\d{3})+|\d+(?:[.,]\d+)?)"
            rf"\s*{unit_pat}?(?=\b|[^a-z0-9]|$)"
        )

        # 1. Rentang harga: "150k - 300k", "150 - 300k", "150rb sampai 300rb", "1 - 2jt"
        m_range = re.search(
            rf"(?:\b(?:antara|dari)\s+)?{num_pat}\s*(?:-|sampai|hingga|s/d|sd|to)\s*{num_pat}",
            text,
        )
        if m_range:
            n1, u1, n2, u2 = m_range.group(1), m_range.group(2), m_range.group(3), m_range.group(4)
            if u1 or u2:
                eff_u1 = u1 or u2
                eff_u2 = u2 or u1
                v1 = cls._parse_price_value(n1, eff_u1)
                v2 = cls._parse_price_value(n2, eff_u2)
                return min(v1, v2), max(v1, v2), None
            raw1 = cls._raw_digits_int(n1)
            raw2 = cls._raw_digits_int(n2)
            if max(raw1, raw2) >= 10_000:
                v1 = cls._parse_price_value(n1, None)
                v2 = cls._parse_price_value(n2, None)
                return min(v1, v2), max(v1, v2), None

        min_harga: Optional[int] = None
        max_harga: Optional[int] = None
        target_harga: Optional[int] = None

        # 2. Batas bawah: "diatas 300k", "di atas 400 ribu", "minimal 300 ribuan", "> 300k"
        m_min = re.search(
            rf"(?:\b(?:diatas|di atas|lebih dari|minimal|min\.?|mulai dari|mulai|above|over)|>=|>)"
            rf"\s*(?:harga\s*)?{num_pat}",
            text,
        )
        if m_min:
            n_str, u_str = m_min.group(1), m_min.group(2)
            if u_str or cls._raw_digits_int(n_str) >= 10:
                min_harga = cls._parse_price_value(n_str, u_str)

        # 3. Batas atas: "dibawah 150k", "di bawah harga 150k", "maks 150k", "budget 150k", "< 150k"
        m_max = re.search(
            rf"(?:\b(?:dibawah|di bawah|max\.?|maks\.?|maksimal|kurang dari|budget|dana|under)|<=|<)"
            rf"\s*(?:harga\s*)?{num_pat}",
            text,
        )
        if m_max:
            n_str, u_str = m_max.group(1), m_max.group(2)
            if u_str or cls._raw_digits_int(n_str) >= 10:
                max_harga = cls._parse_price_value(n_str, u_str)

        if min_harga is not None or max_harga is not None:
            return min_harga, max_harga, None

        # 4. Harga pas / sekitar / nominal mandiri bersatuan: "seharga 150k", "batik 150k"
        m_exact = re.search(
            rf"\b(?:seharga|harga|harganya|sekitar|kisaran)\s*{num_pat}",
            text,
        )
        if m_exact:
            n_str, u_str = m_exact.group(1), m_exact.group(2)
            if u_str or cls._raw_digits_int(n_str) >= 10:
                target_harga = cls._parse_price_value(n_str, u_str)
        else:
            m_unit = re.search(
                rf"(?:rp\.?\s*(\d{{1,3}}(?:[.,]\d{{3}})+|\d+(?:[.,]\d+)?)\s*{unit_pat}?"
                rf"|\b(\d+(?:[.,]\d+)?)\s*{unit_pat})(?=\b|[^a-z0-9]|$)",
                text,
            )
            if m_unit:
                num_s = m_unit.group(1) or m_unit.group(3)
                unit_s = m_unit.group(2) or m_unit.group(4)
                target_harga = cls._parse_price_value(num_s, unit_s)

        if target_harga is not None:
            tol = int(target_harga * 0.15)
            return max(0, target_harga - tol), target_harga + tol, target_harga

        return None, None, None

    @classmethod
    def _extract_ordinal(cls, normalized: str) -> Optional[int]:
        if any(p in normalized for p in ("yang pertama", "produk pertama", "batik pertama", "nomor 1", "no 1")):
            return 0
        if any(p in normalized for p in ("yang kedua", "produk kedua", "batik kedua", "nomor 2", "no 2")):
            return 1
        if any(p in normalized for p in ("yang ketiga", "produk ketiga", "batik ketiga", "nomor 3", "no 3")):
            return 2
        return None

    @classmethod
    def _analyze_query(cls, query: str) -> QueryAnalysis:
        normalized = cls._normalize_text(query)
        tokens = re.findall(r"[a-z0-9]+", normalized)
        token_set = set(tokens)
        language = cls._detect_language(token_set)

        min_harga, max_harga, target_harga = cls._extract_price_filters(query)
        has_price_filter = (
            min_harga is not None or max_harga is not None or target_harga is not None
        )
        ordinal_index = cls._extract_ordinal(normalized)
        rec_tokens = cls._find_recommendation_tokens(tokens)

        wants_recommendation = (
            bool(rec_tokens)
            or any(p in normalized for p in cls._RECOMMENDATION_PHRASES)
            or has_price_filter
        )
        is_product_spec = bool(token_set & cls._PRODUCT_SPEC_WORDS)
        is_knowledge_ask = any(sig in normalized for sig in cls._KNOWLEDGE_SIGNALS)
        has_back_reference = (
            ordinal_index is not None
            or any(p in normalized for p in cls._BACK_REF_PHRASES)
            or bool(token_set & cls._BACK_REF_WORDS)
        )

        # Social murni: sapaan/ucapan terima kasih tanpa pertanyaan batik/produk
        has_domain_signal = (
            wants_recommendation
            or is_product_spec
            or is_knowledge_ask
            or "?" in query
            or bool(token_set & {"batik", "kain", "motif", "produk", "toko", "sanggar"})
        )
        is_social = (
            not has_domain_signal
            and (
                any(p in normalized for p in cls._SOCIAL_PHRASES)
                or bool(token_set & cls._SOCIAL_WORDS)
            )
        )

        # Ekstrak kandidat keyword nama barang/toko/motif setelah bersihkan harga & ukuran
        cleaned = re.sub(
            r"\b(?:dibawah|di bawah|diatas|di atas|max|maks|maksimal|min|minimal"
            r"|kurang dari|lebih dari|mulai dari|seharga|sekitar|kisaran|budget|dana"
            r"|under|above|over)\s*(?:harga\s*)?(?:rp\.?\s*)?\d[\d.,]*"
            r"\s*(?:rban|ribuan|rb|ribu|k|jutaan|jt|juta)?",
            " ",
            normalized,
        )
        cleaned = re.sub(
            r"\b(?:rp\.?\s*)?\d[\d.,]*\s*(?:rban|ribuan|rb|ribu|k|jutaan|jt|juta)\b",
            " ",
            cleaned,
        )
        cleaned = re.sub(r"\b(?:rp\.?\s*)?\d{4,}\b", " ", cleaned)
        cleaned = re.sub(r"\b\d+(?:[.,]\d+)?\s*(?:cm|mm|m|meter|gr|gram|kg)\b", " ", cleaned)

        clean_tokens = [
            t for t in re.findall(r"[a-z0-9]+", cleaned)
            if t not in cls._STOPWORDS and t not in rec_tokens and len(t) > 1
        ]
        specific_tokens = [t for t in clean_tokens if t not in {"batik", "kain", "produk"}]
        keyword_candidate = " ".join(clean_tokens[:4]) if specific_tokens else ""

        return QueryAnalysis(
            raw=query,
            normalized=normalized,
            tokens=tokens,
            token_set=token_set,
            language=language,
            is_social=is_social,
            wants_recommendation=wants_recommendation,
            is_product_spec=is_product_spec,
            is_knowledge_ask=is_knowledge_ask,
            has_back_reference=has_back_reference,
            ordinal_index=ordinal_index,
            min_harga=min_harga,
            max_harga=max_harga,
            target_harga=target_harga,
            keyword_candidate=keyword_candidate,
        )

    # =====================================================================
    # STEP 2: CEK & COCOKKAN BARANG DI DB (+ KONTEKS SEBELUMNYA)
    # =====================================================================

    def _fetch_products_from_backend(
        self,
        keyword: Optional[str] = None,
        motif: Optional[str] = None,
        min_harga: Optional[int] = None,
        max_harga: Optional[int] = None,
        limit: int = BACKEND_MAX_LIMIT,
    ) -> List[Dict]:
        url = build_backend_url(BACKEND_PRODUCT_PATH)
        params: Dict = {"limit": min(max(1, limit), BACKEND_MAX_LIMIT)}
        if keyword:
            params["keyword"] = keyword
        if motif:
            params["motif"] = motif
        if min_harga is not None:
            params["min_harga"] = min_harga
        if max_harga is not None:
            params["max_harga"] = max_harga

        try:
            r = requests.get(
                url,
                params=params,
                headers=get_backend_headers(),
                timeout=BACKEND_TIMEOUT,
            )
            r.raise_for_status()
            data = r.json()
            if isinstance(data, dict):
                data = data.get("data") or data.get("items") or []
            return data if isinstance(data, list) else []
        except requests.exceptions.Timeout:
            logger.warning("[DB] Backend timeout (%ds) → %s", BACKEND_TIMEOUT, url)
            return []
        except requests.exceptions.RequestException as e:
            logger.warning("[DB] Backend request gagal: %s", e)
            return []
        except Exception:
            logger.exception("[DB] Error tak terduga saat memanggil backend")
            return []

    @staticmethod
    def _get_product_price(p: Dict) -> Optional[int]:
        raw = p.get("harga")
        if raw is None or raw == "":
            raw = p.get("harga_per_meter")
        if raw is None or raw == "":
            return None
        try:
            return int(float(raw))
        except (TypeError, ValueError):
            return None

    @classmethod
    def _filter_catalog_by_price(
        cls,
        catalog: List[Dict],
        analysis: QueryAnalysis,
    ) -> List[Dict]:
        """Filter pengaman & pengurutan kedekatan harga di sisi pipeline."""
        filtered = list(catalog)
        if analysis.min_harga is not None:
            filtered = [
                p for p in filtered
                if (price := cls._get_product_price(p)) is not None
                and price >= analysis.min_harga
            ]
        if analysis.max_harga is not None:
            filtered = [
                p for p in filtered
                if (price := cls._get_product_price(p)) is not None
                and price <= analysis.max_harga
            ]
        if analysis.target_harga is not None:
            filtered.sort(
                key=lambda p: abs(
                    (cls._get_product_price(p) or 0) - analysis.target_harga
                )
            )
        return filtered

    @staticmethod
    def _format_price_filter_label(analysis: QueryAnalysis) -> str:
        def _rp(val: int) -> str:
            return f"Rp{int(val):,}".replace(",", ".")

        if analysis.target_harga is not None:
            if analysis.language == "en":
                return f"around {_rp(analysis.target_harga)}"
            return f"sekitar {_rp(analysis.target_harga)}"
        if analysis.min_harga is not None and analysis.max_harga is not None:
            if analysis.language == "en":
                return f"between {_rp(analysis.min_harga)} and {_rp(analysis.max_harga)}"
            return f"antara {_rp(analysis.min_harga)} hingga {_rp(analysis.max_harga)}"
        if analysis.min_harga is not None:
            if analysis.language == "en":
                return f"above {_rp(analysis.min_harga)}"
            return f"di atas {_rp(analysis.min_harga)}"
        if analysis.max_harga is not None:
            if analysis.language == "en":
                return f"under {_rp(analysis.max_harga)}"
            return f"di bawah {_rp(analysis.max_harga)}"
        return ""

    @staticmethod
    def _has_phrase(haystack: str, needle: str) -> bool:
        if not haystack or not needle:
            return False
        pattern = rf"(^|[^a-z0-9]){re.escape(needle)}([^a-z0-9]|$)"
        return re.search(pattern, haystack) is not None

    @classmethod
    def _match_products_in_catalog(
        cls,
        analysis: QueryAnalysis,
        catalog: List[Dict],
    ) -> List[Tuple[int, Dict]]:
        """
        Cocokkan query terhadap nama barang, motif, dan toko asli di DB.
        Mengembalikan list (score, product) yang benar-benar cocok.
        """
        q_norm = analysis.normalized
        kw_tokens = [
            t for t in re.findall(r"[a-z0-9]+", analysis.keyword_candidate.lower())
            if t not in {"batik", "kain", "produk"}
        ]

        scored: List[Tuple[int, Dict]] = []
        for p in catalog:
            attrs = p.get("additional_attribute") or {}
            raw_name = cls._normalize_text(str(p.get("name") or ""))
            raw_motif = cls._normalize_text(str(p.get("motif") or attrs.get("motif") or ""))
            raw_shop = cls._normalize_text(str(p.get("nama_umkm") or ""))
            raw_desc = cls._normalize_text(str(p.get("description") or ""))
            raw_attrs = cls._normalize_text(
                " ".join(str(v) for v in attrs.values() if v is not None)
            )

            score = 0

            # 1. Exact phrase match nama produk / motif / toko dari DB di dalam query user
            if len(raw_name) >= 3 and cls._has_phrase(q_norm, raw_name):
                score += 25
            if len(raw_motif) >= 3 and cls._has_phrase(q_norm, raw_motif):
                score += 15
            if len(raw_shop) >= 4 and cls._has_phrase(q_norm, raw_shop):
                score += 12

            # 2. Token match spesifik (mendukung nama parsial seperti "tes 2" untuk "Batik Tes 2")
            name_words = set(re.findall(r"[a-z0-9]+", f"{raw_name} {raw_motif}"))
            shop_words = set(re.findall(r"[a-z0-9]+", raw_shop))
            desc_words = set(re.findall(r"[a-z0-9]+", f"{raw_attrs} {raw_desc}"))

            matched_name_tokens = 0
            for tok in kw_tokens:
                if tok in name_words:
                    score += 6
                    matched_name_tokens += 1
                elif len(tok) >= 4 and tok in f"{raw_name} {raw_motif}":
                    score += 3
                    matched_name_tokens += 1
                elif tok in shop_words:
                    score += 4
                elif len(tok) >= 4 and tok in desc_words:
                    score += 1

            # Bonus jika semua token spesifik query ditemukan di nama produk/motif
            if kw_tokens and matched_name_tokens == len(kw_tokens):
                score += 6

            if score >= 6:
                scored.append((score, p))

        scored.sort(key=lambda pair: pair[0], reverse=True)
        return scored

    def _resolve_db_products(
        self,
        analysis: QueryAnalysis,
        session_id: str,
    ) -> Tuple[List[Dict], str]:
        """
        Cek apakah barang yang ditanyakan ada di DB (atau konteks sebelumnya).
        Return: (products, match_mode)
            match_mode: "db_entity" | "session_context" | "db_catalog" | "none"
        """
        # Ambil snapshot katalog aktif dari DB (selalu fresh, <= 20 item)
        catalog = self._fetch_products_from_backend(
            min_harga=analysis.min_harga,
            max_harga=analysis.max_harga,
            limit=BACKEND_MAX_LIMIT,
        )

        # Jika ada keyword spesifik, coba juga direct search DB bila jumlah produk > 20
        if analysis.keyword_candidate:
            direct_hits = self._fetch_products_from_backend(
                keyword=analysis.keyword_candidate,
                min_harga=analysis.min_harga,
                max_harga=analysis.max_harga,
                limit=PRODUCT_K,
            )
            if direct_hits:
                seen_ids = {str(p.get("id")) for p in catalog}
                for item in direct_hits:
                    if str(item.get("id")) not in seen_ids:
                        catalog.append(item)

        # Terapkan filter harga pengaman di sisi pipeline
        catalog = self._filter_catalog_by_price(catalog, analysis)

        if not catalog:
            return [], "none"

        # 1. Cek kecocokan langsung nama barang / motif / toko di DB
        matched = self._match_products_in_catalog(analysis, catalog)
        if matched:
            top_score = matched[0][0]
            # Jika ada exact match (score >= 25), jangan ikutkan produk lain yang cuma mirip tipis
            if top_score >= 25 and not analysis.wants_recommendation:
                selected = [p for s, p in matched if s >= top_score - 5]
            else:
                selected = [p for _, p in matched]
            return selected[: max(PRODUCT_K, 5)], "db_entity"

        # 2. Jika tidak menyebut nama baru tapi merujuk konteks percakapan sebelumnya
        last_products = self._session_last_products.get(session_id) or []
        if analysis.has_back_reference and last_products and not analysis.wants_recommendation:
            catalog_by_id = {str(p.get("id")): p for p in catalog if p.get("id")}
            if analysis.ordinal_index is not None and analysis.ordinal_index < len(last_products):
                ref_list = [last_products[analysis.ordinal_index]]
            else:
                ref_list = last_products[:2]

            # Segarkan dari data DB terbaru berdasarkan ID
            refreshed = [
                catalog_by_id.get(str(p.get("id")), p)
                for p in ref_list
            ]
            return refreshed, "session_context"

        # 3. Jika permintaan rekomendasi / daftar katalog / filter harga -> ambil dari DB
        if analysis.wants_recommendation:
            return catalog[: max(PRODUCT_K * 2, 6)], "db_catalog"

        # 4. Jika menanyakan spesifikasi umum dengan konteks batik/toko (misal "ukuran batik disini berapa?")
        if analysis.is_product_spec and (
            bool(analysis.token_set & {"batik", "kain", "produk", "toko", "sanggar"})
            or analysis.has_back_reference
        ):
            return catalog[:PRODUCT_K], "db_catalog"

        return [], "none"

    # =====================================================================
    # FORMATTER PRODUK DB -> CHUNK TEKS UNTUK RERANK & LLM
    # =====================================================================

    @staticmethod
    def _fmt_meter(cm_val) -> str:
        try:
            m = float(cm_val) / 100.0
            return f"{m:g}".replace(".", ",")
        except (TypeError, ValueError):
            return ""

    @classmethod
    def _format_product_chunk(
        cls,
        p: Dict,
        desc_max_chars: int = 600,
        include_shop_desc: bool = True,
    ) -> str:
        harga_num = p.get("harga") if p.get("harga") is not None else p.get("harga_per_meter")
        harga = (
            f"Rp{int(harga_num):,}".replace(",", ".")
            if harga_num is not None and harga_num != "" else "-"
        )
        attrs = p.get("additional_attribute")
        if not isinstance(attrs, dict):
            attrs = {}

        parts = [
            f"Produk: {p.get('nama_motif', p.get('name', '-'))}",
            f"Toko: {p.get('nama_umkm', '-')}",
            f"Harga: {harga}",
        ]

        panjang = p.get("panjang_cm") if p.get("panjang_cm") is not None else attrs.get("panjang_cm")
        lebar = p.get("lebar_cm") if p.get("lebar_cm") is not None else attrs.get("lebar_cm")
        if panjang is not None and lebar is not None:
            parts.append(
                f"Ukuran: {panjang}x{lebar} cm ({cls._fmt_meter(panjang)}x{cls._fmt_meter(lebar)} m per lembar)"
            )
        elif panjang is not None:
            parts.append(f"Panjang: {panjang} cm ({cls._fmt_meter(panjang)} m)")
        elif lebar is not None:
            parts.append(f"Lebar: {lebar} cm ({cls._fmt_meter(lebar)} m)")

        for label, key in (
            ("Motif", "motif"),
            ("Teknik", "teknik"),
            ("Bahan", "bahan"),
            ("Bentuk", "bentuk"),
        ):
            val = p.get(key) or attrs.get(key)
            if val:
                parts.append(f"{label}: {val}")

        berat = p.get("berat_gram") if p.get("berat_gram") is not None else attrs.get("berat_gram")
        if berat is not None and berat != "":
            parts.append(f"Berat: {berat} gram")

        pewarna = (
            p.get("pewarna_alami")
            if p.get("pewarna_alami") is not None
            else attrs.get("pewarna_alami")
        )
        if isinstance(pewarna, bool):
            parts.append(f"Pewarna alami: {'Ya' if pewarna else 'Tidak'}")

        handled = {
            "motif", "teknik", "bahan", "bentuk",
            "panjang_cm", "lebar_cm", "berat_gram", "pewarna_alami",
        }
        for k, v in attrs.items():
            if k in handled or v is None or str(v).strip() == "":
                continue
            val_str = "Ya" if v is True else ("Tidak" if v is False else str(v))
            parts.append(f"{k.replace('_', ' ').title()}: {val_str}")

        desc = str(p.get("description") or "").strip()
        if desc:
            short_desc = desc[:desc_max_chars] + ("…" if len(desc) > desc_max_chars else "")
            parts.append(f"Deskripsi & Filosofi: {short_desc}")

        if include_shop_desc:
            shop_desc = str(p.get("shop_description") or "").strip()
            if shop_desc:
                short_sdesc = shop_desc[:250] + ("…" if len(shop_desc) > 250 else "")
                parts.append(f"Profil Toko: {short_sdesc}")

        parts.append(f"WA: {p.get('kontak_wa', '-')}")
        parts.append(f"Alamat: {p.get('alamat', '-')}")
        return " | ".join(parts)

    # =====================================================================
    # RULE RETRIEVAL & PROMPT BUILDERS (DENGAN KUNCI BAHASA PERMANEN)
    # =====================================================================

    @staticmethod
    def _retrieve_rules(col, query_emb: List[float], k: int, fallback: str) -> str:
        if col is None or k <= 0:
            return fallback
        try:
            total = col.count()
            if total == 0:
                return fallback
            res = col.query(
                query_embeddings=[query_emb],
                n_results=min(k, total),
                include=["documents"],
            )
            docs = (res.get("documents") or [[]])[0]
            joined = "\n\n".join(d.strip() for d in docs if d and d.strip())
            return joined if joined else fallback
        except Exception:
            logger.exception("[Rules] Gagal query koleksi aturan")
            return fallback

    def _base_system_prompt(
        self,
        instructions_text: str,
        guard_rails_text: str,
        language: str,
    ) -> str:
        if language == "en":
            lang_rule = (
                "- MANDATORY LANGUAGE: The user asked in English. "
                "Respond entirely in natural, friendly English."
            )
        else:
            lang_rule = (
                "- BAHASA WAJIB: Pengguna bertanya dalam Bahasa Indonesia. "
                "WAJIB jawab sepenuhnya dalam Bahasa Indonesia yang santai, sopan, dan bersahabat. "
                "DILARANG menjawab dalam Bahasa Inggris."
            )

        return (
            "=== INSTRUKSI ===\n"
            f"{instructions_text}\n\n"
            "=== GUARD RAILS ===\n"
            f"{guard_rails_text}\n\n"
            "=== ATURAN WAJIB GAYA & AKURASI ===\n"
            f"{lang_rule}\n"
            "- Sampaikan ulang informasi dengan bahasamu sendiri yang hangat, ringan, dan natural "
            "seperti CS manusia—JANGAN menyalin mentah susunan kalimat dari data.\n"
            "- KETAT PADA FAKTA: Parafrase hanya boleh mengubah gaya bahasa, DILARANG keras menambah "
            "fakta, makna simbolis, filosofi tambahan, atau klaim asal daerah yang tidak tertulis "
            "eksplisit di data (misalnya jangan menyebut motif sebagai 'warisan batik Trenggalek' "
            "jika data menyebut asal daerah lain atau tidak menyebutkannya).\n"
            "- Jika pengguna menanyakan filosofi/makna namun data hanya menjelaskan bentuk atau ciri "
            "motifnya, jelaskan sebatas informasi yang tertulis tanpa mengarang makna tambahan.\n"
            "- Langsung masuk ke inti jawaban tanpa kata pembuka kaku ('Singkatnya,', 'Intinya,', dll.) "
            "dan tanpa kalimat penutup klise ('Ada yang bisa saya bantu lagi?').\n"
            "- DILARANG menampilkan kode sitasi seperti [DB-1], 【DB-1】, [KB-1], atau [1]."
        )

    def _build_unified_system_prompt(
        self,
        db_chunks: List[RerankedChunk],
        kb_chunks: List[RerankedChunk],
        instructions_text: str,
        guard_rails_text: str,
        analysis: QueryAnalysis,
        show_cards: bool,
    ) -> str:
        base = self._base_system_prompt(
            instructions_text, guard_rails_text, analysis.language
        )
        parts = [base]

        if db_chunks:
            # Tanpa tag [DB-1] supaya model tidak ikut mencetak sitasi 【DB-1】
            db_str = "\n---\n".join(c.konten_chunk for c in db_chunks)
            parts.append(
                "=== DATA RESMI DATABASE (SUMBER UTAMA) ===\n"
                f"{db_str}"
            )

        if kb_chunks:
            kb_str = "\n---\n".join(c.konten_chunk for c in kb_chunks)
            parts.append(
                "=== PENGETAHUAN TAMBAHAN ===\n"
                f"{kb_str}"
            )

        if show_cards and db_chunks:
            task = (
                "Rekomendasikan produk HANYA dari DATA RESMI DATABASE di atas secara singkat, "
                "ramah, dan mengalir. Sebutkan intinya saja (nama, kisaran harga, dan daya tariknya) "
                "karena kartu produk dengan tombol Buku, 3D, dan WA sudah otomatis tampil di bawah pesan. "
                "Jangan ulang nomor WA berkali-kali dan jangan mengarang produk di luar data."
            )
        elif db_chunks and kb_chunks:
            task = (
                "Rangkum jawaban secara singkat, jelas, dan bersahabat dengan bahasamu sendiri. "
                "Utamakan fakta dari DATA RESMI DATABASE (bila ada perbedaan, wajib ikuti Database) "
                "dan gunakan PENGETAHUAN TAMBAHAN hanya untuk melengkapi konteks umum. "
                "Jangan menyalin kalimat deskripsi mentah-mentah dan jangan memaksakan ajakan beli/WA."
            )
        elif db_chunks:
            task = (
                "Rangkum jawaban langsung ke inti pertanyaan menggunakan bahasamu sendiri yang "
                "bersahabat dan mudah dipahami berdasarkan DATA RESMI DATABASE di atas. "
                "Jangan copy-paste mentah teks deskripsi; sarikan poin utamanya saja. "
                "Jangan memaksakan ajakan beli atau nomor WA kecuali pengguna memang memintanya."
            )
        else:
            task = (
                "Rangkum jawaban secara singkat, bersahabat, dan mudah dipahami HANYA berdasarkan "
                "PENGETAHUAN TAMBAHAN di atas. Jika informasinya belum ada, katakan dengan jujur "
                "tanpa mengarang fakta."
            )

        parts.append(f"=== TUGAS ===\n{task}")
        return "\n\n".join(parts)

    # =====================================================================
    # PUBLIC API (STEP 1 -> STEP 7)
    # =====================================================================

    def answer(self, query: str, session_id: str = "default") -> RAGResponse:
        t_start = time.perf_counter()
        query = (query or "").strip()
        if not query:
            return RAGResponse(
                answer="Maaf, pertanyaan kosong.",
                intent="social",
                processing_time=time.perf_counter() - t_start,
            )

        # ── STEP 1: NLP Preprocessing & Analisis ────────────────────────
        analysis = self._analyze_query(query)
        has_price_filter = (
            analysis.min_harga is not None
            or analysis.max_harga is not None
            or analysis.target_harga is not None
        )
        logger.info(
            "[NLP] lang=%s social=%s recom=%s spec=%s know=%s backref=%s kw=%r "
            "min_harga=%s max_harga=%s target_harga=%s",
            analysis.language,
            analysis.is_social,
            analysis.wants_recommendation,
            analysis.is_product_spec,
            analysis.is_knowledge_ask,
            analysis.has_back_reference,
            analysis.keyword_candidate,
            analysis.min_harga,
            analysis.max_harga,
            analysis.target_harga,
        )

        # Jalur cepat untuk sapaan/social
        if analysis.is_social:
            resp = self._answer_social(analysis, t_start)
            self._maybe_cleanup_cache()
            return resp

        # ── STEP 2: Cek & Retrieve dari DB (+ konteks sebelumnya) ───────
        t_ret = time.perf_counter()
        db_products, match_mode = self._resolve_db_products(analysis, session_id)
        logger.info(
            "[DB] match_mode=%s count=%d",
            match_mode, len(db_products),
        )

        # Jika query memakai filter harga namun tidak ada produk DB yang cocok,
        # jangan fallback ke ChromaDB agar tidak keluar jawaban melenceng.
        if has_price_filter and not db_products:
            retrieval_elapsed = time.perf_counter() - t_ret
            price_label = self._format_price_filter_label(analysis)
            if analysis.language == "en":
                no_match_msg = (
                    f"Sorry, we don't have any batik products priced {price_label} "
                    "in our catalog right now."
                )
            else:
                no_match_msg = (
                    f"Maaf, saat ini belum ada produk batik dengan harga {price_label} "
                    "di katalog kami."
                )
            self._maybe_cleanup_cache()
            return RAGResponse(
                answer=no_match_msg,
                intent="product",
                sources=[],
                processing_time=time.perf_counter() - t_start,
                retrieval_time=retrieval_elapsed,
            )

        # Cache lookup khusus pertanyaan pengetahuan murni tanpa hasil DB & tanpa back-ref
        pure_kb_cache_key = None
        if (
            not db_products
            and not analysis.has_back_reference
            and not has_price_filter
            and not analysis.wants_recommendation
        ):
            pure_kb_cache_key = hashlib.md5(
                f"kb:{analysis.language}:{analysis.normalized}".encode("utf-8")
            ).hexdigest()
            cached = self.cache.get(pure_kb_cache_key)
            if cached is not None:
                logger.info("[Cache] HIT — pure knowledge query=%r", query[:80])
                return RAGResponse(
                    answer=cached["answer"],
                    intent=cached.get("intent", "knowledge"),
                    sources=cached.get("sources", []),
                    processing_time=time.perf_counter() - t_start,
                )

        # Embed query (untuk rules + ChromaDB pelengkap jika dibutuhkan)
        query_emb = self.models.embed(query)

        # Ubah produk DB menjadi kandidat chunk
        show_cards = bool(db_products) and analysis.wants_recommendation
        desc_limit = 220 if show_cards else 850
        db_candidates: List[CandidateChunk] = [
            CandidateChunk(
                isi_id=str(p.get("id") or p.get("name") or f"db_{idx}"),
                konten_chunk=self._format_product_chunk(
                    p,
                    desc_max_chars=desc_limit,
                    include_shop_desc=not show_cards,
                ),
                vector_score=0.0,
                source_type="db",
                product_data=p,
            )
            for idx, p in enumerate(db_products, 1)
        ]

        # Ambil ChromaDB HANYA bila:
        #   (a) DB tidak menemukan barang yang cocok, ATAU
        #   (b) pengguna memang bertanya pengetahuan/filosofi/sejarah
        # (JANGAN campur ChromaDB ke rekomendasi/spesifikasi katalog agar data lama tidak bocor)
        kb_candidates: List[CandidateChunk] = []
        should_use_chroma = (not db_candidates) or (
            analysis.is_knowledge_ask and not show_cards
        )
        if should_use_chroma:
            kb_candidates = self.chroma.retrieve(query_emb, k=MAX_CHROMA_K)

        retrieval_elapsed = time.perf_counter() - t_ret

        if not db_candidates and not kb_candidates:
            empty_msg = (
                "Sorry, I couldn't find matching products or information for your request."
                if analysis.language == "en"
                else "Maaf, belum ada produk atau informasi yang cocok dengan permintaan Anda."
            )
            return RAGResponse(
                answer=empty_msg,
                intent="product" if analysis.wants_recommendation else "knowledge",
                sources=[],
                processing_time=time.perf_counter() - t_start,
                retrieval_time=retrieval_elapsed,
            )

        # ── STEP 3: Rerank Terpadu (CrossEncoder) ───────────────────────
        t_rr = time.perf_counter()
        all_candidates = db_candidates + kb_candidates
        scores = self.models.rerank(
            query, [c.konten_chunk for c in all_candidates]
        )

        reranked_db: List[RerankedChunk] = []
        reranked_kb: List[RerankedChunk] = []
        for c, s in zip(all_candidates, scores):
            rc = RerankedChunk(
                isi_id=c.isi_id,
                konten_chunk=c.konten_chunk,
                vector_score=c.vector_score,
                rerank_score=float(s),
                source_type=c.source_type,
                product_data=c.product_data,
            )
            if c.source_type == "db":
                reranked_db.append(rc)
            else:
                reranked_kb.append(rc)

        # Pertahankan urutan berbasis harga bila query murni filter harga tanpa keyword spesifik
        if not (has_price_filter and not analysis.keyword_candidate):
            reranked_db.sort(key=lambda x: x.rerank_score, reverse=True)
        reranked_kb.sort(key=lambda x: x.rerank_score, reverse=True)

        # Potong top-K sesuai mode
        if show_cards:
            selected_db = reranked_db[:PRODUCT_K]
            selected_kb = []
        elif reranked_db:
            # Untuk pertanyaan spesifik/filosofi produk: ambil 1-2 produk DB teratas
            # + maksimal 1 chunk ChromaDB pelengkap jika memang relevan
            db_keep = 1 if match_mode == "session_context" else min(2, len(reranked_db))
            selected_db = reranked_db[:db_keep]
            selected_kb = (
                [c for c in reranked_kb[:1] if c.rerank_score >= -1.0]
                if analysis.is_knowledge_ask
                else []
            )
        else:
            selected_db = []
            selected_kb = reranked_kb[:RERANKED_K]

        rerank_elapsed = time.perf_counter() - t_rr
        logger.info(
            "[Rerank] db=%d (best=%.3f) | kb=%d (best=%.3f) | time=%.3fs",
            len(selected_db),
            selected_db[0].rerank_score if selected_db else 0.0,
            len(selected_kb),
            selected_kb[0].rerank_score if selected_kb else 0.0,
            rerank_elapsed,
        )

        # Simpan produk terpilih ke memori sesi untuk pertanyaan lanjutan
        selected_products = [c.product_data for c in selected_db if c.product_data]
        if selected_products:
            self._remember_products(session_id, selected_products)

        # ── STEP 4: Retrieve Rules (instruction & guard_rails) ──────────
        rule_k_inst = min(1, INSTRUCTION_K) if selected_db else INSTRUCTION_K
        rule_k_guard = min(1, GUARDRAILS_K) if selected_db else GUARDRAILS_K

        instructions_text = self._retrieve_rules(
            self.instruction_col, query_emb, rule_k_inst, _FALLBACK_INSTRUCTIONS
        )
        guard_rails_text = self._retrieve_rules(
            self.guard_rails_col, query_emb, rule_k_guard, _FALLBACK_GUARD_RAILS
        )

        system_prompt = self._build_unified_system_prompt(
            db_chunks=selected_db,
            kb_chunks=selected_kb,
            instructions_text=instructions_text,
            guard_rails_text=guard_rails_text,
            analysis=analysis,
            show_cards=show_cards,
        )

        logger.info(
            "[LLM] mode=%s show_cards=%s lang=%s | TOTAL=%d chars (~%d est. tokens)",
            match_mode,
            show_cards,
            analysis.language,
            len(system_prompt) + len(query),
            (len(system_prompt) + len(query)) // 3,
        )

        # ── STEP 5: Rangkum dengan LLM ──────────────────────────────────
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user",   "content": query},
        ]

        max_tokens = PRODUCT_MAX_TOKENS if selected_db else KNOWLEDGE_MAX_TOKENS
        temp = 0.35 if show_cards else 0.3

        t_gen = time.perf_counter()
        raw_answer = self.models.llm.generate(
            messages,
            temperature=temp,
            top_p=0.9,
            max_tokens=max_tokens,
        )
        answer = self._clean_llm_output(raw_answer)
        gen_elapsed = time.perf_counter() - t_gen

        # ── STEP 6: Output + Intent & Sources untuk Frontend ────────────
        if show_cards:
            response_intent = "product"
            sources = [{"tipe": "produk", **p} for p in selected_products]
        elif selected_db:
            response_intent = "product_detail"
            sources = []
        else:
            response_intent = "knowledge"
            sources = [
                {
                    "tipe": "knowledge_base",
                    "isi_id": c.isi_id,
                    "vector_score": f"{c.vector_score:.4f}",
                    "rerank_score": f"{c.rerank_score:.4f}",
                    "preview": c.konten_chunk[:200] + ("…" if len(c.konten_chunk) > 200 else ""),
                }
                for c in selected_kb
            ]

        resp = RAGResponse(
            answer=answer,
            intent=response_intent,
            sources=sources,
            processing_time=time.perf_counter() - t_start,
            retrieval_time=retrieval_elapsed,
            rerank_time=rerank_elapsed,
            generation_time=gen_elapsed,
        )

        # Cache hanya untuk pure knowledge (tidak menyentuh DB)
        if pure_kb_cache_key and resp.answer and resp.answer != _LLM_ERROR_ANSWER:
            self.cache.set(
                key=pure_kb_cache_key,
                intent=response_intent,
                query=query,
                answer=resp.answer,
                sources=resp.sources,
            )

        self._maybe_cleanup_cache()
        return resp

    # ── Social ──────────────────────────────────────────────────────────

    def _answer_social(self, analysis: QueryAnalysis, t_start: float) -> RAGResponse:
        cache_key = hashlib.md5(
            f"social:{analysis.language}:{analysis.normalized}".encode("utf-8")
        ).hexdigest()
        cached = self.cache.get(cache_key)
        if cached is not None:
            return RAGResponse(
                answer=cached["answer"],
                intent="social",
                sources=[],
                processing_time=time.perf_counter() - t_start,
            )

        system_prompt = (
            f"{self._base_system_prompt(_FALLBACK_INSTRUCTIONS, _FALLBACK_GUARD_RAILS, analysis.language)}\n\n"
            "Jawab sapaan atau obrolan singkat dengan ramah, santai, dan tidak kaku."
        )
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user",   "content": analysis.raw},
        ]

        t_gen = time.perf_counter()
        answer = self.models.llm.generate(
            messages,
            temperature=SOCIAL_TEMP,
            top_p=SOCIAL_TOP_P,
            max_tokens=SOCIAL_MAX_TOKENS,
        )
        gen_elapsed = time.perf_counter() - t_gen

        if answer and answer != _LLM_ERROR_ANSWER:
            self.cache.set(
                key=cache_key,
                intent="social",
                query=analysis.raw,
                answer=answer,
                sources=[],
            )

        return RAGResponse(
            answer=answer,
            intent="social",
            sources=[],
            processing_time=time.perf_counter() - t_start,
            generation_time=gen_elapsed,
        )


# =========================================================================
# SINGLETON
# =========================================================================

_pipeline: Optional[HarnessPipeline] = None


def get_pipeline() -> HarnessPipeline:
    global _pipeline
    if _pipeline is None:
        _pipeline = HarnessPipeline()
    return _pipeline
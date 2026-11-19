# pipeline.py
"""
RAG Pipeline versi harness.

Alur:
    query
      → detect intent (product | social | knowledge)
      → [product]   HTTP GET ke backend e-commerce → LLM
      → [social]    LLM langsung (dengan guard rails + instructions)
      → [knowledge] embed → ChromaDB retrieve → rerank → LLM
                    (dengan guard rails + instructions)

File ini TIDAK punya route. Route ada di main.py (controller harness).
Pipeline mengembalikan RAGResponse yang siap di-serialize (dataclass).

Cache:
  - LLM response di-cache untuk intent knowledge & social.
  - Product TIDAK di-cache (harga/stok bisa berubah).
  - Backend cache dipilih via CONFIG["cache_backend"]: "sqlite" | "redis".
"""

from __future__ import annotations

import hashlib
import logging
import os
import re
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, List, Optional

import chromadb
import requests
from chromadb.config import Settings
from dotenv import load_dotenv
from sentence_transformers import CrossEncoder, SentenceTransformer

from cache import get_cache

# ── Import config dari root project ─────────────────────────────────────
ROOT_DIR = Path(__file__).resolve().parent.parent
from config import CONFIG  # noqa: E402

load_dotenv(ROOT_DIR / ".env")

logger = logging.getLogger("harness.pipeline")

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

KNOWLEDGE_MAX_TOKENS = int(CONFIG["knowledge_max_new_tokens"])
KNOWLEDGE_TEMP       = float(CONFIG["knowledge_temperature"])
KNOWLEDGE_TOP_P      = float(CONFIG["knowledge_top_p"])

SOCIAL_MAX_TOKENS    = int(CONFIG["social_max_new_tokens"])
SOCIAL_TEMP          = float(CONFIG["social_temperature"])
SOCIAL_TOP_P         = float(CONFIG["social_top_p"])

# ── Backend e-commerce (product recommendation) ─────────────────────────
BACKEND_BASE_URL     = os.environ.get("BACKEND_BASE_URL", "http://127.0.0.1:3002").rstrip("/")
BACKEND_PRODUCT_PATH = CONFIG.get("backend_product_path", "/api/products/search")
BACKEND_TIMEOUT      = int(CONFIG.get("backend_timeout", 10))
PRODUCT_K            = int(CONFIG.get("product_recommendation_k", 5))


# =========================================================================
# FALLBACK PROMPTS (kalau koleksi ChromaDB kosong)
# =========================================================================

_FALLBACK_GUARD_RAILS = (
    "Kamu hanya boleh menjawab pertanyaan seputar batik dan topik terkait "
    "(motif, sejarah, budaya, produk, UMKM). Tolak dengan sopan pertanyaan "
    "di luar topik tersebut."
)

_FALLBACK_INSTRUCTIONS = (
    "Jawab dengan bahasa yang ramah, jelas, dan ringkas. "
    "Gunakan Bahasa Indonesia kecuali pengguna bertanya dalam bahasa lain."
)


# =========================================================================
# DATA STRUCTURES
# =========================================================================

@dataclass
class CandidateChunk:
    isi_id:       str
    konten_chunk: str
    vector_score: float


@dataclass
class RerankedChunk:
    isi_id:       str
    konten_chunk: str
    vector_score: float
    rerank_score: float


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
# CHROMA RETRIEVER
# =========================================================================

class ChromaRetriever:
    def __init__(self):
        logger.info("ChromaDB: %s", CHROMA_PATH)
        self.client = chromadb.PersistentClient(
            path=CHROMA_PATH,
            settings=Settings(anonymized_telemetry=False),
        )
        self.collection = self.client.get_collection(CHROMA_COLLECTION)
        logger.info(
            "ChromaDB ready — '%s' (%d dokumen)",
            CHROMA_COLLECTION, self.collection.count(),
        )

    def retrieve(self, query_embedding: List[float], k: int) -> List[CandidateChunk]:
        try:
            results = self.collection.query(
                query_embeddings=[query_embedding],
                n_results=k,
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
            ))
        return out


# =========================================================================
# INSTRUCTION LOADER (dari ChromaDB)
# =========================================================================

def _load_collection_text(client: chromadb.ClientAPI, name: str) -> str:
    """
    Ambil semua dokumen dari koleksi, gabung jadi satu teks.

    Sort berdasarkan (source_stem, chunk_index) agar urutan stabil antar
    restart → prompt prefix identik → prompt caching Groq selalu match.

    Kembalikan string kosong kalau koleksi tidak ada / kosong.
    """
    try:
        col = client.get_collection(name)
    except Exception:
        logger.warning("[Instructions] Koleksi '%s' tidak ada — dilewati", name)
        return ""

    try:
        total = col.count()
        if total == 0:
            logger.info("[Instructions] Koleksi '%s' kosong", name)
            return ""

        batch_size = 200
        items: List[tuple] = []   # (source_stem, chunk_index, doc)
        offset = 0
        while offset < total:
            res = col.get(
                include=["documents", "metadatas"],
                limit=batch_size,
                offset=offset,
            )
            docs  = res.get("documents") or []
            metas = res.get("metadatas") or []
            for doc, meta in zip(docs, metas):
                if not doc:
                    continue
                meta = meta or {}
                items.append((
                    meta.get("source_stem", ""),
                    int(meta.get("chunk_index", 0)),
                    doc,
                ))
            offset += batch_size

        items.sort(key=lambda x: (x[0], x[1]))
        collected = [doc for _, _, doc in items]

        joined = "\n\n".join(collected).strip()
        logger.info(
            "[Instructions] '%s' → %d chunk, total %d karakter (urutan stabil)",
            name, len(collected), len(joined),
        )
        return joined
    except Exception:
        logger.exception("[Instructions] Gagal load '%s'", name)
        return ""


# =========================================================================
# PIPELINE
# =========================================================================

class HarnessPipeline:
    """
    Pipeline utama harness.

    Tidak ada route di sini. Pemanggilan dari main.py:
        pipeline = get_pipeline()
        response = pipeline.answer(query)
    """

    def __init__(self):
        self.models = HarnessModels.get()
        self.chroma = ChromaRetriever()

        # ── Load instructions + guard rails dari ChromaDB ───────────────
        self.instructions_text = _load_collection_text(
            self.chroma.client, INSTRUCTION_COLLECTION
        )
        self.guard_rails_text = _load_collection_text(
            self.chroma.client, GUARDRAILS_COLLECTION
        )

        if not self.instructions_text:
            logger.warning(
                "[Pipeline] instruction_collection kosong — pakai fallback hardcode"
            )
            self.instructions_text = _FALLBACK_INSTRUCTIONS
        if not self.guard_rails_text:
            logger.warning(
                "[Pipeline] guard_rails_collection kosong — pakai fallback hardcode"
            )
            self.guard_rails_text = _FALLBACK_GUARD_RAILS

        logger.info(
            "[Pipeline] Prompt siap — instructions=%d chars, guard_rails=%d chars",
            len(self.instructions_text), len(self.guard_rails_text),
        )

        # ── Cache LLM (sqlite / redis, dipilih via config) ─────────────
        self.cache = get_cache(CONFIG, harness_dir=Path(__file__).resolve().parent)
        self._cache_last_cleanup = time.time()

    def close(self):
        if getattr(self, "cache", None):
            try:
                self.cache.close()
            except Exception:
                pass

    # ── Prompt builders ────────────────────────────────────────────────

    def _base_system_prompt(self) -> str:
        """Bagian system prompt yang selalu ada di semua intent."""
        return (
            "=== INSTRUKSI ===\n"
            f"{self.instructions_text}\n\n"
            "=== GUARD RAILS ===\n"
            f"{self.guard_rails_text}"
        )

    def _knowledge_system_prompt(self, context_str: str) -> str:
        return (
            f"{self._base_system_prompt()}\n\n"
            "=== KONTEKS DARI KNOWLEDGE BASE ===\n"
            f"{context_str}\n\n"
            "Jawab pertanyaan HANYA berdasarkan konteks di atas. "
            "Jika konteks tidak cukup, katakan tidak tahu. "
            "Jangan mengarang fakta di luar konteks."
        )

    def _product_system_prompt(self, product_context: str) -> str:
        return (
            f"{self._base_system_prompt()}\n\n"
            "=== DAFTAR PRODUK ===\n"
            f"{product_context}\n\n"
            "Rekomendasikan produk berikut secara ramah dan ringkas. "
            "Sertakan nama toko, harga, dan kontak WA. "
            "Jangan mengarang produk yang tidak ada di daftar."
        )

    def _social_system_prompt(self) -> str:
        return (
            f"{self._base_system_prompt()}\n\n"
            "Jawab sapaan/obrolan singkat dengan santai dan singkat, "
            "lalu arahkan pengguna untuk bertanya seputar batik bila relevan."
        )

    # ── Public API ──────────────────────────────────────────────────────

    def answer(self, query: str) -> RAGResponse:
        t_start = time.perf_counter()
        query   = (query or "").strip()
        if not query:
            return RAGResponse(
                answer="Maaf, pertanyaan kosong.",
                intent="social",
                processing_time=time.perf_counter() - t_start,
            )

        intent = self._detect_intent(query)
        logger.info("Query intent=%s  query=%r", intent, query[:100])

        # ── Cache lookup (hanya knowledge & social) ────────────────────
        cache_key = None
        if intent in ("knowledge", "social"):
            cache_key = hashlib.md5(f"{intent}:{query}".encode("utf-8")).hexdigest()
            cached = self.cache.get(cache_key)
            if cached is not None:
                logger.info("[Cache] HIT — intent=%s query=%r", intent, query[:80])
                return RAGResponse(
                    answer=cached["answer"],
                    intent=intent,
                    sources=cached.get("sources", []),
                    processing_time=time.perf_counter() - t_start,
                )

        # ── Proses normal ──────────────────────────────────────────────
        if intent == "product":
            resp = self._answer_product(query, t_start)
        elif intent == "social":
            resp = self._answer_social(query, t_start)
        else:
            resp = self._answer_knowledge(query, t_start)

        # ── Simpan ke cache ────────────────────────────────────────────
        if cache_key and resp.answer:
            self.cache.set(
                key=cache_key,
                intent=intent,
                query=query,
                answer=resp.answer,
                sources=resp.sources,
            )

        # ── Cleanup periodik (khusus SQLite, Redis auto-expire) ────────
        now = time.time()
        if now - self._cache_last_cleanup > 600:
            self._cache_last_cleanup = now
            self.cache.cleanup()

        return resp

    # ── Product ─────────────────────────────────────────────────────────

    def _answer_product(self, query: str, t_start: float) -> RAGResponse:
        filters = self._extract_product_filters(query)
        logger.info("[Product] filter: %s", filters)

        t_http = time.perf_counter()
        products = self._fetch_products_from_backend(filters)
        http_elapsed = time.perf_counter() - t_http
        logger.info(
            "[Product] %d produk dari backend (%.3fs)",
            len(products), http_elapsed,
        )

        if not products:
            return RAGResponse(
                answer=(
                    "Maaf, belum ada produk yang cocok dengan permintaan Anda. "
                    "Coba sebutkan motif atau budget lain ya."
                ),
                intent="product",
                sources=[],
                processing_time=time.perf_counter() - t_start,
                retrieval_time=http_elapsed,
            )

        product_context = self._format_products_for_llm(products)
        messages = [
            {"role": "system", "content": self._product_system_prompt(product_context)},
            {"role": "user",   "content": query},
        ]

        t_gen = time.perf_counter()
        answer = self.models.llm.generate(
            messages,
            temperature=0.5,
            top_p=0.9,
            max_tokens=800,
        )
        gen_elapsed = time.perf_counter() - t_gen

        return RAGResponse(
            answer=answer,
            intent="product",
            sources=[{"tipe": "produk", **p} for p in products],
            processing_time=time.perf_counter() - t_start,
            retrieval_time=http_elapsed,
            generation_time=gen_elapsed,
        )

    def _fetch_products_from_backend(self, filters: Dict) -> List[Dict]:
        url = f"{BACKEND_BASE_URL}{BACKEND_PRODUCT_PATH}"
        params: Dict = {"limit": PRODUCT_K}
        if filters.get("keyword"):
            params["keyword"] = filters["keyword"]
        if filters.get("motif"):
            params["motif"] = filters["motif"]
        if filters.get("max_harga"):
            params["max_harga"] = filters["max_harga"]

        try:
            r = requests.get(url, params=params, timeout=BACKEND_TIMEOUT)
            r.raise_for_status()
            data = r.json()

            if isinstance(data, dict):
                data = data.get("data") or data.get("items") or []
            if not isinstance(data, list):
                logger.warning(
                    "[Product] Format respons backend tidak dikenali: %r",
                    type(data),
                )
                return []
            return data

        except requests.exceptions.Timeout:
            logger.warning(
                "[Product] Backend timeout (%ds) → %s", BACKEND_TIMEOUT, url
            )
            return []
        except requests.exceptions.RequestException as e:
            logger.warning("[Product] Backend request gagal: %s", e)
            return []
        except Exception:
            logger.exception("[Product] Error tak terduga saat memanggil backend")
            return []

    @staticmethod
    def _format_products_for_llm(products: List[Dict]) -> str:
        if not products:
            return "(tidak ada produk yang cocok)"
        lines = []
        for i, p in enumerate(products, 1):
            harga = (
                f"Rp{p['harga_per_meter']:,}".replace(",", ".")
                if p.get("harga_per_meter") else "-"
            )
            lines.append(
                f"[{i}] {p.get('nama_motif', '-')} | "
                f"toko: {p.get('nama_umkm', '-')} | "
                f"harga: {harga}/meter | "
                f"WA: {p.get('kontak_wa', '-')} | "
                f"alamat: {p.get('alamat', '-')}"
            )
        return "\n".join(lines)

    @staticmethod
    def _extract_product_filters(query: str) -> Dict:
        q_lower = query.lower()
        filters: Dict = {}

        m = re.search(
            r"(?:dibawah|di bawah|max|maksimal|kurang dari|<)\s*(\d+)\s*(rb|ribu|k)?",
            q_lower,
        )
        if m:
            angka  = int(m.group(1))
            satuan = m.group(2)
            if satuan in ("rb", "ribu", "k"):
                angka *= 1000
            elif satuan is None and angka < 1000:
                angka *= 1000
            filters["max_harga"] = angka

        MOTIF_KEYWORDS = {
            "turonggo yakso":  "Turonggo Yakso",
            "cengkehan":       "Cengkehan",
            "gajah nungguk":   "Gajah Nungguk",
            "pari srono":      "Pari Srono",
            "manggis":         "Manggis",
            "batu tumpuk":     "Batu Tumpuk",
            "kopi trenggalek": "Kopi Trenggalek",
        }
        for key, val in MOTIF_KEYWORDS.items():
            if key in q_lower:
                filters["motif"] = val
                break

        TOKO_KEYWORDS = [
            "sekar jagad", "sekar biru", "mutiara menak sopal",
            "widodo krajan", "oemah batik ngalum",
        ]
        for t in TOKO_KEYWORDS:
            if t in q_lower:
                filters["keyword"] = t
                break

        return filters

    # ── Social ──────────────────────────────────────────────────────────

    def _answer_social(self, query: str, t_start: float) -> RAGResponse:
        messages = [
            {"role": "system", "content": self._social_system_prompt()},
            {"role": "user",   "content": query},
        ]
        t_gen = time.perf_counter()
        answer = self.models.llm.generate(
            messages,
            temperature=SOCIAL_TEMP,
            top_p=SOCIAL_TOP_P,
            max_tokens=SOCIAL_MAX_TOKENS,
        )
        gen_elapsed = time.perf_counter() - t_gen

        return RAGResponse(
            answer=answer,
            intent="social",
            sources=[],
            processing_time=time.perf_counter() - t_start,
            generation_time=gen_elapsed,
        )

    # ── Knowledge ───────────────────────────────────────────────────────

    def _answer_knowledge(self, query: str, t_start: float) -> RAGResponse:
        t_emb = time.perf_counter()
        query_emb = self.models.embed(query)
        logger.info(
            "[Knowledge] embed selesai (%.3fs)", time.perf_counter() - t_emb
        )

        t_ret = time.perf_counter()
        candidates = self.chroma.retrieve(query_emb, k=MAX_CHROMA_K)
        retrieval_elapsed = time.perf_counter() - t_ret
        logger.info(
            "[Knowledge] %d kandidat (%.3fs)", len(candidates), retrieval_elapsed
        )

        if not candidates:
            return RAGResponse(
                answer="Maaf, tidak menemukan informasi relevan di knowledge base.",
                intent="knowledge",
                sources=[],
                processing_time=time.perf_counter() - t_start,
                retrieval_time=retrieval_elapsed,
            )

        t_rr = time.perf_counter()
        rerank_scores = self.models.rerank(
            query, [c.konten_chunk for c in candidates]
        )

        reranked: List[RerankedChunk] = []
        for c, s in zip(candidates, rerank_scores):
            reranked.append(RerankedChunk(
                isi_id=c.isi_id,
                konten_chunk=c.konten_chunk,
                vector_score=c.vector_score,
                rerank_score=float(s),
            ))

        reranked.sort(key=lambda x: x.rerank_score, reverse=True)
        top_chunks: List[RerankedChunk] = reranked[:RERANKED_K]

        rerank_elapsed = time.perf_counter() - t_rr
        logger.info(
            "[Knowledge] rerank → top %d (%.3fs)  best=%.4f  worst=%.4f",
            len(top_chunks), rerank_elapsed,
            top_chunks[0].rerank_score,
            top_chunks[-1].rerank_score,
        )

        context_str = "\n\n".join(
            f"[{i}] {c.konten_chunk}" for i, c in enumerate(top_chunks, 1)
        )

        messages = [
            {"role": "system", "content": self._knowledge_system_prompt(context_str)},
            {"role": "user",   "content": query},
        ]

        t_gen = time.perf_counter()
        answer = self.models.llm.generate(
            messages,
            temperature=KNOWLEDGE_TEMP,
            top_p=KNOWLEDGE_TOP_P,
            max_tokens=KNOWLEDGE_MAX_TOKENS,
        )
        gen_elapsed = time.perf_counter() - t_gen

        sources = [
            {
                "isi_id":       c.isi_id,
                "vector_score": f"{c.vector_score:.4f}",
                "rerank_score": f"{c.rerank_score:.4f}",
                "preview":      c.konten_chunk[:200]
                                + ("…" if len(c.konten_chunk) > 200 else ""),
            }
            for c in top_chunks
        ]

        return RAGResponse(
            answer=answer,
            intent="knowledge",
            sources=sources,
            processing_time=time.perf_counter() - t_start,
            retrieval_time=retrieval_elapsed,
            rerank_time=rerank_elapsed,
            generation_time=gen_elapsed,
        )

    # ── Intent detection ───────────────────────────────────────────────

    _PRODUCT_PHRASES = {
        "rekomendasi batik", "rekomendasikan batik", "batik bagus",
        "batik murah", "batik premium", "cari batik", "carikan batik",
        "beli batik", "order batik", "pesan batik",
        "dimana beli batik", "di mana beli batik",
        "penjual batik", "toko batik", "umkm batik",
        "harga batik", "batik berapa",
    }
    _PRODUCT_ACTIONS = {
        "rekomendasi", "rekomendasikan", "carikan",
        "beli", "order", "pesan", "cari",
    }

    _SOCIAL_PHRASES = (
        "apa kabar", "apakabar", "terima kasih", "terimakasih",
        "sampai jumpa", "selamat tinggal", "thank you",
    )
    _SOCIAL_WORDS = {
        "hai", "halo", "hello", "hi", "hey",
        "kabar", "makasih", "thanks",
        "maaf", "sorry", "permisi",
        "dadah", "bye",
        "oke", "ok", "baik", "siap", "sip",
    }

    _KNOWLEDGE_WORDS = {
        "apa", "apakah", "bagaimana", "mengapa", "kenapa",
        "siapa", "kapan", "dimana", "di", "mana", "berapa", "seberapa",
        "jelaskan", "sebutkan", "ceritakan",
        "deskripsikan", "definisikan", "definisi", "contoh",
        "bandingkan", "bedakan", "perbedaan", "persamaan",
        "cara", "langkah", "proses", "metode",
        "pengertian", "maksud", "artinya", "fungsi", "manfaat",
        "ciri", "karakteristik", "jenis", "macam",
        "batik", "motif", "kain", "canting", "pewarna",
        "budaya", "sejarah", "filosofi", "makna", "tradisi",
        "what", "how", "why", "when", "where", "who", "which",
        "explain", "describe", "list", "define", "compare",
    }

    @classmethod
    def _detect_intent(cls, text: str) -> str:
        normalized = text.lower().strip()
        words      = set(normalized.split())

        # ── Product (prioritas tertinggi) ──────────────────────────────
        for phrase in cls._PRODUCT_PHRASES:
            if phrase in normalized:
                return "product"
        if (words & cls._PRODUCT_ACTIONS) and (
            "batik" in normalized or "kain" in normalized
        ):
            return "product"
        if any(m in normalized for m in (
            "turonggo yakso", "cengkehan", "gajah nungguk", "pari srono"
        )):
            if any(w in normalized for w in (
                "harga", "beli", "order", "pesan", "dimana"
            )):
                return "product"
        if "batik" in normalized and re.search(
            r"\b(?:rp|idr)?\s*\d{4,}", normalized
        ):
            return "product"

        # ── Social ─────────────────────────────────────────────────────
        for phrase in cls._SOCIAL_PHRASES:
            if phrase in normalized:
                return "social"
        if words & cls._SOCIAL_WORDS and not (words & cls._KNOWLEDGE_WORDS):
            return "social"

        # ── Knowledge ──────────────────────────────────────────────────
        if "?" in text:
            return "knowledge"
        if words & cls._KNOWLEDGE_WORDS:
            return "knowledge"

        return "knowledge"


# =========================================================================
# SINGLETON
# =========================================================================

_pipeline: Optional[HarnessPipeline] = None


def get_pipeline() -> HarnessPipeline:
    global _pipeline
    if _pipeline is None:
        _pipeline = HarnessPipeline()
    return _pipeline
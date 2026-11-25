# harness/pipeline.py
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

# ── Backend e-commerce (product recommendation) ─────────────────────────
BACKEND_PRODUCT_PATH = CONFIG.get("backend_product_path", "/chatbot/products/search")
BACKEND_TIMEOUT      = int(CONFIG.get("backend_timeout", 10))
PRODUCT_K            = int(CONFIG.get("product_recommendation_k", 5))


# =========================================================================
# FALLBACK PROMPTS (dipakai untuk intent social atau jika koleksi kosong)
# =========================================================================

_FALLBACK_GUARD_RAILS = (
    "Kamu hanya boleh menjawab pertanyaan seputar batik dan topik terkait "
    "(motif, sejarah, budaya, produk, UMKM). Tolak dengan sopan pertanyaan "
    "di luar topik tersebut."
)

_FALLBACK_INSTRUCTIONS = (
    "Jawab dengan bahasa yang ramah, natural, dan jelas. "
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
# HELPER KOLEKSI ATURAN (instruction & guard_rails)
# =========================================================================

def _get_optional_collection(client: chromadb.ClientAPI, name: str):
    """Ambil handle koleksi ChromaDB jika tersedia, atau None bila belum ada."""
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
    Pipeline utama harness.

    Tidak ada route di sini. Pemanggilan dari main.py:
        pipeline = get_pipeline()
        response = pipeline.answer(query)
    """

    def __init__(self):
        self.models = HarnessModels.get()
        self.chroma = ChromaRetriever()

        # Simpan handle koleksi aturan saja (diambil top-k per query)
        self.instruction_col = _get_optional_collection(
            self.chroma.client, INSTRUCTION_COLLECTION
        )
        self.guard_rails_col = _get_optional_collection(
            self.chroma.client, GUARDRAILS_COLLECTION
        )

        logger.info(
            "[Pipeline] Rule retrieval aktif — instruction_k=%d, guard_rails_k=%d",
            INSTRUCTION_K, GUARDRAILS_K,
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

    # ── Rule retrieval ─────────────────────────────────────────────────

    @staticmethod
    def _retrieve_rules(
        col,
        query_emb: List[float],
        k: int,
        fallback: str,
    ) -> str:
        """Ambil top-k chunk aturan paling relevan; fallback jika kosong/gagal."""
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

    # ── Prompt builders ────────────────────────────────────────────────

    def _base_system_prompt(
        self,
        instructions_text: str,
        guard_rails_text: str,
    ) -> str:
        """Bagian system prompt yang selalu ada di semua intent."""
        return (
            "=== INSTRUKSI ===\n"
            f"{instructions_text}\n\n"
            "=== GUARD RAILS ===\n"
            f"{guard_rails_text}\n\n"
            "=== GAYA BAHASA ===\n"
            "- Jawab secara natural, sopan, dan mengalir seperti percakapan CS manusia.\n"
            "- Penjelasan boleh cukup lengkap jika memang membantu memperjelas jawaban.\n"
            "- DILARANG menutup jawaban dengan kalimat template/klise seperti "
            "'Ada yang bisa saya bantu lagi?', 'Ada yang ingin saya bantu lagi?', "
            "atau 'Apakah ada pertanyaan lain?'. Akhiri jawaban secara natural begitu informasi selesai."
        )

    def _knowledge_system_prompt(
        self,
        context_str: str,
        instructions_text: str,
        guard_rails_text: str,
    ) -> str:
        base = self._base_system_prompt(instructions_text, guard_rails_text)
        return (
            f"{base}\n\n"
            "=== KONTEKS DARI KNOWLEDGE BASE ===\n"
            f"{context_str}\n\n"
            "Jawab pertanyaan HANYA berdasarkan konteks di atas secara natural. "
            "Jika konteks tidak cukup, katakan dengan jujur bahwa informasinya belum tersedia. "
            "Jangan mengarang fakta di luar konteks."
        )

    def _product_system_prompt(
        self,
        product_context: str,
        instructions_text: str,
        guard_rails_text: str,
        is_recommendation: bool = True,
    ) -> str:
        base = self._base_system_prompt(instructions_text, guard_rails_text)

        if is_recommendation:
            task_rule = (
                "Berikan rekomendasi produk berdasarkan data di atas dengan gaya bahasa natural. "
                "Jelaskan singkat keunggulan, harga, atau ciri khas tiap produk. "
                "Karena kartu produk (dengan tombol Buku, 3D, dan WA) sudah otomatis tampil di bawah pesan, "
                "tidak perlu memaksakan format daftar kaku atau mengulang nomor WA berulang-ulang. "
                "Jangan mengarang data di luar daftar."
            )
        else:
            task_rule = (
                "Pengguna sedang mengonfirmasi atau menanyakan detail spesifik produk. "
                "Jawab langsung dan natural berdasarkan data produk di atas. "
                "Boleh tambahkan penjelasan konteks yang relevan (misalnya bahan, ukuran, atau keterangan kain) "
                "agar informatif, tetapi JANGAN memaksakan ajakan memesan atau menyertakan nomor WA "
                "kecuali pengguna memang menanyakan kontak/cara pesan, atau jika informasi yang ditanyakan "
                "belum dicantumkan penjual di data produk. Jangan mengarang data di luar daftar."
            )

        return (
            f"{base}\n\n"
            "=== DATA PRODUK KATALOG ===\n"
            f"{product_context}\n\n"
            f"{task_rule}"
        )

    def _social_system_prompt(self) -> str:
        # Sapaan cukup pakai fallback ringkas agar hemat token & latensi
        base = self._base_system_prompt(
            _FALLBACK_INSTRUCTIONS, _FALLBACK_GUARD_RAILS
        )
        return (
            f"{base}\n\n"
            "Jawab sapaan atau obrolan singkat dengan ramah, santai, dan tidak kaku."
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
        if cache_key and resp.answer and resp.answer != _LLM_ERROR_ANSWER:
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

    _RECOMMENDATION_SIGNALS = {
        "rekomendasi", "rekomendasikan", "rekom", "saran", "sarankan",
        "cari", "carikan", "daftar", "list", "pilihan", "koleksi",
        "beli", "order", "pesan", "murah", "termurah", "terbaik", "bagus",
        "premium", "budget", "dibawah", "max", "maksimal",
    }
    _RECOMMENDATION_PHRASES = (
        "di bawah", "kurang dari", "apa saja", "apa aja",
        "ada batik apa", "ada produk apa", "punya batik apa",
        "jual batik apa", "mau lihat", "lihat produk",
    )

    @classmethod
    def _is_recommendation_query(cls, query: str) -> bool:
        """True jika user minta rekomendasi/cari/pesan (tampilkan kartu), False jika konfirmasi/detail."""
        q_lower = query.lower().strip()
        tokens = set(re.findall(r"[a-z0-9]+", q_lower))
        if tokens & cls._RECOMMENDATION_SIGNALS:
            return True
        if any(phrase in q_lower for phrase in cls._RECOMMENDATION_PHRASES):
            return True
        return False

    def _answer_product(self, query: str, t_start: float) -> RAGResponse:
        is_recommendation = self._is_recommendation_query(query)
        response_intent = "product" if is_recommendation else "product_detail"

        filters = self._extract_product_filters(query)
        logger.info("[Product] mode=%s filter=%s", response_intent, filters)

        t_http = time.perf_counter()
        products = self._fetch_products_from_backend(filters, limit=PRODUCT_K)

        # Fallback: jika keyword spesifik tidak ketemu di SQL ILIKE,
        # ambil daftar produk lebih luas lalu cocokkan token secara lokal
        if not products and (filters.get("keyword") or filters.get("motif")):
            broad_filters = {}
            if filters.get("max_harga"):
                broad_filters["max_harga"] = filters["max_harga"]

            candidates = self._fetch_products_from_backend(broad_filters, limit=20)
            if candidates:
                matched = self._rank_products_by_query(
                    query=query,
                    keyword=filters.get("keyword") or "",
                    products=candidates,
                    limit=PRODUCT_K,
                )
                products = matched if matched else candidates[:PRODUCT_K]
                logger.info(
                    "[Product] fallback lokal -> %d dari %d kandidat",
                    len(products),
                    len(candidates),
                )

        http_elapsed = time.perf_counter() - t_http
        logger.info(
            "[Product] %d produk dari backend (%.3fs)",
            len(products), http_elapsed,
        )

        if not products:
            return RAGResponse(
                answer=(
                    "Maaf, belum ada produk yang cocok dengan permintaan Anda. "
                    "Coba sebutkan nama produk, motif, atau kisaran harga lain."
                ),
                intent=response_intent,
                sources=[],
                processing_time=time.perf_counter() - t_start,
                retrieval_time=http_elapsed,
            )

        query_emb = self.models.embed(query)
        instructions_text = self._retrieve_rules(
            self.instruction_col, query_emb, min(1, INSTRUCTION_K), _FALLBACK_INSTRUCTIONS
        )
        guard_rails_text = self._retrieve_rules(
            self.guard_rails_col, query_emb, min(1, GUARDRAILS_K), _FALLBACK_GUARD_RAILS
        )

        product_context = self._format_products_for_llm(products)
        system_prompt = self._product_system_prompt(
            product_context,
            instructions_text,
            guard_rails_text,
            is_recommendation=is_recommendation,
        )

        logger.info(
            "[Product] breakdown chars | mode=%s | instructions=%d | guard_rails=%d | products=%d | query=%d | TOTAL=%d (~%d est. tokens)",
            response_intent,
            len(instructions_text),
            len(guard_rails_text),
            len(product_context),
            len(query),
            len(system_prompt) + len(query),
            (len(system_prompt) + len(query)) // 3,
        )

        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user",   "content": query},
        ]

        t_gen = time.perf_counter()
        answer = self.models.llm.generate(
            messages,
            temperature=0.4,
            top_p=0.9,
            max_tokens=PRODUCT_MAX_TOKENS,
        )
        gen_elapsed = time.perf_counter() - t_gen

        return RAGResponse(
            answer=answer,
            intent=response_intent,
            sources=[{"tipe": "produk", **p} for p in products] if is_recommendation else [],
            processing_time=time.perf_counter() - t_start,
            retrieval_time=http_elapsed,
            generation_time=gen_elapsed,
        )

    def _fetch_products_from_backend(
        self,
        filters: Dict,
        limit: Optional[int] = None,
    ) -> List[Dict]:
        url = build_backend_url(BACKEND_PRODUCT_PATH)
        params: Dict = {"limit": limit or PRODUCT_K}
        if filters.get("keyword"):
            params["keyword"] = filters["keyword"]
        if filters.get("motif"):
            params["motif"] = filters["motif"]
        if filters.get("max_harga"):
            params["max_harga"] = filters["max_harga"]

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
    def _rank_products_by_query(
        query: str,
        keyword: str,
        products: List[Dict],
        limit: int,
    ) -> List[Dict]:
        """Cocokkan token query ke nama produk, toko, dan atribut tanpa LLM."""
        raw_source = keyword or query
        tokens = [
            t for t in re.findall(r"[a-z0-9]+", raw_source.lower())
            if t not in {"batik", "kain", "produk"}
        ]
        if not tokens:
            tokens = re.findall(r"[a-z0-9]+", raw_source.lower())

        scored = []
        for p in products:
            name_text = f"{p.get('name', '')} {p.get('nama_motif', '')}".lower()
            shop_text = str(p.get("nama_umkm", "")).lower()
            attrs = p.get("additional_attribute") or {}
            attr_text = " ".join(str(v) for v in attrs.values() if v is not None).lower()
            desc_text = str(p.get("description", "")).lower()

            score = 0
            if keyword and keyword.lower() in name_text:
                score += 10
            if keyword and keyword.lower() in shop_text:
                score += 8

            name_words = set(re.findall(r"[a-z0-9]+", name_text))
            shop_words = set(re.findall(r"[a-z0-9]+", shop_text))

            for tok in tokens:
                if tok in name_words:
                    score += 4
                elif len(tok) >= 3 and tok in name_text:
                    score += 2
                if tok in shop_words:
                    score += 3
                elif len(tok) >= 3 and tok in shop_text:
                    score += 1
                if len(tok) >= 3 and (tok in attr_text or tok in desc_text):
                    score += 1

            if score > 0:
                scored.append((score, p))

        scored.sort(key=lambda pair: pair[0], reverse=True)
        return [p for _, p in scored[:limit]]

    @staticmethod
    def _fmt_meter(cm_val) -> str:
        try:
            m = float(cm_val) / 100.0
            return f"{m:g}".replace(".", ",")
        except (TypeError, ValueError):
            return ""

    @classmethod
    def _format_products_for_llm(cls, products: List[Dict]) -> str:
        if not products:
            return "(tidak ada produk yang cocok)"

        lines = []
        for i, p in enumerate(products, 1):
            harga_num = p.get("harga") or p.get("harga_per_meter")
            harga = (
                f"Rp{int(harga_num):,}".replace(",", ".")
                if harga_num is not None and harga_num != "" else "-"
            )

            attrs = p.get("additional_attribute")
            if not isinstance(attrs, dict):
                attrs = {}

            parts = [
                f"[{i}] {p.get('nama_motif', p.get('name', '-'))}",
                f"toko: {p.get('nama_umkm', '-')}",
                f"harga: {harga}",
            ]

            # Format ukuran lengkap (cm + konversi meter per lembar)
            panjang = p.get("panjang_cm") if p.get("panjang_cm") is not None else attrs.get("panjang_cm")
            lebar = p.get("lebar_cm") if p.get("lebar_cm") is not None else attrs.get("lebar_cm")
            if panjang is not None and lebar is not None:
                p_m = cls._fmt_meter(panjang)
                l_m = cls._fmt_meter(lebar)
                parts.append(f"ukuran: {panjang}x{lebar} cm ({p_m}x{l_m} m per lembar)")
            elif panjang is not None:
                parts.append(f"panjang: {panjang} cm ({cls._fmt_meter(panjang)} m)")
            elif lebar is not None:
                parts.append(f"lebar: {lebar} cm ({cls._fmt_meter(lebar)} m)")

            # Atribut spesifikasi utama
            motif = p.get("motif") or attrs.get("motif")
            teknik = p.get("teknik") or attrs.get("teknik")
            bahan = p.get("bahan") or attrs.get("bahan")
            bentuk = p.get("bentuk") or attrs.get("bentuk")
            berat = p.get("berat_gram") if p.get("berat_gram") is not None else attrs.get("berat_gram")
            pewarna_alami = (
                p.get("pewarna_alami")
                if p.get("pewarna_alami") is not None
                else attrs.get("pewarna_alami")
            )

            if motif:
                parts.append(f"motif: {motif}")
            if teknik:
                parts.append(f"teknik: {teknik}")
            if bahan:
                parts.append(f"bahan: {bahan}")
            if bentuk:
                parts.append(f"bentuk: {bentuk}")
            if berat is not None and berat != "":
                parts.append(f"berat: {berat} gram")
            if isinstance(pewarna_alami, bool):
                parts.append(f"pewarna alami: {'Ya' if pewarna_alami else 'Tidak'}")

            # Atribut tambahan lain yang mungkin diisi seller (misal ukuran baju, furing, dll.)
            handled_keys = {
                "motif", "teknik", "bahan", "bentuk",
                "panjang_cm", "lebar_cm", "berat_gram", "pewarna_alami",
            }
            for k, v in attrs.items():
                if k in handled_keys or v is None or str(v).strip() == "":
                    continue
                val_str = "Ya" if v is True else ("Tidak" if v is False else str(v))
                parts.append(f"{k.replace('_', ' ')}: {val_str}")

            desc = str(p.get("description") or "").strip()
            if desc:
                short_desc = desc[:160] + ("…" if len(desc) > 160 else "")
                parts.append(f"deskripsi: {short_desc}")

            parts.append(f"WA: {p.get('kontak_wa', '-')}")
            parts.append(f"alamat: {p.get('alamat', '-')}")

            lines.append(" | ".join(parts))

        return "\n".join(lines)

    _FILTER_STOPWORDS = {
        "apa", "apakah", "ada", "aja", "alamat", "alamatnya", "atau",
        "bagaimana", "bagus", "bahan", "bahannya", "barang", "bawah", "beli",
        "benar", "bener", "bentuk", "bentuknya", "berarti", "berapa", "berat",
        "beratnya", "betul", "bisa", "brp", "budget", "buat", "bukan",
        "cari", "carikan", "cm", "coba", "daftar", "dan", "dari", "dengan",
        "detail", "di", "dibawah", "dimana", "dong", "gak", "gimana", "gram",
        "harga", "harganya", "idr", "info", "informasi", "ini", "itu", "iya",
        "jadi", "jenis", "jual", "juta", "jt", "k", "kah", "kak", "kalau",
        "kalo", "kan", "kasih", "ke", "kisaran", "kok", "kontak", "kurang",
        "lebar", "lebarnya", "lembar", "link", "list", "mana", "maksimal",
        "max", "mengenai", "meter", "min", "minta", "motif", "motifnya",
        "murah", "nggak", "nih", "nya", "nomor", "order", "pakai", "panjang",
        "panjangnya", "penjual", "per", "perlembar", "pesan", "pewarna",
        "premium", "produk", "punya", "rb", "ready", "rekomendasi",
        "rekomendasikan", "ribu", "rp", "saja", "sama", "sanggar", "satuan",
        "saya", "semua", "seputar", "shopee", "sih", "spek", "spesifikasi",
        "stok", "tadi", "tanya", "teknik", "tekniknya", "tentang", "terbaik",
        "tersedia", "tersebut", "tidak", "toko", "tokonya", "tokopedia",
        "tolong", "tuh", "ukuran", "ukurannya", "umkm", "untuk", "wa",
        "whatsapp", "ya", "yah", "yang",
    }

    @classmethod
    def _extract_product_filters(cls, query: str) -> Dict:
        q_lower = query.lower()
        filters: Dict = {}

        # 1. Batas harga maksimal (misal: dibawah 300rb, max 250000)
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

        # 2. Motif baku (jika disebut eksplisit)
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

        # 3. Ekstrak keyword dinamis (mendukung nama produk/toko baru di DB seperti "Batik Tes 2")
        cleaned = re.sub(
            r"(?:dibawah|di bawah|max|maksimal|kurang dari|<)\s*\d+\s*(?:rb|ribu|k)?",
            " ",
            q_lower,
        )
        # Hapus nominal harga (misal 150k, 150rb, rp150.000, 150000) agar tidak mengotori keyword
        cleaned = re.sub(r"\b(?:rp\.?\s*)?\d[\d.,]*\s*(?:rb|ribu|k|jt|juta)\b", " ", cleaned)
        cleaned = re.sub(r"\b(?:rp\.?\s*)?\d{4,}\b", " ", cleaned)

        raw_tokens = re.findall(r"[a-z0-9]+", cleaned)
        kept_tokens = [t for t in raw_tokens if t not in cls._FILTER_STOPWORDS]

        # Jangan kirim keyword jika yang tersisa cuma kata umum "batik"/"kain"
        specific_tokens = [t for t in kept_tokens if t not in {"batik", "kain"}]
        if specific_tokens:
            motif_tokens = set(re.findall(r"[a-z0-9]+", filters.get("motif", "").lower()))
            if not (motif_tokens and set(specific_tokens).issubset(motif_tokens)):
                filters["keyword"] = " ".join(kept_tokens[:4])

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

        instructions_text = self._retrieve_rules(
            self.instruction_col, query_emb, INSTRUCTION_K, _FALLBACK_INSTRUCTIONS
        )
        guard_rails_text = self._retrieve_rules(
            self.guard_rails_col, query_emb, GUARDRAILS_K, _FALLBACK_GUARD_RAILS
        )

        system_prompt = self._knowledge_system_prompt(
            context_str, instructions_text, guard_rails_text
        )

        logger.info(
            "[Knowledge] breakdown chars | instructions=%d | guard_rails=%d | context=%d | query=%d | TOTAL=%d (~%d est. tokens)",
            len(instructions_text),
            len(guard_rails_text),
            len(context_str),
            len(query),
            len(system_prompt) + len(query),
            (len(system_prompt) + len(query)) // 3,
        )

        messages = [
            {"role": "system", "content": system_prompt},
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
        "berapa meter", "per lembar", "perlembar",
        "ukuran batik", "ukuran kain", "panjang kain", "lebar kain",
        "spesifikasi batik", "spesifikasi produk", "detail produk",
    }
    _PRODUCT_ACTIONS = {
        "rekomendasi", "rekomendasikan", "carikan",
        "beli", "order", "pesan", "cari", "jual",
    }
    _PRODUCT_SPEC_WORDS = {
        "harga", "harganya", "brp", "meter", "cm", "ukuran", "ukurannya",
        "panjang", "panjangnya", "lebar", "lebarnya", "perlembar", "lembar",
        "berat", "beratnya", "gram", "stok", "ready", "tersedia",
        "spek", "spesifikasi", "toko", "tokonya", "sanggar", "umkm",
        "wa", "whatsapp", "kontak", "alamat", "link", "shopee", "tokopedia",
    }
    _PURE_KNOWLEDGE_SIGNALS = (
        "filosofi", "sejarah", "makna", "asal usul", "asal-usul",
        "cara merawat", "cara mencuci", "perawatan", "proses pembuatan",
        "perbedaan", "bedanya", "pengertian", "definisi", "apa itu",
    )
    _SOCIAL_PHRASES = {
        "selamat pagi", "selamat siang", "selamat sore", "selamat malam",
        "terima kasih", "makasih banyak", "apa kabar", "sugeng rawuh",
        "sugeng enjang", "sampai jumpa", "dadah", "permisi",
    }
    _SOCIAL_WORDS = {
        "halo", "hai", "hello", "hi", "hey", "hei", "pagi", "siang",
        "sore", "malam", "makasih", "thanks", "thank", "oke", "ok",
        "sip", "siap", "mantap", "bye", "assalamualaikum", "p",
    }
    _KNOWLEDGE_WORDS = {
        "apa", "siapa", "kapan", "dimana", "mengapa", "kenapa", "bagaimana",
        "gimana", "jelaskan", "ceritakan", "filosofi", "sejarah", "makna",
        "motif", "batik", "trenggalek", "tulis", "cap", "rawat", "merawat",
        "cuci", "mencuci", "canting", "malam", "sogan", "pewarna",
    }

    @classmethod
    def _detect_intent(cls, text: str) -> str:
        normalized = text.lower().strip()
        tokens = set(re.findall(r"[a-z0-9]+", normalized))

        is_pure_knowledge = any(sig in normalized for sig in cls._PURE_KNOWLEDGE_SIGNALS)
        has_commerce_intent = bool(
            tokens & (
                cls._PRODUCT_ACTIONS
                | {"harga", "harganya", "beli", "order", "pesan", "wa", "whatsapp", "toko", "sanggar"}
            )
        )

        # Lindungi pertanyaan pengetahuan murni (filosofi/sejarah/perawatan)
        if is_pure_knowledge and not has_commerce_intent:
            return "knowledge"

        # ── Product (prioritas tertinggi) ──────────────────────────────
        for phrase in cls._PRODUCT_PHRASES:
            if phrase in normalized:
                return "product"

        if (tokens & cls._PRODUCT_ACTIONS) and (
            "batik" in normalized or "kain" in normalized or "produk" in normalized
        ):
            return "product"

        # Pertanyaan spesifikasi produk (ukuran, panjang, meter, berat, harga, toko, WA)
        if tokens & cls._PRODUCT_SPEC_WORDS:
            if (
                "batik" in normalized
                or "kain" in normalized
                or "produk" in normalized
                or "toko" in normalized
                or "sanggar" in normalized
                or bool(tokens & {"ini", "itu", "tersebut"})
            ):
                return "product"

        # Pertanyaan bahan/teknik/motif yang menunjuk produk spesifik ("batik a ini bahannya apa?")
        if (
            ("batik" in normalized or "kain" in normalized or "produk" in normalized)
            and bool(tokens & {"bahan", "bahannya", "teknik", "tekniknya", "pewarna", "bentuk"})
            and bool(tokens & {"ini", "itu", "tersebut"})
        ):
            return "product"

        if any(m in normalized for m in (
            "turonggo yakso", "cengkehan", "gajah nungguk", "pari srono",
            "manggis", "batu tumpuk", "kopi trenggalek",
        )):
            if tokens & (cls._PRODUCT_ACTIONS | cls._PRODUCT_SPEC_WORDS | {"bahan", "bahannya", "teknik", "dimana"}):
                return "product"

        if "batik" in normalized and re.search(
            r"\b(?:rp\.?\s*|idr\s*)?\d+(?:[.,]\d+)?\s*(?:rb|ribu|k|jt|juta)?\b",
            normalized,
        ):
            if re.search(r"\b(?:rp\.?\s*|idr\s*)?\d+(?:[.,]\d+)?\s*(?:rb|ribu|k|jt|juta)\b|\b\d{4,}\b", normalized):
                return "product"

        # ── Social ─────────────────────────────────────────────────────
        for phrase in cls._SOCIAL_PHRASES:
            if phrase in normalized:
                return "social"
        if tokens & cls._SOCIAL_WORDS and not (tokens & cls._KNOWLEDGE_WORDS):
            return "social"

        # ── Knowledge ──────────────────────────────────────────────────
        if "?" in text:
            return "knowledge"
        if tokens & cls._KNOWLEDGE_WORDS:
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
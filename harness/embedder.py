"""
embedder.py — versi simpel (tanpa graph), 3 koleksi.

Routing by filename:
  - nama file mengandung "instruction"            → instruction_collection
  - nama file mengandung "guard_rail"/"guardrail" → guard_rails_collection
  - lainnya                                       → chroma_collection (default)

Alur:
  1. Baca semua file PDF di folder `dataset_path`.
  2. Deteksi koleksi tujuan berdasarkan nama file.
  3. Ekstrak teks per halaman dengan pdfplumber.
  4. Chunking sederhana berdasarkan `max_tokens_per_chunk`.
  5. Embed tiap chunk dengan `embedding_model`.
  6. Simpan ke koleksi yang sesuai di folder `chroma_path`.

Resource management:
  - Setelah selesai, model dihapus dari GPU (del + empty_cache)
    supaya GPU bisa dipakai server harness yang berjalan permanen.
  - Proses dipaksa exit di akhir main() supaya CUDA context benar-benar
    dilepas.

Jalankan:
    python embedder.py
    python embedder.py --file dataset/xxx.pdf
    python embedder.py --reset
    python embedder.py --cpu
"""

from __future__ import annotations

import argparse
import gc
import hashlib
import logging
import os
import re
import sys
import uuid
from pathlib import Path
from typing import Dict, List, Optional

import chromadb
from chromadb.config import Settings
import pdfplumber
from sentence_transformers import SentenceTransformer

# ── Import config dari root ─────────────────────────────────────────────
PARENT_DIR = Path(__file__).resolve().parent.parent
if str(PARENT_DIR) not in sys.path:
    sys.path.insert(0, str(PARENT_DIR))

from config import CONFIG  # noqa: E402

logger = logging.getLogger("embedder")

# ── Konstanta dari CONFIG ───────────────────────────────────────────────
def _resolve(p: str) -> str:
    return p if os.path.isabs(p) else str((PARENT_DIR / p).resolve())

EMBEDDING_MODEL        = CONFIG["embedding_model"]
CHROMA_COLLECTION      = CONFIG["chroma_collection"]
INSTRUCTION_COLLECTION = CONFIG["instruction_collection"]
GUARDRAILS_COLLECTION  = CONFIG["guard_rails_collection"]
MAX_TOKENS_PER_CHUNK   = int(CONFIG["max_tokens_per_chunk"])
DATASET_PATH           = _resolve(CONFIG["dataset_path"])
CHROMA_PATH            = _resolve(CONFIG["chroma_path"])


# =========================================================================
# COLLECTION ROUTING
# =========================================================================

def _route_collection(filename: str) -> str:
    """
    Tentukan koleksi tujuan berdasarkan nama file.

    Aturan:
      - mengandung "instruction"                 → instruction_collection
      - mengandung "guard_rail" / "guardrail"    → guard_rails_collection
      - lainnya                                  → chroma_collection
    """
    name = filename.lower()
    if "instruction" in name:
        return INSTRUCTION_COLLECTION
    if "guard_rail" in name or "guardrail" in name:
        return GUARDRAILS_COLLECTION
    return CHROMA_COLLECTION


# =========================================================================
# GPU DEVICE SELECTION
# =========================================================================

def _pick_device(force_cpu: bool = False) -> str:
    if force_cpu:
        logger.info("[Device] --cpu dipaksa → pakai CPU")
        return "cpu"
    try:
        import torch
        if torch.cuda.is_available():
            name = torch.cuda.get_device_name(0)
            logger.info("[Device] CUDA tersedia (%s) → pakai GPU", name)
            return "cuda"
    except Exception as e:
        logger.warning("[Device] Cek CUDA gagal: %s", e)
    logger.info("[Device] GPU tidak tersedia → pakai CPU")
    return "cpu"


def _release_gpu(model=None) -> None:
    if model is not None:
        try:
            del model
        except Exception:
            pass
    gc.collect()
    try:
        import torch
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
            torch.cuda.ipc_collect()
            logger.info(
                "[GPU] Cache dibersihkan — allocated=%.1f MB  reserved=%.1f MB",
                torch.cuda.memory_allocated() / 1024 / 1024,
                torch.cuda.memory_reserved() / 1024 / 1024,
            )
    except Exception as e:
        logger.debug("[GPU] Cleanup dilewati: %s", e)


# =========================================================================
# TOKEN & CHUNKING
# =========================================================================

def count_tokens(text: str) -> int:
    return len(text) // 4


def split_text(text: str, max_tokens: int) -> List[str]:
    if not text.strip():
        return []

    chunks: List[str] = []
    current = ""
    parts = re.split(r"([.!?]+\s+)", text)

    for i in range(0, len(parts), 2):
        sentence = parts[i]
        delim    = parts[i + 1] if i + 1 < len(parts) else ""
        piece    = sentence + delim

        if current and count_tokens(current + piece) > max_tokens:
            chunks.append(current.strip())
            current = piece
        else:
            current += piece

        if count_tokens(current) > max_tokens:
            words = current.split()
            buf = ""
            for w in words:
                if count_tokens(buf + " " + w) > max_tokens:
                    if buf:
                        chunks.append(buf.strip())
                    buf = w
                else:
                    buf = buf + " " + w if buf else w
            current = buf

    if current.strip():
        chunks.append(current.strip())

    return chunks


# =========================================================================
# PDF PARSING
# =========================================================================

def extract_pdf_text(pdf_path: str) -> str:
    pages: List[str] = []
    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            t = (page.extract_text() or "").strip()
            if t:
                pages.append(t)
    return "\n\n".join(pages)


def file_hash(path: str) -> str:
    h = hashlib.md5()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(4096), b""):
            h.update(chunk)
    return h.hexdigest()


# =========================================================================
# EMBEDDER
# =========================================================================

class Embedder:
    def __init__(self, device: str = "cpu"):
        self.device = device

        logger.info("Loading embedding model: %s (device=%s)", EMBEDDING_MODEL, device)
        self.model = SentenceTransformer(EMBEDDING_MODEL, device=device)

        logger.info("Opening ChromaDB at: %s", CHROMA_PATH)
        self.client = chromadb.PersistentClient(
            path=CHROMA_PATH,
            settings=Settings(anonymized_telemetry=False),
        )

        # Siapkan 3 koleksi
        self.collections: Dict[str, "chromadb.Collection"] = {}
        for name in (CHROMA_COLLECTION, INSTRUCTION_COLLECTION, GUARDRAILS_COLLECTION):
            self.collections[name] = self.client.get_or_create_collection(
                name=name,
                metadata={"description": f"Harness collection: {name}"},
            )

    def reset_collections(self):
        for name in (CHROMA_COLLECTION, INSTRUCTION_COLLECTION, GUARDRAILS_COLLECTION):
            try:
                self.client.delete_collection(name)
                logger.info("Collection '%s' deleted.", name)
            except Exception:
                pass
            self.collections[name] = self.client.get_or_create_collection(
                name=name,
                metadata={"description": f"Harness collection: {name}"},
            )

    def _collection(self, name: str):
        return self.collections[name]

    def already_ingested(self, collection_name: str, fhash: str) -> bool:
        try:
            col = self._collection(collection_name)
            res = col.get(where={"file_hash": fhash}, limit=1, include=[])
            return len(res["ids"]) > 0
        except Exception:
            return False

    def ingest_file(self, pdf_path: str) -> Optional[Dict]:
        name  = Path(pdf_path).name
        fhash = file_hash(pdf_path)

        collection_name = _route_collection(name)
        logger.info("[%s] → koleksi '%s'", name, collection_name)

        if self.already_ingested(collection_name, fhash):
            logger.info("[SKIP] %s (hash %s sudah ada di '%s')",
                        name, fhash[:8], collection_name)
            return None

        text = extract_pdf_text(pdf_path)
        if not text:
            logger.warning("[EMPTY] %s — tidak ada teks, dilewati", name)
            return None

        chunks = split_text(text, MAX_TOKENS_PER_CHUNK)
        if not chunks:
            logger.warning("[EMPTY] %s — 0 chunk setelah splitting", name)
            return None

        logger.info("[%s] %d chunk, embedding...", name, len(chunks))

        embeddings = self.model.encode(
            chunks,
            batch_size=32,
            show_progress_bar=False,
            normalize_embeddings=True,
        ).tolist()

        source_stem = Path(pdf_path).stem
        ids = [
            str(uuid.uuid5(uuid.NAMESPACE_DNS, f"{fhash}:{i}"))
            for i in range(len(chunks))
        ]
        metadatas = [
            {
                "source_file": pdf_path,
                "source_name": name,
                "source_stem": source_stem,
                "file_hash":   fhash,
                "chunk_index": i,
                "collection":  collection_name,
            }
            for i in range(len(chunks))
        ]

        col = self._collection(collection_name)
        col.upsert(
            ids=ids,
            documents=chunks,
            embeddings=embeddings,
            metadatas=metadatas,
        )
        logger.info("[%s] ✓ %d chunk tersimpan di '%s'",
                    name, len(chunks), collection_name)

        return {
            "file":       name,
            "chunks":     len(chunks),
            "hash":       fhash,
            "collection": collection_name,
        }

    def close(self):
        logger.info("Menutup Embedder...")
        if self.model is not None:
            _release_gpu(model=self.model)
            self.model = None
        self.client = None
        gc.collect()


# =========================================================================
# MAIN
# =========================================================================

def _setup_logging():
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s  %(levelname)-8s  %(name)-10s  %(message)s",
        datefmt="%H:%M:%S",
        force=True,
    )
    for noisy in ("chromadb", "urllib3", "httpx", "sentence_transformers", "transformers"):
        logging.getLogger(noisy).setLevel(logging.WARNING)


def main():
    parser = argparse.ArgumentParser(description="PDF embedder → ChromaDB (3 koleksi)")
    parser.add_argument("--file",  help="Proses satu file PDF saja")
    parser.add_argument("--reset", action="store_true", help="Hapus ketiga koleksi sebelum ingest")
    parser.add_argument("--cpu",   action="store_true", help="Paksa pakai CPU")
    args = parser.parse_args()

    _setup_logging()

    if not Path(DATASET_PATH).exists():
        logger.error("Dataset path tidak ditemukan: %s", DATASET_PATH)
        sys.exit(1)

    if args.file:
        if not Path(args.file).is_file():
            logger.error("File tidak ditemukan: %s", args.file)
            sys.exit(1)
        pdf_files = [Path(args.file)]
    else:
        pdf_files = sorted(Path(DATASET_PATH).rglob("*.pdf"))

    if not pdf_files:
        logger.warning("Tidak ada file PDF di %s", DATASET_PATH)
        return

    logger.info("Ditemukan %d file PDF", len(pdf_files))

    device = _pick_device(force_cpu=args.cpu)
    embedder = Embedder(device=device)

    if args.reset:
        embedder.reset_collections()

    processed = 0
    skipped   = 0
    per_collection: Dict[str, int] = {}
    try:
        for pdf in pdf_files:
            try:
                result = embedder.ingest_file(str(pdf))
                if result:
                    processed += 1
                    c = result["collection"]
                    per_collection[c] = per_collection.get(c, 0) + 1
                else:
                    skipped += 1
            except Exception:
                logger.exception("Gagal memproses %s", pdf)
    finally:
        embedder.close()

    logger.info("=" * 50)
    logger.info("SELESAI — processed=%d  skipped=%d", processed, skipped)
    for c, n in per_collection.items():
        logger.info("  %-25s : %d file", c, n)
    logger.info("Chroma path: %s", CHROMA_PATH)
    logger.info("Device     : %s", device)


if __name__ == "__main__":
    try:
        main()
    except SystemExit:
        raise
    except BaseException:
        import traceback
        traceback.print_exc()
        sys.exit(1)
    finally:
        _release_gpu()
        # Flush dulu supaya log tidak hilang saat os._exit
        try:
            sys.stdout.flush()
            sys.stderr.flush()
        except Exception:
            pass
        os._exit(0)
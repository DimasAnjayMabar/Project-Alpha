# harness/cache/sqlite_backend.py
"""
Backend cache LLM berbasis SQLite.

Dua lapis:
  - in-memory LRU (super cepat, hilang saat restart)
  - SQLite (persist, dibaca kalau lapis 1 miss)
"""

from __future__ import annotations

import json
import logging
import sqlite3
import threading
import time
from collections import OrderedDict
from pathlib import Path
from typing import Dict, List, Optional

from .base import BaseLLMCache

logger = logging.getLogger("harness.cache.sqlite")


class SQLiteLLMCache(BaseLLMCache):
    def __init__(
        self,
        sqlite_path:     Path,
        max_memory_items: int = 500,
        ttl_seconds:     int = 3600,
    ):
        self.sqlite_path = Path(sqlite_path)
        self.max_mem     = max_memory_items
        self.ttl         = ttl_seconds

        self._mem: "OrderedDict[str, tuple]" = OrderedDict()
        self._mem_lock = threading.Lock()

        self._db_lock = threading.Lock()
        self._init_db()

        logger.info(
            "[Cache/SQLite] siap — path=%s  max_mem=%d  ttl=%ds",
            self.sqlite_path, self.max_mem, self.ttl,
        )

    def _init_db(self):
        self.sqlite_path.parent.mkdir(parents=True, exist_ok=True)
        with self._db_lock, sqlite3.connect(self.sqlite_path) as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS llm_cache (
                    key         TEXT PRIMARY KEY,
                    intent      TEXT NOT NULL,
                    query       TEXT NOT NULL,
                    answer      TEXT NOT NULL,
                    sources     TEXT,
                    created_at  REAL NOT NULL,
                    expires_at  REAL NOT NULL
                )
            """)
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_expires ON llm_cache(expires_at)"
            )
            conn.commit()

    # ── Public API ──────────────────────────────────────────────────────

    def get(self, key: str) -> Optional[Dict]:
        now = time.time()

        with self._mem_lock:
            item = self._mem.get(key)
            if item is not None:
                expires_at, payload = item
                if expires_at > now:
                    self._mem.move_to_end(key)
                    return payload
                self._mem.pop(key, None)

        try:
            with self._db_lock, sqlite3.connect(self.sqlite_path) as conn:
                row = conn.execute(
                    "SELECT answer, sources, expires_at FROM llm_cache WHERE key=?",
                    (key,),
                ).fetchone()
        except Exception:
            logger.exception("[Cache/SQLite] gagal baca")
            return None

        if row is None:
            return None

        answer, sources_json, expires_at = row
        if expires_at <= now:
            try:
                with self._db_lock, sqlite3.connect(self.sqlite_path) as conn:
                    conn.execute("DELETE FROM llm_cache WHERE key=?", (key,))
                    conn.commit()
            except Exception:
                pass
            return None

        payload = {
            "answer":  answer,
            "sources": json.loads(sources_json) if sources_json else [],
        }
        self._promote_to_mem(key, expires_at, payload)
        return payload

    def set(
        self,
        key:     str,
        intent:  str,
        query:   str,
        answer:  str,
        sources: List[Dict],
        ttl:     Optional[int] = None,
    ) -> None:
        ttl = ttl if ttl is not None else self.ttl
        now = time.time()
        expires_at = now + ttl
        payload = {"answer": answer, "sources": sources}

        self._promote_to_mem(key, expires_at, payload)

        try:
            with self._db_lock, sqlite3.connect(self.sqlite_path) as conn:
                conn.execute(
                    """
                    INSERT OR REPLACE INTO llm_cache
                    (key, intent, query, answer, sources, created_at, expires_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        key, intent, query, answer,
                        json.dumps(sources, ensure_ascii=False) if sources else "[]",
                        now, expires_at,
                    ),
                )
                conn.commit()
        except Exception:
            logger.exception("[Cache/SQLite] gagal tulis")

    def cleanup(self) -> int:
        try:
            with self._db_lock, sqlite3.connect(self.sqlite_path) as conn:
                cur = conn.execute(
                    "DELETE FROM llm_cache WHERE expires_at < ?", (time.time(),)
                )
                conn.commit()
                n = cur.rowcount
            if n:
                logger.info("[Cache/SQLite] cleanup — %d entri expired dihapus", n)
            return n
        except Exception:
            logger.exception("[Cache/SQLite] cleanup gagal")
            return 0

    def stats(self) -> Dict:
        try:
            with self._db_lock, sqlite3.connect(self.sqlite_path) as conn:
                total = conn.execute("SELECT COUNT(*) FROM llm_cache").fetchone()[0]
                live  = conn.execute(
                    "SELECT COUNT(*) FROM llm_cache WHERE expires_at >= ?",
                    (time.time(),),
                ).fetchone()[0]
            with self._mem_lock:
                mem = len(self._mem)
            return {
                "backend":       "sqlite",
                "sqlite_total":  total,
                "sqlite_live":   live,
                "memory_items":  mem,
            }
        except Exception:
            return {"backend": "sqlite", "error": "stats gagal"}

    def close(self) -> None:
        with self._mem_lock:
            self._mem.clear()
        logger.info("[Cache/SQLite] ditutup")

    # ── Internal ────────────────────────────────────────────────────────

    def _promote_to_mem(self, key: str, expires_at: float, payload: Dict):
        with self._mem_lock:
            self._mem[key] = (expires_at, payload)
            self._mem.move_to_end(key)
            while len(self._mem) > self.max_mem:
                self._mem.popitem(last=False)
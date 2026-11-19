# harness/cache/base.py
"""
Interface abstrak untuk cache LLM.

Semua backend (SQLite, Redis, dsb) harus implement method di bawah ini
dengan signature yang sama. Pipeline hanya berinteraksi lewat interface ini.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Dict, List, Optional


class BaseLLMCache(ABC):
    """Kontrak minimal cache LLM."""

    @abstractmethod
    def get(self, key: str) -> Optional[Dict]:
        """
        Kembalikan {"answer": str, "sources": list} kalau ada & belum expired.
        Kembalikan None kalau tidak ada atau expired.
        """
        ...

    @abstractmethod
    def set(
        self,
        key:     str,
        intent:  str,
        query:   str,
        answer:  str,
        sources: List[Dict],
        ttl:     Optional[int] = None,
    ) -> None:
        """Simpan jawaban dengan TTL opsional (default dari instance)."""
        ...

    @abstractmethod
    def cleanup(self) -> int:
        """
        Hapus entri expired (untuk backend yang tidak auto-expire).
        Return jumlah entri yang dihapus. Backend dengan TTL otomatis
        (Redis) boleh return 0.
        """
        ...

    @abstractmethod
    def stats(self) -> Dict:
        """Info ringkas untuk monitoring (dipanggil /health)."""
        ...

    @abstractmethod
    def close(self) -> None:
        """Lepas koneksi / resource."""
        ...
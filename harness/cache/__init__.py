# harness/cache/__init__.py
"""
Factory cache LLM.

Pilih backend lewat CONFIG["cache_backend"]:
  - "sqlite" (default) → SQLiteLLMCache
  - "redis"            → RedisLLMCache

Interface identik, jadi pipeline tidak perlu tahu backend apa yang dipakai.
"""

from __future__ import annotations

import logging
import os
from pathlib import Path
from typing import Optional

from .base import BaseLLMCache

logger = logging.getLogger("harness.cache")


def get_cache(config: dict, harness_dir: Optional[Path] = None) -> BaseLLMCache:
    """
    Bangun instance cache berdasarkan config.

    Args:
        config      : CONFIG dari config.py
        harness_dir : folder harness (untuk default path SQLite)
    """
    backend = config.get("cache_backend", "sqlite").lower()

    if backend == "sqlite":
        from .sqlite_backend import SQLiteLLMCache
        base = harness_dir or Path(__file__).resolve().parent.parent
        return SQLiteLLMCache(
            sqlite_path      = base / "cache.sqlite",
            max_memory_items = int(config.get("cache_max_memory_items", 500)),
            ttl_seconds      = int(config.get("cache_ttl_seconds", 3600)),
        )

    if backend == "redis":
        from .redis_backend import RedisLLMCache
        redis_url = os.environ.get("REDIS_URL")
        if not redis_url:
            raise EnvironmentError(
                "cache_backend=redis tapi REDIS_URL tidak diset di .env"
            )
        return RedisLLMCache(
            redis_url = redis_url,
            prefix    = config.get("redis_prefix_harness", "harness:llm:"),
            ttl       = int(config.get("cache_ttl_seconds", 3600)),
        )

    raise ValueError(
        f"cache_backend tidak dikenali: {backend!r} (didukung: 'sqlite', 'redis')"
    )


__all__ = ["BaseLLMCache", "get_cache"]
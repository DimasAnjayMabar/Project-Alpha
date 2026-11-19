# harness/cache/redis_backend.py
"""
Backend cache LLM berbasis Redis.

Cocok untuk:
  - multi-instance harness (shared cache)
  - di-share dengan backend (prefix berbeda)
  - production

TTL di-handle oleh Redis (setex). Tidak ada cleanup manual.
"""

from __future__ import annotations

import json
import logging
from typing import Dict, List, Optional

from .base import BaseLLMCache

logger = logging.getLogger("harness.cache.redis")


class RedisLLMCache(BaseLLMCache):
    def __init__(
        self,
        redis_url: str,
        prefix:    str = "harness:llm:",
        ttl:       int = 3600,
        socket_timeout: float = 2.0,
    ):
        import redis  # import lazy — hanya kalau backend ini dipakai

        self.prefix = prefix
        self.ttl    = ttl
        self.client = redis.from_url(
            redis_url,
            decode_responses=True,
            socket_timeout=socket_timeout,
            socket_connect_timeout=socket_timeout,
        )
        try:
            self.client.ping()
        except Exception as e:
            logger.error("[Cache/Redis] gagal terhubung ke %s: %s", redis_url, e)
            raise

        logger.info(
            "[Cache/Redis] siap — url=%s  prefix=%s  ttl=%ds",
            redis_url, prefix, ttl,
        )

    def _key(self, key: str) -> str:
        return f"{self.prefix}{key}"

    def get(self, key: str) -> Optional[Dict]:
        try:
            raw = self.client.get(self._key(key))
            if raw is None:
                return None
            return json.loads(raw)
        except Exception:
            logger.exception("[Cache/Redis] get gagal key=%s", key[:8])
            return None

    def set(
        self,
        key:     str,
        intent:  str,
        query:   str,
        answer:  str,
        sources: List[Dict],
        ttl:     Optional[int] = None,
    ) -> None:
        payload = {
            "intent":  intent,
            "query":   query,
            "answer":  answer,
            "sources": sources,
        }
        try:
            self.client.setex(
                self._key(key),
                ttl if ttl is not None else self.ttl,
                json.dumps(payload, ensure_ascii=False),
            )
        except Exception:
            logger.exception("[Cache/Redis] set gagal key=%s", key[:8])

    def cleanup(self) -> int:
        # Redis auto-expire via TTL — tidak perlu cleanup manual
        return 0

    def stats(self) -> Dict:
        try:
            info = self.client.info("memory")
            return {
                "backend":         "redis",
                "total_keys":      self.client.dbsize(),
                "used_memory":     info.get("used_memory_human", "?"),
                "prefix":          self.prefix,
            }
        except Exception:
            return {"backend": "redis", "error": "stats gagal"}

    def close(self) -> None:
        try:
            self.client.close()
        except Exception:
            pass
        logger.info("[Cache/Redis] ditutup")
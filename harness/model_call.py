# model_call.py
"""
LLM abstraction layer untuk harness.

Tujuan:
  - pipeline.py TIDAK memanggil Groq/Ollama secara langsung.
  - Ganti provider (groq ↔ ollama) cukup lewat config, tanpa ubah pipeline.
  - Interface seragam: generate(messages, temperature, top_p, max_tokens) -> str

Provider yang didukung saat ini:
  - "groq"   → Groq API (sekarang dipakai)
  - "ollama" → Ollama server lokal (nanti, misal http://localhost:11434)

Cara pakai di pipeline.py:
    from model_call import get_llm
    llm = get_llm()
    answer = llm.generate(messages, temperature=0.2, top_p=0.95, max_tokens=1024)
"""

from __future__ import annotations

import logging
import os
from abc import ABC, abstractmethod
from pathlib import Path
import threading
from typing import Dict, List, Optional

import requests
from dotenv import load_dotenv

# ── Import config dari root project ─────────────────────────────────────
ROOT_DIR = Path(__file__).resolve().parent.parent
from config import CONFIG  # noqa: E402

load_dotenv(ROOT_DIR / ".env")

logger = logging.getLogger("harness.model_call")


# =========================================================================
# INTERFACE
# =========================================================================

class BaseLLM(ABC):
    """Kontrak minimal yang harus dipenuhi setiap provider LLM."""

    @abstractmethod
    def generate(
        self,
        messages:    List[Dict[str, str]],
        temperature: float = 0.2,
        top_p:       float = 0.95,
        max_tokens:  int   = 1024,
    ) -> str:
        """Kembalikan jawaban penuh (non-streaming) sebagai string."""
        ...


# =========================================================================
# GROQ
# =========================================================================

# model_call.py — tambahkan `import threading` di bagian atas
class GroqLLM(BaseLLM):
    def __init__(self, model: str, api_key: Optional[str] = None):
        from groq import Groq

        key = api_key or os.environ.get("GROQ_API_KEY")
        if not key:
            raise EnvironmentError(
                "GROQ_API_KEY tidak ditemukan. Taruh di .env root project."
            )
        self.model  = model
        self.client = Groq(api_key=key, max_retries=0)
        self._lock  = threading.Lock()
        logger.info("GroqLLM ready — model=%s (max_retries=0)", model)

    def generate(
        self,
        messages:    List[Dict[str, str]],
        temperature: float = 0.2,
        top_p:       float = 0.95,
        max_tokens:  int   = 1024,
    ) -> str:
        total_chars = sum(len(m.get("content", "")) for m in messages)
        logger.info(
            "[Groq] generate model=%s  input_chars=%d  max_tokens=%d  temp=%.2f",
            self.model, total_chars, max_tokens, temperature,
        )
        kwargs = {
            "model": self.model,
            "messages": messages,
            "temperature": temperature,
            "top_p": top_p,
            "max_tokens": max_tokens,
            "stream": False,
        }
        if "gpt-oss" in self.model.lower():
            kwargs["reasoning_effort"] = "low"

        try:
            with self._lock:
                resp = self.client.chat.completions.create(**kwargs)

            if resp.usage:
                cached = getattr(
                    getattr(resp.usage, "prompt_tokens_details", None),
                    "cached_tokens",
                    0,
                )
                logger.info(
                    "[Groq] usage prompt=%d cached=%d completion=%d total=%d",
                    resp.usage.prompt_tokens,
                    cached or 0,
                    resp.usage.completion_tokens,
                    resp.usage.total_tokens,
                )
            return resp.choices[0].message.content or ""
        except Exception as e:
            logger.error("[Groq] generate gagal: %s", e)
            return "Maaf, terjadi kesalahan saat memproses jawaban."


# =========================================================================
# OLLAMA
# =========================================================================
# Ollama mengekspos endpoint OpenAI-compatible di /v1/chat/completions.
# Jadi kita bisa pakai `requests` biasa (atau openai client dengan base_url).
# Di sini pakai `requests` supaya tidak menambah dependensi.
# =========================================================================

class OllamaLLM(BaseLLM):
    def __init__(
        self,
        model: str,
        base_url: str = "http://localhost:11434",
        timeout:  int = 120,
    ):
        self.model     = model
        self.base_url  = base_url.rstrip("/")
        self.timeout   = timeout
        logger.info("OllamaLLM ready — model=%s  url=%s", model, self.base_url)

    def generate(
        self,
        messages:    List[Dict[str, str]],
        temperature: float = 0.2,
        top_p:       float = 0.95,
        max_tokens:  int   = 1024,
    ) -> str:
        url = f"{self.base_url}/chat/completions"
        payload = {
            "model": self.model,
            "messages": messages,
            "temperature": temperature,
            "top_p": top_p,
            "max_tokens": max_tokens,
            "stream": False,
        }
        logger.info(
            "[Ollama] generate model=%s  max_tokens=%d  temp=%.2f  top_p=%.2f",
            self.model, max_tokens, temperature, top_p,
        )
        try:
            r = requests.post(url, json=payload, timeout=self.timeout)
            r.raise_for_status()
            data = r.json()
            return data["choices"][0]["message"]["content"] or ""
        except requests.exceptions.RequestException:
            logger.exception("[Ollama] request gagal ke %s", url)
            return "Maaf, LLM lokal sedang tidak tersedia."
        except (KeyError, IndexError):
            logger.exception("[Ollama] format respons tidak dikenali: %s", data)
            return "Maaf, terjadi kesalahan pada LLM lokal."


# =========================================================================
# FACTORY
# =========================================================================

_llm_instance: Optional[BaseLLM] = None


def _build_llm() -> BaseLLM:
    provider = CONFIG.get("llm_provider", "groq").lower()

    if provider == "groq":
        model = CONFIG.get("groq_model")
        return GroqLLM(model=model)

    if provider == "ollama":
        model    = CONFIG.get("ollama_model")
        base_url = os.environ.get("OLLAMA_BASE_URL")
        return OllamaLLM(model=model, base_url=base_url)

    raise ValueError(
        f"llm_provider tidak dikenali: {provider!r} "
        f"(didukung: 'groq', 'ollama')"
    )


def get_llm() -> BaseLLM:
    """Singleton LLM — dibuat sekali, dipakai berulang."""
    global _llm_instance
    if _llm_instance is None:
        _llm_instance = _build_llm()
    return _llm_instance


def reset_llm() -> None:
    """Paksa rebuild LLM (misal setelah ganti config runtime)."""
    global _llm_instance
    _llm_instance = None
    logger.info("LLM instance di-reset.")
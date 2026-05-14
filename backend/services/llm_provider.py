"""
LLM Provider abstraction layer.

Switch providers via .env:
  LLM_PROVIDER=upstage   (default) — Upstage Solar
  LLM_PROVIDER=openai              — OpenAI GPT-4o
  LLM_PROVIDER=anthropic           — Claude (Anthropic)
  LLM_PROVIDER=ollama              — Local Ollama (no API key needed)

  EMBED_PROVIDER=upstage  (default) — Upstage solar-embedding-1-large
  EMBED_PROVIDER=openai             — text-embedding-3-small
  EMBED_PROVIDER=local              — sentence-transformers (no API key)
"""
import os
import httpx
from typing import Optional

# ── Config ────────────────────────────────────────────────────────────────────
LLM_PROVIDER   = os.getenv("LLM_PROVIDER",   "upstage").lower()
EMBED_PROVIDER = os.getenv("EMBED_PROVIDER",  "upstage").lower()

UPSTAGE_API_KEY   = os.getenv("UPSTAGE_API_KEY",   "")
OPENAI_API_KEY    = os.getenv("OPENAI_API_KEY",    "")
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
OLLAMA_BASE_URL   = os.getenv("OLLAMA_BASE_URL",   "http://localhost:11434")
OPENAI_BASE_URL   = os.getenv("OPENAI_BASE_URL",   "https://api.openai.com/v1")

LLM_MODEL = os.getenv("LLM_MODEL", "")  # override per-provider default if set


# ── Chat Completion ───────────────────────────────────────────────────────────

async def chat(
    messages: list[dict],
    system_prompt: str = "",
    temperature: float = 0.7,
    max_tokens: int = 1500,
) -> str:
    full = []
    if system_prompt:
        full.append({"role": "system", "content": system_prompt})
    full.extend(messages)

    if LLM_PROVIDER == "upstage":
        return await _upstage_chat(full, temperature, max_tokens)
    if LLM_PROVIDER == "openai":
        return await _openai_chat(full, temperature, max_tokens)
    if LLM_PROVIDER == "anthropic":
        return await _anthropic_chat(messages, system_prompt, temperature, max_tokens)
    if LLM_PROVIDER == "ollama":
        return await _ollama_chat(full, temperature, max_tokens)
    raise ValueError(f"Unknown LLM_PROVIDER: {LLM_PROVIDER!r}")


# ── Embeddings ────────────────────────────────────────────────────────────────

async def embed(texts: list[str]) -> list[list[float]]:
    if EMBED_PROVIDER == "upstage":
        return await _upstage_embed(texts)
    if EMBED_PROVIDER == "openai":
        return await _openai_embed(texts)
    if EMBED_PROVIDER == "local":
        return _local_embed(texts)
    raise ValueError(f"Unknown EMBED_PROVIDER: {EMBED_PROVIDER!r}")


# ── Upstage ───────────────────────────────────────────────────────────────────

async def _upstage_chat(messages: list[dict], temperature: float, max_tokens: int) -> str:
    model = LLM_MODEL or "solar-pro"
    async with httpx.AsyncClient(timeout=60.0) as client:
        r = await client.post(
            "https://api.upstage.ai/v1/chat/completions",
            headers={"Authorization": f"Bearer {UPSTAGE_API_KEY}"},
            json={"model": model, "messages": messages, "temperature": temperature, "max_tokens": max_tokens},
        )
        r.raise_for_status()
        return r.json()["choices"][0]["message"]["content"]


async def _upstage_embed(texts: list[str]) -> list[list[float]]:
    async with httpx.AsyncClient(timeout=30.0) as client:
        r = await client.post(
            "https://api.upstage.ai/v1/embeddings",
            headers={"Authorization": f"Bearer {UPSTAGE_API_KEY}"},
            json={"model": "solar-embedding-1-large", "input": texts},
        )
        r.raise_for_status()
        return [item["embedding"] for item in r.json()["data"]]


# ── OpenAI ────────────────────────────────────────────────────────────────────

async def _openai_chat(messages: list[dict], temperature: float, max_tokens: int) -> str:
    model = LLM_MODEL or "gpt-4o-mini"
    async with httpx.AsyncClient(timeout=60.0) as client:
        r = await client.post(
            f"{OPENAI_BASE_URL}/chat/completions",
            headers={"Authorization": f"Bearer {OPENAI_API_KEY}"},
            json={"model": model, "messages": messages, "temperature": temperature, "max_tokens": max_tokens},
        )
        r.raise_for_status()
        return r.json()["choices"][0]["message"]["content"]


async def _openai_embed(texts: list[str]) -> list[list[float]]:
    model = LLM_MODEL or "text-embedding-3-small"
    async with httpx.AsyncClient(timeout=30.0) as client:
        r = await client.post(
            f"{OPENAI_BASE_URL}/embeddings",
            headers={"Authorization": f"Bearer {OPENAI_API_KEY}"},
            json={"model": model, "input": texts},
        )
        r.raise_for_status()
        return [item["embedding"] for item in r.json()["data"]]


# ── Anthropic (Claude) ────────────────────────────────────────────────────────

async def _anthropic_chat(
    messages: list[dict],
    system_prompt: str,
    temperature: float,
    max_tokens: int,
) -> str:
    model = LLM_MODEL or "claude-haiku-4-5-20251001"
    # Anthropic uses separate system field
    anthropic_msgs = [m for m in messages if m["role"] != "system"]
    async with httpx.AsyncClient(timeout=60.0) as client:
        body: dict = {
            "model": model,
            "messages": anthropic_msgs,
            "temperature": temperature,
            "max_tokens": max_tokens,
        }
        if system_prompt:
            body["system"] = system_prompt
        r = await client.post(
            "https://api.anthropic.com/v1/messages",
            headers={
                "x-api-key": ANTHROPIC_API_KEY,
                "anthropic-version": "2023-06-01",
            },
            json=body,
        )
        r.raise_for_status()
        return r.json()["content"][0]["text"]


# ── Ollama (local) ────────────────────────────────────────────────────────────

async def _ollama_chat(messages: list[dict], temperature: float, max_tokens: int) -> str:
    model = LLM_MODEL or "llama3.2"
    async with httpx.AsyncClient(timeout=120.0) as client:
        r = await client.post(
            f"{OLLAMA_BASE_URL}/api/chat",
            json={
                "model": model,
                "messages": messages,
                "stream": False,
                "options": {"temperature": temperature, "num_predict": max_tokens},
            },
        )
        r.raise_for_status()
        return r.json()["message"]["content"]


# ── Local sentence-transformers (no API) ──────────────────────────────────────

_local_model = None

def _local_embed(texts: list[str]) -> list[list[float]]:
    global _local_model
    if _local_model is None:
        from sentence_transformers import SentenceTransformer
        _local_model = SentenceTransformer("paraphrase-multilingual-MiniLM-L12-v2")
    return _local_model.encode(texts).tolist()


# ── Provider info (for /health endpoint) ─────────────────────────────────────

def provider_info() -> dict:
    return {
        "llm_provider": LLM_PROVIDER,
        "llm_model": LLM_MODEL or _default_model(),
        "embed_provider": EMBED_PROVIDER,
    }


def _default_model() -> str:
    return {
        "upstage": "solar-pro",
        "openai": "gpt-4o-mini",
        "anthropic": "claude-haiku-4-5-20251001",
        "ollama": "llama3.2",
    }.get(LLM_PROVIDER, "unknown")

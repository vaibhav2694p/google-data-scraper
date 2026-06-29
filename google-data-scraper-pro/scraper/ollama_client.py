"""Optional Ollama integration for category cleanup & email relevance."""
from __future__ import annotations

import httpx

from app.config import Config
from scraper.utils import setup_logger

log = setup_logger("ollama")

_TIMEOUT = httpx.Timeout(15.0, connect=5.0)


def _enabled() -> bool:
    return Config.OLLAMA_ENABLED and bool(Config.OLLAMA_BASE_URL)


async def _chat(prompt: str, system: str = "") -> str:
    if not _enabled():
        return ""
    payload = {
        "model": Config.OLLAMA_MODEL,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": prompt},
        ],
        "stream": False,
    }
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            resp = await client.post(
                f"{Config.OLLAMA_BASE_URL}/api/chat",
                json=payload,
            )
            resp.raise_for_status()
            return resp.json().get("message", {}).get("content", "")
    except Exception as e:
        log.warning("Ollama call failed: %s", e)
        return ""


async def cleanup_category(category: str) -> str:
    """Use LLM to normalise a messy Google Maps category string."""
    if not _enabled() or not category:
        return category
    result = await _chat(
        f"Normalise this business category to a short label (≤5 words). "
        f"Return ONLY the normalised label.\n\nCategory: {category}",
        system="You clean up business category labels.",
    )
    return result.strip() if result else category


async def email_relevance_score(email: str, category: str) -> float:
    """Return a 0-1 relevance score for an email vs. the business category."""
    if not _enabled():
        return 0.5
    result = await _chat(
        f"Rate how relevant this email is to a business in the '{category}' category.\n"
        f"Email: {email}\n"
        f"Return ONLY a number between 0 and 1.",
        system="You score email relevance.",
    )
    try:
        return max(0.0, min(1.0, float(result)))
    except (ValueError, TypeError):
        return 0.5

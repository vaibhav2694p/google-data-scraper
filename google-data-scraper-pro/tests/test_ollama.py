"""Tests for Ollama integration (runs even without Ollama)."""
import asyncio
from unittest.mock import patch

from app.config import Config


def test_disabled_by_default():
    """Ollama should be disabled by default — no crash."""
    from scraper.ollama_client import cleanup_category

    # Patch Config so Ollama is disabled
    with patch.object(Config, "OLLAMA_ENABLED", False):
        result = asyncio.get_event_loop().run_until_complete(
            cleanup_category("Accounting Services")
        )
        # Should return the original string unchanged
        assert result == "Accounting Services"


def test_score_returns_float():
    from scraper.ollama_client import email_relevance_score

    with patch.object(Config, "OLLAMA_ENABLED", False):
        score = asyncio.get_event_loop().run_until_complete(
            email_relevance_score("info@acme.com", "Accounting")
        )
        assert isinstance(score, float)
        assert 0.0 <= score <= 1.0

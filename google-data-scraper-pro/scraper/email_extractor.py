"""Fetch a business website and extract email addresses."""
from __future__ import annotations

import re
from typing import Optional

import httpx
from bs4 import BeautifulSoup

from scraper.utils import EMAIL_RE, setup_logger

log = setup_logger("email_extractor")

_TIMEOUT = httpx.Timeout(8.0, connect=5.0)
_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36"
    )
}


def _is_valid_email(email: str) -> bool:
    """Basic sanity filter for scraped emails."""
    skip = {
        "example@", "email@", "your@", "name@",
        "test@", "user@", "admin@localhost",
    }
    low = email.lower()
    if any(low.startswith(s) for s in skip):
        return False
    if low.endswith((".png", ".jpg", ".gif", ".svg", ".css", ".js")):
        return False
    return True


async def extract_email_from_website(url: str) -> str:
    """Return the first valid email found on *url*, or ''."""
    if not url or not url.startswith("http"):
        return ""

    async with httpx.AsyncClient(
        timeout=_TIMEOUT,
        headers=_HEADERS,
        follow_redirects=True,
        verify=False,
    ) as client:
        try:
            resp = await client.get(url)
            if resp.status_code != 200:
                return ""
            html = resp.text
        except Exception as e:
            log.debug("Fetch failed %s: %s", url, e)
            return ""

    soup = BeautifulSoup(html, "html.parser")

    # 1. mailto: links
    for a_tag in soup.find_all("a", href=True):
        href = a_tag["href"]
        if href.startswith("mailto:"):
            email = href[7:].split("?")[0].strip()
            if _is_valid_email(email):
                return email

    # 2. JSON-LD blocks
    for script in soup.find_all("script", type="application/ld+json"):
        text = script.string or ""
        emails = EMAIL_RE.findall(text)
        for e in emails:
            if _is_valid_email(e):
                return e

    # 3. Plain text scan
    body_text = soup.get_text(" ", strip=True)
    emails = EMAIL_RE.findall(body_text)
    for e in emails:
        if _is_valid_email(e):
            return e

    return ""

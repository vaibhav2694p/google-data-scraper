"""Shared helpers."""
from __future__ import annotations

import logging
import re
from typing import Optional

EMAIL_RE = re.compile(
    r"[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}",
)


def setup_logger(name: str = "gms", level: int = logging.INFO) -> logging.Logger:
    logger = logging.getLogger(name)
    if not logger.handlers:
        handler = logging.StreamHandler()
        handler.setFormatter(
            logging.Formatter("%(asctime)s [%(levelname)s] %(message)s", "%H:%M:%S")
        )
        logger.addHandler(handler)
    logger.setLevel(level)
    return logger


def safe_text(text: Optional[str]) -> str:
    return (text or "").strip()


def parse_rating(text: Optional[str]) -> Optional[float]:
    if not text:
        return None
    m = re.search(r"([\d.]+)", text)
    return float(m.group(1)) if m else None


def parse_reviews(text: Optional[str]) -> Optional[int]:
    if not text:
        return None
    cleaned = re.sub(r"[(),]", "", text)
    m = re.search(r"(\d+)", cleaned)
    return int(m.group(1)) if m else None

"""Thread-safe in-memory job state with JSON persistence."""
from __future__ import annotations

import hashlib
import json
import os
import threading
from dataclasses import dataclass, field
from typing import Any


@dataclass
class JobState:
    query: str = ""
    status: str = "idle"
    total_found: int = 0
    scraped: int = 0
    emails_found: int = 0
    results: list = field(default_factory=list)
    seen_keys: set = field(default_factory=set)
    error: str = ""
    _lock: threading.Lock = field(default_factory=threading.Lock, repr=False)

    def _key(self, item: dict) -> str:
        name = (item.get("business_name") or "").strip().lower()
        phone = (item.get("phone") or "").strip().replace(" ", "")
        raw = f"{name}|{phone}"
        return hashlib.md5(raw.encode()).hexdigest()

    def add_item(self, item: dict) -> bool:
        """Add an item if not a duplicate. Returns True if added."""
        name = (item.get("business_name") or "").strip()
        if not name:
            return False

        key = self._key(item)
        with self._lock:
            if key in self.seen_keys:
                return False
            self.seen_keys.add(key)
            self.results.append(item)
            self.scraped = len(self.results)
            if item.get("email"):
                self.emails_found = sum(
                    1 for r in self.results if r.get("email")
                )
            return True

    def snapshot(self) -> dict:
        with self._lock:
            return {
                "query": self.query,
                "status": self.status,
                "total_found": self.total_found,
                "scraped": self.scraped,
                "emails_found": self.emails_found,
                "result_count": len(self.results),
                "error": self.error,
            }

    def save(self, path: str = "data/state.json") -> None:
        os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
        with self._lock:
            data = {
                "query": self.query,
                "status": self.status,
                "results": list(self.results),
            }
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)

    def load(self, path: str = "data/state.json") -> bool:
        if not os.path.exists(path):
            return False
        try:
            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)
            with self._lock:
                self.query = data.get("query", "")
                self.results = data.get("results", [])
                self.scraped = len(self.results)
                self.seen_keys = {self._key(r) for r in self.results}
                self.emails_found = sum(
                    1 for r in self.results if r.get("email")
                )
            return True
        except Exception:
            return False

"""Tests for export functions."""
import json
import os
import tempfile

from scraper.exporters import export_csv, export_xlsx, export_json


SAMPLE = [
    {"business_name": "Acme", "phone": "123", "email": "a@b.com", "rating": 4.5},
    {"business_name": "Beta", "phone": "456", "email": "", "rating": 3.0},
]


def test_csv_roundtrip():
    with tempfile.NamedTemporaryFile(suffix=".csv", delete=False) as f:
        path = f.name
    try:
        export_csv(SAMPLE, path)
        assert os.path.exists(path)
        with open(path, encoding="utf-8") as f:
            lines = f.readlines()
        assert len(lines) == 3  # header + 2 rows
        assert "Business Name" in lines[0]
    finally:
        os.unlink(path)


def test_json_roundtrip():
    with tempfile.NamedTemporaryFile(suffix=".json", delete=False) as f:
        path = f.name
    try:
        export_json(SAMPLE, path)
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
        assert len(data) == 2
        assert data[0]["business_name"] == "Acme"
    finally:
        os.unlink(path)


def test_xlsx_creates_file():
    with tempfile.NamedTemporaryFile(suffix=".xlsx", delete=False) as f:
        path = f.name
    try:
        export_xlsx(SAMPLE, path)
        assert os.path.exists(path)
        assert os.path.getsize(path) > 0
    finally:
        os.unlink(path)

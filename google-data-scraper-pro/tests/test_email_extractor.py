"""Tests for email extractor utilities."""
from scraper.utils import EMAIL_RE, safe_text, parse_rating, parse_reviews


def test_email_regex():
    assert "test@example.com" in EMAIL_RE.findall("Contact test@example.com for info")


def test_safe_text():
    assert safe_text("  hello  ") == "hello"
    assert safe_text(None) == ""
    assert safe_text("") == ""


def test_parse_rating():
    assert parse_rating("4.5 (120)") == 4.5
    assert parse_rating("3.0") == 3.0
    assert parse_rating(None) is None


def test_parse_reviews():
    assert parse_reviews("(120)") == 120
    assert parse_reviews("1,234") == 1234
    assert parse_reviews(None) is None

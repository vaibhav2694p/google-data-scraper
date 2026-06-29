"""Tests for deduplication logic."""
from app.state import JobState


def test_same_item_not_added_twice():
    state = JobState()
    item = {"business_name": "Acme Corp", "phone": "555-1234"}
    assert state.add_item(item) is True
    assert state.add_item(item) is False
    assert state.scraped == 1


def test_different_items_added():
    state = JobState()
    assert state.add_item({"business_name": "Acme", "phone": "111"}) is True
    assert state.add_item({"business_name": "Acme", "phone": "222"}) is True
    assert state.scraped == 2


def test_email_counted():
    state = JobState()
    state.add_item({"business_name": "A", "phone": "1", "email": "a@b.com"})
    state.add_item({"business_name": "B", "phone": "2", "email": ""})
    assert state.emails_found == 1

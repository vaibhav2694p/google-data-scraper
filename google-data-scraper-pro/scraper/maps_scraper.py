"""Playwright-based Google Maps scraper."""
from __future__ import annotations

import asyncio
from typing import Optional

from playwright.async_api import async_playwright, Page, Browser, BrowserContext

from app.state import JobState
from scraper.email_extractor import extract_email_from_website
from scraper.utils import (
    safe_text,
    parse_rating,
    parse_reviews,
    setup_logger,
)

log = setup_logger("scraper")

MAPS_URL = "https://www.google.com/maps/search/{query}"


async def scrape_google_maps(
    query: str,
    max_results: int = 500,
    state: Optional[JobState] = None,
    stop_event: Optional[asyncio.Event] = None,
    pause_event: Optional[asyncio.Event] = None,
):
    """Main scrape loop: search, scroll, extract cards, fetch emails."""
    if stop_event is None:
        stop_event = asyncio.Event()

    async with async_playwright() as pw:
        browser: Browser = await pw.chromium.launch(
            headless=True,
            args=[
                "--disable-blink-features=AutomationControlled",
                "--no-sandbox",
            ],
        )
        context: BrowserContext = await browser.new_context(
            user_agent=(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/120.0.0.0 Safari/537.36"
            ),
            viewport={"width": 1280, "height": 900},
            locale="en-US",
        )
        page: Page = await context.new_page()

        url = MAPS_URL.format(query=query.replace(" ", "+"))
        log.info("Navigating to: %s", url)
        await page.goto(url, wait_until="domcontentloaded", timeout=30000)
        await page.wait_for_timeout(3000)

        # Dismiss cookie / consent dialogs if present
        for sel in ['button:has-text("Accept")', 'button:has-text("I agree")', 'button:has-text("Reject")']:
            try:
                btn = page.locator(sel).first
                if await btn.is_visible(timeout=1000):
                    await btn.click()
                    await page.wait_for_timeout(500)
            except Exception:
                pass

        feed = page.locator('div[role="feed"]').first
        cards = feed.locator('div[role="article"]')

        seen_names: set[str] = set()
        no_new_count = 0
        MAX_NO_NEW = 5

        for scroll_round in range(100):
            if stop_event.is_set():
                log.info("Stop event received")
                break
            if pause_event and pause_event.is_set():
                log.info("Paused — waiting…")
                while pause_event.is_set() and not stop_event.is_set():
                    await asyncio.sleep(0.5)
                if stop_event.is_set():
                    break

            count = await cards.count()
            log.info("Scroll round %d — %d cards visible", scroll_round + 1, count)

            for i in range(count):
                if stop_event.is_set():
                    break
                if state and state.scraped >= max_results:
                    log.info("Hit max_results=%d", max_results)
                    break

                try:
                    card = cards.nth(i)
                    data = await _extract_card(card)
                    if not data:
                        continue
                    name = data.get("business_name", "")
                    if name in seen_names:
                        continue
                    seen_names.add(name)

                    # Email extraction
                    website = data.get("website", "")
                    if website:
                        data["email"] = await extract_email_from_website(website)
                    else:
                        data["email"] = ""

                    if state:
                        added = state.add_item(data)
                        if added:
                            log.info(
                                "#%d %s | email=%s",
                                state.scraped,
                                data["business_name"],
                                data.get("email", ""),
                            )
                except Exception as e:
                    log.debug("Card %d error: %s", i, e)

            if state and state.scraped >= max_results:
                break

            # Check if we got new cards
            new_count = await cards.count()
            if new_count == count:
                no_new_count += 1
            else:
                no_new_count = 0

            if no_new_count >= MAX_NO_NEW:
                log.info("No new results after %d rounds — done", MAX_NO_NEW)
                break

            # Scroll down
            await page.evaluate(
                'document.querySelector(\'div[role="feed"]\')?.parentElement?.scrollBy(0, 600)'
                ' || window.scrollBy(0, 600)'
            )
            await page.wait_for_timeout(1500)

        await browser.close()
        if state:
            state.total_found = state.scraped
            log.info(
                "Scrape complete: %d results, %d emails",
                state.scraped,
                state.emails_found,
            )


async def _extract_card(card) -> dict:
    """Extract data from a single result card."""
    def _q(selector: str) -> str:
        try:
            el = card.locator(selector).first
            return el.text_content(timeout=2000) or ""
        except Exception:
            return ""

    business_name = safe_text(_q('[class*="fontHeadlineSmall"]'))
    if not business_name:
        business_name = safe_text(_q("a[aria-label]"))
        if not business_name:
            try:
                label = card.get_attribute("aria-label", timeout=1000)
                if label:
                    business_name = label.strip()
            except Exception:
                pass

    if not business_name:
        return {}

    rating_text = safe_text(_q('span[role="img"]'))
    rating = parse_rating(rating_text)
    reviews_text = safe_text(_q('span[aria-label*="review"]'))
    reviews = parse_reviews(reviews_text)
    category = safe_text(_q('button[data-item-id="category"]'))
    address = safe_text(_q('button[data-item-id="address"]'))
    phone = safe_text(_q('button[data-item-id*="phone"]'))
    website = ""
    try:
        wb = card.locator('a[data-item-id="authority"]')
        if await wb.count():
            website = await wb.get_attribute("href") or ""
    except Exception:
        pass

    return {
        "business_name": business_name,
        "rating": rating,
        "reviews": reviews,
        "category": category,
        "address": address,
        "phone": phone,
        "website": website.strip() if website else "",
        "email": "",
    }

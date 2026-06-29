"""Playwright-based Google Maps scraper."""
from __future__ import annotations

import asyncio
import random
from typing import Optional

from playwright.async_api import async_playwright, Page, Browser, BrowserContext

from app.state import JobState
from scraper.email_extractor import extract_email_from_website
from scraper.utils import safe_text, parse_rating, parse_reviews, setup_logger

log = setup_logger("scraper")

MAPS_URL = "https://www.google.com/maps/search/{query}"

STEALTH_JS = """
Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
window.chrome = { runtime: {} };
"""

CARD_JS = """(el) => {
    const result = {
        business_name: '', category: '', address: '', phone: '',
        email: '', website: '', rating: null, reviews: null,
    };

    const link = (el.tagName === 'A') ? el : el.querySelector('a.hfpxzc');
    if (link) result.business_name = (link.getAttribute('aria-label') || '').trim();
    if (!result.business_name) {
        const h = el.querySelector('.qBF1Pd, .fontHeadlineSmall');
        if (h) result.business_name = h.textContent.trim();
    }
    if (!result.business_name) return null;

    const mw = el.querySelector('.MW4etd');
    if (mw) { const v = parseFloat(mw.textContent); if (!isNaN(v)) result.rating = v; }
    if (!result.rating) {
        const ri = el.querySelector('span[role="img"][aria-label*="star"]');
        if (ri) { const m = ri.getAttribute('aria-label').match(/(\\d[\\d.]+)/); if (m) result.rating = parseFloat(m[1]); }
    }

    const reviewEl = el.querySelector('.UY7F9');
    if (reviewEl) {
        const m = reviewEl.textContent.match(/(\\d[\\d,]*)/);
        if (m) result.reviews = parseInt(m[1].replace(/,/g, ''));
    }

    // Category and address from the W4Efsd detail block
    const allW4 = el.querySelectorAll('.W4Efsd');
    for (const w of allW4) {
        if (w.querySelector('.AJB7ye')) continue;
        if (!w.querySelector('.W4Efsd')) continue;

        const innerW4s = w.querySelectorAll(':scope > .W4Efsd');
        if (innerW4s.length > 0) {
            const childSpans = innerW4s[0].querySelectorAll(':scope > span');
            const clean = (s) => s.replace(/[\\u00b7\\u00A0\\u2000-\\u200F\\u202F\\u2060-\\u206F\\ue000-\\ufeff]/gu, '').replace(/\\s+/g, ' ').trim();
            const fieldTexts = [];
            for (const sp of childSpans) {
                // Collect all leaf span texts, filter out separator icons
                const leaves = sp.querySelectorAll('span');
                if (leaves.length === 0) {
                    const t = clean(sp.textContent);
                    if (t && t !== '·') fieldTexts.push(t);
                } else {
                    // Gather unique leaf texts, skip icon-only spans
                    const leafTexts = [];
                    for (const leaf of leaves) {
                        if (leaf.querySelector('span')) continue;
                        const t = clean(leaf.textContent);
                        if (t && t !== '·' && !t.match(/^[\\u200B-\\u200F\\uFEFF]+$/)) leafTexts.push(t);
                    }
                    const combined = leafTexts.join(', ');
                    if (combined) fieldTexts.push(combined);
                }
            }
            if (fieldTexts.length > 0) result.category = fieldTexts[0];
            if (fieldTexts.length > 1) result.address = fieldTexts[1];
        }
        // Second inner: hours + phone
        if (innerW4s.length > 1) {
            const phoneEl = innerW4s[1].querySelector('.UsdlK');
            if (phoneEl) result.phone = phoneEl.textContent.trim();
        }
        break;
    }

    if (!result.phone) {
        const ph = el.querySelector('.UsdlK');
        if (ph) result.phone = ph.textContent.trim();
    }

    const authLink = el.querySelector('a[data-item-id="authority"], a[data-item-id*="website"]');
    if (authLink) result.website = (authLink.getAttribute('href') || '').trim();
    if (!result.website) {
        const links = el.querySelectorAll('a[href^="http"]');
        for (const l of links) {
            const h = l.getAttribute('href') || '';
            if (h && !h.includes('google.com') && !h.includes('gstatic')) {
                result.website = h;
                break;
            }
        }
    }

    return result;
}"""


async def scrape_google_maps(
    query: str,
    max_results: int = 500,
    state: Optional[JobState] = None,
    stop_event=None,
    pause_event=None,
):
    if stop_event is None:
        stop_event = asyncio.Event()
    if state:
        state.status = "running"

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(
            headless=True,
            args=[
                "--disable-blink-features=AutomationControlled",
                "--no-sandbox",
                "--disable-dev-shm-usage",
                "--disable-gpu",
            ],
        )
        context = await browser.new_context(
            user_agent=(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/131.0.0.0 Safari/537.36"
            ),
            viewport={"width": 1280, "height": 900},
            locale="en-US",
        )
        await context.add_init_script(STEALTH_JS)
        page = await context.new_page()

        url = MAPS_URL.format(query=query.replace(" ", "+"))
        log.info("Navigating to: %s", url)

        try:
            await page.goto(url, wait_until="domcontentloaded", timeout=45000)
        except Exception as e:
            log.error("Navigation failed: %s", e)
            if state:
                state.status = "error"
                state.error = f"Navigation failed: {e}"
            await browser.close()
            return

        await page.wait_for_timeout(4000)
        await _dismiss_consent(page)
        await page.wait_for_timeout(3000)

        feed = await _find_feed(page)
        if not feed:
            log.error("Results feed not found.")
            if state:
                state.status = "error"
                state.error = "Results feed not found. Google Maps may be blocking automated access."
            await browser.close()
            return

        log.info("Feed found. Starting scroll+extract loop...")

        seen_keys: set[str] = set()
        no_new_count = 0
        MAX_NO_NEW = 12

        for scroll_round in range(300):
            if _check_stop(stop_event):
                break
            if _is_paused(pause_event):
                while _is_paused(pause_event) and not _check_stop(stop_event):
                    await asyncio.sleep(0.5)
                if _check_stop(stop_event):
                    break

            if state and state.scraped >= max_results:
                log.info("Hit max_results=%d", max_results)
                break

            cards = await _find_cards(page, feed)
            count = len(cards)
            log.info("Round %d — %d cards, %d extracted", scroll_round + 1, count, state.scraped if state else 0)

            new_this_round = 0
            for i, card in enumerate(cards):
                if _check_stop(stop_event):
                    break
                if state and state.scraped >= max_results:
                    break

                try:
                    data = await card.evaluate(CARD_JS)
                    if not data:
                        continue

                    name = safe_text(data.get("business_name"))
                    if not name:
                        continue

                    phone = safe_text(data.get("phone"))
                    key = f"{name.lower()}|{phone.replace(' ', '')}"
                    if key in seen_keys:
                        continue
                    seen_keys.add(key)
                    new_this_round += 1

                    website = safe_text(data.get("website"))
                    email = ""
                    if website:
                        try:
                            email = await extract_email_from_website(website)
                        except Exception as e:
                            log.debug("Email failed for %s: %s", website, e)

                    record = {
                        "business_name": name,
                        "category": safe_text(data.get("category")),
                        "address": safe_text(data.get("address")),
                        "phone": phone,
                        "email": email,
                        "website": website,
                        "rating": data.get("rating"),
                        "reviews": data.get("reviews"),
                    }

                    if state:
                        added = state.add_item(record)
                        if added:
                            log.info(
                                "#%d %s | cat=%s | phone=%s | email=%s",
                                state.scraped, name,
                                record["category"], phone, email,
                            )
                except Exception as e:
                    log.debug("Card %d error: %s", i, e)

            if state and state.scraped >= max_results:
                break

            if new_this_round == 0:
                no_new_count += 1
            else:
                no_new_count = 0

            if no_new_count >= MAX_NO_NEW:
                log.info("No new results after %d rounds — done", MAX_NO_NEW)
                break

            await _scroll_feed(page, feed)
            delay = random.uniform(1.0, 2.5)
            await page.wait_for_timeout(int(delay * 1000))

        if state:
            state.total_found = state.scraped
            state.status = "done"
            log.info("Scrape complete: %d results, %d emails", state.scraped, state.emails_found)

        await browser.close()


def _check_stop(stop_event) -> bool:
    if stop_event is None:
        return False
    return stop_event.is_set()


def _is_paused(pause_event) -> bool:
    if pause_event is None:
        return False
    return pause_event.is_set()


async def _dismiss_consent(page: Page):
    for sel in [
        'button:has-text("Accept all")',
        'button:has-text("Accept")',
        'button:has-text("I agree")',
        'button:has-text("Reject all")',
        '#L2AGLb',
    ]:
        try:
            btn = page.locator(sel).first
            if await btn.is_visible(timeout=800):
                await btn.click()
                log.info("Dismissed consent: %s", sel)
                await page.wait_for_timeout(1500)
                return
        except Exception:
            pass


async def _find_feed(page: Page):
    for sel in ['div[role="feed"]', 'div.m6QErb[aria-label]', 'div[aria-label="Results"]']:
        try:
            el = page.locator(sel).first
            if await el.is_visible(timeout=3000):
                log.info("Found feed: %s", sel)
                return el
        except Exception:
            pass
    return None


async def _find_cards(page: Page, feed) -> list:
    for sel in ['div[role="article"]', 'a.hfpxzc']:
        try:
            loc = feed.locator(sel)
            count = await loc.count()
            if count > 0:
                return [loc.nth(i) for i in range(count)]
        except Exception:
            pass
    return []


async def _scroll_feed(page: Page, feed):
    try:
        is_scrollable = await feed.evaluate("el => el.scrollHeight > el.clientHeight")
        if is_scrollable:
            await feed.evaluate("el => el.scrollTop += 800")
            return
    except Exception:
        pass
    try:
        await page.evaluate("window.scrollBy(0, 800)")
    except Exception:
        pass

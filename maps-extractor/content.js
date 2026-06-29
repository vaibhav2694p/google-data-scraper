/* =====================================================
   content.js - Google Maps DOM extractor
   Runs inside the Maps tab. Strategy:
     1. Find the results feed (left pane).
     2. Auto-scroll to materialise more cards (MutationObserver
        + end-of-list sentinel + force-scroll fallback).
     3. For each card NOT already in the resumed dedup set,
        open it, extract detail-pane fields, normalise + push.
     4. Throttled, retry-able, pause-able, stop-able.

   Resume behaviour:
     - Background hands the existing dataset in MLE_START.payload.existing.
     - We rehydrate `seen`, `seenNames`, `seenUrls` from it.
     - processCard does a PRE-CLICK skip if a card matches any of those -
       so resuming costs zero clicks for already-known listings.

   Only publicly visible data is read. Polite delays >=1.5s by default.
   Extended with XHR interception, deep email/social extraction.
   ===================================================== */

(function () {
  'use strict';

  if (window.__MLE_CONTENT_LOADED__) return;
  window.__MLE_CONTENT_LOADED__ = true;

  const H = window.MLE_Helpers;
  const V = window.MLE_Validators;
  const S = window.MLE_Selectors;
  const SELECTORS = S.SELECTORS;
  const parseLatLngFromUrl = S.parseLatLngFromUrl;
  const cleanPlaceUrl = S.cleanPlaceUrl;
  const extractCID = S.extractCID;
  const normalizeSocialLink = S.normalizeSocialLink;
  const SOCIAL_MEDIA_PATTERNS = S.SOCIAL_MEDIA_PATTERNS;
  const CONTACT_PAGE_PATHS = S.CONTACT_PAGE_PATHS;
  const EMAIL_BLACKLIST = S.EMAIL_BLACKLIST;
  const log = H.makeLogger('content');

  // ---------- Runtime state ----------
  const state = {
    running: false,
    paused: false,
    stopRequested: false,
    settings: null,
    seen: new Set(),
    seenNames: new Set(),
    seenUrls: new Set(),
    seenCIDs: new Set(),
    extracted: 0,
    addedThisSession: 0,
    errors: 0,
    duplicates: 0,
    batch: [],
    flushTimer: null,
    processedIndex: 0,
    scrapePosSaveTimer: null,
    lastScrollTop: 0,
    lastFeedHeight: null,
  };

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (!msg || !msg.type) return;
    switch (msg.type) {
      case 'MLE_START':
        startExtraction(msg.payload || {}).catch((e) => {
          log.error('start failed', e && e.message || e);
          finish('error');
        });
        sendResponse({ ok: true });
        break;
      case 'MLE_PAUSE':
        state.paused = true; log.warn('Paused');
        sendResponse({ ok: true });
        break;
      case 'MLE_RESUME':
        state.paused = false; log.info('Resumed');
        sendResponse({ ok: true });
        break;
      case 'MLE_STOP':
        state.stopRequested = true; log.warn('Stop requested');
        sendResponse({ ok: true });
        break;
      case 'MLE_PING':
        sendResponse({ ok: true });
        break;
    }
    return true;
  });

  async function startExtraction(payload) {
    if (state.running) { log.warn('Already running'); return; }
    const settings = payload.settings || payload || {};
    const existing = Array.isArray(payload.existing) ? payload.existing : [];
    const scrapePos = payload.scrapePos || {};

    state.settings = Object.assign({
      delayMs: 1500, maxResults: 200, dedup: true, jitter: true,
      keyword: '', minRating: '', minReviews: '', required: [],
      deepEmailSearch: true,
    }, settings);

    state.running = true;
    state.paused = false;
    state.stopRequested = false;
    state.seen = new Set();
    state.seenNames = new Set();
    state.seenUrls = new Set();
    state.seenCIDs = new Set();
    state.extracted = existing.length;
    state.addedThisSession = 0;
    state.errors = 0;
    state.duplicates = 0;
    state.batch = [];
    state.processedIndex = scrapePos.processedIndex || 0;
    state.lastScrollTop = scrapePos.scrollTop || 0;
    state.lastFeedHeight = scrapePos.feedHeight || null;

    for (const r of existing) {
      const key = V.dedupKey(r);
      if (key) state.seen.add(key);
      if (r.name) state.seenNames.add(String(r.name).toLowerCase().trim());
      if (r.url)  state.seenUrls.add(fingerprintUrl(r.url));
      if (r.cid)  state.seenCIDs.add(String(r.cid));
    }
    if (existing.length) {
      log.info('Resuming. ' + existing.length + ' records already saved - they will be skipped without re-clicking.');
    }
    if (state.processedIndex > 0) {
      log.info('Resuming from processed index: ' + state.processedIndex + ', scrollTop: ' + state.lastScrollTop);
    }
    log.info('Extraction started', { keyword: state.settings.keyword, max: state.settings.maxResults });

    const feed = await H.waitFor(SELECTORS.resultsFeed, { timeout: 8000 });
    if (!feed) {
      log.error('Results feed not found. Open a Google Maps search results page first.');
      return finish('error');
    }

    if (state.lastScrollTop > 0) {
      feed.scrollTop = state.lastScrollTop;
      await H.sleep(500);
    }

    const observer = new MutationObserver(H.throttle(() => {
      pushProgress({ total: countCards(feed) });
    }, 600));
    observer.observe(feed, { childList: true, subtree: true });

    startScrapePosSaver(feed);

    try {
      await mainLoop(feed);
    } catch (err) {
      log.error('Loop error', err && err.message);
      state.errors += 1;
    } finally {
      stopScrapePosSaver();
      observer.disconnect();
      flushBatch(true);
      finish('idle');
    }
  }

  function finish(stateName) {
    state.running = false;
    pushProgress({ state: stateName });
    H.safeSendMessage({
      type: 'MLE_DONE',
      payload: {
        extracted: state.extracted,
        added: state.addedThisSession,
        errors: state.errors,
        duplicates: state.duplicates,
      },
    });
    log.ok('Done. +' + state.addedThisSession + ' new (' + state.extracted + ' total). ' + state.duplicates + ' duplicates skipped, ' + state.errors + ' errors.');
  }

  function fingerprintUrl(url) {
    if (!url) return '';
    const m = String(url).match(/\/place\/[^/]+\/(data=[^?#]+)?/);
    return m ? m[0] : url;
  }

  async function mainLoop(feed) {
    let endReached = false;
    let stagnantScrolls = 0;
    const STAGNANT_LIMIT = 10;
    let consecutiveErrors = 0;
    const MAX_CONSECUTIVE_ERRORS = 5;

    while (state.running && !state.stopRequested && state.extracted < state.settings.maxResults) {
      while (state.paused && !state.stopRequested) await H.sleep(400);
      if (state.stopRequested) break;

      const cards = collectCards(feed);

      if (state.processedIndex >= cards.length) {
        if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
          log.warn('Too many consecutive errors, attempting force scroll...');
          await forceScrollFeed(feed);
          await H.sleep(2000);
          consecutiveErrors = 0;
        }
        const before = cards.length;
        await scrollFeed(feed);
        await H.sleep(2000);
        let after = collectCards(feed).length;

        if (after === before) {
          await forceScrollFeed(feed);
          await H.sleep(2500);
          after = collectCards(feed).length;
        }

        const endSelectors = [
          'p.fontBodyMedium span.HlvSq',
          'span.HlvSq',
          'p.fontBodyMedium > span',
          '[data-value="No more results"]',
        ];
        for (const sel of endSelectors) {
          if (document.querySelector(sel)) {
            endReached = true;
            break;
          }
        }
        if (!endReached && document.body.innerText.indexOf("You've reached the end") !== -1) {
          endReached = true;
        }
        if (!endReached && document.body.innerText.indexOf('No more results') !== -1) {
          endReached = true;
        }

        if (after === before) {
          stagnantScrolls += 1;
          consecutiveErrors += 1;
          log.info('Stagnant scroll ' + stagnantScrolls + '/' + STAGNANT_LIMIT + ' - retrying...');
        } else {
          stagnantScrolls = 0;
          consecutiveErrors = 0;
        }
        if (endReached || stagnantScrolls >= STAGNANT_LIMIT) {
          log.info('No more results to load.');
          break;
        }
        continue;
      }

      while (state.processedIndex < cards.length && state.extracted < state.settings.maxResults) {
        if (state.stopRequested) break;
        while (state.paused && !state.stopRequested) await H.sleep(400);

        const card = cards[state.processedIndex++];
        try {
          await processCard(card);
          consecutiveErrors = 0;
        } catch (err) {
          state.errors += 1;
          consecutiveErrors += 1;
          log.error('card failed', err && err.message);
          if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
            log.warn('Too many consecutive errors, will retry after scroll');
            break;
          }
        }
        const base = Number(state.settings.delayMs) || 1500;
        await (state.settings.jitter ? H.jitterSleep(base, 700) : H.sleep(base));
      }

      if (state.extracted >= state.settings.maxResults) {
        log.info('Reached max results.');
        break;
      }
    }
  }

  async function processCard(card) {
    const cardLink = card.matches && card.matches(SELECTORS.resultLink)
      ? card
      : card.querySelector(SELECTORS.resultLink);
    if (!cardLink) return;

    // PRE-CLICK dedup check (skip without clicking)
    if (state.settings.dedup) {
      const cardNameRaw = H.text(card.querySelector(SELECTORS.resultName) || cardLink);
      const cardName = cardNameRaw ? cardNameRaw.toLowerCase().trim() : '';
      const cardHrefFp = fingerprintUrl(cardLink.getAttribute('href') || '');

      // Also check CID if available
      const cardCID = card.getAttribute('data-cid') || '';

      if (
        (cardName && state.seenNames.has(cardName)) ||
        (cardHrefFp && state.seenUrls.has(cardHrefFp)) ||
        (cardCID && state.seenCIDs.has(cardCID))
      ) {
        state.duplicates += 1;
        pushProgress({ duplicates: state.duplicates });
        return;
      }
    }

    await clickCardWithRetry(cardLink);

    const detailNameEl = await H.waitFor(SELECTORS.detailName, { timeout: 8000 });
    if (!detailNameEl) {
      log.warn('Detail pane did not load - going back and skipping card');
      state.errors += 1;
      await goBackToResults();
      return;
    }
    await H.sleep(500);

    const record = await H.withRetry(() => extractDetail(), { retries: 3, baseDelay: 500 });

    const key = V.dedupKey(record);
    if (state.settings.dedup && key && state.seen.has(key)) {
      state.duplicates += 1;
      pushProgress({ duplicates: state.duplicates });
      await goBackToResults();
      return;
    }
    state.seen.add(key);
    if (record.name) state.seenNames.add(String(record.name).toLowerCase().trim());
    if (record.url)  state.seenUrls.add(fingerprintUrl(record.url));
    if (record.cid)  state.seenCIDs.add(String(record.cid));

    const v = V.validateRecord(record);
    if (!v.valid) {
      log.warn('Invalid record, reasons:', v.reasons.join(','));
      state.errors += 1;
      pushProgress({ errors: state.errors });
      await goBackToResults();
      return;
    }
    if (!V.passesFilters(record, {
      minRating:  state.settings.minRating,
      minReviews: state.settings.minReviews,
      required:   state.settings.required || [],
    })) {
      await goBackToResults();
      return;
    }

    record.keyword = state.settings.keyword || '';
    record.extractedAt = new Date().toISOString();

    // Deep email/social extraction from business website
    if (record.website && state.settings.deepEmailSearch) {
      try {
        const enriched = await deepExtractFromWebsite(record.website, record.name);
        if (enriched) {
          if (enriched.email && !record.email) record.email = enriched.email;
          if (enriched.instagram && !record.instagram) record.instagram = enriched.instagram;
          if (enriched.facebook && !record.facebook) record.facebook = enriched.facebook;
          if (enriched.youtube && !record.youtube) record.youtube = enriched.youtube;
          if (enriched.linkedin && !record.linkedin) record.linkedin = enriched.linkedin;
          if (enriched.twitter && !record.twitter) record.twitter = enriched.twitter;
        }
      } catch (e) {
        log.warn('Deep extraction failed for: ' + record.name);
      }
    }

    state.batch.push(record);
    state.extracted += 1;
    state.addedThisSession += 1;
    pushProgress({
      count: state.extracted,
      added: state.addedThisSession,
      duplicates: state.duplicates,
      errors: state.errors,
    });
    scheduleFlush();
    await goBackToResults();
  }

  async function clickCardWithRetry(cardLink, retries = 3) {
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        cardLink.scrollIntoView({ block: 'center', behavior: 'instant' });
        await H.sleep(200);
        cardLink.click();
        await H.sleep(300);
        const detailNameEl = document.querySelector(SELECTORS.detailName);
        if (detailNameEl) return true;
        if (attempt < retries) {
          log.warn('Click attempt ' + (attempt + 1) + ' failed, retrying...');
          await goBackToResults();
          await H.sleep(500 * (attempt + 1));
        }
      } catch (err) {
        if (attempt === retries) throw err;
        log.warn('Click error: ' + err.message + ', retrying...');
        await H.sleep(500 * (attempt + 1));
      }
    }
    return false;
  }

  async function goBackToResults() {
    try {
      const backBtn = document.querySelector(SELECTORS.backButton);
      if (backBtn) {
        backBtn.click();
        await H.sleep(300);
        return;
      }
      const feed = document.querySelector(SELECTORS.resultsFeed);
      if (feed) {
        feed.focus();
        await H.sleep(200);
      }
    } catch (_) {}
  }

  function extractDetail() {
    const rootName = H.text(document.querySelector(SELECTORS.detailName));
    if (!rootName) throw new Error('detail not ready');

    const url = cleanPlaceUrl(location.href);
    const ll = parseLatLngFromUrl(location.href) || { lat: '', lng: '' };

    const ratingEl   = document.querySelector(SELECTORS.detailRating);
    const reviewsEl  = document.querySelector(SELECTORS.detailReviews);
    const categoryEl = document.querySelector(SELECTORS.detailCategory);
    const addressEl  = document.querySelector(SELECTORS.detailAddress);
    const phoneEl    = document.querySelector(SELECTORS.detailPhone);
    const websiteEl  = document.querySelector(SELECTORS.detailWebsite);

    let reviewsCount = '';
    if (reviewsEl) {
      const raw = (reviewsEl.getAttribute('aria-label') || reviewsEl.textContent || '').replace(/[,.\s]/g, '');
      const m = raw.match(/\d+/);
      reviewsCount = m ? m[0] : '';
    }

    let address = '';
    if (addressEl) {
      address = addressEl.getAttribute('aria-label') || H.text(addressEl);
      address = address.replace(/^Address:\s*/i, '').trim();
    }

    let phone = '';
    if (phoneEl) {
      phone = phoneEl.getAttribute('aria-label') || H.text(phoneEl);
      phone = phone.replace(/^Phone:\s*/i, '').trim();
      phone = V.normalizePhone(phone);
    }

    let website = '';
    if (websiteEl) website = websiteEl.getAttribute('href') || '';

    const hours = extractHours();

    const social = Array.from(document.querySelectorAll(SELECTORS.socialLinks))
      .map((a) => a.href)
      .filter((u, i, arr) => u && arr.indexOf(u) === i)
      .slice(0, 8);

    const paneText = (document.querySelector(SELECTORS.detailRoot) || document.body).innerText || '';
    const email = V.extractEmail(paneText);

    // Extract CID from page
    const cid = extractCID();

    // Extract place_id from URL or data
    let placeId = '';
    const placeMatch = location.href.match(/place\/[^/]+\/data=[^?#]*!1s([^!]+)/);
    if (placeMatch) placeId = placeMatch[1];

    return {
      name: rootName,
      category: H.text(categoryEl),
      rating: H.text(ratingEl),
      reviewsCount: reviewsCount,
      address: address,
      phone: phone,
      website: website,
      hours: hours,
      lat: ll.lat || '',
      lng: ll.lng || '',
      social: social,
      email: email,
      cid: cid,
      place_id: placeId,
      url: url,
    };
  }

  function extractHours() {
    const rows = document.querySelectorAll(SELECTORS.detailHoursTable);
    if (!rows || !rows.length) {
      const btn = document.querySelector(SELECTORS.detailHoursButton);
      return btn ? (btn.getAttribute('aria-label') || '').trim() : '';
    }
    return Array.from(rows).map((tr) => {
      const day = H.text(tr.querySelector('th') || tr.children[0]);
      const time = H.text(tr.querySelector('td') || tr.children[1]);
      return day + ': ' + time;
    }).join(' | ');
  }

  /**
   * Deep email/social extraction from business website.
   * Fetches the website and extracts emails and social media links.
   */
  async function deepExtractFromWebsite(websiteUrl, businessName) {
    if (!websiteUrl || !websiteUrl.startsWith('http')) return null;

    try {
      const result = await H.safeSendMessage({
        type: 'MLE_DEEP_EXTRACT',
        payload: { website: websiteUrl, name: businessName }
      });

      if (result && result.ok && result.data) {
        return {
          email: result.data.email || '',
          instagram: (result.data.instagram || []).join(', '),
          facebook: (result.data.facebook || []).join(', '),
          youtube: (result.data.youtube || []).join(', '),
          linkedin: (result.data.linkedin || []).join(', '),
          twitter: (result.data.twitter || []).join(', '),
        };
      }
    } catch (e) {
      // Silently fail - deep extraction is optional
    }
    return null;
  }

  function collectCards(feed) {
    return Array.from(feed.querySelectorAll(SELECTORS.resultLink));
  }
  function countCards(feed) {
    return feed.querySelectorAll(SELECTORS.resultLink).length;
  }

  async function scrollFeed(feed) {
    feed.scrollTo({ top: feed.scrollHeight, behavior: 'smooth' });
    await H.sleep(500);
    saveScrapePos(feed);
  }

  async function forceScrollFeed(feed) {
    const lastCard = feed.querySelector(SELECTORS.resultLink + ':last-of-type');
    feed.scrollTop = Math.max(0, feed.scrollHeight - feed.clientHeight - 600);
    await H.sleep(350);
    if (lastCard && typeof lastCard.focus === 'function') {
      try { lastCard.focus({ preventScroll: true }); } catch (_) {}
    }
    feed.scrollTop = feed.scrollHeight;
    await H.sleep(450);
    feed.scrollTo({ top: feed.scrollHeight, behavior: 'instant' });
    saveScrapePos(feed);
  }

  function scheduleFlush() {
    if (state.flushTimer) return;
    state.flushTimer = setTimeout(() => flushBatch(false), 1200);
  }
  function flushBatch(force) {
    clearTimeout(state.flushTimer);
    state.flushTimer = null;
    if (!state.batch.length) return;
    const payload = state.batch.splice(0, state.batch.length);
    const sent = H.safeSendMessage({ type: 'MLE_RECORDS', payload: payload });
    if (!sent && !force) {
      state.batch.unshift.apply(state.batch, payload);
    }
  }
  function pushProgress(patch) {
    H.safeSendMessage({ type: 'MLE_PROGRESS', payload: patch });
  }

  function saveScrapePos(feed) {
    if (!feed) return;
    const cards = collectCards(feed);
    const lastCard = cards[cards.length - 1];
    const lastCardHref = lastCard ? lastCard.getAttribute('href') : '';
    const pos = {
      processedIndex: state.processedIndex,
      scrollTop: feed.scrollTop,
      feedHeight: feed.scrollHeight,
      pageNum: Math.floor(state.processedIndex / 20) + 1,
      lastCardHref: lastCardHref,
    };
    state.lastScrollTop = feed.scrollTop;
    state.lastFeedHeight = feed.scrollHeight;
    H.safeSendMessage({ type: 'MLE_SCRAPE_POS', payload: pos });
  }

  function startScrapePosSaver(feed) {
    if (state.scrapePosSaveTimer) return;
    state.scrapePosSaveTimer = setInterval(() => saveScrapePos(feed), 5000);
  }

  function stopScrapePosSaver() {
    if (state.scrapePosSaveTimer) {
      clearInterval(state.scrapePosSaveTimer);
      state.scrapePosSaveTimer = null;
    }
  }
})();

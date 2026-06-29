/* =====================================================
   content.js - Google Maps XHR-based extractor
   Runs inside the Maps tab.

   Strategy (same as GMB-Scraper-main, cleaned up):
     1. Injected.js intercepts XHR responses from /search.
     2. We parse b[64] from the API response to get all fields.
     3. Auto-scroll triggers new XHR loads automatically.
     4. Email extraction happens via background.js in batches.
     5. Resume/dedup via seenCIDs Set.

   No card clicking. No fragile DOM selectors for detail pane.
   All data comes from the XHR API response.
   ===================================================== */

(function () {
  'use strict';

  if (window.__MLE_CONTENT_LOADED__) return;
  window.__MLE_CONTENT_LOADED__ = true;

  const H = window.MLE_Helpers;
  const log = H.makeLogger('content');

  // ---------- Runtime state ----------
  const state = {
    running: false,
    paused: false,
    stopRequested: false,
    settings: null,
    seenCIDs: new Set(),
    seenNames: new Set(),
    extracted: 0,
    addedThisSession: 0,
    errors: 0,
    duplicates: 0,
    batch: [],
    flushTimer: null,
    staleCount: 0,
  };

  // ---------- XHR intercepted data handler ----------
  // This is the PRIMARY data source. injected.js captures Google Maps
  // search API responses and posts them to us via window.postMessage.
  window.addEventListener('message', async function(evt) {
    if (!evt.data || evt.data.type !== 'search' || !evt.data.data) return;
    if (!state.running || state.stopRequested) return;

    try {
      let raw = evt.data.data.replace('/*""*/', '');
      let parsed = JSON.parse(raw);
      let data = parsed.d ? JSON.parse(parsed.d.slice(5)) : null;

      if (!data || !Array.isArray(data)) return;

      // data[64] contains the search result items
      const items = data[64];
      if (!items || !Array.isArray(items)) return;

      log.info('XHR intercepted ' + items.length + ' search results');

      let newCount = 0;
      const records = [];

      for (const item of items) {
        if (!item || !Array.isArray(item)) continue;
        if (state.extracted >= state.settings.maxResults) break;

        try {
          const c = item[item.length - 1];
          if (!c || !Array.isArray(c)) continue;

          const name = c[11] || '';
          if (!name) continue;

          // Get CID for dedup
          const cid = c[37]?.[0]?.[0]?.[13]?.[0]?.[0]?.[1] || '';

          // Dedup by CID (most reliable) or by name
          if (state.settings.dedup) {
            if (cid && state.seenCIDs.has(String(cid))) {
              state.duplicates += 1;
              continue;
            }
            if (state.seenNames.has(name.toLowerCase().trim())) {
              state.duplicates += 1;
              continue;
            }
          }

          // Extract all fields from the XHR response
          const website = c[7]?.[0] || '';
          const phone = c[178]?.[0]?.[0] || '';
          const ratingCount = c[4]?.[8] || '';
          const averageRating = c[4]?.[7] || '';
          const category = Array.isArray(c[13]) ? c[13].join(';') : '';
          const placeId = c[78] || '';
          const address = Array.isArray(c[2]) ? c[2].join(',') : '';
          const lat = c[9]?.[2] || '';
          const lng = c[9]?.[3] || '';

          // Working hours from c[203]
          let hours = '';
          try {
            const hoursData = c[203]?.[0];
            if (hoursData && Array.isArray(hoursData)) {
              const dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
              const parts = [];
              hoursData.forEach(function(h) {
                const weekDay = h?.[1];
                const dayName = weekDay ? dayNames[weekDay - 1] : '';
                const dayHours = Array.isArray(h?.[3]) ? h[3].map(function(a) { return a?.[0] || ''; }).filter(Boolean).join(', ') : '';
                if (dayName && dayHours) parts.push(dayName + ': ' + dayHours);
              });
              hours = parts.join(' | ');
            }
          } catch (_) {}

          const record = {
            name: name,
            category: category,
            rating: String(averageRating),
            reviewsCount: String(ratingCount),
            phone: phone,
            address: address,
            website: website,
            email: '',
            lat: lat,
            lng: lng,
            cid: cid,
            place_id: placeId,
            url: cid ? 'https://www.google.com/maps?cid=' + cid : '',
            hours: hours,
            keyword: state.settings.keyword || '',
            extractedAt: new Date().toISOString(),
          };

          // Mark as seen
          if (cid) state.seenCIDs.add(String(cid));
          state.seenNames.add(name.toLowerCase().trim());

          records.push(record);
          state.extracted += 1;
          state.addedThisSession += 1;
          newCount += 1;
        } catch (err) {
          state.errors += 1;
        }
      }

      if (newCount > 0) {
        log.info('Added ' + newCount + ' new records (' + state.extracted + ' total)');

        // Deep email extraction in batches of 50
        if (state.settings.deepEmailSearch) {
          const emailsToFetch = records.filter(function(r) { return r.website; });
          if (emailsToFetch.length > 0) {
            log.info('Fetching emails for ' + emailsToFetch.length + ' businesses...');
            for (let i = 0; i < emailsToFetch.length; i += 50) {
              const batch = emailsToFetch.slice(i, i + 50);
              const promises = batch.map(async function(rec) {
                try {
                  const result = await H.safeSendMessage({
                    type: 'MLE_DEEP_EXTRACT',
                    payload: { website: rec.website, name: rec.name }
                  });
                  if (result && result.ok && result.data) {
                    if (result.data.email) rec.email = result.data.email;
                    if (result.data.instagram && result.data.instagram.length) rec.instagram = result.data.instagram.join(', ');
                    if (result.data.facebook && result.data.facebook.length) rec.facebook = result.data.facebook.join(', ');
                    if (result.data.youtube && result.data.youtube.length) rec.youtube = result.data.youtube.join(', ');
                    if (result.data.linkedin && result.data.linkedin.length) rec.linkedin = result.data.linkedin.join(', ');
                    if (result.data.twitter && result.data.twitter.length) rec.twitter = result.data.twitter.join(', ');
                  }
                } catch (_) {}
              });
              await Promise.all(promises);
              if (i + 50 < emailsToFetch.length) {
                await H.sleep(500);
              }
            }
          }
        }

        // Add all records to batch
        records.forEach(function(r) { state.batch.push(r); });
        pushProgress({
          count: state.extracted,
          added: state.addedThisSession,
          duplicates: state.duplicates,
          errors: state.errors,
        });
        scheduleFlush();
      }
    } catch (err) {
      // XHR parse errors are expected for some responses
    }
  });

  // ---------- Message handler ----------
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

  // ---------- Start extraction ----------
  async function startExtraction(payload) {
    if (state.running) { log.warn('Already running'); return; }
    const settings = payload.settings || payload || {};
    const existing = Array.isArray(payload.existing) ? payload.existing : [];

    state.settings = Object.assign({
      delayMs: 1500, maxResults: 500, dedup: true, jitter: true,
      keyword: '', deepEmailSearch: true,
    }, settings);

    state.running = true;
    state.paused = false;
    state.stopRequested = false;
    state.seenCIDs = new Set();
    state.seenNames = new Set();
    state.extracted = existing.length;
    state.addedThisSession = 0;
    state.errors = 0;
    state.duplicates = 0;
    state.batch = [];
    state.staleCount = 0;

    // Rehydrate dedup sets from existing data
    for (const r of existing) {
      if (r.cid) state.seenCIDs.add(String(r.cid));
      if (r.name) state.seenNames.add(String(r.name).toLowerCase().trim());
    }
    if (existing.length) {
      log.info('Resuming - ' + existing.length + ' records already saved.');
    }

    log.info('Extraction started. Keyword: ' + (state.settings.keyword || 'none') + ', Max: ' + state.settings.maxResults);

    // Wait for the feed to appear
    const feed = await waitForElement('[role="feed"]', 10000);
    if (!feed) {
      log.error('Results feed not found. Open Google Maps search first.');
      return finish('error');
    }

    log.info('Feed found. Starting auto-scroll...');

    // Start the auto-scroll loop
    await autoScrollLoop(feed);
  }

  // ---------- Auto-scroll loop ----------
  // This scrolls the feed to trigger more XHR loads.
  // Each scroll triggers a new /search XHR which we intercept.
  async function autoScrollLoop(feed) {
    let lastHeight = 0;
    let staleCount = 0;
    const STALE_LIMIT = 50;
    let scrollAttempts = 0;

    while (state.running && !state.stopRequested && state.extracted < state.settings.maxResults) {
      while (state.paused && !state.stopRequested) await H.sleep(400);
      if (state.stopRequested) break;

      const currentHeight = feed.scrollHeight;

      // Scroll to bottom
      feed.scrollTop = feed.scrollHeight;
      await H.sleep(800);

      // Check for end-of-results markers
      if (document.getElementsByClassName('HlvSq').length > 0) {
        log.info('Reached end of results (HlvSq marker found).');
        break;
      }

      // Check for other end markers
      const endMarkers = document.querySelectorAll('p.fontBodyMedium span.HlvSq, [data-value="No more results"]');
      if (endMarkers.length > 0) {
        log.info('Reached end of results (end marker found).');
        break;
      }
      if (document.body.innerText.indexOf("You've reached the end") !== -1) {
        log.info('Reached end of results (text marker).');
        break;
      }

      // Check if height changed
      if (currentHeight === lastHeight) {
        staleCount += 1;
        if (staleCount >= STALE_LIMIT) {
          log.info('No new results after ' + STALE_LIMIT + ' scrolls. Stopping.');
          break;
        }
        // Every 10 stale scrolls, try a more aggressive scroll
        if (staleCount % 10 === 0) {
          log.info('Trying aggressive scroll (stale: ' + staleCount + ')...');
          const lastCard = feed.querySelector('a.hfpxzc:last-of-type');
          if (lastCard) {
            lastCard.scrollIntoView({ block: 'center', behavior: 'instant' });
            await H.sleep(500);
          }
          feed.scrollTop = feed.scrollHeight;
          await H.sleep(2000);
          // Check again after aggressive scroll
          if (feed.scrollHeight > currentHeight) {
            staleCount = 0;
            lastHeight = feed.scrollHeight;
            log.info('Aggressive scroll loaded new results!');
            continue;
          }
        }
      } else {
        staleCount = 0;
        lastHeight = currentHeight;
      }

      scrollAttempts += 1;
      if (scrollAttempts % 20 === 0) {
        log.info('Scroll attempt ' + scrollAttempts + ' - extracted: ' + state.extracted + ' / ' + state.settings.maxResults);
      }

      // Random delay between scrolls
      const delay = state.settings.jitter
        ? 1000 + Math.floor(Math.random() * 3000)
        : Number(state.settings.delayMs) || 1500;
      await H.sleep(delay);
    }

    if (state.extracted >= state.settings.maxResults) {
      log.info('Reached max results limit: ' + state.settings.maxResults);
    }

    finish('idle');
  }

  // ---------- Helper: wait for element ----------
  function waitForElement(selector, timeout) {
    return new Promise(function(resolve) {
      const el = document.querySelector(selector);
      if (el) { resolve(el); return; }
      const observer = new MutationObserver(function() {
        const el = document.querySelector(selector);
        if (el) { observer.disconnect(); resolve(el); }
      });
      observer.observe(document.body, { childList: true, subtree: true });
      setTimeout(function() { observer.disconnect(); resolve(null); }, timeout);
    });
  }

  // ---------- Finish ----------
  function finish(stateName) {
    state.running = false;
    pushProgress({ state: stateName });
    flushBatch(true);
    H.safeSendMessage({
      type: 'MLE_DONE',
      payload: {
        extracted: state.extracted,
        added: state.addedThisSession,
        errors: state.errors,
        duplicates: state.duplicates,
      },
    });
    log.ok('Done. +' + state.addedThisSession + ' new (' + state.extracted + ' total). ' + state.duplicates + ' duplicates, ' + state.errors + ' errors.');
  }

  // ---------- Batch flush ----------
  function scheduleFlush() {
    if (state.flushTimer) return;
    state.flushTimer = setTimeout(function() { flushBatch(false); }, 1200);
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
})();

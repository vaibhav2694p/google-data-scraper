/* =====================================================
   sorry.js — Anti-bot /sorry detection + fetch with redirect tracking
   Adapted from GMB-Scraper for Maps Lead Extractor.
   Detects Google's /sorry verification pages and handles
   redirect chains automatically.
   ===================================================== */

(function (global) {
  'use strict';

  const REDIRECT_STATUS_CODES = new Set([300, 301, 302, 303, 307, 308]);
  const DEFAULT_MAX_REDIRECTS = 10;
  const EXTENSION_ORIGIN = chrome.runtime.getURL('').replace(/\/$/, '');
  const GOOGLE_WEBREQUEST_FILTER = { urls: ['*://*.google.com/*'] };

  function getTimestamp() {
    return '[' + new Date().toISOString() + ']';
  }

  function isSorryUrl(url) {
    if (!url) return false;
    try {
      return new URL(url, 'https://www.google.com').pathname.includes('/sorry');
    } catch (_) {
      return url.includes('/sorry');
    }
  }

  function resolveRedirectUrl(location, base) {
    if (!location) return null;
    try {
      return new URL(location, base).toString();
    } catch (f) {
      console.warn(getTimestamp(), '[SORRY] Unable to resolve redirect URL:', f);
      return null;
    }
  }

  function createHeaderStore(headers) {
    const map = new Map();
    const set = (name, value) => {
      if (name && value !== undefined && value !== null) {
        map.set(name.toLowerCase(), { name: name, value: value });
      }
    };
    Object.entries(headers || {}).forEach(([k, v]) => set(k, v));
    return {
      ensureHeader: function (name, value) {
        if (value || value === 0) {
          const key = name.toLowerCase();
          if (!map.has(key)) set(name, value);
        }
      },
      hasHeaders: function () { return map.size > 0; },
      buildHeaders: function (referer) {
        const h = new Headers();
        map.forEach(function (entry) {
          const k = entry.name.toLowerCase();
          const v = referer && k === 'referer' ? referer : entry.value;
          try { h.set(entry.name, v); } catch (_) {}
        });
        return h;
      }
    };
  }

  // Fetch context tracking for redirect chains
  let fetchContextCounter = 0;
  const redirectAwaitMap = new Map();
  const requestIdToContext = new Map();

  function createFetchContext(url, controller) {
    return {
      id: 'fetch-' + Date.now() + '-' + (++fetchContextCounter).toString(16),
      controller: controller,
      redirectChain: [url],
      requestIds: new Set(),
      sorryDetected: false,
      sorryUrl: null,
      lastRequestUrl: url,
      pendingRedirects: []
    };
  }

  function cleanupFetchContext(ctx) {
    for (const [key, arr] of redirectAwaitMap.entries()) {
      const idx = arr.indexOf(ctx);
      if (idx !== -1) {
        arr.splice(idx, 1);
        if (arr.length === 0) redirectAwaitMap.delete(key);
      }
    }
    for (const id of ctx.requestIds) {
      requestIdToContext.delete(id);
    }
    ctx.requestIds.clear();
  }

  function queueContextForUrl(url, ctx) {
    if (url && ctx) {
      let arr = redirectAwaitMap.get(url);
      if (!arr) { arr = []; redirectAwaitMap.set(url, arr); }
      arr.push(ctx);
    }
  }

  function consumeContextForUrl(url) {
    const arr = redirectAwaitMap.get(url);
    if (arr && arr.length > 0) {
      const ctx = arr.shift();
      if (arr.length === 0) redirectAwaitMap.delete(url);
      return ctx;
    }
    return null;
  }

  function trackRequestForContext(ctx, requestId, url) {
    ctx.requestIds.add(requestId);
    ctx.lastRequestUrl = url;
    requestIdToContext.set(requestId, ctx);
  }

  function releaseRequestTracking(requestId) {
    const ctx = requestIdToContext.get(requestId);
    if (ctx) {
      requestIdToContext.delete(requestId);
      ctx.requestIds.delete(requestId);
    }
  }

  function isExtensionServiceWorkerRequest(details) {
    return details.tabId === -1 && details.initiator && details.initiator.startsWith(EXTENSION_ORIGIN);
  }

  // webRequest listeners for redirect tracking
  chrome.webRequest.onBeforeRequest.addListener(function (details) {
    if (isExtensionServiceWorkerRequest(details)) {
      const ctx = consumeContextForUrl(details.url);
      if (ctx) {
        trackRequestForContext(ctx, details.requestId, details.url);
      }
    }
  }, GOOGLE_WEBREQUEST_FILTER);

  chrome.webRequest.onHeadersReceived.addListener(function (details) {
    const ctx = requestIdToContext.get(details.requestId);
    if (ctx && REDIRECT_STATUS_CODES.has(details.statusCode)) {
      const locHeader = (details.responseHeaders || []).find(
        function (h) { return h.name && h.name.toLowerCase() === 'location'; }
      );
      const resolvedUrl = resolveRedirectUrl(locHeader && locHeader.value, details.url);
      if (resolvedUrl) {
        if (ctx.redirectChain[ctx.redirectChain.length - 1] !== resolvedUrl) {
          ctx.redirectChain.push(resolvedUrl);
        }
        if (isSorryUrl(resolvedUrl)) {
          ctx.sorryDetected = true;
          ctx.sorryUrl = resolvedUrl;
          console.warn(getTimestamp(), '[SORRY] Anti-bot redirect detected for', ctx.id, ':', resolvedUrl);
          try { ctx.controller && ctx.controller.abort(); } catch (_) {}
        } else {
          ctx.pendingRedirects.push(resolvedUrl);
        }
      }
    }
  }, GOOGLE_WEBREQUEST_FILTER, ['responseHeaders', 'extraHeaders']);

  chrome.webRequest.onCompleted.addListener(function (details) {
    releaseRequestTracking(details.requestId);
  }, GOOGLE_WEBREQUEST_FILTER);

  chrome.webRequest.onErrorOccurred.addListener(function (details) {
    releaseRequestTracking(details.requestId);
  }, GOOGLE_WEBREQUEST_FILTER);

  /**
   * Fetch a URL with automatic /sorry detection and redirect tracking.
   * @param {string} url
   * @param {number} timeout - ms (default 30s)
   * @param {object} opts - { headers, userAgent, referer, language, maxRedirects }
   * @returns {Promise<{success, data?, needsVerification?, verificationUrl?, error?, redirectChain?}>}
   */
  async function fetchWithSorryDetection(url, timeout, opts) {
    timeout = timeout || 30000;
    opts = opts || {};
    const controller = new AbortController();
    const timer = setTimeout(function () { controller.abort(); }, timeout);
    const ctx = createFetchContext(url, controller);

    try {
      const headerStore = createHeaderStore(opts.headers || {});
      headerStore.ensureHeader('User-Agent', opts.userAgent);
      headerStore.ensureHeader('Referer', opts.referer);
      headerStore.ensureHeader('Accept-Language', opts.language ? opts.language + ',en;q=0.9' : 'en-US,en;q=0.9');
      headerStore.ensureHeader('Accept', 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8');
      headerStore.ensureHeader('Cache-Control', 'max-age=0');
      headerStore.ensureHeader('Pragma', 'no-cache');
      headerStore.ensureHeader('Upgrade-Insecure-Requests', '1');
      headerStore.ensureHeader('Sec-Fetch-Dest', 'document');
      headerStore.ensureHeader('Sec-Fetch-Mode', 'navigate');
      headerStore.ensureHeader('Sec-Fetch-Site', 'none');
      headerStore.ensureHeader('Sec-Fetch-User', '?1');

      const fetchOpts = {
        signal: controller.signal,
        redirect: 'manual',
        credentials: 'include',
        method: 'GET'
      };
      if (headerStore.hasHeaders()) {
        fetchOpts.headers = headerStore.buildHeaders();
      }

      const maxRedirects = opts.maxRedirects || DEFAULT_MAX_REDIRECTS;
      let redirectCount = 0;
      let currentUrl = url;

      for (;;) {
        queueContextForUrl(currentUrl, ctx);
        const response = await fetch(currentUrl, fetchOpts);

        // Check if /sorry was detected via webRequest
        if (ctx.sorryDetected && ctx.sorryUrl) {
          return {
            success: false,
            needsVerification: true,
            verificationUrl: ctx.sorryUrl,
            redirectChain: ctx.redirectChain,
            error: 'Google anti-bot verification required'
          };
        }

        // Handle redirect responses
        if (response.type === 'opaqueredirect' || REDIRECT_STATUS_CODES.has(response.status)) {
          if (redirectCount >= maxRedirects) {
            return {
              success: false,
              error: 'Too many redirects (>' + maxRedirects + ')',
              redirectChain: ctx.redirectChain
            };
          }

          let nextUrl = null;
          if (REDIRECT_STATUS_CODES.has(response.status)) {
            const loc = response.headers.get('Location');
            nextUrl = resolveRedirectUrl(loc, currentUrl);
          }
          if (!nextUrl && ctx.pendingRedirects.length > 0) {
            nextUrl = ctx.pendingRedirects.shift();
          }
          if (!nextUrl) {
            return {
              success: false,
              error: 'Redirect response missing Location header',
              redirectChain: ctx.redirectChain
            };
          }

          if (ctx.redirectChain[ctx.redirectChain.length - 1] !== nextUrl) {
            ctx.redirectChain.push(nextUrl);
          }

          if (isSorryUrl(nextUrl)) {
            return {
              success: false,
              needsVerification: true,
              verificationUrl: nextUrl,
              redirectChain: ctx.redirectChain,
              error: 'Google anti-bot verification required'
            };
          }

          redirectCount++;
          currentUrl = nextUrl;
          continue;
        }

        // Check final URL for /sorry
        if (isSorryUrl(response.url)) {
          if (ctx.redirectChain[ctx.redirectChain.length - 1] !== response.url) {
            ctx.redirectChain.push(response.url);
          }
          return {
            success: false,
            needsVerification: true,
            verificationUrl: response.url,
            redirectChain: ctx.redirectChain,
            error: 'Google anti-bot verification required'
          };
        }

        if (!response.ok) {
          return {
            success: false,
            error: 'Fetch failed with status: ' + response.status,
            redirectChain: ctx.redirectChain
          };
        }

        const data = await response.text();
        if (response.url && ctx.redirectChain[ctx.redirectChain.length - 1] !== response.url) {
          ctx.redirectChain.push(response.url);
        }
        return { success: true, data: data, redirectChain: ctx.redirectChain };
      }
    } catch (err) {
      if (ctx.sorryDetected && ctx.sorryUrl) {
        return {
          success: false,
          needsVerification: true,
          verificationUrl: ctx.sorryUrl,
          redirectChain: ctx.redirectChain,
          error: 'Google anti-bot verification required'
        };
      }
      return {
        success: false,
        error: err.name === 'AbortError' ? 'Request timeout' : err.message,
        redirectChain: ctx.redirectChain
      };
    } finally {
      cleanupFetchContext(ctx);
      clearTimeout(timer);
    }
  }

  /**
   * Monitor a verification tab until user completes it or timeout.
   * @param {number} tabId
   * @returns {Promise<{success, verified?, userClosed?, timeout?}>}
   */
  function monitorVerificationTab(tabId) {
    return new Promise(function (resolve) {
      let checks = 0;
      const MAX_CHECKS = 30;
      const interval = setInterval(async function () {
        checks++;
        try {
          const tab = await chrome.tabs.get(tabId);
          if (tab) {
            if (tab.url && !tab.url.includes('/sorry')) {
              try { await chrome.tabs.remove(tabId); } catch (_) {}
              clearInterval(interval);
              resolve({ success: true, verified: true });
            } else if (checks >= MAX_CHECKS) {
              try { await chrome.tabs.remove(tabId); } catch (_) {}
              clearInterval(interval);
              resolve({ success: false, timeout: true });
            }
          } else {
            clearInterval(interval);
            resolve({ success: false, userClosed: true });
          }
        } catch (_) {
          clearInterval(interval);
          resolve({ success: false, userClosed: true });
        }
      }, 2000);
    });
  }

  /**
   * Handle a fetch request from content script with anti-bot detection.
   * Opens verification tab if needed and monitors it.
   */
  async function handleFetchRequest(data) {
    const result = await fetchWithSorryDetection(
      data.url,
      data.timeout || 30000,
      data.browserContext || {}
    );

    if (result.needsVerification && result.verificationUrl) {
      try {
        const tab = await chrome.tabs.create({ url: result.verificationUrl, active: true });
        const monitorResult = await monitorVerificationTab(tab.id);
        if (monitorResult.verified) {
          result.verificationComplete = true;
        } else if (monitorResult.userClosed) {
          result.verificationComplete = false;
          result.userCanceled = true;
        } else if (monitorResult.timeout) {
          result.verificationComplete = false;
          result.timeout = true;
        }
      } catch (e) {
        console.error(getTimestamp(), '[SORRY] Failed to open verification tab:', e);
      }
    }

    return result;
  }

  // Expose for use by background.js message handler
  global.MLE_Sorry = {
    fetchWithSorryDetection: fetchWithSorryDetection,
    handleFetchRequest: handleFetchRequest,
    monitorVerificationTab: monitorVerificationTab,
    isSorryUrl: isSorryUrl,
    getTimestamp: getTimestamp
  };

})(typeof window !== 'undefined' ? window : self);

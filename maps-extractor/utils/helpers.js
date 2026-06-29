/* =====================================================
   helpers.js — Shared utility functions
   Loaded in popup, content-script, and (importable in) background.
   Exposes a global `MLE_Helpers` object so it works in both
   classic content-script and module contexts.
   ===================================================== */

(function (global) {
  'use strict';

  /**
   * Promise-based sleep.
   * @param {number} ms
   * @returns {Promise<void>}
   */
  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Sleep with random jitter in range [base, base+jitterMax].
   * Used to avoid bot-like rhythmic patterns.
   */
  function jitterSleep(base, jitterMax = 800) {
    const extra = Math.floor(Math.random() * jitterMax);
    return sleep(base + extra);
  }

  /**
   * Classic debounce.
   */
  function debounce(fn, wait = 200) {
    let t;
    return function (...args) {
      clearTimeout(t);
      t = setTimeout(() => fn.apply(this, args), wait);
    };
  }

  /**
   * Throttle calls — leading-edge.
   */
  function throttle(fn, limit = 200) {
    let inThrottle = false;
    return function (...args) {
      if (inThrottle) return;
      inThrottle = true;
      fn.apply(this, args);
      setTimeout(() => (inThrottle = false), limit);
    };
  }

  /**
   * Run an async fn with retry + exponential backoff.
   * @param {Function} fn  — async function
   * @param {Object}   opts
   * @param {number}   opts.retries
   * @param {number}   opts.baseDelay
   */
  async function withRetry(fn, { retries = 3, baseDelay = 400 } = {}) {
    let attempt = 0;
    let lastErr;
    while (attempt <= retries) {
      try {
        return await fn(attempt);
      } catch (err) {
        lastErr = err;
        if (attempt === retries) break;
        await sleep(baseDelay * Math.pow(2, attempt));
        attempt += 1;
      }
    }
    throw lastErr;
  }

  /**
   * Safe text-content extraction for a DOM element.
   */
  function text(node) {
    if (!node) return '';
    return (node.textContent || '').trim().replace(/\s+/g, ' ');
  }

  /**
   * Safe attribute getter.
   */
  function attr(node, name) {
    return node && node.getAttribute ? (node.getAttribute(name) || '').trim() : '';
  }

  /**
   * Hash a string deterministically (FNV-1a 32-bit).
   * Used for deduplication keys.
   */
  function hash(str) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return ('0000000' + h.toString(16)).slice(-8);
  }

  /**
   * Format a Date as ISO-like 2026-05-21T07-30-12.
   * Filesystem-safe (no colons).
   */
  function fileStamp(d = new Date()) {
    const pad = (n) => String(n).padStart(2, '0');
    return (
      d.getFullYear() +
      '-' + pad(d.getMonth() + 1) +
      '-' + pad(d.getDate()) +
      'T' + pad(d.getHours()) +
      '-' + pad(d.getMinutes()) +
      '-' + pad(d.getSeconds())
    );
  }

  /**
   * Wait for DOM element matching selector — resolves with element or null on timeout.
   */
  function waitFor(selector, { timeout = 5000, root = document } = {}) {
    return new Promise((resolve) => {
      const existing = root.querySelector(selector);
      if (existing) return resolve(existing);
      const obs = new MutationObserver(() => {
        const el = root.querySelector(selector);
        if (el) {
          obs.disconnect();
          resolve(el);
        }
      });
      obs.observe(root.body || root, { childList: true, subtree: true });
      setTimeout(() => { obs.disconnect(); resolve(null); }, timeout);
    });
  }

  /**
   * Safe send — wraps chrome.runtime.sendMessage with both sync + async error handling.
   * Returns the response or null on failure. Never throws.
   */
  function safeSendMessage(msg) {
    try {
      const result = chrome.runtime.sendMessage(msg, function () {
        if (chrome.runtime.lastError) {
          /* receiver gone — ignore */
        }
      });
      if (result && typeof result.catch === 'function') {
        result.catch(function () { /* receiver gone — ignore */ });
      }
      return result || null;
    } catch (_) {
      return null;
    }
  }

  /**
   * Console logger that proxies to extension's log channel.
   * Uses safeSendMessage so it never throws when background is gone.
   */
  function makeLogger(channel = 'content') {
    function emit(level, ...args) {
      const msg = args.map((a) =>
        typeof a === 'string' ? a : JSON.stringify(a)
      ).join(' ');
      safeSendMessage({
        type: 'MLE_LOG',
        payload: { channel, level, msg, ts: Date.now() },
      });
      console[level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log'](
        `[MLE:${channel}]`, ...args
      );
    }
    return {
      info: (...a) => emit('info', ...a),
      ok:   (...a) => emit('ok', ...a),
      warn: (...a) => emit('warn', ...a),
      error:(...a) => emit('error', ...a),
    };
  }

  global.MLE_Helpers = {
    sleep,
    jitterSleep,
    debounce,
    throttle,
    withRetry,
    text,
    attr,
    hash,
    fileStamp,
    waitFor,
    safeSendMessage,
    makeLogger,
  };
})(typeof window !== 'undefined' ? window : self);

/* =====================================================
   storage.js — Chrome storage wrapper
   - Promise-based facade for chrome.storage.local
   - Namespaced keys
   - Auto-save buffer with debounce
   - History list with cap
   ===================================================== */

(function (global) {
  'use strict';

  const NS = 'mle:';
  const KEYS = {
    DATASET:   NS + 'dataset',       // [] of extracted records
    SETTINGS:  NS + 'settings',      // user filter / theme settings
    PROGRESS:  NS + 'progress',      // { state, count, lastUpdate, keyword }
    SCRAPE_POS: NS + 'scrapePos',    // { processedIndex, scrollTop, feedHeight, pageNum, lastCardHref }
    HISTORY:   NS + 'history',       // recent download metadata
    LOGS:      NS + 'logs',          // ring buffer of log lines
  };
  const HISTORY_CAP = 25;
  const LOG_CAP = 500;

  function get(key) {
    return new Promise((resolve) => {
      chrome.storage.local.get([key], (res) => resolve(res[key]));
    });
  }
  function set(key, value) {
    return new Promise((resolve) => {
      chrome.storage.local.set({ [key]: value }, resolve);
    });
  }
  function remove(key) {
    return new Promise((resolve) => {
      chrome.storage.local.remove([key], resolve);
    });
  }

  // ---------- Dataset ----------
  async function getDataset() {
    return (await get(KEYS.DATASET)) || [];
  }
  async function setDataset(arr) {
    return set(KEYS.DATASET, arr || []);
  }
  async function appendRecords(records) {
    const cur = await getDataset();
    const next = cur.concat(records);
    await setDataset(next);
    return next.length;
  }
  async function clearDataset() {
    return remove(KEYS.DATASET);
  }

  // ---------- Settings ----------
  const DEFAULT_SETTINGS = {
    theme: 'dark',
    keyword: '',
    minRating: '',
    minReviews: '',
    required: [],
    delayMs: 1500,
    maxResults: 200,
    autoSave: true,
    dedup: true,
    jitter: true,
    deepEmailSearch: true,
  };
  async function getSettings() {
    const s = (await get(KEYS.SETTINGS)) || {};
    return { ...DEFAULT_SETTINGS, ...s };
  }
  async function setSettings(patch) {
    const cur = await getSettings();
    const merged = { ...cur, ...patch };
    await set(KEYS.SETTINGS, merged);
    return merged;
  }

  // ---------- Progress ----------
  async function getProgress() {
    return (await get(KEYS.PROGRESS)) || {
      state: 'idle', count: 0, total: 0, errors: 0, duplicates: 0, lastUpdate: 0, keyword: '',
    };
  }
  async function setProgress(patch) {
    const cur = await getProgress();
    const merged = { ...cur, ...patch, lastUpdate: Date.now() };
    await set(KEYS.PROGRESS, merged);
    return merged;
  }
  async function resetProgress() {
    return set(KEYS.PROGRESS, {
      state: 'idle', count: 0, total: 0, errors: 0, duplicates: 0, lastUpdate: Date.now(), keyword: '',
    });
  }

  // ---------- Scrape Position (for resume) ----------
  async function getScrapePos() {
    return (await get(KEYS.SCRAPE_POS)) || {
      processedIndex: 0,
      scrollTop: 0,
      feedHeight: 0,
      pageNum: 1,
      lastCardHref: '',
      lastUpdate: 0,
    };
  }
  async function setScrapePos(patch) {
    const cur = await getScrapePos();
    const merged = { ...cur, ...patch, lastUpdate: Date.now() };
    await set(KEYS.SCRAPE_POS, merged);
    return merged;
  }
  async function clearScrapePos() {
    return set(KEYS.SCRAPE_POS, {
      processedIndex: 0,
      scrollTop: 0,
      feedHeight: 0,
      pageNum: 1,
      lastCardHref: '',
      lastUpdate: Date.now(),
    });
  }

  // ---------- History ----------
  async function addHistory(entry) {
    const cur = (await get(KEYS.HISTORY)) || [];
    const next = [{ ...entry, at: Date.now() }, ...cur].slice(0, HISTORY_CAP);
    await set(KEYS.HISTORY, next);
    return next;
  }
  async function getHistory() {
    return (await get(KEYS.HISTORY)) || [];
  }
  async function clearHistory() {
    return remove(KEYS.HISTORY);
  }

  // ---------- Logs (persisted ring buffer) ----------
  async function pushLog(line) {
    const cur = (await get(KEYS.LOGS)) || [];
    cur.push(line);
    if (cur.length > LOG_CAP) cur.splice(0, cur.length - LOG_CAP);
    await set(KEYS.LOGS, cur);
  }
  async function getLogs() {
    return (await get(KEYS.LOGS)) || [];
  }
  async function clearLogs() {
    return remove(KEYS.LOGS);
  }

  global.MLE_Storage = {
    KEYS,
    getDataset, setDataset, appendRecords, clearDataset,
    getSettings, setSettings, DEFAULT_SETTINGS,
    getProgress, setProgress, resetProgress,
    getScrapePos, setScrapePos, clearScrapePos,
    addHistory, getHistory, clearHistory,
    pushLog, getLogs, clearLogs,
  };
})(typeof window !== 'undefined' ? window : self);

/* =====================================================
   popup.js - Dashboard controller
   - Wires UI controls to background + storage.
   - Subscribes to relay messages from background for live updates.
   - Handles exports via export.js helpers.
   ===================================================== */

(function () {
  'use strict';

  const H = window.MLE_Helpers;
  const V = window.MLE_Validators;
  const ST = window.MLE_Storage;
  const EX = window.MLE_Export;

  const $ = function (id) { return document.getElementById(id); };
  const els = {
    banner: $('statusBanner'),
    statusText: $('statusText'),
    statusKeyword: $('statusKeyword'),
    countTotal: $('countTotal'),
    countValid: $('countValid'),
    countDup:   $('countDup'),
    countErr:   $('countErr'),
    progressFill: $('progressFill'),
    progressPct:  $('progressPct'),
    btnStart: $('btnStart'),
    btnPause: $('btnPause'),
    btnStop:  $('btnStop'),
    keywordInput: $('keywordInput'),
    minRating: $('minRating'),
    minReviews: $('minReviews'),
    delayMs: $('delayMs'),
    maxResults: $('maxResults'),
    autoSave: $('autoSave'),
    dedup: $('dedup'),
    jitter: $('jitter'),
    deepEmailSearch: $('deepEmailSearch'),
    requiredChecks: document.querySelectorAll('input[data-required]'),
    logConsole: $('logConsole'),
    logCount: $('logCount'),
    btnClearLogs: $('btnClearLogs'),
    exportCsv: $('exportCsv'),
    exportXlsx: $('exportXlsx'),
    exportJson: $('exportJson'),
    btnClearData: $('btnClearData'),
    historyList: $('historyList'),
    themeToggle: $('themeToggle'),
    tabs: document.querySelectorAll('.tab'),
    panels: document.querySelectorAll('.panel'),
  };

  document.addEventListener('DOMContentLoaded', init);

  async function init() {
    bindTabs();
    bindControls();
    bindSettingsAutoSave();
    bindExports();
    bindThemeToggle();
    listenBackground();

    await Promise.all([
      hydrateSettings(),
      hydrateProgress(),
      hydrateLogs(),
      hydrateHistory(),
    ]);
  }

  function bindTabs() {
    els.tabs.forEach(function (tab) {
      tab.addEventListener('click', function () {
        const name = tab.dataset.tab;
        els.tabs.forEach(function (t) { t.classList.toggle('active', t === tab); });
        els.panels.forEach(function (p) { p.classList.toggle('active', p.dataset.panel === name); });
      });
    });
  }

  function bindThemeToggle() {
    els.themeToggle.addEventListener('click', async function () {
      const cur = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
      document.documentElement.setAttribute('data-theme', cur);
      await ST.setSettings({ theme: cur });
    });
  }

  async function hydrateSettings() {
    const s = await ST.getSettings();
    document.documentElement.setAttribute('data-theme', s.theme || 'dark');
    els.keywordInput.value = s.keyword || '';
    els.minRating.value    = s.minRating || '';
    els.minReviews.value   = s.minReviews || '';
    els.delayMs.value      = s.delayMs || 1500;
    els.maxResults.value   = s.maxResults || 200;
    els.autoSave.checked   = !!s.autoSave;
    els.dedup.checked      = !!s.dedup;
    els.jitter.checked     = !!s.jitter;
    els.deepEmailSearch.checked = s.deepEmailSearch !== false;
    els.requiredChecks.forEach(function (cb) {
      cb.checked = (s.required || []).indexOf(cb.dataset.required) !== -1;
    });
    if (s.keyword) els.statusKeyword.textContent = s.keyword;
  }

  async function hydrateProgress() {
    const p = await ST.getProgress();
    renderProgress(p);
    const ds = await ST.getDataset();
    if (ds.length) {
      flashLog(ds.length + ' records already saved. Start = resume (skips known listings).');
    }
  }

  async function hydrateLogs() {
    const logs = await ST.getLogs();
    logs.forEach(appendLogLine);
    els.logCount.textContent = logs.length + ' entries';
  }

  async function hydrateHistory() {
    const items = await ST.getHistory();
    renderHistory(items);
  }

  function bindControls() {
    els.btnStart.addEventListener('click', onStart);
    els.btnPause.addEventListener('click', onPause);
    els.btnStop.addEventListener('click', onStop);
    els.btnClearLogs.addEventListener('click', async function () {
      await ST.clearLogs();
      els.logConsole.innerHTML = '';
      els.logCount.textContent = '0 entries';
    });
  }

  async function onStart() {
    const settings = await collectSettings();
    await ST.setSettings(settings);

    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const tab = tabs[0];
    if (!tab || !/google\.com\/maps/.test(tab.url || '')) {
      flashError('Open a Google Maps search results tab first.');
      return;
    }

    setButtons({ running: true, paused: false });
    setBanner('running', 'Extracting...', settings.keyword);
    els.statusKeyword.textContent = settings.keyword || '';

    const resp = await sendBg({ type: 'MLE_START', payload: { tabId: tab.id, settings: settings } });
    if (!resp || !resp.ok) {
      flashError(resp && resp.error || 'Could not start extraction.');
      setButtons({ running: false, paused: false });
      setBanner('error', resp && resp.error || 'Failed to start');
      return;
    }
    if (resp.resumedFrom > 0) {
      flashLog('Resuming - ' + resp.resumedFrom + ' saved records will be skipped without re-clicking.');
    }
  }

  async function onPause() {
    const paused = els.banner.dataset.state === 'paused';
    if (paused) {
      await sendBg({ type: 'MLE_RESUME' });
      setBanner('running', 'Extracting...');
      els.btnPause.textContent = 'Pause';
    } else {
      await sendBg({ type: 'MLE_PAUSE' });
      setBanner('paused', 'Paused');
      els.btnPause.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M8 5v14l11-7L8 5Z"/></svg> Resume';
    }
  }

  async function onStop() {
    await sendBg({ type: 'MLE_STOP' });
    setButtons({ running: false, paused: false });
    setBanner('idle', 'Idle - ready to extract');
    els.btnPause.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M6 5h4v14H6V5Zm8 0h4v14h-4V5Z"/></svg> Pause';
  }

  function setButtons(opts) {
    els.btnStart.disabled = !!opts.running;
    els.btnPause.disabled = !opts.running;
    els.btnStop.disabled  = !opts.running;
  }

  function setBanner(state, text, keyword) {
    els.banner.dataset.state = state;
    els.statusText.textContent = text;
    if (keyword !== undefined) els.statusKeyword.textContent = keyword || '';
  }

  function flashError(msg) {
    appendLogLine({ channel: 'popup', level: 'error', msg: msg, ts: Date.now() });
  }
  function flashLog(msg) {
    appendLogLine({ channel: 'popup', level: 'ok', msg: msg, ts: Date.now() });
  }

  function bindSettingsAutoSave() {
    const inputs = [els.keywordInput, els.minRating, els.minReviews, els.delayMs, els.maxResults];
    inputs.forEach(function (inp) { inp.addEventListener('input', H.debounce(saveSettings, 300)); });
    [els.autoSave, els.dedup, els.jitter, els.deepEmailSearch].forEach(function (cb) { cb.addEventListener('change', saveSettings); });
    els.requiredChecks.forEach(function (cb) { cb.addEventListener('change', saveSettings); });
  }

  async function collectSettings() {
    const required = [];
    els.requiredChecks.forEach(function (c) { if (c.checked) required.push(c.dataset.required); });
    return {
      keyword:    V.clean(els.keywordInput.value),
      minRating:  els.minRating.value,
      minReviews: els.minReviews.value,
      delayMs:    Math.max(500, Number(els.delayMs.value) || 1500),
      maxResults: Math.max(1, Number(els.maxResults.value) || 200),
      autoSave:   els.autoSave.checked,
      dedup:      els.dedup.checked,
      jitter:     els.jitter.checked,
      deepEmailSearch: els.deepEmailSearch.checked,
      required:   required,
      theme:      document.documentElement.getAttribute('data-theme') || 'dark',
    };
  }
  async function saveSettings() {
    const s = await collectSettings();
    await ST.setSettings(s);
  }

  function listenBackground() {
    chrome.runtime.onMessage.addListener(function (msg) {
      if (!msg || !msg.type) return;
      switch (msg.type) {
        case 'MLE_LOG_RELAY':
          appendLogLine(msg.payload);
          break;
        case 'MLE_PROGRESS_RELAY':
          mergeProgress(msg.payload);
          break;
        case 'MLE_RECORDS_RELAY':
          break;
        case 'MLE_DONE_RELAY':
          setButtons({ running: false, paused: false });
          const p = msg.payload || {};
          setBanner('idle', 'Finished - +' + (p.added || 0) + ' new (' + (p.extracted || 0) + ' total)');
          break;
      }
    });
  }

  async function mergeProgress(patch) {
    const p = await ST.getProgress();
    renderProgress(Object.assign({}, p, patch));
  }

  function renderProgress(p) {
    els.countTotal.textContent = p.count || 0;
    els.countValid.textContent = (p.count || 0) - (p.errors || 0);
    els.countDup.textContent   = p.duplicates || 0;
    els.countErr.textContent   = p.errors || 0;

    const goal = (p.maxResults || Number(els.maxResults.value) || 200);
    const pct = Math.min(100, Math.round(((p.count || 0) / goal) * 100));
    els.progressFill.style.width = pct + '%';
    els.progressPct.textContent  = pct + '%';

    if (p.state === 'running')      setBanner('running', 'Extracting...', p.keyword);
    else if (p.state === 'paused')  setBanner('paused', 'Paused', p.keyword);
    else if (p.state === 'error')   setBanner('error', 'Error occurred');
    else                            setBanner('idle', 'Idle - ready to extract', p.keyword);

    setButtons({
      running: p.state === 'running' || p.state === 'paused',
      paused:  p.state === 'paused',
    });
  }

  function appendLogLine(entry) {
    if (!entry) return;
    const ts = new Date(entry.ts || Date.now()).toLocaleTimeString();
    const line = document.createElement('div');
    line.className = 'log-line ' + (entry.level || 'info');
    const lvl = (entry.level || 'info').toUpperCase();
    line.innerHTML = '<span class="ts">' + ts + '</span><span class="lvl">[' + lvl + ']</span><span class="msg"></span>';
    line.querySelector('.msg').textContent = entry.msg || '';
    els.logConsole.appendChild(line);
    els.logConsole.scrollTop = els.logConsole.scrollHeight;
    while (els.logConsole.children.length > 500) {
      els.logConsole.removeChild(els.logConsole.firstChild);
    }
    els.logCount.textContent = els.logConsole.children.length + ' entries';
  }

  function bindExports() {
    els.exportCsv.addEventListener('click',  function () { doExport('csv'); });
    els.exportXlsx.addEventListener('click', function () { doExport('xlsx'); });
    els.exportJson.addEventListener('click', function () { doExport('json'); });
    els.btnClearData.addEventListener('click', async function () {
      if (!confirm('Delete all extracted records from local storage?\nThis means Start will scrape from scratch next time.')) return;
      await ST.clearDataset();
      await ST.resetProgress();
      await ST.clearScrapePos();
      await hydrateProgress();
      flashLog('Dataset and scrape position cleared.');
    });
  }

  async function doExport(kind) {
    const records = await ST.getDataset();
    if (!records.length) {
      flashError('Nothing to export - extract some leads first.');
      return;
    }
    const settings = await ST.getSettings();
    const safeKey = (settings.keyword || 'leads').replace(/[^a-z0-9_-]+/gi, '_').slice(0, 40);
    const base = 'maps_' + safeKey + '_' + H.fileStamp();

    let result;
    try {
      if (kind === 'csv')  result = EX.exportCsv(records, base);
      if (kind === 'xlsx') result = EX.exportXlsx(records, base);
      if (kind === 'json') result = EX.exportJson(records, base);
    } catch (err) {
      flashError('Export failed: ' + err.message);
      return;
    }

    const hist = await ST.addHistory({
      file: result.file, type: result.type, count: result.count, size: result.size,
    });
    renderHistory(hist);
    flashLog('Exported ' + result.count + ' records to ' + result.file);
  }

  function renderHistory(items) {
    if (!items || !items.length) {
      els.historyList.innerHTML = '<li class="history-empty">No downloads yet.</li>';
      return;
    }
    els.historyList.innerHTML = '';
    items.forEach(function (it) {
      const li = document.createElement('li');
      li.className = 'history-item';
      const when = new Date(it.at).toLocaleString();
      li.innerHTML = '<div class="h-meta"><span class="h-name"></span><span class="h-sub"></span></div><span class="h-badge"></span>';
      li.querySelector('.h-name').textContent = it.file;
      li.querySelector('.h-sub').textContent  = when + ' · ' + formatBytes(it.size);
      li.querySelector('.h-badge').textContent = (it.type || '').toUpperCase();
      els.historyList.appendChild(li);
    });
  }

  function formatBytes(b) {
    if (!b) return '0 B';
    const u = ['B', 'KB', 'MB', 'GB'];
    let i = 0; let v = b;
    while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
    return v.toFixed(v < 10 ? 1 : 0) + ' ' + u[i];
  }

  function sendBg(msg) {
    return new Promise(function (resolve) {
      try {
        chrome.runtime.sendMessage(msg, function (resp) {
          if (chrome.runtime.lastError) {
            resolve({ ok: false, error: chrome.runtime.lastError.message || 'Extension context invalidated' });
            return;
          }
          resolve(resp);
        });
      } catch (e) {
        resolve({ ok: false, error: e.message || 'send failed' });
      }
    });
  }
})();

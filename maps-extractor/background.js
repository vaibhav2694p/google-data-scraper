/* =====================================================
   background.js - MV3 service worker
   Responsibilities:
   - Wake on extension events (install, startup, message).
   - Relay control messages popup <-> content script.
   - Persist progress + dataset via chrome.storage.
   - Fan out logs to any open popup.
   - Keepalive ping (chrome.alarms) so MV3 doesn't suspend us mid-run.
   - Survive service-worker shutdowns: state lives in storage.
   - Handle anti-bot /sorry detection and deep email extraction.
   ===================================================== */

importScripts('sorry.js');

const STATE = { tabId: -1 };

const KEYS = {
  DATASET:    'mle:dataset',
  SETTINGS:   'mle:settings',
  PROGRESS:   'mle:progress',
  SCRAPE_POS: 'mle:scrapePos',
  HISTORY:    'mle:history',
  LOGS:       'mle:logs',
};
const LOG_CAP = 500;
const KEEPALIVE_ALARM = 'mle-keepalive';

function log(...args) {
  console.log('[MLE:bg]', ...args);
}

function sget(key) {
  return new Promise((r) => chrome.storage.local.get([key], (v) => r(v[key])));
}
function sset(key, val) {
  return new Promise((r) => chrome.storage.local.set({ [key]: val }, r));
}
async function patchProgress(patch) {
  const cur = (await sget(KEYS.PROGRESS)) || {
    state: 'idle', count: 0, errors: 0, duplicates: 0, total: 0,
  };
  const merged = Object.assign({}, cur, patch, { lastUpdate: Date.now() });
  await sset(KEYS.PROGRESS, merged);
  return merged;
}
async function pushLog(line) {
  const cur = (await sget(KEYS.LOGS)) || [];
  cur.push(line);
  if (cur.length > LOG_CAP) cur.splice(0, cur.length - LOG_CAP);
  await sset(KEYS.LOGS, cur);
}

chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') {
    await sset(KEYS.SETTINGS, {
      theme: 'dark', keyword: '', minRating: '', minReviews: '',
      required: [], delayMs: 1500, maxResults: 500,
      autoSave: true, dedup: true, jitter: true, deepEmailSearch: true,
    });
    await sset(KEYS.PROGRESS, {
      state: 'idle', count: 0, errors: 0, duplicates: 0, total: 0, lastUpdate: Date.now(),
    });
  }
});

chrome.runtime.onStartup.addListener(async () => {
  const p = (await sget(KEYS.PROGRESS)) || {};
  if (p.state === 'running') {
    await patchProgress({ state: 'idle' });
  }
  try { chrome.alarms.clear(KEEPALIVE_ALARM); } catch (_) {}
});

const CCTLDS = new Set('ac ad ae af ag ai al am an ao aq ar as at au aw ax az ba bb bd be bf bg bh bi bj bm bn bo br bs bt bv bw by bz ca cc cd cf cg ch ci ck cl cm cn co cr cu cv cw cx cy cz de dj dk dm do dz ec ee eg eh er es et eu fi fj fk fm fo fr ga gb gd ge gf gg gh gi gl gm gn gp gq gr gs gt gu gw gy hk hm hn hr ht hu id ie il im in io iq ir is it je jm jo jp ke kg kh ki km kn kp kr kw ky kz la lb lc li lk lr ls lt lu lv ly ma mc md me mf mg mh mk ml mm mn mo mp mq mr ms mt mu mv mw mx my mz na nc ne nf ng ni nl no np nr nu nz om pa pe pf pg ph pk pl pm pn pr ps pt pw py qa re ro rs ru rw sa sb sc sd se sg sh si sj sk sl sm sn so sr ss st su sv sx sy sz tc td tf tg th tj tk tl tm tn to tr tt tv tw tz ua ug uk us uy uz va vc ve vg vi vn vu wf ws xk ye yt za zm zw'.split(' '));

const EMAIL_BLACKLIST = new Set('.png .jpg .jpeg .gif .webp wixpress.com sentry.io noreply abuse no-reply subscribe mailer-daemon domain.com email.com yourname wix.com'.split(' '));
const CONTACT_PAGE_PATHS = '/contact /contact-us /contact-me /about /about-me /about-us /team /our-team /meet-the-team /support /customer-service /feedback /help /sales /return /location /faq'.split(' ');
const BLACKLISTED_PATHS = new Set('/reel /about /tr /privacy /download /pg /settings /vp /profiles'.split(' '));
const SOCIAL_MEDIA_DOMAINS = new Set(['instagram', 'facebook', 'youtube', 'linkedin', 'twitter']);

const SOCIAL_MEDIA_PATTERNS = {
  instagram: /(((http|https):\/\/)?((www\.)?(?:instagram.com|instagr.am)\/([A-Za-z0-9_.]{2,30})))/ig,
  facebook:  /(?:https?:)?\/\/(?:www\.)?(?:facebook|fb)\.com\/((?![A-z]+\.php)(?!marketplace|gaming|watch|me|messages|help|search|groups)[A-z0-9_\-\.]+)\/?/ig,
  youtube:   /(?:https?:)?\/\/(?:[A-z]+\.)?youtube\.com\/(channel\/([A-z0-9-_]+)|user\/([A-z0-9]+))\/?/ig,
  linkedin:  /(?:https?:)?\/\/(?:[\w]+\.)?linkedin\.com\/((company|school)\/[A-z0-9-\u00c0-\u00ff\.]+|in\/[\w\-_\u00c0-\u00ff%]+)\/?/ig,
  twitter:   /(?:(?:http|https):\/\/)?(?:www.)?(?:twitter\.com|x\.com)\/(?!(oauth|account|tos|privacy|signup|home|hashtag|search|login|widgets|i|settings|start|share|intent|oct)(['"\?\.\/]|$))([A-Za-z0-9_]{1,15})/igm,
  email:     /\b[A-Z0-9._%+-]{1,64}@(?!-)(?:[A-Z0-9-]+\.)+[A-Z]{2,63}\b/gi,
};

function decodeCfEmail(encoded) {
  let result = '';
  const key = parseInt(encoded.slice(0, 2), 16);
  for (let i = 2; i < encoded.length; i += 2) {
    const code = parseInt(encoded.slice(i, i + 2), 16) ^ key;
    result += String.fromCharCode(code);
  }
  return result;
}

function getDomain(url) {
  try {
    const host = new URL(url).host.toLowerCase().split('.');
    if (host.length >= 3 && CCTLDS.has(host[host.length - 1])) return host[host.length - 3];
    if (host.length >= 2) return host[host.length - 2];
    return host[0];
  } catch (_) {
    return null;
  }
}

function normalizeSocialLink(link) {
  if (!link) return '';
  try {
    if (link.startsWith('//')) link = 'https:' + link;
    if (!link.startsWith('http')) link = 'https://' + link;
    const url = new URL(link);
    if (url.protocol === 'http:' || url.protocol === '') url.protocol = 'https:';
    if (url.host === 'instagram.com') url.host = 'www.instagram.com';
    if (url.host === 'facebook.com') url.host = 'www.facebook.com';
    if (url.host === 'www.twitter.com') url.host = 'twitter.com';
    if (url.host === 'www.x.com') url.host = 'x.com';
    if (BLACKLISTED_PATHS.has(url.pathname)) return '';
    if (url.pathname.endsWith('/')) url.pathname = url.pathname.slice(0, -1);
    return url.toString();
  } catch (_) {
    return '';
  }
}

/**
 * Deep email/social extraction from business website.
 * Uses fetchWithSorryDetection for /sorry page handling.
 */
async function deepExtractFromWebsite(websiteUrl, businessName) {
  try {
    if (!websiteUrl.startsWith('http')) websiteUrl = 'https://' + websiteUrl;

    const result = await fetchWithSorryDetection(websiteUrl, 10000, {
      referer: 'https://www.google.com/',
    });

    if (!result.success || !result.data) return null;

    const html = result.data;
    if (!html || html.length < 10) return null;

    const normalized = html.normalize('NFKC');
    const results = { email: '', instagram: [], facebook: [], youtube: [], linkedin: [], twitter: [] };

    // Decode Cloudflare email protection
    const cfMatches = normalized.match(/data-cfemail="([a-f0-9]+)"/gi);
    if (cfMatches) {
      for (const match of cfMatches) {
        const encoded = match.match(/data-cfemail="([a-f0-9]+)"/i);
        if (encoded && encoded[1]) {
          const decoded = decodeCfEmail(encoded[1]);
          if (decoded && decoded.includes('@')) {
            const lower = decoded.toLowerCase();
            if (!Array.from(EMAIL_BLACKLIST).some(function (b) { return lower.includes(b); })) {
              if (!results.email) results.email = lower;
            }
          }
        }
      }
    }

    // Extract emails from text
    const emailMatches = normalized.match(SOCIAL_MEDIA_PATTERNS.email);
    if (emailMatches) {
      const validEmails = emailMatches.filter(function (e) {
        const lower = e.toLowerCase();
        return !Array.from(EMAIL_BLACKLIST).some(function (b) { return lower.includes(b); });
      });
      if (validEmails.length > 0) {
        const domain = getDomain(websiteUrl);
        const domainEmails = validEmails.filter(function (e) { return domain && e.toLowerCase().includes(domain); });
        results.email = domainEmails.length > 0 ? domainEmails[0].toLowerCase() : validEmails[0].toLowerCase();
      }
    }

    // Extract social media links from href attributes
    const linkRegex = /<a[^>]+href=["']([^"']+)["']/gi;
    let linkMatch;
    const links = [];
    while ((linkMatch = linkRegex.exec(normalized)) !== null) {
      if (linkMatch[1]) {
        try {
          const resolved = new URL(linkMatch[1], websiteUrl).toString();
          links.push(resolved);
        } catch (_) {}
      }
    }

    // Find contact pages and extract social links from them
    const contactPages = [];
    try {
      const urlObj = new URL(websiteUrl);
      for (const link of links) {
        try {
          const pathname = new URL(link).pathname.toLowerCase();
          if (CONTACT_PAGE_PATHS.some(function (p) { return pathname.includes(p); })) {
            contactPages.push(link);
          }
        } catch (_) {}
      }
    } catch (_) {}

    // Extract social media from all links
    for (const link of links) {
      try {
        const host = new URL(link).host.toLowerCase();
        for (const platform of SOCIAL_MEDIA_DOMAINS) {
          let matches = false;
          if (platform === 'twitter') {
            matches = host === 'twitter.com' || host === 'www.twitter.com' || host.endsWith('.twitter.com') ||
                      host === 'x.com' || host === 'www.x.com' || host.endsWith('.x.com');
          } else {
            matches = host === platform + '.com' || host === 'www.' + platform + '.com' || host.endsWith('.' + platform + '.com');
          }
          if (matches) {
            const normalized = normalizeSocialLink(link);
            if (normalized && results[platform].indexOf(normalized) === -1) {
              results[platform].push(normalized);
            }
            break;
          }
        }
      } catch (_) {}
    }

    // Also extract social from regex on the HTML
    const socialPlatforms = ['instagram', 'facebook', 'youtube', 'linkedin', 'twitter'];
    for (const platform of socialPlatforms) {
      const matches = normalized.match(SOCIAL_MEDIA_PATTERNS[platform]);
      if (matches) {
        for (const m of matches) {
          const normalizedLink = normalizeSocialLink(m);
          if (normalizedLink && results[platform].indexOf(normalizedLink) === -1) {
            results[platform].push(normalizedLink);
          }
        }
      }
    }

    // Find emails in mailto: links
    const mailtoMatches = html.match(/href=["']mailto:([^"']+)["']/gi);
    if (mailtoMatches) {
      for (const match of mailtoMatches) {
        const email = match.replace(/href=["']mailto:/i, '').replace(/["']$/, '').split('?')[0];
        if (email && email.includes('@')) {
          const lower = email.toLowerCase();
          if (!Array.from(EMAIL_BLACKLIST).some(function (b) { return lower.includes(b); })) {
            if (!results.email) results.email = lower;
          }
        }
      }
    }

    // Deep search: visit contact pages for more emails
    if (!results.email && contactPages.length > 0) {
      for (const contactUrl of contactPages.slice(0, 5)) {
        try {
          const contactResult = await fetchWithSorryDetection(contactUrl, 5000, {
            referer: websiteUrl,
          });
          if (contactResult.success && contactResult.data) {
            const contactHtml = contactResult.data;
            // Check for Cloudflare email
            const cfContact = contactHtml.match(/data-cfemail="([a-f0-9]+)"/i);
            if (cfContact && cfContact[1]) {
              const decoded = decodeCfEmail(cfContact[1]);
              if (decoded && decoded.includes('@')) {
                const lower = decoded.toLowerCase();
                if (!Array.from(EMAIL_BLACKLIST).some(function (b) { return lower.includes(b); })) {
                  results.email = lower;
                  break;
                }
              }
            }
            const contactEmails = contactHtml.match(SOCIAL_MEDIA_PATTERNS.email);
            if (contactEmails) {
              const valid = contactEmails.filter(function (e) {
                const lower = e.toLowerCase();
                return !Array.from(EMAIL_BLACKLIST).some(function (b) { return lower.includes(b); });
              });
              if (valid.length > 0) {
                results.email = valid[0].toLowerCase();
                break;
              }
            }
          }
        } catch (_) {}
      }
    }

    return results;
  } catch (e) {
    console.log('[MLE:bg] Deep extraction error:', e.message);
    return null;
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || !msg.type) return;

  (async () => {
    try {
      switch (msg.type) {

        case 'MLE_LOG': {
          await pushLog(msg.payload);
          try {
            chrome.runtime.sendMessage({ type: 'MLE_LOG_RELAY', payload: msg.payload }, function () {
              if (chrome.runtime.lastError) { /* popup closed */ }
            });
          } catch (_) {}
          sendResponse({ ok: true });
          break;
        }

        case 'MLE_START': {
          const { tabId, settings } = msg.payload;
          STATE.tabId = tabId;

          const existing = (await sget(KEYS.DATASET)) || [];
          const baseCount = existing.length;
          const scrapePos = (await sget(KEYS.SCRAPE_POS)) || { processedIndex: 0, scrollTop: 0, feedHeight: 0, pageNum: 1, lastCardHref: '' };

          await patchProgress({
            state: 'running',
            count: baseCount,
            errors: 0, duplicates: 0,
            keyword: settings.keyword || '',
          });

          try { chrome.alarms.create(KEEPALIVE_ALARM, { periodInMinutes: 0.2 }); } catch (_) {}

          try {
            await chrome.tabs.sendMessage(tabId, {
              type: 'MLE_START',
              payload: { settings, existing, baseCount, scrapePos },
            });
            sendResponse({ ok: true, resumedFrom: baseCount, scrapePos });
          } catch (err) {
            await patchProgress({ state: 'error' });
            try { chrome.alarms.clear(KEEPALIVE_ALARM); } catch (_) {}
            sendResponse({ ok: false, error: 'content-script not reachable. Reload the Maps tab.' });
          }
          break;
        }

        case 'MLE_GET_DATASET': {
          const ds = (await sget(KEYS.DATASET)) || [];
          sendResponse({ ok: true, records: ds });
          break;
        }

        case 'MLE_PAUSE':
        case 'MLE_RESUME':
        case 'MLE_STOP': {
          if (STATE.tabId < 0) { sendResponse({ ok: false, error: 'no active tab' }); break; }
          await patchProgress({
            state: msg.type === 'MLE_STOP' ? 'idle'
                  : msg.type === 'MLE_PAUSE' ? 'paused'
                  : 'running',
          });
          if (msg.type === 'MLE_STOP') {
            try { chrome.alarms.clear(KEEPALIVE_ALARM); } catch (_) {}
          }
          try { await chrome.tabs.sendMessage(STATE.tabId, { type: msg.type }); } catch (_) {}
          sendResponse({ ok: true });
          break;
        }

        case 'MLE_PROGRESS': {
          await patchProgress(msg.payload || {});
          try {
            chrome.runtime.sendMessage({ type: 'MLE_PROGRESS_RELAY', payload: msg.payload }, function () {
              if (chrome.runtime.lastError) { /* popup closed */ }
            });
          } catch (_) {}
          sendResponse({ ok: true });
          break;
        }

        case 'MLE_SCRAPE_POS': {
          await sset(KEYS.SCRAPE_POS, msg.payload || {});
          sendResponse({ ok: true });
          break;
        }

        case 'MLE_RECORDS': {
          const records = Array.isArray(msg.payload) ? msg.payload : [];
          if (records.length) {
            const cur = (await sget(KEYS.DATASET)) || [];
            const next = cur.concat(records);
            await sset(KEYS.DATASET, next);
            try {
              chrome.runtime.sendMessage({ type: 'MLE_RECORDS_RELAY', payload: { added: records.length, total: next.length } }, function () {
                if (chrome.runtime.lastError) { /* popup closed */ }
              });
            } catch (_) {}
          }
          sendResponse({ ok: true });
          break;
        }

        case 'MLE_DONE': {
          await patchProgress({ state: 'idle' });
          await sset(KEYS.SCRAPE_POS, {
            processedIndex: 0,
            scrollTop: 0,
            feedHeight: 0,
            pageNum: 1,
            lastCardHref: '',
            lastUpdate: Date.now(),
          });
          try { chrome.alarms.clear(KEEPALIVE_ALARM); } catch (_) {}
          try {
            chrome.runtime.sendMessage({ type: 'MLE_DONE_RELAY', payload: msg.payload || {} }, function () {
              if (chrome.runtime.lastError) { /* popup closed */ }
            });
          } catch (_) {}
          sendResponse({ ok: true });
          break;
        }

        case 'MLE_DEEP_EXTRACT': {
          const { website, name } = msg.payload || {};
          if (!website) { sendResponse({ ok: false, error: 'no website' }); break; }
          const result = await deepExtractFromWebsite(website, name);
          sendResponse({ ok: true, data: result });
          break;
        }

        case 'MLE_PING': {
          sendResponse({ ok: true, pong: true });
          break;
        }

        default:
          sendResponse({ ok: false, error: 'unknown_type' });
      }
    } catch (err) {
      console.error('[MLE:bg]', err);
      sendResponse({ ok: false, error: String(err && err.message || err) });
    }
  })();

  return true;
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== KEEPALIVE_ALARM) return;
  const p = (await sget(KEYS.PROGRESS)) || {};
  if (p.state !== 'running' && p.state !== 'paused') {
    try { chrome.alarms.clear(KEEPALIVE_ALARM); } catch (_) {}
    return;
  }
  if (STATE.tabId < 0) return;
  try {
    await chrome.tabs.sendMessage(STATE.tabId, { type: 'MLE_PING' });
  } catch (_) {
    try {
      const tab = await chrome.tabs.get(STATE.tabId);
      if (tab && tab.status === 'complete') {
        await patchProgress({ state: 'idle' });
      }
    } catch (_) {}
  }
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  if (tabId === STATE.tabId) {
    STATE.tabId = -1;
    const p = (await sget(KEYS.PROGRESS)) || {};
    if (p.state === 'running' || p.state === 'paused') {
      await patchProgress({ state: 'idle' });
    }
    try { chrome.alarms.clear(KEEPALIVE_ALARM); } catch (_) {}
  }
});

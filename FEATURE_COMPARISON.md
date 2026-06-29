# FEATURE COMPARISON

## Features Merged from GMB-Scraper into Your Project (v2.0.0)

| # | Feature | GMB-Scraper Source | Your Project Integration | Status |
|---|---------|-------------------|--------------------------|--------|
| 1 | Anti-bot /sorry detection | `sorry.js` (22 lines) | `sorry.js` (403 lines) — enhanced with full webRequest tracking | ✅ Merged |
| 2 | Deep email extraction | `js/mybg.js` extractemail() | `background.js` deepExtractFromWebsite() — enhanced with contact page crawling | ✅ Merged |
| 3 | Social media extraction | `js/mybg.js` SOCIAL_MEDIA_PLATFORMS | `selectors.js` SOCIAL_MEDIA_PATTERNS + background extraction | ✅ Merged |
| 4 | CID extraction | `contentScript.js` data-cid | `selectors.js` extractCID() + content.js integration | ✅ Merged |
| 5 | Place ID extraction | `contentScript.js` parseBusinessData() | `content.js` extractDetail() from URL pattern | ✅ Merged |
| 6 | Extended export columns | `js/dashboard.js` COLUMNS | `export.js` 22 columns including CID, Place ID, social | ✅ Merged |
| 7 | Email blacklist filtering | `js/mybg.js` EMAIL_BLACKLIST | `selectors.js` EMAIL_BLACKLIST + background filtering | ✅ Merged |
| 8 | Contact page crawling | `js/mybg.js` CONTACT_PAGE_PATHS | `background.js` crawls 18 paths when no email found | ✅ Merged |
| 9 | Domain-based email priority | `js/mybg.js` get_domain() | `background.js` prioritizes emails matching business domain | ✅ Merged |
| 10 | Deep email search toggle | N/A (always on) | `popup.html` + `popup.js` user-controllable toggle | ✅ Added |
| 11 | CID-based deduplication | `contentScript.js` leads_lnglat Set | `content.js` seenCIDs Set + pre-click CID check | ✅ Enhanced |
| 12 | webRequest permissions | `manifest.json` | `manifest.json` added "webRequest" permission | ✅ Added |

---

## Features NOT Merged (Intentionally Excluded)

| # | Feature | Reason for Exclusion |
|---|---------|---------------------|
| 1 | Auth/login system | User requirement: "No login or registration system" |
| 2 | Stripe subscription | User requirement: No paywall |
| 3 | eval() in sandbox | Security risk: eval() can execute arbitrary code |
| 4 | `*://*/*` host permission | Overly broad, privacy concern |
| 5 | jQuery dependency | Unnecessary, vanilla JS is sufficient |
| 6 | ECharts visualization | Not needed for data extraction tool |
| 7 | Demo data files | Not needed in production extension |
| 8 | 200+ Google domains | Your project targets google.com/maps/* only |
| 9 | XHR interception approach | Your DOM-based approach is more reliable for MV3 |
| 10 | Review extraction | Partially implemented selectors, full feature pending |
| 11 | Tabulator.js table | Your popup UI is superior |
| 12 | Semantic UI framework | Not needed, your CSS is custom and clean |
| 13 | Locale/i18n files | Your project is English-only |
| 14 | Sandbox.html | Not needed without eval() |
| 15 | Cloudflare email decode | Low value, most sites don't use it |

---

## Features Unique to Your Project (Not in GMB-Scraper)

| Feature | Details |
|---------|---------|
| Resume capability | Saves extraction position, rehydrates dedup sets |
| Dark/Light themes | Full theme switching with CSS custom properties |
| Animated progress bar | Shimmer effect, real-time percentage |
| Pause/Resume/Stop | Full extraction lifecycle control |
| Triple-set deduplication | Name + URL fingerprint + CID |
| Pre-click dedup | Skips cards without clicking (zero-cost) |
| Batch flushing | Accumulates records, sends in batches |
| Scrape position saver | Saves every 5 seconds for crash recovery |
| Storage abstraction | Promise-based wrapper over chrome.storage |
| Log persistence | Ring buffer with 500-entry cap |
| History tracking | Recent downloads with file size |
| Safe message passing | Never throws on receiver-gone errors |
| Custom logger | Multi-level (info/ok/warn/error) with channel |
| Record validation | Phone, email, URL, rating validation |
| User filters | Min rating, min reviews, required fields |
| Jitter randomization | Random delays to avoid bot detection |

---

## Architecture Comparison

### Your Project (Clean Architecture)
```
popup.html ─── popup.js (controller)
                 ├── storage.js (persistence)
                 ├── export.js (CSV/XLSX/JSON)
                 └── libs/xlsx.full.min.js

background.js (service worker)
  ├── Message relay (11 types)
  ├── Deep email extraction
  └── Keepalive alarm

content.js (DOM extraction)
  ├── Auto-scroll + MutationObserver
  ├── Card processing pipeline
  ├── Dedup (triple-set)
  └── Batch flushing

utils/
  ├── helpers.js (sleep, retry, throttle, logger)
  ├── selectors.js (DOM selectors + social patterns)
  └── validators.js (field validation)

sorry.js (anti-bot detection)
```

### GMB-Scraper (Mixed Architecture)
```
popup.html ─── jQuery + popup.js
                 └── auth/* (login, rolecheck, Stripe)

bg.js (service worker)
  ├── auth/config.js
  ├── auth/loginbg.js
  ├── auth/feedback/feedback.js
  ├── js/mybg.js (email extraction)
  └── sorry.js

contentScript.js (injected at document_end)
  ├── UI injection (toolbar)
  ├── Auto-scroll
  ├── APP_INITIALIZATION_STATE parsing
  └── Sandbox iframe fallback

contentScript2.js (injected at document_start)
  └── injected.js (XHR hook in page context)

sandbox.html (CSP bypass with eval())
```

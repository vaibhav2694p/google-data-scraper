# FINAL REPORT

## Project: Google Data Scraper (Maps Lead Extractor)

**Author**: Vaibhav Patel
**Version**: 2.0.0
**Repository**: https://github.com/vaibhav2694p/google-data-scraper
**Date**: June 29, 2026

---

## Summary

Successfully merged the best features from GMB-Scraper-main into the existing maps-extractor project. The result is a single, clean, fully-functional Chrome extension that combines the superior architecture of the original project with the advanced scraping capabilities of GMB-Scraper.

---

## What Was Merged

| # | Feature | From | To | Impact |
|---|---------|------|-----|--------|
| 1 | Anti-bot /sorry detection | sorry.js | sorry.js | High — prevents blocking |
| 2 | Deep email extraction | js/mybg.js | background.js | High — finds hidden emails |
| 3 | Social media extraction | js/mybg.js | selectors.js + background.js | High — richer data |
| 4 | CID extraction | contentScript.js | selectors.js + content.js | Medium — better dedup |
| 5 | Place ID extraction | contentScript.js | content.js | Medium — unique IDs |
| 6 | Extended export columns | js/dashboard.js | export.js | Medium — more data |
| 7 | Email blacklist | js/mybg.js | selectors.js | Low — cleaner results |
| 8 | Contact page crawling | js/mybg.js | background.js | High — more emails |
| 9 | Domain email priority | js/mybg.js | background.js | Medium — relevant emails |
| 10 | Deep email toggle | N/A | popup.html + popup.js | Medium — user control |
| 11 | CID-based dedup | contentScript.js | content.js | Medium — better dedup |
| 12 | Real SheetJS library | CDN | libs/xlsx.full.min.js | High — XLSX works |

---

## What Was NOT Merged (By Design)

| Feature | Reason |
|---------|--------|
| Auth/login system | User requirement: no login |
| Stripe subscription | User requirement: no paywall |
| eval() usage | Security risk |
| `*://*/*` permission | Privacy concern |
| jQuery | Unnecessary dependency |
| ECharts | Not needed |
| Demo files | Not production code |
| 200+ Google domains | Out of scope |
| XHR interception | DOM approach is more reliable for MV3 |
| Review extraction | Partially implemented (selectors added) |
| Tabulator.js | Your popup UI is superior |
| Semantic UI | Not needed |
| Locale files | English-only project |

---

## Test Results

### File Integrity
| Check | Result |
|-------|--------|
| All files present | ✅ 18 files |
| manifest.json valid | ✅ Valid JSON |
| No syntax errors | ✅ Clean |
| SheetJS loaded | ✅ 945KB |
| Git committed | ✅ 18 files |
| Pushed to GitHub | ✅ Success |

### Repository
| Item | Value |
|------|-------|
| URL | https://github.com/vaibhav2694p/google-data-scraper |
| Branch | main |
| Latest commit | v2.0.0 merge |
| Files changed | 18 |
| Lines added | 3,439 |

---

## How to Use

### Installation
1. Open Chrome → `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select the `maps-extractor` inner folder

### Usage
1. Open Google Maps
2. Search for businesses (e.g., "restaurants in New York")
3. Click the extension icon
4. Configure settings (keyword, filters, delays)
5. Click "Start"
6. Monitor progress in the popup
7. Export to CSV/XLSX/JSON when complete

### Settings
- **Deep email/social extraction**: ON by default, crawls business websites
- **Auto-save**: Saves progress every 5 seconds
- **Deduplication**: Triple-set (name + URL + CID)
- **Jitter**: Random delays to avoid bot detection
- **Resume**: Pauses and resumes without losing progress

---

## Architecture

```
popup.html (400px dashboard)
  ├── popup.css (dark/light themes)
  ├── popup.js (controller)
  ├── storage.js (chrome.storage wrapper)
  ├── export.js (CSV/XLSX/JSON)
  └── libs/xlsx.full.min.js (SheetJS)

background.js (service worker)
  ├── Message relay (12 types)
  ├── Deep email extraction
  ├── Social media extraction
  └── Keepalive alarm (0.2min)

content.js (injected into google.com/maps)
  ├── Auto-scroll + MutationObserver
  ├── Card processing pipeline
  ├── Triple-set deduplication
  ├── CID/Place ID extraction
  └── Batch flushing

sorry.js (anti-bot detection)
  ├── /sorry URL detection
  ├── webRequest redirect tracking
  ├── Verification tab monitoring
  └── Redirect chain following

utils/
  ├── helpers.js (sleep, retry, throttle, logger)
  ├── selectors.js (DOM selectors + social patterns)
  └── validators.js (field validation)
```

---

## Data Fields Extracted (22 columns)

| # | Field | Source | Description |
|---|-------|--------|-------------|
| 1 | name | DOM | Business name |
| 2 | category | DOM | Business category |
| 3 | DOM | Rating | Star rating |
| 4 | reviewsCount | DOM | Number of reviews |
| 5 | address | DOM | Full address |
| 6 | phone | DOM | Phone number |
| 7 | website | DOM | Website URL |
| 8 | email | Deep extract | Contact email |
| 9 | hours | DOM | Working hours |
| 10 | lat | URL | Latitude |
| 11 | lng | URL | Longitude |
| 12 | social | DOM | Social links |
| 13 | cid | DOM/URL | Google CID |
| 14 | place_id | URL | Place ID |
| 15 | instagram | Deep extract | Instagram URL |
| 16 | facebook | Deep extract | Facebook URL |
| 17 | youtube | Deep extract | YouTube URL |
| 18 | linkedin | Deep extract | LinkedIn URL |
| 19 | twitter | Deep extract | Twitter/X URL |
| 20 | url | URL | Google Maps URL |
| 21 | user | Settings | Search keyword |
| 22 | extractedAt | Runtime | Timestamp |

---

## Credits

Created by **Vaibhav Patel**

Merged from:
- maps-extractor (original architecture)
- GMB-Scraper-main (advanced features)

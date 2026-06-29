# Code Analysis Report — maps-extractor

## Overview

**Directory:** `C:\Users\VaibhavPatel\SafeBooks Global Pvt Ltd\maps-extractor`
**Total Files:** 12 | **Total Lines:** 3,401
**Type:** Manifest V3 Chrome Extension (Service Worker background)
**Version:** 2.0.1

---

## Architecture

```
popup UI → storage/export → background/sorry → content script → utils
```

The extension uses a layered architecture:

- **Popup layer** — popup.html, popup.js, popup.css, export.js
- **Storage layer** — storage.js (chrome.storage wrapper)
- **Background layer** — background.js (MV3 service worker)
- **Error handling layer** — sorry.js (anti-bot detection/recovery)
- **Content layer** — content.js (DOM scraping injected into Maps pages)
- **Utility layer** — helpers.js, selectors.js, validators.js

---

## Key Files

| File | Lines | Purpose |
|------|-------|---------|
| `manifest.json` | 75 | Extension manifest (MV3, permissions, content scripts) |
| `background.js` | 482 | Service worker — orchestrates extraction, handles messages, manages state |
| `content.js` | 607 | Content script — DOM scraping, auto-scroll, data parsing |
| `sorry.js` | 347 | Anti-bot / Cloudflare "sorry" page detection and recovery |
| `popup.html` | 248 | Popup UI structure |
| `popup.js` | 379 | Popup logic — controls extraction, handles UI events |
| `popup.css` | 511 | Popup styles (dark/light theme support) |
| `export.js` | 138 | CSV/XLSX/JSON export via Blob downloads |
| `storage.js` | 164 | chrome.storage.local wrapper for settings and results |
| `helpers.js` | 198 | Shared utility functions |
| `selectors.js` | 150 | CSS selectors, regex patterns, platform lists |
| `validators.js` | 102 | Data validation and normalization |

---

## Features

### Core Extraction
- **DOM-based scraping** — parses Google Maps HTML directly (no XHR interception)
- **Auto-scroll** — scrolls results panel to load all listings (DOM scroll + MutationObserver)
- **Email extraction** — fetches business websites and extracts emails (including Cloudflare `__cf_email__` decoding)
- **Social media extraction** — Facebook, Instagram, LinkedIn, Twitter/X, YouTube
- **CID extraction** — from `data-cid` attribute and URL parameters
- **Place ID extraction** — from Google Maps URL

### Reliability
- **Anti-bot detection** — monitors `webRequest` for `/sorry` URLs and checks tab content
- **Sorry.js recovery** — dedicated handler for Cloudflare/Google CAPTCHA challenges
- **Resume capability** — saves scroll position every 5s; can resume interrupted extractions
- **Retry logic** — retries failed website fetches with configurable attempts
- **Consecutive error tracking** — stops after threshold errors to prevent infinite loops

### Data Management
- **Duplicate removal** — by name+address+phone, CID, URL, and name combinations
- **Progress tracking** — count, errors, duplicates, progress bar
- **Filters** — rating and review count filters
- **Download history** — tracks previous exports in storage

### Export
- **CSV** — standard comma-separated via Blob download
- **XLSX** — via SheetJS library
- **JSON** — structured data export

### UI
- **Dark/Light theme** — toggle with persistent preference
- **Log console** — real-time extraction log display
- **Pause / Resume / Stop** — full extraction lifecycle control

---

## Dependencies

- **SheetJS (xlsx)** — bundled for XLSX export
- **Chrome APIs** — storage.local, tabs, scripting, webRequest, alarms

---

## Manifest V3 Compliance

- Service worker background (no persistent background page)
- `host_permissions` for Google Maps domains
- Content scripts injected at `document_idle`
- No remote code execution (all scripts local)

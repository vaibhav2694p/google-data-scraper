# Feature Comparison — GMB-Scraper vs maps-extractor

## Summary

`maps-extractor` is a rebuilt Manifest V3 extension that integrates all core features from the reference `GMB-Scraper-main` project, drops unnecessary components (auth, XHR interception, toolbar overlay), and adds several new capabilities.

---

## Full Comparison

| Feature | GMB-Scraper | maps-extractor | Status |
|---------|-------------|----------------|--------|
| **Auto-scroll** | ✅ DOM scroll | ✅ DOM scroll + MutationObserver | Integrated |
| **Email extraction** | ✅ Website fetch + CF decode | ✅ Website fetch + CF decode | Integrated |
| **Social media extraction** | ✅ 5 platforms | ✅ 5 platforms | Integrated |
| **Anti-bot /sorry detection** | ✅ webRequest + tab monitoring | ✅ webRequest + tab monitoring | Integrated |
| **CID extraction** | ✅ From data-cid | ✅ From data-cid + URL | Integrated |
| **Place ID extraction** | ✅ From APP_INITIALIZATION_STATE | ✅ From URL | Integrated |
| **Duplicate removal** | ✅ By CID/place_id | ✅ By name+address+phone, CID, URL, name | Integrated (better) |
| **Resume capability** | ✅ Storage-based | ✅ Storage + position save every 5s | Integrated (better) |
| **Export CSV** | ✅ Via dashboard.html | ✅ Via popup (Blob download) | Integrated (simpler) |
| **Export XLSX** | ✅ Via dashboard.html | ✅ Via popup (SheetJS) | Integrated (simpler) |
| **Export JSON** | ❌ | ✅ | Added |
| **Progress tracking** | ❌ Basic | ✅ Full (count, errors, duplicates, progress bar) | Added |
| **Pause / Resume / Stop** | ❌ | ✅ | Added |
| **Error handling** | ❌ Minimal | ✅ Retry, consecutive error tracking | Added |
| **Filters (rating, reviews)** | ❌ | ✅ | Added |
| **Theme support** | ❌ | ✅ Dark/Light | Added |
| **Log console** | ❌ | ✅ | Added |
| **Download history** | ❌ | ✅ | Added |
| **XHR interception** | ✅ | ❌ | Not needed (DOM approach works) |
| **APP_INITIALIZATION_STATE parsing** | ✅ | ❌ | Not needed (DOM approach works) |
| **Toolbar overlay** | ✅ | ❌ | Not needed (popup UI is better) |
| **Review extraction** | ✅ | ❌ | Not requested |
| **Login/Auth system** | ✅ | ❌ | Intentionally removed |
| **Subscription/Payment** | ✅ | ❌ | Intentionally removed |
| **Search input in popup** | ✅ | ❌ | **Needs to be added** |
| **Leads Demo Data link** | ✅ | ❌ | **Needs to be added** |
| **Video Showcase link** | ✅ | ❌ | Optional |

---

## What Was Intentionally Dropped

| Component | Reason |
|-----------|--------|
| XHR interception (injected.js) | DOM-based scraping is more reliable in MV3; no need to intercept network requests |
| APP_INITIALIZATION_STATE parsing | URL-based Place ID extraction is simpler and sufficient |
| Toolbar overlay UI | Popup UI provides better UX; overlay conflicts with Maps UI |
| Review extraction | Not requested by stakeholders |
| Auth / Login system | Not needed; extension should work without accounts |
| Subscription / Payment | Not needed; extension is a standalone tool |

---

## What Was Added Beyond Reference

| Feature | Description |
|---------|-------------|
| JSON export | Structured data format alongside CSV/XLSX |
| Full progress tracking | Live count, error count, duplicate count, progress bar |
| Pause / Resume / Stop | Complete extraction lifecycle control |
| Retry with error tracking | Configurable retries, consecutive error threshold |
| Rating & review filters | Filter businesses by minimum rating or review count |
| Dark/Light theme | Persistent theme preference |
| Log console | Real-time extraction log in popup |
| Download history | Tracks all previous exports |
| Improved duplicate removal | Four strategies: name+address+phone, CID, URL, name |
| Position-based resume | Saves scroll position every 5 seconds for reliable resume |

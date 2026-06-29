# Google Data Scraper

> Professional Chrome extension for extracting business data from Google Maps. XHR interception-based for maximum reliability.

![Version](https://img.shields.io/badge/version-2.2.0-blue)
![Chrome MV3](https://img.shields.io/badge/Chrome-MV3-green)

## How It Works

Unlike DOM-scraping approaches that click each card individually, this extension **intercepts Google Maps XHR API responses** directly. When Google Maps loads search results, it makes API calls — we capture those responses and extract all business data instantly.

```
Google Maps XHR → injected.js captures → content.js processes → background.js stores → popup shows
```

## Features

- **XHR interception** — Captures data from Google Maps API responses (not DOM)
- **Unlimited auto-scroll** — Scrolls continuously until all results loaded
- **Deep email extraction** — Crawls business websites for contact emails
- **Social media discovery** — Instagram, Facebook, YouTube, LinkedIn, Twitter/X
- **Cloudflare email decode** — Decodes `data-cfemail` protected emails
- **Resume capability** — Pause and resume without losing progress
- **Smart deduplication** — Prevents duplicates using CID and name
- **Multi-format export** — CSV, XLSX (SheetJS), JSON
- **Dark/Light themes** — Toggle between themes

## Data Fields

| Field | Source |
|-------|--------|
| Business Name | XHR API |
| Category | XHR API |
| Rating | XHR API |
| Reviews | XHR API |
| Phone | XHR API |
| Email | Website crawl |
| Website | XHR API |
| Address | XHR API |
| Google Maps URL | Generated from CID |
| Latitude | XHR API |
| Longitude | XHR API |
| Working Hours | XHR API |
| CID | XHR API |
| Place ID | XHR API |
| Instagram | Website crawl |
| Facebook | Website crawl |
| YouTube | Website crawl |
| LinkedIn | Website crawl |
| Twitter/X | Website crawl |

## Installation

1. Clone this repository
2. Open Chrome → `chrome://extensions/`
3. Enable **Developer mode**
4. Click **Load unpacked**
5. Select the `maps-extractor` folder (inner folder with `manifest.json`)

## Usage

1. Open Google Maps and search for businesses (e.g., "accounting firm near new york")
2. Click the extension icon
3. Click **Start Auto Extract**
4. Watch progress in the popup
5. Export as CSV, XLSX, or JSON

## Architecture

```
maps-extractor/
├── manifest.json          # MV3 manifest
├── background.js          # Service worker (email extraction, storage)
├── sorry.js               # Anti-bot /sorry detection
├── contentScript2.js      # XHR interceptor injector (document_start)
├── injected.js            # XMLHttpRequest prototype override
├── content.js             # XHR data processor + auto-scroll
├── popup.html             # Dashboard UI
├── popup.css              # Dashboard styles
├── popup.js               # Dashboard controller
├── storage.js             # Chrome storage wrapper
├── export.js              # CSV/XLSX/JSON export
├── utils/
│   ├── helpers.js         # Utilities
│   ├── selectors.js       # DOM selectors
│   └── validators.js      # Field validation
├── libs/
│   └── xlsx.full.min.js   # SheetJS
└── assets/                # Extension icons
```

## XHR Interception Flow

1. `contentScript2.js` injects `injected.js` at `document_start`
2. `injected.js` patches `XMLHttpRequest.prototype.open/send`
3. When Google Maps makes `/search` XHR calls, the response is captured
4. Response is posted to `content.js` via `window.postMessage`
5. `content.js` parses `data[64]` array for all business fields
6. Auto-scroll triggers new `/search` XHR calls automatically

## Privacy

- Public data only
- No authentication required
- All data stays in your browser
- No tracking or analytics

## Version History

| Version | Changes |
|---------|---------|
| **v2.2.0** | Rewrote content.js to XHR-only extraction, fixed auto-scroll, fixed email extraction speed |
| **v2.1.0** | Added XHR interception, fixed 20-record limit, added email scraping |
| **v2.0.1** | Fixed sorry.js context, host permissions, Cloudflare email decode |
| **v2.0.0** | Deep email/social extraction, CID & Place ID, anti-bot detection |

## Credits

Created by **Vaibhav Patel**

- [LinkedIn](https://www.linkedin.com/in/vaibhav-patel-b14267227/)
- [Portfolio](https://vaibhav2694p.github.io/vaibhav-portfolio-v2/)
- [GitHub](https://github.com/vaibhav2694p)

## License

MIT License - Use responsibly and ethically.

# Google Data Scraper

> Professional Chrome extension for extracting business data from Google Maps with deep email/social media extraction.

![Version](https://img.shields.io/badge/version-2.1.0-blue)
![Chrome MV3](https://img.shields.io/badge/Chrome-MV3-green)
![License](https://img.shields.io/badge/license-MIT-orange)

## Features

- **Unlimited auto-scroll** - Scrapes all available results, not just 20
- **XHR interception** - Captures search results directly from Google Maps API responses
- **Deep email extraction** - Crawls business websites and contact pages for emails
- **Social media discovery** - Instagram, Facebook, YouTube, LinkedIn, Twitter/X
- **Anti-bot detection** - Detects Google /sorry verification pages
- **Resume capability** - Pause and resume without losing progress
- **Smart deduplication** - Prevents duplicate entries using name, address, CID
- **Multi-format export** - CSV, XLSX (SheetJS), JSON
- **Dark/Light themes** - Toggle between themes

## Data Fields

| Field | Description |
|-------|-------------|
| Business Name | Company name |
| Category | Business category |
| Rating | Star rating (1-5) |
| Reviews | Number of reviews |
| Phone | Phone number |
| Email | Contact email from website |
| Website | Business website URL |
| Address | Full street address |
| Google Maps URL | Direct Maps link |
| Latitude | GPS latitude |
| Longitude | GPS longitude |

## Installation

1. Clone this repository
2. Open Chrome → `chrome://extensions/`
3. Enable **Developer mode**
4. Click **Load unpacked**
5. Select the `maps-extractor` folder (inner folder with manifest.json)

## Usage

1. Open Google Maps and search for businesses
2. Click the extension icon
3. Click **Start Auto Extract** or **Start**
4. Monitor progress in the popup
5. Export as CSV, XLSX, or JSON

## Architecture

```
maps-extractor/
├── manifest.json          # Chrome extension manifest (MV3)
├── background.js          # Service worker (deep extraction, anti-bot)
├── sorry.js               # Anti-bot /sorry detection
├── content.js             # DOM extraction + auto-scroll + XHR handler
├── contentScript2.js      # XHR interceptor injector
├── injected.js            # XMLHttpRequest prototype override
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

## How It Works

1. **XHR Interception**: `injected.js` patches `XMLHttpRequest.prototype` to capture Google Maps search API responses
2. **Data Extraction**: `content.js` processes intercepted data and extracts business fields
3. **Deep Email**: `background.js` fetches business websites to find emails and social links
4. **Anti-Bot**: `sorry.js` monitors for Google verification pages via `webRequest` API

## Privacy

- Public data only
- No authentication required
- All data stays in your browser
- No tracking or analytics

## Version History

| Version | Changes |
|---------|---------|
| **v2.1.0** | Added XHR interception, fixed 20-record limit (now unlimited), added email scraping, integrated GMB features |
| **v2.0.1** | Fixed sorry.js context, host permissions, Cloudflare email decode |
| **v2.0.0** | Deep email/social extraction, CID & Place ID, anti-bot detection |

## Credits

Created by **Vaibhav Patel**

- [LinkedIn](https://www.linkedin.com/in/vaibhav-patel-b14267227/)
- [Portfolio](https://vaibhav2694p.github.io/vaibhav-portfolio-v2/)
- [GitHub](https://github.com/vaibhav2694p)

## License

MIT License - Use responsibly and ethically.

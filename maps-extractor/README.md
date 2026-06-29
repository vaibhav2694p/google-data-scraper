# Maps Lead Extractor - Business Data Tool

A professional Chrome extension for extracting business data from Google Maps. Collects publicly visible listings with deep email and social media extraction, then exports to CSV, XLSX, or JSON.

## Features

### Core Functionality
- **Auto-scrolling**: Automatically scrolls through Google Maps search results
- **Smart deduplication**: Prevents duplicate entries using name, address, and CID
- **Resume capability**: Pauses and resumes extraction without losing progress
- **Batch processing**: Processes cards in batches for reliability
- **Error recovery**: Automatically retries failed extractions

### Data Extraction
- Business name, category, rating, review count
- Full address, phone number, website URL
- Working hours (when available)
- Latitude/longitude coordinates
- Google Maps URL
- **CID (Customer ID)** - Unique Google identifier
- **Place ID** - Google Places identifier
- **Deep email extraction** - Crawls business websites for contact emails
- **Social media links** - Instagram, Facebook, YouTube, LinkedIn, Twitter/X

### Anti-Bot Protection
- **Sorry page detection**: Monitors for Google's anti-bot verification pages
- **Redirect chain tracking**: Follows redirect chains to detect verification
- **Automatic tab management**: Opens verification tabs and monitors completion
- **Cooldown periods**: Waits appropriate time after verification

### Export Options
- **CSV**: Excel-compatible with UTF-8 BOM
- **XLSX**: Full Excel workbook with auto-sized columns (SheetJS)
- **JSON**: Raw structured data for developers

### User Interface
- **Dark/Light themes**: Toggle between themes
- **Live progress**: Real-time extraction statistics
- **Log console**: Detailed extraction logs
- **History**: Track recent downloads
- **Responsive design**: Modern, intuitive interface

## Installation

### From GitHub (Recommended)

1. Clone or download this repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" (top right toggle)
4. Click "Load unpacked"
5. Select the `maps-extractor` folder (the inner folder with manifest.json)

### Usage

1. Open Google Maps and search for businesses (e.g., "restaurants in New York")
2. Click the Maps Lead Extractor icon in your toolbar
3. Configure settings (keyword, filters, delays)
4. Click "Start" to begin extraction
5. Monitor progress in the popup
6. Export data when complete

## Configuration

### Basic Settings
- **Search keyword tag**: Label for this extraction session
- **Min rating**: Filter by minimum star rating
- **Min reviews**: Filter by minimum review count
- **Required fields**: Skip listings missing these fields

### Advanced Settings
- **Scroll delay (ms)**: Delay between scrolling (500-10000ms)
- **Max results**: Maximum listings to extract (1-2000)
- **Auto-save progress**: Save progress automatically
- **Remove duplicates**: Skip already-extracted listings
- **Random delay jitter**: Add randomness to avoid bot detection
- **Deep email/social extraction**: Crawl business websites for contacts

## Architecture

### File Structure
```
maps-extractor/
├── manifest.json          # Chrome extension manifest (MV3)
├── background.js          # Service worker (imports sorry.js, message relay, deep extraction)
├── sorry.js               # Anti-bot /sorry detection (background ONLY via importScripts)
├── content.js             # Content script (DOM extraction, auto-scroll)
├── popup.html             # Dashboard UI markup
├── popup.css              # Dashboard styles
├── popup.js               # Dashboard controller
├── storage.js             # Chrome storage wrapper
├── export.js              # CSV/XLSX/JSON export logic
├── utils/
│   ├── helpers.js         # Shared utilities (safeSendMessage, sleep, retry)
│   ├── selectors.js       # DOM selectors + social patterns
│   └── validators.js      # Field validation
├── libs/
│   └── xlsx.full.min.js   # SheetJS library (real, 945KB)
└── assets/                # Extension icons
```

### Message Flow
```
Popup (popup.js)
    ↓ MLE_START
Background (background.js)
    ↓ MLE_START + existing data
Content (content.js)
    ↓ MLE_RECORDS / MLE_PROGRESS
Background
    ↓ MLE_RECORDS_RELAY / MLE_PROGRESS_RELAY
Popup (live updates)
```

### Key Features

#### Deep Email Extraction
When enabled, the extension:
1. Fetches the business website
2. Scans for email addresses in HTML
3. Visits common contact pages (/contact, /about, etc.)
4. Filters out irrelevant emails (noreply, image files, etc.)
5. Prioritizes emails matching the business domain

#### Anti-Bot Detection
The extension monitors for Google's verification pages:
1. Tracks redirect chains via webRequest API
2. Detects /sorry URLs in redirects
3. Opens verification tab for user completion
4. Monitors tab until verification completes
5. Applies cooldown before continuing

#### Resume Capability
Extraction state is persisted:
- Processed card index
- Scroll position
- Feed height
- Dedup sets (names, URLs, CIDs)
- Existing dataset

## Technical Details

### Chrome APIs Used
- `storage.local`: Persistent data storage
- `tabs`: Tab management for verification
- `alarms`: Keepalive for service worker
- `webRequest`: Redirect monitoring
- `runtime.sendMessage`: Message passing

### MV3 Considerations
- Service worker 30s idle timeout handled via keepalive alarm
- All state persisted to storage
- Safe message passing with error handling
- No eval() usage (security compliant)

## Privacy & Ethics

- **Public data only**: Extracts only publicly visible information
- **No authentication**: Does not require login or API keys
- **Local storage**: All data stays in your browser
- **No tracking**: No analytics or telemetry
- **Rate limiting**: Built-in delays to be respectful

## Version History

### v2.0.1 (Latest)
- **Fixed**: sorry.js was loaded in content_scripts instead of background service worker (chrome.webRequest only works in background)
- **Fixed**: Host permissions now include `*://*/*` so deep email extraction can fetch arbitrary business websites
- **Fixed**: Removed forbidden User-Agent header from service worker fetch (browsers block this)
- **Added**: Cloudflare email decoding (`data-cfemail` attribute) from GMB-Scraper
- **Added**: Social link normalization (instagram.com→www.instagram.com, facebook.com→www.facebook.com, etc.)
- **Added**: `/sorry` page detection during deep website extraction (was silently failing before)
- **Fixed**: Version mismatch between footer (v1.0.0) and manifest (v2.0.0)

### v2.0.0
- Merged best features from GMB-Scraper
- Added deep email/social extraction
- Added CID and Place ID extraction
- Added anti-bot /sorry detection
- Fixed XLSX export (real SheetJS)
- Added deep email search toggle
- Improved error handling

### v1.0.0
- Initial release
- Basic DOM extraction
- CSV/JSON export
- Resume capability

## Credits

Created by **Vaibhav Patel**

## License

MIT License - Use responsibly and ethically.

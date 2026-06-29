# Implementation Plan — maps-extractor

## Overview

This plan addresses remaining gaps and code quality issues identified during the GMB-Scraper integration. Priorities are ordered by user impact and effort.

---

## Priority 1: Add Search Bar to Popup

**Impact:** High — directly improves daily usability
**Effort:** Low — ~50 lines across 3 files

### Changes

#### popup.html
- Add a search input field above the extraction controls
- Add a "Search" button next to the input
- Wrap in a new `.search-bar` container div

```html
<div class="search-bar">
  <input type="text" id="searchInput" placeholder="Search business on Maps...">
  <button id="searchBtn">Search</button>
</div>
```

#### popup.js
- Read `searchInput` value on button click or Enter key
- Encode the query and construct a Google Maps search URL
- Use `chrome.tabs.update()` to navigate the active tab to the search URL
- Optional: close the popup after navigation

```js
searchBtn.addEventListener('click', () => {
  const query = searchInput.value.trim();
  if (!query) return;
  const url = `https://www.google.com/maps/search/${encodeURIComponent(query)}`;
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    chrome.tabs.update(tabs[0].id, { url });
  });
});
```

#### popup.css
- Style the search bar to match existing UI (dark theme, border radius, spacing)
- Ensure input and button are vertically aligned

---

## Priority 2: Add Demo Data Link

**Impact:** Low — useful for demonstrations only
**Effort:** Minimal — ~10 lines in 2 files

### Changes

#### popup.html
- Add a small link or button below the search bar or in the footer
- Text: "Leads Demo Data" or similar
- Links to a predefined demo dataset URL (or loads a sample JSON from extension storage)

#### popup.js
- Add click handler for the demo link
- Either navigate to an external URL or populate storage with sample data and trigger the UI to display it

---

## Priority 3: Code Cleanup

**Impact:** Medium — reduces maintenance burden and eliminates confusion
**Effort:** Low — refactor only, no new features

### 3a. Remove Duplicate Patterns from background.js

| Constant | Keep In | Remove From |
|----------|---------|-------------|
| `SOCIAL_MEDIA_PATTERNS` | selectors.js | background.js |
| `EMAIL_BLACKLIST` | selectors.js | background.js |
| `CONTACT_PAGE_PATHS` | selectors.js | background.js |

In `background.js`, import from `selectors.js` via `chrome.runtime.sendMessage` or inline the import at the top of the file.

### 3b. Remove Dead Code

| Function | File | Action |
|----------|------|--------|
| `monitorVerificationTab()` | sorry.js:~line 200 | Delete entirely |
| `hash()` | helpers.js:~line 150 | Delete entirely |

### 3c. Fix `deepEmailSearch` Default

In `storage.js`, add to the defaults object:
```js
const DEFAULTS = {
  // ... existing defaults
  deepEmailSearch: true
};
```

### 3d. Fix `countValid` Statistic

In `popup.js`, either:
- **Option A:** Rename to `countProcessed` to accurately reflect what it measures
- **Option B:** Track a separate `validatedCount` variable that only increments when an entry passes all validation checks, and display that instead

Recommend Option B for accuracy.

---

## Priority 4: Documentation

**Impact:** Low — project reference material
**Effort:** Low

### Tasks
- [ ] Update `README.md` with:
  - Complete setup instructions (clone, load unpacked, permissions)
  - Feature list with screenshots
  - Usage guide (search, extract, export)
  - Troubleshooting section
- [ ] Create `FINAL_REPORT.md` summarizing the integration project:
  - What was built
  - What was integrated from GMB-Scraper
  - What was intentionally excluded
  - Known issues and future work

---

## Execution Order

```
Priority 1 (Search Bar)  ──→  Priority 2 (Demo Link)  ──→  Priority 3 (Cleanup)  ──→  Priority 4 (Docs)
```

Each priority should be completed and tested before moving to the next. Priority 1 and 2 can be developed in parallel since they touch different parts of the UI.

---

## Testing Checklist

After each priority:
- [ ] Load unpacked extension in Chrome
- [ ] Verify popup renders correctly (dark and light themes)
- [ ] Test extraction on a real Google Maps search
- [ ] Verify export (CSV, XLSX, JSON) works
- [ ] Check console for errors
- [ ] Verify storage operations complete without errors

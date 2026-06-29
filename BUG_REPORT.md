# Bug Report — maps-extractor

## Previously Fixed Bugs (v2.0.1)

| # | Bug | Fix |
|---|-----|-----|
| 1 | `sorry.js` loaded in `content_scripts` instead of `background` | Moved to background service worker |
| 2 | Host permissions too restrictive for deep extraction | Expanded `host_permissions` to cover business websites |
| 3 | `User-Agent` forbidden header in service worker fetch | Removed `User-Agent` header (browser sets it automatically) |
| 4 | Version mismatch between footer and manifest.json | Synchronized version string |
| 5 | Missing Cloudflare `__cf_email__` decoding | Added hex decoding for CF-protected emails |
| 6 | Missing social link normalization (trailing slashes, query params) | Added `normalizeSocialLink` in helpers.js |
| 7 | `deepExtractFromWebsite` not using sorry detection | Integrated sorry check before/after website fetch |

---

## Remaining Issues

### 1. No Search Bar in Popup

**Severity:** Medium
**File:** popup.html, popup.js

User cannot search for a business directly from the popup. They must manually navigate to Google Maps, search, then open the popup to extract. Adding a search input and button that opens a Google Maps search URL in the active tab would significantly improve UX.

**Expected:** Search input field + button → `window.open('https://www.google.com/maps/search/...')` or update active tab.

---

### 2. Duplicate Patterns Between selectors.js and background.js

**Severity:** Low (maintenance risk)
**Files:** selectors.js, background.js

The following constants are defined in both files:
- `SOCIAL_MEDIA_PATTERNS` — regex patterns for social platforms
- `EMAIL_BLACKLIST` — domains to ignore during email extraction
- `CONTACT_PAGE_PATHS` — paths to check for contact pages

Changes to one file won't propagate to the other, creating drift risk.

**Fix:** Remove duplicates from `background.js` and import from `selectors.js`.

---

### 3. normalizeSocialLink Inconsistency

**Severity:** Low
**Files:** selectors.js, background.js

Two versions exist:
- `selectors.js` — simpler version (basic URL parsing)
- `background.js` — more robust version (handles edge cases, trailing slashes, query params)

The background.js version is superior but selectors.js version may be used by other modules.

**Fix:** Consolidate to the robust version in a single location (helpers.js or selectors.js) and use everywhere.

---

### 4. No Error Handling in storage.js

**Severity:** Medium
**File:** storage.js

All `chrome.storage.local` operations (`get`, `set`) lack error callbacks. If storage is full or corrupted, errors are silently swallowed.

```js
// Current (no error handling)
chrome.storage.local.set({ key: value });

// Should be
chrome.storage.local.set({ key: value }, () => {
  if (chrome.runtime.lastError) {
    console.error('Storage error:', chrome.runtime.lastError);
  }
});
```

---

### 5. `deepEmailSearch` Default Inconsistency

**Severity:** Low
**Files:** storage.js, popup.js

- `storage.js` defaults object does **not** include `deepEmailSearch`
- `popup.js` initializes it as `true` when not found in storage

This means the default value depends on which code path runs first, leading to inconsistent behavior.

**Fix:** Add `deepEmailSearch: true` to the defaults object in `storage.js`.

---

### 6. Dead Code

**Severity:** Low
**Files:** sorry.js, helpers.js

| Code | File | Issue |
|------|------|-------|
| `monitorVerificationTab()` | sorry.js | Defined but never called; monitoring is handled via `webRequest` listener |
| `hash()` | helpers.js | Utility function for hashing; never used anywhere in the codebase |

**Fix:** Remove both functions to reduce code size and confusion.

---

### 7. `countValid` Statistic Is Misleading

**Severity:** Low
**File:** popup.js

The `countValid` stat is calculated as:
```js
countValid = totalCount - errorCount
```

This does **not** represent actually validated entries. It represents entries that didn't error — but some may have been duplicates, empty, or incomplete.

**Fix:** Either rename to `countProcessed` or track actual validation passes separately.

---

### 8. Obfuscated CSS Selectors

**Severity:** High (fragile)
**Files:** selectors.js, content.js

Google Maps uses dynamically generated class names (e.g., `.Nv2PK`, `.qBF1Pd`, `.fontHeadlineSmall`). These will break whenever Google updates their UI.

**Impact:** Entire extraction could fail silently on UI updates.

**Mitigation:** This is an inherent limitation of DOM scraping. Consider:
- Adding a selector validation check on extension startup
- Making selectors configurable via storage
- Providing a fallback message when selectors fail

---

## Summary

| Severity | Count | Status |
|----------|-------|--------|
| High | 1 | Open (inherent limitation) |
| Medium | 2 | Open |
| Low | 5 | Open |
| Fixed | 7 | Closed |

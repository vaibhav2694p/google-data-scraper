/* =====================================================
   selectors.js — DOM selector map for Google Maps
   Centralised so future UI changes are a one-file fix.
   Google's class names are obfuscated and change often;
   we rely on stable role / aria / href patterns where possible.
   Extended with CID, place_id, kg_id, working hours selectors.
   ===================================================== */

(function (global) {
  'use strict';

  const SELECTORS = {
    // ---- Results list (left pane) ----
    resultsFeed: 'div[role="feed"]',
    resultCard:  'div[role="feed"] > div > div[jsaction]',
    resultLink:  'a.hfpxzc',                 // primary clickable card link
    resultName:  'div.qBF1Pd, div.fontHeadlineSmall',

    // Pagination "end of list" marker
    feedEnd: '.HlvSq, span.HlvSq, p.fontBodyMedium > span',

    // ---- Detail pane (after clicking a card) ----
    detailRoot:        'div[role="main"]',
    detailName:        'h1.DUwDvf, h1.fontHeadlineLarge',
    detailRating:      'div.F7nice span[aria-hidden="true"]',
    detailReviews:     'div.F7nice span[aria-label*="review"], div.F7nice span[aria-label*="отзыв"]',
    detailCategory:    'button[jsaction*="category"], div.LBgpqf button.DkEaL',
    detailAddress:     'button[data-item-id="address"]',
    detailPhone:       'button[data-item-id^="phone"], button[aria-label*="Phone"]',
    detailWebsite:     'a[data-item-id="authority"], a[aria-label*="Website"]',
    detailHoursButton: 'div[aria-label*="Hours"], button[data-item-id="oh"]',
    detailHoursTable:  'table.eK4R0e tbody tr',
    detailPlusCode:    'button[data-item-id="oloc"]',

    // ---- Extended fields (CID, place_id, kg_id) ----
    // These are extracted from page data, not DOM selectors
    cidDataAttr:       '[data-cid]',
    placeIdButton:     'button[data-item-id*="place"]',

    // ---- Social links inside detail (best-effort) ----
    socialLinks: 'a[href*="facebook.com"], a[href*="instagram.com"], a[href*="twitter.com"], a[href*="linkedin.com"], a[href*="x.com"], a[href*="youtube.com"], a[href*="tiktok.com"]',

    // ---- Email extraction ----
    emailLink: 'a[href^="mailto:"]',

    // Close detail button
    backButton: 'button[aria-label*="Back"], button.hYBOP',

    // ---- Reviews panel ----
    reviewsPanel: '#reviews-panel',
    reviewItem: '.jftiEf',
    reviewAuthor: '.d4r55',
    reviewText: '.wiI7pd',
    reviewRating: '.kvMYJc',
    reviewDate: '.rsqaWe',
    reviewSortButton: 'button[data-sort="0"]',
    reviewNextPage: 'button[aria-label*="Next"]',
  };

  /**
   * Social media regex patterns for deep email/social extraction.
   * Used by content.js when extracting from business websites.
   */
  const SOCIAL_MEDIA_PATTERNS = {
    instagram: /(((http|https):\/\/)?((www\.)?(?:instagram.com|instagr.am)\/([A-Za-z0-9_.]{2,30})))/ig,
    facebook:  /(?:https?:)?\/\/(?:www\.)?(?:facebook|fb)\.com\/((?![A-z]+\.php)(?!marketplace|gaming|watch|me|messages|help|search|groups)[A-z0-9_\-\.]+)\/?/ig,
    youtube:   /(?:https?:)?\/\/(?:[A-z]+\.)?youtube\.com\/(channel\/([A-z0-9-_]+)|user\/([A-z0-9]+))\/?/ig,
    linkedin:  /(?:https?:)?\/\/(?:[\w]+\.)?linkedin\.com\/((company|school)\/[A-z0-9-\u00c0-\u00ff\.]+|in\/[\w\-_\u00c0-\u00ff%]+)\/?/ig,
    twitter:   /(?:(?:http|https):\/\/)?(?:www.)?(?:twitter\.com|x\.com)\/(?!(oauth|account|tos|privacy|signup|home|hashtag|search|login|widgets|i|settings|start|share|intent|oct)(['"\?\.\/]|$))([A-Za-z0-9_]{1,15})/igm,
    email:     /\b[A-Z0-9._%+-]{1,64}@(?!-)(?:[A-Z0-9-]+\.)+[A-Z]{2,63}\b/gi,
  };

  /**
   * Contact page paths for deep email extraction.
   */
  const CONTACT_PAGE_PATHS = '/contact /contact-us /contact-me /about /about-me /about-us /team /our-team /meet-the-team /support /customer-service /feedback /help /sales /return /location /faq'.split(' ');

  /**
   * Email blacklist to skip irrelevant addresses.
   */
  const EMAIL_BLACKLIST = new Set('.png .jpg .jpeg .gif .webp wixpress.com sentry.io noreply abuse no-reply subscribe mailer-daemon domain.com email.com yourname wix.com'.split(' '));

  /**
   * Extract latitude / longitude from the current Google Maps URL.
   * URL pattern: .../@<lat>,<lng>,<zoom>z/...
   * @returns {{lat: string, lng: string} | null}
   */
  function parseLatLngFromUrl(url) {
    const m = (url || location.href).match(/@(-?\d+\.\d+),(-?\d+\.\d+),/);
    if (!m) return null;
    return { lat: m[1], lng: m[2] };
  }

  /**
   * Pull the clean Maps place URL out of an anchor.
   */
  function cleanPlaceUrl(href) {
    if (!href) return '';
    try {
      const u = new URL(href, location.origin);
      ['sa', 'ved', 'usg'].forEach((p) => u.searchParams.delete(p));
      return u.toString();
    } catch (_) {
      return href;
    }
  }

  /**
   * Extract CID from the current page's data attributes or scripts.
   */
  function extractCID() {
    // Try from data-cid attribute
    const cidEl = document.querySelector('[data-cid]');
    if (cidEl) return cidEl.getAttribute('data-cid');

    // Try from URL
    const urlMatch = location.href.match(/cid=(\d+)/);
    if (urlMatch) return urlMatch[1];

    return '';
  }

  /**
   * Normalize a social media link.
   */
  function normalizeSocialLink(link) {
    if (!link) return '';
    try {
      if (link.startsWith('//')) link = 'https:' + link;
      if (!link.startsWith('http')) link = 'https://' + link;
      const url = new URL(link);
      if (url.protocol === 'http:' || url.protocol === '') url.protocol = 'https:';
      if (url.pathname.endsWith('/')) url.pathname = url.pathname.slice(0, -1);
      return url.toString();
    } catch (_) {
      return '';
    }
  }

  global.MLE_Selectors = {
    SELECTORS,
    SOCIAL_MEDIA_PATTERNS,
    CONTACT_PAGE_PATHS,
    EMAIL_BLACKLIST,
    parseLatLngFromUrl,
    cleanPlaceUrl,
    extractCID,
    normalizeSocialLink,
  };
})(typeof window !== 'undefined' ? window : self);

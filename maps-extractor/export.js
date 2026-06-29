/* =====================================================
   export.js — Export dataset to CSV / XLSX / JSON
   Used inside popup context. Triggers a browser download
   via Blob URLs (no host permission needed).
   ===================================================== */

(function (global) {
  'use strict';

  const COLUMNS = [
    { key: 'name',         label: 'Business Name' },
    { key: 'category',     label: 'Category' },
    { key: 'rating',       label: 'Rating' },
    { key: 'reviewsCount', label: 'Reviews' },
    { key: 'phone',        label: 'Phone' },
    { key: 'email',        label: 'Email' },
    { key: 'website',      label: 'Website' },
    { key: 'address',      label: 'Address' },
    { key: 'url',          label: 'Google Maps URL' },
    { key: 'lat',          label: 'Latitude' },
    { key: 'lng',          label: 'Longitude' },
    { key: 'hours',        label: 'Working Hours' },
    { key: 'social',       label: 'Social Links' },
    { key: 'cid',          label: 'CID' },
    { key: 'place_id',     label: 'Place ID' },
    { key: 'instagram',    label: 'Instagram' },
    { key: 'facebook',     label: 'Facebook' },
    { key: 'youtube',      label: 'YouTube' },
    { key: 'linkedin',     label: 'LinkedIn' },
    { key: 'twitter',      label: 'Twitter/X' },
    { key: 'keyword',      label: 'Search Keyword' },
    { key: 'extractedAt',  label: 'Extracted At' },
  ];

  /** Escape a single CSV cell per RFC4180. */
  function csvCell(v) {
    if (v == null) return '';
    const s = String(v);
    if (/[",\n\r]/.test(s)) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  }

  /** Build CSV string from record array. */
  function toCsv(records) {
    const header = COLUMNS.map((c) => csvCell(c.label)).join(',');
    const lines = records.map((r) =>
      COLUMNS.map((c) => csvCell(normalize(r[c.key]))).join(',')
    );
    // BOM so Excel detects UTF-8 correctly
    return '﻿' + [header, ...lines].join('\r\n');
  }

  /** Build a 2-D array of rows for SheetJS. */
  function toRows(records) {
    const head = COLUMNS.map((c) => c.label);
    const body = records.map((r) => COLUMNS.map((c) => normalize(r[c.key])));
    return [head, ...body];
  }

  /** Build JSON pretty-printed. */
  function toJson(records) {
    return JSON.stringify({ exportedAt: new Date().toISOString(), count: records.length, records }, null, 2);
  }

  /** Flatten arrays / objects into strings safe for spreadsheet cells. */
  function normalize(v) {
    if (v == null) return '';
    if (Array.isArray(v)) return v.join(' | ');
    if (typeof v === 'object') return JSON.stringify(v);
    return v;
  }

  /** Trigger a Blob download via anchor click. */
  function download(filename, blob) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(url);
      a.remove();
    }, 1000);
  }

  /** Export records to CSV file. */
  function exportCsv(records, baseName) {
    const blob = new Blob([toCsv(records)], { type: 'text/csv;charset=utf-8' });
    const file = baseName + '.csv';
    download(file, blob);
    return { file, size: blob.size, type: 'csv', count: records.length };
  }

  /** Export records to XLSX using SheetJS (must be loaded globally). */
  function exportXlsx(records, baseName) {
    if (typeof XLSX === 'undefined') {
      throw new Error('SheetJS (XLSX) library not loaded.');
    }
    const ws = XLSX.utils.aoa_to_sheet(toRows(records));

    // Auto-size columns
    const widths = COLUMNS.map((c, idx) => {
      let max = c.label.length;
      records.forEach((r) => {
        const v = String(normalize(r[c.key]) || '');
        if (v.length > max) max = v.length;
      });
      return { wch: Math.min(60, Math.max(10, max + 2)) };
    });
    ws['!cols'] = widths;

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Leads');

    const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const file = baseName + '.xlsx';
    download(file, blob);
    return { file, size: blob.size, type: 'xlsx', count: records.length };
  }

  /** Export records to JSON. */
  function exportJson(records, baseName) {
    const blob = new Blob([toJson(records)], { type: 'application/json;charset=utf-8' });
    const file = baseName + '.json';
    download(file, blob);
    return { file, size: blob.size, type: 'json', count: records.length };
  }

  global.MLE_Export = {
    COLUMNS,
    exportCsv, exportXlsx, exportJson,
    toCsv, toJson, toRows,
  };
})(typeof window !== 'undefined' ? window : self);

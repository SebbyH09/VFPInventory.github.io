/**
 * quoteParser.js
 *
 * First-pass parser for vendor quote PDFs.
 *
 * Unlike the Prendio PO parser (poParser.js), vendor quotes arrive in many
 * different layouts, so this parser is deliberately generic and forgiving. It
 * makes a best effort to pull out:
 *   - vendor name
 *   - quote number
 *   - quote date
 *   - expiration / "valid until" date
 *   - line items (catalog #, description, quantity, quoted price, list price)
 *
 * Anything it can't confidently extract is surfaced in `warnings` so the user
 * can correct it in the review screen before approving line items. The point of
 * this pass is to save typing, not to be perfect — the human approves.
 */

function parseQuoteData(rawText, metadata = {}) {
  if (!rawText || rawText.trim().length < 10) {
    throw new Error('quoteParser: Raw text is too short to parse.');
  }

  const quote = {
    vendor:         extractVendor(rawText, metadata),
    quoteNumber:    extractQuoteNumber(rawText),
    quoteDate:      extractQuoteDate(rawText),
    expirationDate: extractExpirationDate(rawText),
    lineItems:      extractLineItems(rawText),
    source:         'pdf_upload',
    fileName:       metadata.fileName || null,
    parsedAt:       new Date()
  };

  quote.warnings = validateQuote(quote);
  return quote;
}

// ─────────────────────────────────────────────
// HEADER FIELD EXTRACTORS
// ─────────────────────────────────────────────

/**
 * Vendor name. Quotes usually don't label their own name, so we try a few
 * heuristics: an explicit "Vendor:/Supplier:/From:" label, otherwise the first
 * non-empty line of the document (typically the letterhead / company name).
 */
function extractVendor(text, metadata) {
  const labeled = tryPatterns(text, [
    /vendor\s*[:]\s*(.+?)(?:\n|$)/i,
    /supplier\s*[:]\s*(.+?)(?:\n|$)/i,
    /(?:^|\n)\s*from\s*[:]\s*(.+?)(?:\n|$)/i,
    /prepared\s+by\s*[:]\s*(.+?)(?:\n|$)/i,
    /remit\s+to\s*[:]\s*(.+?)(?:\n|$)/i
  ]);
  if (labeled) return labeled;

  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

  // Many quotes lead with the CUSTOMER's name/address (near a "Customer #"),
  // not the vendor's. If we can see a customer marker, don't grab the top line
  // as the vendor — fall back to the vendor's web domain instead, which is a
  // much better hint (the user confirms it on the review screen anyway).
  const hasCustomerBlock = /customer\s*(?:#|no\.?|number|id)/i.test(text)
    || /bill\s+to|ship\s+to|sold\s+to/i.test(text);

  if (!hasCustomerBlock) {
    for (const line of lines) {
      if (/^(quote|quotation|estimate|proposal|date|page|line)\b/i.test(line)) continue;
      if (line.length >= 2 && line.length <= 80) return line;
    }
  }

  // Derive from a web address on the document (e.g. www.geneseesci.com).
  const domain = text.match(/(?:www\.)?([a-z0-9][a-z0-9\-]{1,})\.(?:com|net|org|co)\b/i);
  if (domain) return domain[1] + '.' + (domain[0].split('.').pop());

  return null;
}

/**
 * Quote number. "Quote #", "Quotation No.", "Quote Number", "Reference", etc.
 */
function extractQuoteNumber(text) {
  return tryPatterns(text, [
    /qu\w*\s*(?:#|number|no\.?|num)\s*[:]?\s*([A-Z0-9][A-Z0-9\-\/]*)/i,
    /quote\s*[:#]\s*([A-Z0-9][A-Z0-9\-\/]*)/i,
    /reference\s*(?:#|number|no\.?)?\s*[:]?\s*([A-Z0-9][A-Z0-9\-\/]*)/i,
    /estimate\s*(?:#|number|no\.?)?\s*[:]?\s*([A-Z0-9][A-Z0-9\-\/]*)/i
  ]);
}

/**
 * Quote date. Handles labelled dates and both M/D/YYYY and Month D, YYYY forms.
 */
function extractQuoteDate(text) {
  const numeric = tryPatterns(text, [
    /quote\s+date\s*[:]?\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i,
    /(?:print|issue|order)\s+date\s*[:]?\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i,
    /(?:^|\n)\s*date\s*[:]?\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i,
    /dated?\s*[:]?\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i
  ]);
  if (numeric) return normalizeDate(numeric);

  const worded = tryPatterns(text, [
    /quote\s+date\s*[:]?\s*([A-Z][a-z]+\.?\s+\d{1,2},?\s+\d{4})/i,
    /(?:^|\n)\s*date\s*[:]?\s*([A-Z][a-z]+\.?\s+\d{1,2},?\s+\d{4})/i
  ]);
  return worded ? normalizeWordedDate(worded) : null;
}

/**
 * Expiration / validity date. Vendors phrase this many ways:
 *   "Valid until 12/31/2026", "Expires: 12/31/2026", "Quote valid for 30 days"
 * When only a relative window ("valid for N days") is given, we compute it from
 * the quote date (or today, as a fallback).
 */
function extractExpirationDate(text) {
  const explicit = tryPatterns(text, [
    /(?:valid\s+(?:until|through|thru)|expir\w*|good\s+(?:until|through))(?:\s+date)?\s*[:]?\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i,
    /(?:valid\s+(?:until|through)|expir\w*)(?:\s+date)?\s*[:]?\s*([A-Z][a-z]+\.?\s+\d{1,2},?\s+\d{4})/i
  ]);
  if (explicit) {
    const iso = /\d{1,2}[\/\-]/.test(explicit) ? normalizeDate(explicit) : normalizeWordedDate(explicit);
    return iso ? new Date(iso + 'T00:00:00') : null;
  }

  // Relative: "valid for 30 days", "quote valid 45 days"
  const relMatch = text.match(/valid\s+(?:for\s+)?(\d{1,3})\s+days/i)
    || text.match(/(\d{1,3})\s+days?\s+(?:from\s+(?:quote\s+)?date|validity)/i);
  if (relMatch) {
    const days = parseInt(relMatch[1], 10);
    const base = extractQuoteDate(text);
    const start = base ? new Date(base + 'T00:00:00') : new Date();
    start.setDate(start.getDate() + days);
    return start;
  }

  return null;
}

// ─────────────────────────────────────────────
// LINE ITEM EXTRACTION
// ─────────────────────────────────────────────

/**
 * Best-effort line item extraction. We scan for lines that contain at least one
 * currency amount and try to pull out a catalog number, quantity and prices.
 * When two prices appear on a line we treat the smaller as the quoted (net)
 * price and the larger as the original / list price.
 */
function extractLineItems(text) {
  const lines = text.split('\n').map(l => l.replace(/\s+$/g, ''));

  // Prefer block-based extraction (each item spans several lines: a start line
  // with a line-number/catalog, then description lines, then a price line).
  const blockItems = extractBlockItems(lines, text);
  if (blockItems.length > 0) return blockItems;

  // Fallback: single-line items (description + prices on one line).
  return extractInlineItems(lines);
}

const PRICE_RE = /\$\s?[\d,]+\.\d{2}/g;
// Lines to skip inside a block but keep scanning past (repeating table headers,
// page breaks that appear between items on multi-page quotes).
const NOISE_RE = /^(line\s*#|product\b|list\s+price|your\s+price|qty\b|total\s+price|page\s+\d|--\s*\d+\s+of\s+\d+)/i;
// Lines that mark the END of the line-item table — stop the current block here
// so trailing totals/notes/footers never bleed into an item's description.
const STOP_RE = /^(sub\s*-?\s*total|total\b|tax\b|shipping\b|freight\b|grand\s+total|amount\s+due|balance|quote\s+totals|notes?\b|terms\b)/i;

/**
 * A line item starts with either:
 *   "<line#> [CATALOG] description..."   e.g.  1 [12-102] Serological Pipets
 *   "<line#> Part#/Cat#/Item# CATALOG description..."
 *   "[CATALOG] description..."
 * The block runs until the next start line (or a totals / notes section). All
 * currency amounts in the block are the item's prices; a bare integer near them
 * is the quantity.
 */
function extractBlockItems(lines, fullText) {
  // Column semantics: many quotes label "List Price" and "Your/Net Price".
  const listYourColumns = /list\s+price/i.test(fullText) &&
    /(your|net|sale|discount(?:ed)?)\s+price/i.test(fullText);

  const startRe = /^\s*(\d{1,4})\s+\[([^\]]+)\]\s*(.*)$/;
  const startRe2 = /^\s*(\d{1,4})\s+(?:cat(?:alog)?|part|item|sku|model|mfg)\s*(?:#|no\.?|number)?\s*[:]?\s*([A-Za-z0-9][A-Za-z0-9\-\/]{2,})\s*(.*)$/i;
  const startRe3 = /^\s*\[([^\]]+)\]\s*(.*)$/;

  // Find the index where each item block begins.
  const starts = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let m;
    if ((m = line.match(startRe))) {
      starts.push({ i, lineNumber: parseInt(m[1], 10), catalog: m[2].trim(), rest: m[3].trim() });
    } else if ((m = line.match(startRe2))) {
      starts.push({ i, lineNumber: parseInt(m[1], 10), catalog: m[2].trim(), rest: m[3].trim() });
    } else if ((m = line.match(startRe3))) {
      starts.push({ i, lineNumber: null, catalog: m[1].trim(), rest: m[2].trim() });
    }
  }
  if (starts.length === 0) return [];

  const items = [];
  for (let s = 0; s < starts.length; s++) {
    const start = starts[s];
    const end = s + 1 < starts.length ? starts[s + 1].i : lines.length;

    // Gather the block's descriptive lines and its prices.
    const descParts = [];
    if (start.rest) descParts.push(start.rest);
    const prices = [];
    let quantity = null;
    let unit = null;

    for (let j = start.i; j < end; j++) {
      const raw = lines[j];
      const line = raw.trim();
      if (!line) continue;
      if (j !== start.i && STOP_RE.test(line)) break;   // end of the table
      if (j !== start.i && NOISE_RE.test(line)) continue;

      const found = line.match(PRICE_RE);
      if (found) {
        found.forEach(p => {
          const n = parseFloat(p.replace(/[^0-9.]/g, ''));
          if (!isNaN(n)) prices.push(n);
        });
        // Quantity: a bare integer left after removing currency amounts.
        const leftover = line.replace(PRICE_RE, ' ');
        const qtyUnit = leftover.match(/\b(\d+(?:\.\d+)?)\s*(ea|each|box|bx|case|cs|pk|pack|bottle|btl|vial|tube|kit|set|roll|pair|unit|units)\b/i);
        if (qtyUnit) {
          quantity = parseFloat(qtyUnit[1]);
          unit = qtyUnit[2];
        } else if (quantity == null) {
          const bare = leftover.match(/(?:^|\s)(\d{1,4})(?:\s|$)/);
          if (bare) quantity = parseInt(bare[1], 10);
        }
        // A price line that also carries description text keeps that text.
        const textOnly = leftover.replace(/\b\d+(?:\.\d+)?\b/g, ' ').replace(/[|]/g, ' ').trim();
        if (j === start.i && textOnly.length >= 3) descParts.push(textOnly);
      } else if (j !== start.i) {
        // Pure description continuation line.
        descParts.push(line);
      }
    }

    let description = descParts.join(', ')
      .replace(/\s{2,}/g, ' ')
      .replace(/^[\s\-|:,]+|[\s\-|:,]+$/g, '')
      .trim();
    if (!description) description = start.catalog ? `Item ${start.catalog}` : `Line ${start.lineNumber || s + 1}`;

    // Resolve quoted (net) vs original (list) prices.
    let quotedPrice = null;
    let originalPrice = null;
    const distinct = [...new Set(prices)];
    if (prices.length === 1) {
      quotedPrice = prices[0];
    } else if (prices.length >= 2) {
      if (listYourColumns) {
        // Column order is List, Your, [Qty], Total → first is list, second is net.
        originalPrice = prices[0];
        quotedPrice = prices[1];
      } else {
        const sorted = [...distinct].sort((a, b) => a - b);
        quotedPrice = sorted[0];
        originalPrice = sorted[sorted.length - 1];
      }
      if (originalPrice === quotedPrice) originalPrice = null;
    }

    items.push({
      lineNumber:    start.lineNumber != null ? start.lineNumber : (s + 1),
      catalogNumber: start.catalog || null,
      description,
      quantity,
      unit,
      quotedPrice,
      originalPrice,
      approvalStatus: 'pending',
      inventoryItemId: null,
      inventoryItemName: null
    });
  }

  return items;
}

/**
 * Fallback: one line item per line (description + prices on the same line).
 */
function extractInlineItems(lines) {
  const items = [];
  let lineNo = 0;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (NOISE_RE.test(line) || STOP_RE.test(line)) continue;

    const priceMatches = line.match(/\$?\s?([\d,]+\.\d{2})\b/g);
    if (!priceMatches || priceMatches.length === 0) continue;
    const textPart = line.replace(/\$?\s?[\d,]+\.\d{2}/g, '').replace(/[\d.,%$]/g, '').trim();
    if (textPart.length < 3) continue;

    const prices = priceMatches
      .map(p => parseFloat(p.replace(/[^0-9.]/g, '')))
      .filter(n => !isNaN(n));

    let quantity = null;
    let unit = null;
    const qtyUnit = line.match(/\b(\d+(?:\.\d+)?)\s*(ea|each|box|bx|case|cs|pk|pack|bottle|btl|vial|tube|kit|set|roll|pair|unit|units)\b/i);
    if (qtyUnit) {
      quantity = parseFloat(qtyUnit[1]);
      unit = qtyUnit[2];
    } else {
      const leadingQty = line.match(/^(\d{1,4})\s+\D/);
      if (leadingQty) quantity = parseInt(leadingQty[1], 10);
    }

    let catalogNumber = null;
    const catMatch = line.match(/(?:cat(?:alog)?|part|item|sku|model|mfg)\s*(?:#|no\.?|number)?\s*[:]?\s*([A-Z0-9][A-Z0-9\-\/]{2,})/i);
    if (catMatch) {
      catalogNumber = catMatch[1];
    } else {
      const token = line.match(/\b([A-Z0-9]{2,}[-\/][A-Z0-9\-\/]{2,}|[A-Z]{2,}\d{2,}[A-Z0-9]*)\b/);
      if (token) catalogNumber = token[1];
    }

    let description = line
      .replace(/\$?\s?[\d,]+\.\d{2}/g, ' ')
      .replace(/\b(?:cat(?:alog)?|part|item|sku|model|mfg)\s*(?:#|no\.?|number)?\s*[:]?\s*[A-Z0-9][A-Z0-9\-\/]{2,}/i, ' ');
    if (catalogNumber) description = description.replace(catalogNumber, ' ');
    if (qtyUnit) description = description.replace(qtyUnit[0], ' ');
    description = description
      .replace(/^\s*\d{1,4}\s+/, ' ')
      .replace(/\s{2,}/g, ' ')
      .replace(/^[\s\-|:]+|[\s\-|:]+$/g, '')
      .trim();
    if (!description) description = catalogNumber ? `Item ${catalogNumber}` : line;

    let quotedPrice = null;
    let originalPrice = null;
    if (prices.length === 1) {
      quotedPrice = prices[0];
    } else {
      const sorted = [...prices].sort((a, b) => a - b);
      quotedPrice = sorted[0];
      originalPrice = sorted[sorted.length - 1];
      if (originalPrice === quotedPrice) originalPrice = null;
    }

    items.push({
      lineNumber:    ++lineNo,
      catalogNumber: catalogNumber || null,
      description,
      quantity,
      unit,
      quotedPrice,
      originalPrice,
      approvalStatus: 'pending',
      inventoryItemId: null,
      inventoryItemName: null
    });
  }

  return items;
}

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────

function tryPatterns(text, patterns) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[1] && match[1].trim()) {
      return match[1].trim();
    }
  }
  return null;
}

/** Normalize M/D/YYYY (or MM-DD-YY) → YYYY-MM-DD */
function normalizeDate(dateStr) {
  if (!dateStr) return null;
  const parts = dateStr.split(/[\/\-]/);
  if (parts.length !== 3) return null;
  let [month, day, year] = parts;
  if (year.length === 2) year = '20' + year;
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

/** Normalize "January 5, 2026" / "Jan 5 2026" → YYYY-MM-DD */
function normalizeWordedDate(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function validateQuote(quote) {
  const warnings = [];
  if (!quote.vendor) warnings.push('Vendor name not detected — please fill it in.');
  if (!quote.quoteNumber) warnings.push('Quote number not detected — please fill it in.');
  if (!quote.expirationDate) warnings.push('Expiration date not detected — set it so expiry alerts work.');
  if (!quote.lineItems || quote.lineItems.length === 0) {
    warnings.push('No line items detected — you may need to add them manually.');
  }
  return warnings;
}

module.exports = { parseQuoteData };

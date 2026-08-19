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
    /prepared\s+by\s*[:]\s*(.+?)(?:\n|$)/i
  ]);
  if (labeled) return labeled;

  // Fall back to the first meaningful line of the document.
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  for (const line of lines) {
    // Skip lines that are obviously not a company name.
    if (/^(quote|quotation|estimate|proposal|date|page)\b/i.test(line)) continue;
    if (line.length >= 2 && line.length <= 80) return line;
  }
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
    /(?:valid\s+(?:until|through|thru)|expir\w*|good\s+(?:until|through))\s*[:]?\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i,
    /(?:valid\s+(?:until|through)|expir\w*)\s*[:]?\s*([A-Z][a-z]+\.?\s+\d{1,2},?\s+\d{4})/i
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
  const items = [];
  const lines = text.split('\n');
  let lineNo = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Skip obvious totals / summary rows.
    if (/^(sub\s*-?\s*total|total|tax|shipping|freight|grand\s+total|amount\s+due|balance)\b/i.test(line)) {
      continue;
    }

    // A line item must contain a price.
    const priceMatches = line.match(/\$?\s?([\d,]+\.\d{2})\b/g);
    if (!priceMatches || priceMatches.length === 0) continue;
    // A line that is only a number/price (no descriptive text) is not an item.
    const textPart = line.replace(/\$?\s?[\d,]+\.\d{2}/g, '').replace(/[\d.,%$]/g, '').trim();
    if (textPart.length < 3) continue;

    const prices = priceMatches
      .map(p => parseFloat(p.replace(/[^0-9.]/g, '')))
      .filter(n => !isNaN(n));

    // Quantity: a small standalone integer, or "N ea/each/cs/box/pk..."
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

    // Catalog / part / SKU number.
    let catalogNumber = null;
    const catMatch = line.match(/(?:cat(?:alog)?|part|item|sku|model|mfg)\s*(?:#|no\.?|number)?\s*[:]?\s*([A-Z0-9][A-Z0-9\-\/]{2,})/i);
    if (catMatch) {
      catalogNumber = catMatch[1];
    } else {
      // Fallback: an alphanumeric token that looks like a part number.
      const token = line.match(/\b([A-Z0-9]{2,}[-\/][A-Z0-9\-\/]{2,}|[A-Z]{2,}\d{2,}[A-Z0-9]*)\b/);
      if (token) catalogNumber = token[1];
    }

    // Description: the line with prices, quantity token and catalog stripped out.
    let description = line
      .replace(/\$?\s?[\d,]+\.\d{2}/g, ' ')
      .replace(/\b(?:cat(?:alog)?|part|item|sku|model|mfg)\s*(?:#|no\.?|number)?\s*[:]?\s*[A-Z0-9][A-Z0-9\-\/]{2,}/i, ' ');
    if (catalogNumber) description = description.replace(catalogNumber, ' ');
    // Strip the qty + unit token (e.g. "10 ea") and any leading line number.
    if (qtyUnit) description = description.replace(qtyUnit[0], ' ');
    description = description
      .replace(/^\s*\d{1,4}\s+/, ' ')       // leading line number
      .replace(/\s{2,}/g, ' ')
      .replace(/^[\s\-|:]+|[\s\-|:]+$/g, '')
      .trim();
    if (!description) description = catalogNumber ? `Item ${catalogNumber}` : line;

    // Prices: smaller = quoted/net, larger = original/list (when two are present).
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

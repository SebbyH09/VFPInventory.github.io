/**
 * poParser.js
 *
 * Parses raw text extracted from Prendio PO confirmation PDFs.
 *
 * Since ALL of these PDFs come from the same system (Prendio), the format
 * is consistent every time. That means we can use simple, fast regex pattern
 * matching instead of AI — no API calls, no cost, no latency.
 *
 * HOW TO CALIBRATE THIS FILE:
 * When you receive your first Prendio PO confirmation PDF, run it through
 * pdfExtractor.js and console.log the rawText. Then look at the output and
 * adjust the regex patterns below to match exactly what Prendio outputs.
 *
 * Each regex has a comment explaining what it's looking for and a test
 * string so you can verify it in regex101.com if needed.
 */

// ─────────────────────────────────────────────
// MAIN PARSING FUNCTION
// ─────────────────────────────────────────────

/**
 * Parses raw text from a Prendio PO confirmation PDF.
 * @param {string} rawText       - Text extracted from the PDF
 * @param {object} emailMetadata - Context from the email (subject, sender, date, filename)
 * @returns {object}             - Structured PO data
 */
function parsePOData(rawText, emailMetadata = {}) {
  if (!rawText || rawText.trim().length < 20) {
    throw new Error('poParser: Raw text is too short to parse.');
  }

  console.log(`[poParser] Parsing PO from "${emailMetadata.filename || 'unknown file'}"`);

  const po = {
    // ── Header fields ──
    poNumber:       extractPONumber(rawText),
    orderDate:      extractOrderDate(rawText),
    vendor:         extractVendor(rawText),
    requester:      extractRequester(rawText),
    department:     extractDepartment(rawText),
    shippingAddress: extractShippingAddress(rawText),
    deliveryDate:   extractDeliveryDate(rawText),

    // ── Line items ──
    lineItems:      extractLineItems(rawText),

    // ── Totals ──
    subtotal:       extractCurrencyField(rawText, ['subtotal', 'sub-total', 'sub total']),
    tax:            extractCurrencyField(rawText, ['tax', 'sales tax']),
    shipping:       extractCurrencyField(rawText, ['shipping', 'freight', 'delivery']),
    total:          extractCurrencyField(rawText, ['total', 'order total', 'grand total']),
    currency:       'USD',

    // ── Source metadata ──
    source:         'prendio',
    emailMetadata,
    parsedAt:       new Date()
  };

  // Basic validation — a PO must have at least a number and line items
  const warnings = validatePO(po);
  po.warnings = warnings;

  if (warnings.length > 0) {
    console.warn(`[poParser] Parsed with ${warnings.length} warning(s):`, warnings);
  } else {
    console.log(`[poParser] Clean parse — PO# ${po.poNumber}, ${po.lineItems.length} line item(s).`);
  }

  return po;
}

// ─────────────────────────────────────────────
// FIELD EXTRACTORS
// ─────────────────────────────────────────────

// Each function targets a specific field in the Prendio PDF.
// Adjust the regex strings to match what your actual PDFs output.
// All extractors return null if the field isn't found — never throw.

/**
 * PO Number — typically looks like "PO-2024-00123" or "PO# 10045"
 * Test: "Purchase Order: PO-2024-00123"
 */
function extractPONumber(text) {
  const patterns = [
    /purchase\s+order\s*[:#]?\s*([A-Z0-9\-]+)/i,
    /po\s*[:#]?\s*([A-Z0-9\-]+)/i,
    /order\s+number\s*[:#]?\s*([A-Z0-9\-]+)/i
  ];
  return tryPatterns(text, patterns);
}

/**
 * Order Date — looks for a date near "order date" or "date"
 * Test: "Order Date: 01/15/2024"
 */
function extractOrderDate(text) {
  const patterns = [
    /order\s+date\s*[:]?\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i,
    /date\s+ordered\s*[:]?\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i,
    /date\s*[:]?\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i
  ];
  const raw = tryPatterns(text, patterns);
  return raw ? normalizeDate(raw) : null;
}

/**
 * Expected delivery date
 */
function extractDeliveryDate(text) {
  const patterns = [
    /delivery\s+date\s*[:]?\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i,
    /expected\s+delivery\s*[:]?\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i,
    /ship\s+by\s*[:]?\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i
  ];
  const raw = tryPatterns(text, patterns);
  return raw ? normalizeDate(raw) : null;
}

/**
 * Vendor/Supplier name
 */
function extractVendor(text) {
  const patterns = [
    /vendor\s*[:]?\s*(.+?)(?:\n|$)/i,
    /supplier\s*[:]?\s*(.+?)(?:\n|$)/i,
    /ship\s+from\s*[:]?\s*(.+?)(?:\n|$)/i
  ];
  return tryPatterns(text, patterns);
}

/**
 * Requester name (who submitted the PO in Prendio)
 */
function extractRequester(text) {
  const patterns = [
    /requested\s+by\s*[:]?\s*(.+?)(?:\n|$)/i,
    /requester\s*[:]?\s*(.+?)(?:\n|$)/i,
    /submitted\s+by\s*[:]?\s*(.+?)(?:\n|$)/i,
    /ordered\s+by\s*[:]?\s*(.+?)(?:\n|$)/i
  ];
  return tryPatterns(text, patterns);
}

/**
 * Department / cost center
 */
function extractDepartment(text) {
  const patterns = [
    /department\s*[:]?\s*(.+?)(?:\n|$)/i,
    /dept\s*[:]?\s*(.+?)(?:\n|$)/i,
    /cost\s+center\s*[:]?\s*(.+?)(?:\n|$)/i,
    /lab\s*[:]?\s*(.+?)(?:\n|$)/i
  ];
  return tryPatterns(text, patterns);
}

/**
 * Shipping address block
 */
function extractShippingAddress(text) {
  const patterns = [
    /ship\s+to\s*[:]?\s*([\s\S]+?)(?:\n\n|\nvendor|\nbill)/i,
    /deliver\s+to\s*[:]?\s*([\s\S]+?)(?:\n\n)/i
  ];
  const raw = tryPatterns(text, patterns);
  return raw ? raw.replace(/\s+/g, ' ').trim() : null;
}

/**
 * Currency amount for a labeled field (subtotal, tax, shipping, total)
 * @param {string[]} labels - Possible field names in the PDF
 */
function extractCurrencyField(text, labels) {
  for (const label of labels) {
    // Matches things like "Total: $1,234.56" or "TOTAL    1234.56"
    const pattern = new RegExp(
      `${label}\\s*[:]?\\s*\\$?([\\d,]+\\.\\d{2})`,
      'i'
    );
    const match = text.match(pattern);
    if (match) {
      return parseFloat(match[1].replace(/,/g, ''));
    }
  }
  return null;
}

// ─────────────────────────────────────────────
// LINE ITEM EXTRACTION
// ─────────────────────────────────────────────

/**
 * This is the most complex part. Prendio PO line items are typically in a table.
 * After PDF extraction, table rows become lines of text.
 *
 * Common Prendio line item format (adjust to match your actual PDFs):
 * "1    Fisher Scientific    Pipette Tips 200uL    12-345-67    10    Box    $24.99    $249.90"
 *
 * Column order from Prendio:
 * Line# | Vendor | Description | Cat# | Qty | Unit | Unit Price | Total
 *
 * ⚠️  IMPORTANT: Run a real Prendio PDF through the extractor and log rawText
 * to see the actual format before finalizing this regex.
 */
function extractLineItems(text) {
  const lineItems = [];

  // Strategy: find the line items section between a header row and the totals section
  // Adjust these boundary markers to match what Prendio actually outputs
  const sectionMatch = text.match(
    /(?:line\s*#?|item\s*#?|qty|description).+?\n([\s\S]+?)(?:subtotal|sub-total|total\s*:|\n\n\n)/i
  );

  const itemSection = sectionMatch ? sectionMatch[1] : text;
  const lines = itemSection.split('\n').map(l => l.trim()).filter(l => l.length > 10);

  for (const line of lines) {
    const item = parseLineItemRow(line);
    if (item) lineItems.push(item);
  }

  // If structured parsing found nothing, fall back to looser extraction
  if (lineItems.length === 0) {
    return extractLineItemsFallback(text);
  }

  return lineItems;
}

/**
 * Parse a single line item row.
 *
 * Tries to match: LineNum  Description  CatalogNum  Qty  Unit  UnitPrice  Total
 * This pattern covers most standard Prendio table row formats.
 *
 * Adjust this regex after seeing your real PDF output.
 */
function parseLineItemRow(line) {
  // Pattern: optional line number, description, catalog number, quantity, unit, prices
  // Example: "1  Pipette Tips 200uL  12-345-67  10  Box  24.99  249.90"
  const pattern = /^(\d+)?\s+(.+?)\s{2,}([\w\-]+)\s+(\d+(?:\.\d+)?)\s+(\w+)\s+\$?([\d,]+\.\d{2})\s+\$?([\d,]+\.\d{2})/;

  const match = line.match(pattern);
  if (!match) return null;

  return {
    lineNumber:    match[1] ? parseInt(match[1]) : null,
    description:   match[2].trim(),
    catalogNumber: match[3].trim(),
    quantity:      parseFloat(match[4]),
    unit:          match[5].trim(),
    unitPrice:     parseFloat(match[6].replace(/,/g, '')),
    totalPrice:    parseFloat(match[7].replace(/,/g, ''))
  };
}

/**
 * Fallback: looser extraction when the table structure doesn't match.
 * Looks for lines with quantities and prices without caring about column order.
 */
function extractLineItemsFallback(text) {
  console.warn('[poParser] Using fallback line item extraction — check your regex patterns.');

  const items = [];
  const lines = text.split('\n');

  for (const line of lines) {
    // Look for lines that contain a price (e.g., $24.99 or 24.99)
    if (/\$[\d,]+\.\d{2}/.test(line) && line.length > 15) {
      const priceMatches = line.match(/\$?([\d,]+\.\d{2})/g);
      const qtyMatch = line.match(/\b(\d+)\s+(ea|each|box|case|pk|pack|bottle|vial|tube)/i);

      if (priceMatches) {
        items.push({
          description:   line.replace(/\$[\d,]+\.\d{2}/g, '').trim(),
          catalogNumber: null,
          quantity:      qtyMatch ? parseInt(qtyMatch[1]) : null,
          unit:          qtyMatch ? qtyMatch[2] : null,
          unitPrice:     priceMatches.length >= 2 ? parseFloat(priceMatches[0].replace(/[$,]/g, '')) : null,
          totalPrice:    priceMatches.length >= 2
                           ? parseFloat(priceMatches[priceMatches.length - 1].replace(/[$,]/g, ''))
                           : parseFloat(priceMatches[0].replace(/[$,]/g, ''))
        });
      }
    }
  }

  return items;
}

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────

/**
 * Tries a list of regex patterns against text, returns first capture group match.
 * Returns null if none match.
 */
function tryPatterns(text, patterns) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      return match[1].trim();
    }
  }
  return null;
}

/**
 * Normalize various date formats to YYYY-MM-DD
 * Handles: MM/DD/YYYY, MM-DD-YYYY, MM/DD/YY
 */
function normalizeDate(dateStr) {
  if (!dateStr) return null;

  const parts = dateStr.split(/[\/\-]/);
  if (parts.length !== 3) return dateStr;

  let [month, day, year] = parts;
  if (year.length === 2) year = '20' + year;

  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

/**
 * Validate that a parsed PO has the minimum required fields.
 * Returns an array of warning strings (empty = all good).
 */
function validatePO(po) {
  const warnings = [];

  if (!po.poNumber) warnings.push('PO number not found — check poNumber regex');
  if (!po.orderDate) warnings.push('Order date not found');
  if (!po.vendor) warnings.push('Vendor name not found');
  if (!po.lineItems || po.lineItems.length === 0) warnings.push('No line items found — check line item regex');

  for (const [i, item] of (po.lineItems || []).entries()) {
    if (!item.description) warnings.push(`Line item ${i + 1}: missing description`);
    if (!item.quantity) warnings.push(`Line item ${i + 1}: missing quantity`);
  }

  return warnings;
}

module.exports = { parsePOData };

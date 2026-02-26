/**
 * poParser.js
 *
 * Parses raw text extracted from Prendio PO confirmation PDFs.
 *
 * Since ALL of these PDFs come from the same system (Prendio), the format
 * is consistent every time. That means we can use simple, fast regex pattern
 * matching instead of AI — no API calls, no cost, no latency.
 *
 * CALIBRATED against actual Prendio PO format (Feb 2026):
 *   - PO # 15699
 *   - Date: 2/26/2026
 *   - Vendor block with address + account number
 *   - Ship To block with attention line
 *   - Buyer / Requisitioner with name, email, phone
 *   - Line items table: Line | Qty | U/M | Item Code/Description | Unit Price | Amount | Tax
 *   - Part# and Desc: on separate lines within each line item
 *   - Totals at bottom: Subtotal, Tax, Shipping, Total
 *
 * If Prendio ever changes their PDF layout, re-run a PDF through pdfExtractor.js,
 * log the rawText, and adjust patterns below.
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
    poNumber:        extractPONumber(rawText),
    orderDate:       extractOrderDate(rawText),
    vendor:          extractVendor(rawText),
    vendorAddress:   extractVendorAddress(rawText),
    accountNumber:   extractAccountNumber(rawText),
    requester:       extractRequester(rawText),
    buyer:           extractBuyer(rawText),
    department:      extractDepartment(rawText),
    shippingAddress: extractShippingAddress(rawText),
    deliveryDate:    extractDeliveryDate(rawText),
    shipVia:         extractShipVia(rawText),
    terms:           extractTerms(rawText),

    // ── Line items ──
    lineItems:       extractLineItems(rawText),

    // ── Totals ──
    subtotal:        extractCurrencyField(rawText, ['subtotal', 'sub-total', 'sub total']),
    tax:             extractCurrencyField(rawText, ['tax', 'sales tax']),
    shipping:        extractCurrencyField(rawText, ['shipping', 'freight', 'delivery']),
    total:           extractCurrencyField(rawText, ['total', 'order total', 'grand total']),
    currency:        'USD',

    // ── Source metadata ──
    source:          'prendio',
    emailMetadata,
    parsedAt:        new Date()
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
// FIELD EXTRACTORS — Calibrated to Prendio format
// ─────────────────────────────────────────────

/**
 * PO Number — Prendio uses "PO # 15699" format
 * Test: "PO # 15699"
 */
function extractPONumber(text) {
  const patterns = [
    /PO\s*#\s*(\d+)/i,
    /purchase\s+order\s*[:#]?\s*([A-Z0-9\-]+)/i,
    /po\s*[:#]\s*([A-Z0-9\-]+)/i,
    /order\s+number\s*[:#]?\s*([A-Z0-9\-]+)/i
  ];
  return tryPatterns(text, patterns);
}

/**
 * Order Date — Prendio uses "Date: 2/26/2026" (M/D/YYYY, no leading zeros)
 * Test: "Date: 2/26/2026"
 */
function extractOrderDate(text) {
  const patterns = [
    /(?:^|\n)\s*Date\s*:\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/i,
    /order\s+date\s*[:]?\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i,
    /date\s+ordered\s*[:]?\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i
  ];
  const raw = tryPatterns(text, patterns);
  return raw ? normalizeDate(raw) : null;
}

/**
 * Expected delivery date — Prendio shows "Delivery Date:" in the shipping info table.
 * May contain a date or text like "(Punchout Order)".
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
 * Vendor name — Prendio shows "Vendor:" on its own line, followed by vendor name on next line.
 * Example:
 *   Vendor:
 *   Fisher Scientific
 *   P.O. Box 3648
 *
 * Also handles inline: "Vendor: Fisher Scientific"
 */
function extractVendor(text) {
  // Multi-line: "Vendor:\n  Fisher Scientific"
  const multiLine = text.match(/Vendor\s*:\s*\n\s*(.+?)(?:\n|$)/i);
  if (multiLine && multiLine[1].trim()) return multiLine[1].trim();

  // Inline: "Vendor: Fisher Scientific"
  const inline = text.match(/Vendor\s*:\s*(.+?)(?:\n|$)/i);
  if (inline && inline[1].trim()) return inline[1].trim();

  // Fallback
  const patterns = [
    /supplier\s*[:]?\s*(.+?)(?:\n|$)/i,
    /ship\s+from\s*[:]?\s*(.+?)(?:\n|$)/i
  ];
  return tryPatterns(text, patterns);
}

/**
 * Vendor address — multi-line block after vendor name, before Account Number
 */
function extractVendorAddress(text) {
  const match = text.match(/Vendor\s*:\s*\n?\s*.+?\n([\s\S]+?)(?:Account\s+Number|Ship\s+To|\n\n)/i);
  if (match) return match[1].replace(/\s+/g, ' ').trim();
  return null;
}

/**
 * Account Number — "Account Number: 089954-007"
 */
function extractAccountNumber(text) {
  const match = text.match(/Account\s+Number\s*:\s*([A-Z0-9\-]+)/i);
  return match ? match[1].trim() : null;
}

/**
 * Buyer — Prendio shows "Buyer" as a header, then name, email, phone on next line(s)
 * Example:
 *   Buyer
 *   Sebastian Halama, shalama@vfplabs.com, 9999999999
 */
function extractBuyer(text) {
  const patterns = [
    /Buyer\s*\n\s*([^,\n]+)/i,
    /Buyer\s*:\s*([^,\n]+)/i
  ];
  return tryPatterns(text, patterns);
}

/**
 * Requester — Prendio shows "Requisitioner" as a header, then name on next line
 * Example:
 *   Requisitioner
 *   Sebastian Halama, shalama@vfplabs.com, 9999999999
 */
function extractRequester(text) {
  const patterns = [
    /Requisitioner\s*\n\s*([^,\n]+)/i,
    /Requisitioner\s*:\s*([^,\n]+)/i,
    /Requested\s+by\s*[:]?\s*([^,\n]+)/i,
    /Requester\s*[:]?\s*([^,\n]+)/i
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
    /cost\s+center\s*[:]?\s*(.+?)(?:\n|$)/i
  ];
  return tryPatterns(text, patterns);
}

/**
 * Shipping address — Prendio uses "Ship To:" followed by multi-line address block
 * Example:
 *   Ship To:
 *   Aera Therapeutics, Inc.
 *   300 Technology Square
 *   6th Floor
 *   Cambridge, MA 02139
 *   Attn: Sebastian Halama
 */
function extractShippingAddress(text) {
  const patterns = [
    /Ship\s+To\s*:\s*\n?([\s\S]+?)(?:Ship\s+Via|Buyer|Requisitioner|FOB|\n\n)/i,
    /Deliver\s+To\s*:\s*\n?([\s\S]+?)(?:\n\n)/i
  ];
  const raw = tryPatterns(text, patterns);
  return raw ? raw.replace(/\s+/g, ' ').trim() : null;
}

/**
 * Ship Via — "Ship Via: Free Standard Shipping"
 */
function extractShipVia(text) {
  const match = text.match(/Ship\s+Via\s*:\s*(.+?)(?:\n|$)/i);
  return match ? match[1].trim() : null;
}

/**
 * Payment terms — "Terms: Net 30"
 */
function extractTerms(text) {
  const match = text.match(/Terms\s*:\s*(.+?)(?:\n|$)/i);
  return match ? match[1].trim() : null;
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
// LINE ITEM EXTRACTION — Calibrated to Prendio format
// ─────────────────────────────────────────────

/**
 * Prendio line items table (from actual PDF):
 *
 *   Line | Qty | U/M | Item Code / Description | Unit Price | Amount | Tax
 *   ─────┼─────┼─────┼─────────────────────────┼────────────┼────────┼────
 *   1      1.00   CS    Part# 14223985             684.44     684.44   No
 *                        Desc: 0.2ML PCR STRIP TUBE FLAT CAP
 *
 * After PDF text extraction, this typically becomes:
 *   "1 1.00 CS Part# 14223985 684.44 684.44 No"
 *   "Desc: 0.2ML PCR STRIP TUBE FLAT CAP"
 *
 * Strategy:
 *   1. Find the line items section (between header row and totals)
 *   2. Parse each numbered row for Line#, Qty, U/M, Part#, prices
 *   3. Look at the following line(s) for "Desc:" to get the description
 */
function extractLineItems(text) {
  const lineItems = [];

  // Find the items section — starts after the table header, ends at totals
  const sectionMatch = text.match(
    /(?:Line\s*\|?\s*Qty\s*\|?\s*U\/M|Item\s+Code.*?Description).+?\n([\s\S]+?)(?:Subtotal|Sub-total|Total\s*[\$:]|\n\n\n)/i
  );

  const itemSection = sectionMatch ? sectionMatch[1] : text;
  const lines = itemSection.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Try Prendio-specific format first:
    // "1 1.00 CS Part# 14223985 684.44 684.44 No"
    const prendioMatch = line.match(
      /^(\d+)\s+([\d.]+)\s+(\w+)\s+Part#\s*([\w\-]+)\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})\s*(Yes|No)?/i
    );

    if (prendioMatch) {
      // Look ahead for "Desc:" line
      let description = null;
      for (let j = i + 1; j < Math.min(i + 4, lines.length); j++) {
        const descMatch = lines[j].match(/Desc\s*:\s*(.+)/i);
        if (descMatch) {
          description = descMatch[1].trim();
          break;
        }
      }

      lineItems.push({
        lineNumber:    parseInt(prendioMatch[1]),
        quantity:      parseFloat(prendioMatch[2]),
        unit:          prendioMatch[3].trim(),
        catalogNumber: prendioMatch[4].trim(),
        unitPrice:     parseFloat(prendioMatch[5].replace(/,/g, '')),
        totalPrice:    parseFloat(prendioMatch[6].replace(/,/g, '')),
        taxable:       prendioMatch[7] ? prendioMatch[7].toLowerCase() === 'yes' : false,
        description:   description || `Part# ${prendioMatch[4].trim()}`
      });
      continue;
    }

    // Fallback: generic line item row
    const genericMatch = parseLineItemRow(line);
    if (genericMatch) lineItems.push(genericMatch);
  }

  // If structured parsing found nothing, fall back to looser extraction
  if (lineItems.length === 0) {
    return extractLineItemsFallback(text);
  }

  return lineItems;
}

/**
 * Generic line item row parser (fallback for non-Prendio format).
 * Tries to match: LineNum  Description  CatalogNum  Qty  Unit  UnitPrice  Total
 */
function parseLineItemRow(line) {
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

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Check for Part# lines with prices
    const partMatch = line.match(/Part#\s*([\w\-]+).*?([\d,]+\.\d{2})/i);
    if (partMatch) {
      // Look ahead for Desc: line
      let description = null;
      for (let j = i + 1; j < Math.min(i + 4, lines.length); j++) {
        const descMatch = lines[j].match(/Desc\s*:\s*(.+)/i);
        if (descMatch) {
          description = descMatch[1].trim();
          break;
        }
      }

      const qtyMatch = line.match(/(\d+(?:\.\d+)?)\s+(\w{2,})\s+Part#/i);
      items.push({
        catalogNumber: partMatch[1].trim(),
        description:   description || `Part# ${partMatch[1].trim()}`,
        quantity:      qtyMatch ? parseFloat(qtyMatch[1]) : null,
        unit:          qtyMatch ? qtyMatch[2].trim() : null,
        unitPrice:     null,
        totalPrice:    parseFloat(partMatch[2].replace(/,/g, ''))
      });
      continue;
    }

    // Generic: look for lines that contain a price
    if (/\$[\d,]+\.\d{2}/.test(line) && line.length > 15) {
      const priceMatches = line.match(/\$?([\d,]+\.\d{2})/g);
      const qtyMatch = line.match(/\b(\d+)\s+(ea|each|box|case|pk|pack|bottle|vial|tube|cs)\b/i);

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
 * Handles: M/D/YYYY, MM/DD/YYYY, MM-DD-YYYY, MM/DD/YY
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

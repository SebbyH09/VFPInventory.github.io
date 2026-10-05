/**
 * quotes.js — Express routes for vendor quotes
 *
 * Workflow:
 *   1. User uploads a vendor quote PDF               → POST /quotes/upload
 *   2. quoteParser does a first pass on the PDF text and stores a Quote with
 *      line items in `pending` state.
 *   3. User reviews the quote                        → GET  /quotes/:id
 *      and approves each line item, tying it to an existing inventory item.
 *   4. Approving a line item stamps the inventory item's `activeQuote` so the
 *      quote number / new price / original price show up on the Inventory page,
 *      and the quote's expiration date feeds the dashboard "expiring soon" alert.
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');

const Quote = require('../models/Quote');
const PrepaidDelivery = require('../models/PrepaidDelivery');
const inventory = require('../models/ListedInventoryItem');
const InventoryHistory = require('../models/InventoryHistory');
const requireAuth = require('../Middleware/auth');
const { extractTextFromPDF } = require('../services/pdfExtractor');
const { parseQuoteData } = require('../services/quoteParser');

// PDF upload — held in memory, 15MB cap.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf' || /\.pdf$/i.test(file.originalname)) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed.'), false);
    }
  }
});

// ─────────────────────────────────────────────
// LIST + UPLOAD PAGE
// ─────────────────────────────────────────────

router.get('/', requireAuth, async (req, res) => {
  const flash = req.session.quotesFlash || null;
  delete req.session.quotesFlash;
  await renderList(req, res, flash);
});

/**
 * Render the Quotes list page (uploaded quotes + prepaid monthly deliveries).
 */
async function renderList(req, res, message, status = 200) {
  try {
    const [quotes, prepaid, inventoryItems] = await Promise.all([
      Quote.find({}).sort({ createdAt: -1 }).limit(200).lean(),
      PrepaidDelivery.find({}).sort({ endDate: 1 }).lean(),
      inventory.find({ isActive: { $ne: false } }).select('item vendor catalog').sort({ item: 1 }).lean()
    ]);
    res.status(status).render('quotes', {
      user: req.session.user,
      quotes,
      prepaid,
      inventoryItems,
      countMonths: PrepaidDelivery.countMonths,
      message
    });
  } catch (err) {
    console.error('[quotes] List error:', err.message);
    res.status(500).render('quotes', {
      user: req.session.user,
      quotes: [],
      prepaid: [],
      inventoryItems: [],
      countMonths: PrepaidDelivery.countMonths,
      message: { type: 'error', text: 'Failed to load quotes.' }
    });
  }
}

// ─────────────────────────────────────────────
// UPLOAD + PARSE A QUOTE PDF
// ─────────────────────────────────────────────

router.post('/upload', requireAuth, (req, res) => {
  upload.single('quoteFile')(req, res, async (uploadErr) => {
    if (uploadErr) {
      return renderList(req, res, { type: 'error', text: uploadErr.message });
    }

    try {
      if (!req.file) {
        return renderList(req, res, { type: 'error', text: 'Please choose a PDF file to upload.' });
      }

      const rawText = await extractTextFromPDF(req.file.buffer);
      const parsed = parseQuoteData(rawText, { fileName: req.file.originalname });

      const quote = await Quote.create({
        source:         'pdf_upload',
        fileName:       req.file.originalname,
        rawText,
        vendor:         parsed.vendor,
        quoteNumber:    parsed.quoteNumber,
        quoteDate:      parsed.quoteDate,
        expirationDate: parsed.expirationDate,
        lineItems:      parsed.lineItems,
        warnings:       parsed.warnings,
        status:         'pending_review',
        uploadedBy:     req.session.user?.email || 'unknown'
      });

      // Straight to the review screen so the user can approve items.
      return res.redirect('/quotes/' + quote._id);
    } catch (err) {
      console.error('[quotes] Upload/parse error:', err.message);
      return renderList(req, res, { type: 'error', text: 'Could not read that PDF. Please try a different file.' });
    }
  });
});

// ─────────────────────────────────────────────
// PREPAID MONTHLY DELIVERIES
// (registered before /:id so "prepaid" isn't treated as a quote id)
// ─────────────────────────────────────────────

/**
 * Validate + normalise the prepaid delivery form. Returns { data } or { error }.
 */
async function readPrepaidForm(body) {
  const str = (v) => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null);
  const num = (v) => {
    if (v === undefined || v === null || String(v).trim() === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : NaN;
  };
  const date = (v) => (str(v) ? new Date(str(v) + 'T00:00:00Z') : null);  // stored as UTC midnight

  const data = {
    vendor:           str(body.vendor),
    item:             str(body.item),
    catalogNumber:    str(body.catalogNumber),
    referenceNumber:  str(body.referenceNumber),
    quantityPerMonth: num(body.quantityPerMonth),
    unit:             str(body.unit),
    unitPrice:        num(body.unitPrice),
    amountPaid:       num(body.amountPaid),
    startDate:        date(body.startDate),
    endDate:          date(body.endDate),
    deliveryDay:      num(body.deliveryDay),
    notes:            str(body.notes),
    inventoryItemId:  null,
    inventoryItemName: null
  };

  if (!data.vendor) return { error: 'Vendor is required.' };
  if (!data.item && !str(body.inventoryItemId)) return { error: 'Item is required.' };
  if (data.quantityPerMonth === null || Number.isNaN(data.quantityPerMonth) || data.quantityPerMonth < 0) {
    return { error: 'Quantity per month must be a number of 0 or more.' };
  }
  for (const f of ['unitPrice', 'amountPaid']) {
    if (Number.isNaN(data[f]) || (data[f] !== null && data[f] < 0)) return { error: 'Prices must be positive numbers.' };
  }
  if (data.deliveryDay !== null &&
      (Number.isNaN(data.deliveryDay) || !Number.isInteger(data.deliveryDay) || data.deliveryDay < 1 || data.deliveryDay > 31)) {
    return { error: 'Delivery day must be a whole number from 1 to 31.' };
  }
  if (!data.startDate || isNaN(data.startDate) || !data.endDate || isNaN(data.endDate)) {
    return { error: 'Start and end dates are required.' };
  }
  if (data.endDate < data.startDate) return { error: 'End date must be on or after the start date.' };

  const invId = str(body.inventoryItemId);
  if (invId) {
    const item = await inventory.findById(invId).select('item').lean().catch(() => null);
    if (!item) return { error: 'Linked inventory item not found.' };
    data.inventoryItemId = item._id;
    data.inventoryItemName = item.item;
    if (!data.item) data.item = item.item;
  }

  return { data };
}

function setFlash(req, type, text) {
  req.session.quotesFlash = { type, text };
}

// Add a prepaid delivery
router.post('/prepaid', requireAuth, async (req, res) => {
  try {
    const { data, error } = await readPrepaidForm(req.body);
    if (error) {
      setFlash(req, 'error', error);
      return res.redirect('/quotes#prepaid');
    }
    data.createdBy = req.session.user?.email || 'unknown';
    await PrepaidDelivery.create(data);
    setFlash(req, 'success', `Prepaid delivery for ${data.item} added.`);
  } catch (err) {
    console.error('[quotes] Prepaid create error:', err.message);
    setFlash(req, 'error', 'Failed to add prepaid delivery.');
  }
  res.redirect('/quotes#prepaid');
});

// Edit a prepaid delivery
router.post('/prepaid/:id', requireAuth, async (req, res) => {
  try {
    const prepaid = await PrepaidDelivery.findById(req.params.id);
    if (!prepaid) {
      setFlash(req, 'error', 'Prepaid delivery not found.');
      return res.redirect('/quotes#prepaid');
    }
    const { data, error } = await readPrepaidForm(req.body);
    if (error) {
      setFlash(req, 'error', error);
      return res.redirect('/quotes#prepaid');
    }
    prepaid.set(data);
    await prepaid.save();
    setFlash(req, 'success', `Prepaid delivery for ${prepaid.item} updated.`);
  } catch (err) {
    console.error('[quotes] Prepaid update error:', err.message);
    setFlash(req, 'error', 'Failed to update prepaid delivery.');
  }
  res.redirect('/quotes#prepaid');
});

// Log that this month's delivery arrived
router.post('/prepaid/:id/received', requireAuth, async (req, res) => {
  try {
    const prepaid = await PrepaidDelivery.findById(req.params.id);
    if (!prepaid) return res.status(404).json({ message: 'Prepaid delivery not found.' });
    prepaid.deliveries.push({
      receivedAt: new Date(),
      quantity: prepaid.quantityPerMonth,
      loggedBy: req.session.user?.email || 'unknown'
    });
    await prepaid.save();
    res.json({ message: 'Delivery logged.', received: prepaid.deliveries.length });
  } catch (err) {
    console.error('[quotes] Prepaid log error:', err.message);
    res.status(500).json({ message: 'Failed to log delivery.' });
  }
});

// Undo the most recent logged delivery
router.post('/prepaid/:id/undo-received', requireAuth, async (req, res) => {
  try {
    const prepaid = await PrepaidDelivery.findById(req.params.id);
    if (!prepaid) return res.status(404).json({ message: 'Prepaid delivery not found.' });
    prepaid.deliveries.pop();
    await prepaid.save();
    res.json({ message: 'Last delivery removed.', received: prepaid.deliveries.length });
  } catch (err) {
    console.error('[quotes] Prepaid undo error:', err.message);
    res.status(500).json({ message: 'Failed to undo delivery.' });
  }
});

// Delete a prepaid delivery
router.delete('/prepaid/:id', requireAuth, async (req, res) => {
  try {
    const prepaid = await PrepaidDelivery.findByIdAndDelete(req.params.id);
    if (!prepaid) return res.status(404).json({ message: 'Prepaid delivery not found.' });
    res.json({ message: 'Prepaid delivery deleted.' });
  } catch (err) {
    console.error('[quotes] Prepaid delete error:', err.message);
    res.status(500).json({ message: 'Failed to delete prepaid delivery.' });
  }
});

// ─────────────────────────────────────────────
// REVIEW A SINGLE QUOTE
// ─────────────────────────────────────────────

router.get('/:id', requireAuth, async (req, res) => {
  try {
    const quote = await Quote.findById(req.params.id).lean();
    if (!quote) return renderList(req, res, { type: 'error', text: 'Quote not found.' }, 404);

    // Inventory items offered in the "tie to item" dropdown.
    const inventoryItems = await inventory.find({ isActive: { $ne: false } })
      .select('item brand vendor catalog cost')
      .sort({ item: 1 })
      .lean();

    res.render('quoteDetail', {
      user: req.session.user,
      quote,
      inventoryItems
    });
  } catch (err) {
    console.error('[quotes] Detail error:', err.message);
    res.redirect('/quotes');
  }
});

// ─────────────────────────────────────────────
// EDIT QUOTE HEADER (vendor / number / dates)
// ─────────────────────────────────────────────

router.patch('/:id', requireAuth, async (req, res) => {
  try {
    const { vendor, quoteNumber, quoteDate, expirationDate } = req.body;
    const quote = await Quote.findById(req.params.id);
    if (!quote) return res.status(404).json({ message: 'Quote not found.' });

    if (vendor !== undefined) quote.vendor = vendor;
    if (quoteNumber !== undefined) quote.quoteNumber = quoteNumber;
    if (quoteDate !== undefined) quote.quoteDate = quoteDate || null;
    if (expirationDate !== undefined) {
      quote.expirationDate = expirationDate ? new Date(expirationDate + 'T00:00:00') : null;
    }
    await quote.save();

    // Keep any linked inventory items' quote info in sync.
    await syncLinkedInventory(quote);

    res.json({ message: 'Quote updated.', quote });
  } catch (err) {
    console.error('[quotes] Update header error:', err.message);
    res.status(500).json({ message: 'Failed to update quote.' });
  }
});

// ─────────────────────────────────────────────
// EDIT A LINE ITEM (before approval)
// ─────────────────────────────────────────────

router.patch('/:id/line/:index', requireAuth, async (req, res) => {
  try {
    const quote = await Quote.findById(req.params.id);
    if (!quote) return res.status(404).json({ message: 'Quote not found.' });

    const li = quote.lineItems[req.params.index];
    if (!li) return res.status(404).json({ message: 'Line item not found.' });

    const { description, catalogNumber, quantity, unit, quotedPrice, originalPrice } = req.body;
    if (description !== undefined) li.description = description;
    if (catalogNumber !== undefined) li.catalogNumber = catalogNumber || null;
    if (quantity !== undefined) li.quantity = quantity === '' ? null : Number(quantity);
    if (unit !== undefined) li.unit = unit || null;
    if (quotedPrice !== undefined) li.quotedPrice = quotedPrice === '' ? null : Number(quotedPrice);
    if (originalPrice !== undefined) li.originalPrice = originalPrice === '' ? null : Number(originalPrice);

    await quote.save();
    res.json({ message: 'Line item updated.', lineItem: li });
  } catch (err) {
    console.error('[quotes] Update line error:', err.message);
    res.status(500).json({ message: 'Failed to update line item.' });
  }
});

// ─────────────────────────────────────────────
// APPROVE A LINE ITEM → tie it to an inventory item
// ─────────────────────────────────────────────

router.post('/:id/line/:index/approve', requireAuth, async (req, res) => {
  try {
    const { inventoryItemId, quotedPrice, originalPrice } = req.body;
    if (!inventoryItemId) {
      return res.status(400).json({ message: 'Choose an inventory item to tie this quote to.' });
    }

    const quote = await Quote.findById(req.params.id);
    if (!quote) return res.status(404).json({ message: 'Quote not found.' });

    const li = quote.lineItems[req.params.index];
    if (!li) return res.status(404).json({ message: 'Line item not found.' });

    const item = await inventory.findById(inventoryItemId);
    if (!item) return res.status(404).json({ message: 'Inventory item not found.' });

    // Resolve prices: prefer explicit overrides, fall back to parsed values.
    const newPrice = quotedPrice !== undefined && quotedPrice !== ''
      ? Number(quotedPrice)
      : (li.quotedPrice != null ? li.quotedPrice : null);
    // "Original price" defaults to the item's current cost so the Inventory
    // page can show the before/after comparison.
    const origPrice = originalPrice !== undefined && originalPrice !== ''
      ? Number(originalPrice)
      : (li.originalPrice != null ? li.originalPrice : (item.cost || null));

    // Update the line item.
    li.approvalStatus    = 'approved';
    li.inventoryItemId   = item._id;
    li.inventoryItemName = item.item;
    li.quotedPrice       = newPrice;
    li.originalPrice     = origPrice;
    quote.refreshStatus();
    await quote.save();

    // Stamp the inventory item with the active quote.
    item.activeQuote = {
      quoteId:        quote._id,
      quoteNumber:    quote.quoteNumber,
      vendor:         quote.vendor,
      quotedPrice:    newPrice,
      originalPrice:  origPrice,
      expirationDate: quote.expirationDate,
      approvedAt:     new Date()
    };
    await item.save();

    await InventoryHistory.create({
      itemId: item._id,
      itemName: item.item,
      changeType: 'item_updated',
      notes: `Tied to quote ${quote.quoteNumber || '(no #)'} from ${quote.vendor || 'vendor'}`
        + (newPrice != null ? ` — quoted $${newPrice.toFixed(2)}` : ''),
      userId: req.session.user?.email || 'unknown'
    });

    res.json({ message: 'Line item approved and tied to inventory item.', quote });
  } catch (err) {
    console.error('[quotes] Approve error:', err.message);
    res.status(500).json({ message: 'Failed to approve line item.' });
  }
});

// ─────────────────────────────────────────────
// REJECT A LINE ITEM
// ─────────────────────────────────────────────

router.post('/:id/line/:index/reject', requireAuth, async (req, res) => {
  try {
    const quote = await Quote.findById(req.params.id);
    if (!quote) return res.status(404).json({ message: 'Quote not found.' });

    const li = quote.lineItems[req.params.index];
    if (!li) return res.status(404).json({ message: 'Line item not found.' });

    await clearInventoryLink(li);
    li.approvalStatus    = 'rejected';
    li.inventoryItemId   = null;
    li.inventoryItemName = null;
    quote.refreshStatus();
    await quote.save();

    res.json({ message: 'Line item rejected.', quote });
  } catch (err) {
    console.error('[quotes] Reject error:', err.message);
    res.status(500).json({ message: 'Failed to reject line item.' });
  }
});

// ─────────────────────────────────────────────
// RESET A LINE ITEM back to pending
// ─────────────────────────────────────────────

router.post('/:id/line/:index/reset', requireAuth, async (req, res) => {
  try {
    const quote = await Quote.findById(req.params.id);
    if (!quote) return res.status(404).json({ message: 'Quote not found.' });

    const li = quote.lineItems[req.params.index];
    if (!li) return res.status(404).json({ message: 'Line item not found.' });

    await clearInventoryLink(li);
    li.approvalStatus    = 'pending';
    li.inventoryItemId   = null;
    li.inventoryItemName = null;
    quote.refreshStatus();
    await quote.save();

    res.json({ message: 'Line item reset to pending.', quote });
  } catch (err) {
    console.error('[quotes] Reset error:', err.message);
    res.status(500).json({ message: 'Failed to reset line item.' });
  }
});

// ─────────────────────────────────────────────
// DELETE A QUOTE
// ─────────────────────────────────────────────

router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const quote = await Quote.findById(req.params.id);
    if (!quote) return res.status(404).json({ message: 'Quote not found.' });

    // Detach any inventory items still pointing at this quote.
    for (const li of quote.lineItems) {
      await clearInventoryLink(li);
    }
    await quote.deleteOne();

    res.json({ message: 'Quote deleted.' });
  } catch (err) {
    console.error('[quotes] Delete error:', err.message);
    res.status(500).json({ message: 'Failed to delete quote.' });
  }
});

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────

/**
 * Clear an inventory item's activeQuote if it currently points at the given
 * (about to be un-approved / deleted) line item.
 */
async function clearInventoryLink(lineItem) {
  if (!lineItem.inventoryItemId) return;
  const item = await inventory.findById(lineItem.inventoryItemId);
  if (item && item.activeQuote && String(item.activeQuote.quoteId) &&
      lineItem.approvalStatus === 'approved') {
    // Only clear if this quote is the one currently stamped on the item.
    item.activeQuote = undefined;
    await item.save();
  }
}

/**
 * After a quote header edit, refresh the stamped info on every inventory item
 * tied to one of its approved line items.
 */
async function syncLinkedInventory(quote) {
  for (const li of quote.lineItems) {
    if (li.approvalStatus === 'approved' && li.inventoryItemId) {
      const item = await inventory.findById(li.inventoryItemId);
      if (item && item.activeQuote && String(item.activeQuote.quoteId) === String(quote._id)) {
        item.activeQuote.quoteNumber    = quote.quoteNumber;
        item.activeQuote.vendor         = quote.vendor;
        item.activeQuote.expirationDate = quote.expirationDate;
        await item.save();
      }
    }
  }
}

module.exports = router;

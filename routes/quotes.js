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
  try {
    const quotes = await Quote.find({}).sort({ createdAt: -1 }).limit(200).lean();
    res.render('quotes', {
      user: req.session.user,
      quotes,
      message: null
    });
  } catch (err) {
    console.error('[quotes] List error:', err.message);
    res.render('quotes', {
      user: req.session.user,
      quotes: [],
      message: { type: 'error', text: 'Failed to load quotes.' }
    });
  }
});

// ─────────────────────────────────────────────
// UPLOAD + PARSE A QUOTE PDF
// ─────────────────────────────────────────────

router.post('/upload', requireAuth, (req, res) => {
  upload.single('quoteFile')(req, res, async (uploadErr) => {
    if (uploadErr) {
      const quotes = await Quote.find({}).sort({ createdAt: -1 }).limit(200).lean();
      return res.render('quotes', {
        user: req.session.user,
        quotes,
        message: { type: 'error', text: uploadErr.message }
      });
    }

    try {
      if (!req.file) {
        const quotes = await Quote.find({}).sort({ createdAt: -1 }).limit(200).lean();
        return res.render('quotes', {
          user: req.session.user,
          quotes,
          message: { type: 'error', text: 'Please choose a PDF file to upload.' }
        });
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
      const quotes = await Quote.find({}).sort({ createdAt: -1 }).limit(200).lean();
      return res.render('quotes', {
        user: req.session.user,
        quotes,
        message: { type: 'error', text: 'Could not read that PDF. Please try a different file.' }
      });
    }
  });
});

// ─────────────────────────────────────────────
// REVIEW A SINGLE QUOTE
// ─────────────────────────────────────────────

router.get('/:id', requireAuth, async (req, res) => {
  try {
    const quote = await Quote.findById(req.params.id).lean();
    if (!quote) return res.status(404).render('quotes', {
      user: req.session.user,
      quotes: await Quote.find({}).sort({ createdAt: -1 }).limit(200).lean(),
      message: { type: 'error', text: 'Quote not found.' }
    });

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

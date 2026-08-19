/**
 * Quote.js — Mongoose Model
 *
 * Stores vendor quotes uploaded as PDFs. A quote is run through a first-pass
 * PDF parser (services/quoteParser.js) that pulls out the vendor, quote number,
 * dates and a list of line items. The user then reviews each line item and
 * approves the ones that should be tied to an existing inventory item.
 *
 * Lifecycle:
 *   PDF uploaded
 *       ↓
 *   [status: pending_review]   ← parsed, waiting for the user to approve items
 *       ↓  (as line items get approved / rejected)
 *   [status: reviewed]         ← every line item has been actioned
 *
 * When a line item is approved and linked to an inventory item, that inventory
 * item's `activeQuote` field is updated so the current quote / price shows up
 * on the Inventory page.
 */

const mongoose = require('mongoose');

const QuoteLineItemSchema = new mongoose.Schema({
  lineNumber:    { type: Number, default: null },
  catalogNumber: { type: String, default: null },
  description:   { type: String, required: true },
  quantity:      { type: Number, default: null },
  unit:          { type: String, default: null },

  // Price the vendor is quoting for this item
  quotedPrice:   { type: Number, default: null },
  // Original / list price if the quote shows one (for comparison)
  originalPrice: { type: Number, default: null },

  // Review workflow
  approvalStatus: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending'
  },

  // Inventory item this line was tied to when approved
  inventoryItemId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ListedInventoryItem',
    default: null
  },
  inventoryItemName: { type: String, default: null }
});

const QuoteSchema = new mongoose.Schema({
  // ── Source ──
  source:   { type: String, default: 'pdf_upload' },
  fileName: { type: String, default: null },

  // ── Raw PDF text (kept as a fallback if parsing missed something) ──
  rawText:  { type: String, default: '' },

  // ── Parsed header fields ──
  vendor:         { type: String, default: null },
  quoteNumber:    { type: String, default: null },
  quoteDate:      { type: String, default: null },   // YYYY-MM-DD string
  expirationDate: { type: Date,   default: null },    // Date so we can query "expiring soon"

  // ── Line items ──
  lineItems: [QuoteLineItemSchema],

  // Fields the parser couldn't confidently extract
  warnings: [String],

  // ── Workflow status ──
  status: {
    type: String,
    enum: ['pending_review', 'reviewed'],
    default: 'pending_review',
    index: true
  },

  uploadedBy: { type: String, default: null }
}, {
  timestamps: true
});

QuoteSchema.index({ expirationDate: 1 });

// Recompute overall status from the state of the line items.
QuoteSchema.methods.refreshStatus = function () {
  const items = this.lineItems || [];
  const allActioned = items.length > 0 &&
    items.every(li => li.approvalStatus === 'approved' || li.approvalStatus === 'rejected');
  this.status = allActioned ? 'reviewed' : 'pending_review';
  return this.status;
};

module.exports = mongoose.model('Quote', QuoteSchema);

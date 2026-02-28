/**
 * PurchaseOrder.js — Mongoose Model
 *
 * Stores every Prendio PO confirmation that comes through the email pipeline.
 *
 * Lifecycle:
 *   email arrives with PO PDF
 *       ↓
 *   [status: auto_approved]   ← immediately synced to inventory
 *   [status: processed]       ← after inventory update completes
 *
 * emailReceivedAt is used by the cleanup job to delete emails older than 7 days.
 * The PO record itself is kept permanently for your procurement audit trail.
 */

const mongoose = require('mongoose');

const LineItemSchema = new mongoose.Schema({
  lineNumber:    { type: Number, default: null },
  catalogNumber: { type: String, default: null },
  description:   { type: String, required: true },
  quantity:      { type: Number, default: null },
  unit:          { type: String, default: null },
  unitPrice:     { type: Number, default: null },
  totalPrice:    { type: Number, default: null }
}, { _id: false });

const PurchaseOrderSchema = new mongoose.Schema({
  // ── Source ──
  source: {
    type: String,
    enum: ['email', 'manual_upload'],
    default: 'email'
  },

  emailMetadata: {
    subject:  String,
    from:     String,
    filename: String
  },

  // ── Raw PDF text (keep this — it's your fallback if parsing went wrong) ──
  rawText: {
    type: String,
    required: true
  },

  // ── Parsed PO data ──
  parsedData: {
    poNumber:        String,
    orderDate:       String,   // Stored as string (YYYY-MM-DD) for simplicity
    deliveryDate:    String,
    vendor:          String,
    requester:       String,
    department:      String,
    shippingAddress: String,
    lineItems:       [LineItemSchema],
    subtotal:        Number,
    tax:             Number,
    shipping:        Number,
    total:           Number,
    currency:        { type: String, default: 'USD' },
    warnings:        [String]  // Any fields the parser couldn't confidently extract
  },

  // ── Workflow status ──
  status: {
    type: String,
    enum: ['auto_approved', 'processed'],
    default: 'auto_approved',
    index: true
  },

  // Sync results (populated after inventory update)
  syncedAt:    Date,
  syncedBy:    { type: String, default: null },   // user ID or 'system_auto'
  syncResults: mongoose.Schema.Types.Mixed,

  // ── Timestamps ──
  emailReceivedAt: { type: Date, default: Date.now },  // Used by cleanup job
  createdAt:       { type: Date, default: Date.now }
});

// ── Common queries ──

PurchaseOrderSchema.statics.getByPONumber = function (poNumber) {
  return this.findOne({ 'parsedData.poNumber': poNumber });
};

PurchaseOrderSchema.statics.getByVendor = function (vendor) {
  return this.find({ 'parsedData.vendor': new RegExp(vendor, 'i') }).sort({ createdAt: -1 });
};

module.exports = mongoose.model('PurchaseOrder', PurchaseOrderSchema);

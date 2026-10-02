/**
 * PrepaidDelivery.js — Mongoose Model
 *
 * A prepaid standing order: the lab pays a vendor up front and receives a
 * fixed quantity of an item every month between a start and end date.
 * Managed from the Quotes page. Each delivery that arrives can be logged so
 * the page can show how many of the prepaid months have been received.
 */

const mongoose = require('mongoose');

const DeliveryLogSchema = new mongoose.Schema({
  receivedAt: { type: Date, default: Date.now },
  quantity:   { type: Number, default: null },
  loggedBy:   { type: String, default: null }
});

const PrepaidDeliverySchema = new mongoose.Schema({
  vendor:          { type: String, required: true, trim: true },
  item:            { type: String, required: true, trim: true },
  catalogNumber:   { type: String, default: null, trim: true },
  referenceNumber: { type: String, default: null, trim: true },  // PO / quote / contract #

  // Optional link to an existing inventory item
  inventoryItemId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ListedInventoryItem',
    default: null
  },
  inventoryItemName: { type: String, default: null },

  quantityPerMonth: { type: Number, required: true, min: 0 },
  unit:             { type: String, default: null, trim: true },
  unitPrice:        { type: Number, default: null, min: 0 },
  // Total paid up front. If blank the page shows qty × price × months.
  amountPaid:       { type: Number, default: null, min: 0 },

  startDate:   { type: Date, required: true },
  endDate:     { type: Date, required: true },
  deliveryDay: { type: Number, default: null, min: 1, max: 31 },  // day of month it usually arrives

  notes: { type: String, default: null, trim: true },

  deliveries: [DeliveryLogSchema],

  createdBy: { type: String, default: null }
}, {
  timestamps: true
});

PrepaidDeliverySchema.index({ endDate: 1 });

// Number of monthly deliveries covered between start and end (inclusive).
PrepaidDeliverySchema.methods.totalMonths = function () {
  return countMonths(this.startDate, this.endDate);
};

function countMonths(start, end) {
  if (!start || !end) return 0;
  const s = new Date(start), e = new Date(end);
  const months = (e.getUTCFullYear() - s.getUTCFullYear()) * 12 + (e.getUTCMonth() - s.getUTCMonth()) + 1;
  return Math.max(0, months);
}

PrepaidDeliverySchema.statics.countMonths = countMonths;

module.exports = mongoose.model('PrepaidDelivery', PrepaidDeliverySchema);

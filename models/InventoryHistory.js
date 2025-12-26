const mongoose = require('mongoose');

const inventoryHistorySchema = new mongoose.Schema({
  itemId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ListedInventoryItem',
    required: true
  },
  itemName: {
    type: String,
    required: true
  },
  changeType: {
    type: String,
    enum: ['quantity_change', 'item_used', 'order_placed', 'cycle_count', 'item_created', 'item_updated', 'item_deleted'],
    required: true
  },
  previousQuantity: {
    type: Number
  },
  newQuantity: {
    type: Number
  },
  quantityChange: {
    type: Number  // Positive for additions, negative for usage
  },
  changeDate: {
    type: Date,
    default: Date.now,
    required: true
  },
  notes: {
    type: String
  },
  userId: {
    type: String  // Can be expanded to reference User model if needed
  }
}, {
  timestamps: true  // Automatically adds createdAt and updatedAt
});

// Index for faster queries
inventoryHistorySchema.index({ itemId: 1, changeDate: -1 });
inventoryHistorySchema.index({ changeDate: -1 });
inventoryHistorySchema.index({ changeType: 1 });

module.exports = mongoose.model('InventoryHistory', inventoryHistorySchema);

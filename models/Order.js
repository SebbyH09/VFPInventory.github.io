const mongoose = require('mongoose');

const Schema = mongoose.Schema;

const OrderItemSchema = new Schema({
    itemId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'ListedInventoryItem',
        required: true
    },
    itemName: {
        type: String,
        required: true
    },
    brand: {
        type: String,
        default: ''
    },
    vendor: {
        type: String,
        default: ''
    },
    catalog: {
        type: String,
        default: ''
    },
    // Variant fields capture which alternate (if any) was ordered.
    // isPrimary=true means the inventory item's main brand/vendor/catalog.
    variantLabel: {
        type: String,
        default: 'Primary'
    },
    variantIsPrimary: {
        type: Boolean,
        default: true
    },
    quantityOrdered: {
        type: Number,
        required: true,
        min: [1, 'Quantity ordered must be at least 1']
    },
    quantityReceived: {
        type: Number,
        default: 0,
        min: 0
    },
    cost: {
        type: Number,
        default: 0,
        min: 0
    }
}, { _id: true });

const OrderSchema = new Schema({
    orderNumber: {
        type: String,
        required: true,
        unique: true
    },
    status: {
        type: String,
        enum: ['open', 'partial', 'received'],
        default: 'open'
    },
    items: [OrderItemSchema],
    createdBy: {
        type: String,
        default: 'unknown'
    },
    notes: {
        type: String,
        trim: true,
        default: ''
    }
}, {
    timestamps: true
});

OrderSchema.index({ orderNumber: 1 });
OrderSchema.index({ status: 1 });
OrderSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Order', OrderSchema);

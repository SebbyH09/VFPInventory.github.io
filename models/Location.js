const mongoose = require('mongoose');

const locationItemSchema = new mongoose.Schema({
    itemName: { type: String, required: true, trim: true },
    specificLocation: { type: String, trim: true, default: '' },
    inventoryItemId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'ListedInventoryItem',
        default: null
    }
});

const locationSchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true, trim: true },
    description: { type: String, trim: true, default: '' },
    items: [locationItemSchema]
}, { timestamps: true });

module.exports = mongoose.model('Location', locationSchema);

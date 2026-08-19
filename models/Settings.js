const mongoose = require('mongoose');

const settingsSchema = new mongoose.Schema({
    // Singleton key - only one settings document
    key: {
        type: String,
        default: 'global',
        unique: true
    },
    // Categories for inventory items
    categories: [{
        name: { type: String, required: true, trim: true },
        value: { type: String, required: true, trim: true }
    }],
    // Timeframe settings
    defaultCycleCountInterval: {
        type: Number,
        default: 90,
        min: 1
    },
    defaultOrderFrequencyPeriod: {
        type: Number,
        default: 30,
        min: 1
    },
    recommendationLookbackDays: {
        type: Number,
        default: 90,
        min: 7
    },
    leadTimeDays: {
        type: Number,
        default: 14,
        min: 1
    },
    lowStockAlertEnabled: {
        type: Boolean,
        default: true
    },
    // Default values for new items
    defaultMinQuantity: {
        type: Number,
        default: 0,
        min: 0
    },
    defaultMaxQuantity: {
        type: Number,
        default: 0,
        min: 0
    }
}, {
    timestamps: true
});

// Ensure only one settings document exists
settingsSchema.statics.getSettings = async function() {
    let settings = await this.findOne({ key: 'global' });
    if (!settings) {
        settings = await this.create({
            key: 'global',
            categories: [
                { name: 'Reagent', value: 'Reagent' },
                { name: 'Filter', value: 'Filter' },
                { name: 'PPE', value: 'PPE' },
                { name: 'Cleaning Supplies', value: 'Cleaning' },
                { name: 'Office Supplies', value: 'Office' },
                { name: 'Lab Consumables', value: 'Consumable' },
                { name: 'Electrical', value: 'Electrical' },
                { name: 'Mechanical Parts', value: 'Mechanical' },
                { name: 'Other', value: 'Other' }
            ]
        });
    }
    return settings;
};

module.exports = mongoose.model('Settings', settingsSchema);

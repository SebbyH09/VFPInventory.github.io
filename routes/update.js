const express = require('express');
const router = express.Router();
const requireAuth = require('../Middleware/auth');
const inventory = require('../models/ListedInventoryItem');
const InventoryHistory = require('../models/InventoryHistory');
const Settings = require('../models/Settings');

// Selectable timeframes for the "not updated in..." filter
const TIMEFRAME_OPTIONS = [
    { months: 1, label: '1 month' },
    { months: 3, label: '3 months' },
    { months: 6, label: '6 months' },
    { months: 12, label: '1 year' },
    { months: 24, label: '2 years' }
];

// Resolve the item's stored-location list, falling back to the legacy field
function resolveStored(item) {
    if (item.storedLocations && item.storedLocations.length) return item.storedLocations;
    return item.location ? [item.location] : [];
}

// Important detail fields whose absence flags an item as "missing information".
// Deliberately excludes cycle counts and inventory quantity numbers.
function computeMissingFields(item) {
    const missing = [];
    if (!item.brand || !String(item.brand).trim()) missing.push('Brand');
    if (!item.vendor || !String(item.vendor).trim()) missing.push('Vendor');
    if (!item.catalog || !String(item.catalog).trim()) missing.push('Catalog #');
    if (!item.type || !String(item.type).trim()) missing.push('Type');
    if (!item.cost || item.cost <= 0) missing.push('Price');
    const stored = resolveStored(item);
    const stocked = item.stockedInLocations || [];
    if (stored.length === 0 && stocked.length === 0) missing.push('Location');
    return missing;
}

// GET - render the update page
router.get('/', requireAuth, async (req, res) => {
    try {
        let months = parseInt(req.query.months, 10);
        if (!TIMEFRAME_OPTIONS.some(o => o.months === months)) {
            months = 6; // default
        }

        const cutoff = new Date();
        cutoff.setMonth(cutoff.getMonth() - months);

        const settings = await Settings.getSettings();
        const items = await inventory.find({ isActive: { $ne: false } }).lean();

        const flaggedItems = [];
        items.forEach(item => {
            const missingFields = computeMissingFields(item);
            const refDate = item.lastReviewedDate || item.updatedAt || item.createdAt || null;
            const isStale = refDate ? new Date(refDate) < cutoff : true;
            const daysSince = refDate
                ? Math.floor((Date.now() - new Date(refDate)) / (1000 * 60 * 60 * 24))
                : null;

            if (missingFields.length > 0 || isStale) {
                flaggedItems.push({
                    _id: item._id,
                    item: item.item,
                    brand: item.brand || '',
                    vendor: item.vendor || '',
                    catalog: item.catalog || '',
                    type: item.type || '',
                    cost: item.cost || 0,
                    storedLocations: resolveStored(item),
                    stockedInLocations: item.stockedInLocations || [],
                    missingFields,
                    isStale,
                    daysSince,
                    lastReviewed: refDate
                });
            }
        });

        // Missing-info items first (most missing fields first), then most stale
        flaggedItems.sort((a, b) => {
            const aMissing = a.missingFields.length;
            const bMissing = b.missingFields.length;
            if ((bMissing > 0) !== (aMissing > 0)) {
                return (bMissing > 0 ? 1 : 0) - (aMissing > 0 ? 1 : 0);
            }
            if (bMissing !== aMissing) return bMissing - aMissing;
            return (b.daysSince || 0) - (a.daysSince || 0);
        });

        res.render('update', {
            user: req.session.user,
            flaggedItems,
            months,
            timeframeOptions: TIMEFRAME_OPTIONS,
            settings,
            totalActive: items.length
        });
    } catch (error) {
        console.error('Update page error:', error);
        res.render('update', {
            user: req.session.user,
            flaggedItems: [],
            months: 6,
            timeframeOptions: TIMEFRAME_OPTIONS,
            settings: null,
            totalActive: 0,
            error: 'Failed to load update data'
        });
    }
});

// POST - acknowledge an item as reviewed (no changes needed)
router.post('/:id/acknowledge', requireAuth, async (req, res) => {
    try {
        const { id } = req.params;
        if (!id || id === 'undefined') {
            return res.status(400).json({ message: 'Invalid item ID' });
        }

        const item = await inventory.findById(id);
        if (!item) {
            return res.status(404).json({ message: 'Item not found' });
        }

        item.lastReviewedDate = new Date();
        await item.save();

        await InventoryHistory.create({
            itemId: item._id,
            itemName: item.item,
            changeType: 'item_updated',
            notes: 'Reviewed via Update page — no changes needed',
            userId: req.session.user?.email || 'unknown'
        });

        res.json({
            message: 'Item marked as reviewed',
            lastReviewedDate: item.lastReviewedDate
        });
    } catch (error) {
        res.status(500).json({ message: 'Error updating item' });
    }
});

module.exports = router;

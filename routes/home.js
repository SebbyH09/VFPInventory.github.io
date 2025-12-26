const express = require('express');
const router = express.Router();
const requireAuth = require('../Middleware/auth');
const ListedInventoryItem = require('../models/ListedInventoryItem');
const InventoryHistory = require('../models/InventoryHistory');

router.get('/', async (req, res) => {
    console.log('===== ROOT ROUTE HIT =====');
    console.log('Is logged in:', req.session.isLoggedIn);

    if (req.session.isLoggedIn) {
        console.log('User is logged in, fetching inventory...');

        try {
            const lowInventoryItems = await ListedInventoryItem.find({
                $expr: { $lt: ['$currentquantity', '$minimumquantity'] }
            }).sort({ item: 1 });

            console.log('Low inventory items found:', lowInventoryItems.length);

            // Fetch items that need cycle counts
            const allItems = await ListedInventoryItem.find({});
            const today = new Date();
            const cycleCountDueItems = allItems.filter(item => {
                const interval = item.cycleCountInterval || 90;
                if (!item.lastCycleCount) {
                    return true; // Never counted
                }
                const daysSinceCount = Math.floor((today - new Date(item.lastCycleCount)) / (1000 * 60 * 60 * 24));
                return daysSinceCount >= interval;
            }).map(item => {
                const daysSinceCount = item.lastCycleCount
                    ? Math.floor((today - new Date(item.lastCycleCount)) / (1000 * 60 * 60 * 24))
                    : null;
                return {
                    ...item.toObject(),
                    daysSinceCount,
                    daysOverdue: daysSinceCount ? daysSinceCount - (item.cycleCountInterval || 90) : null
                };
            }).sort((a, b) => {
                if (!a.daysSinceCount) return -1;
                if (!b.daysSinceCount) return 1;
                return b.daysSinceCount - a.daysSinceCount;
            });

            console.log('Cycle count due items found:', cycleCountDueItems.length);

            res.render('dashboard', {
                user: req.session.user,
                lowInventoryItems: lowInventoryItems,
                cycleCountDueItems: cycleCountDueItems
            });
        } catch (error) {
            console.error('Error fetching inventory items:', error);
            res.render('dashboard', {
                user: req.session.user,
                lowInventoryItems: [],
                cycleCountDueItems: []
            });
        }
    } else {
        console.log('Rendering home page');
        res.render('home');
    }
});

router.get('/dashboard', requireAuth, async (req, res) => {
    console.log('===== DASHBOARD ROUTE HIT =====');

    try {
        const lowInventoryItems = await ListedInventoryItem.find({
            $expr: { $lt: ['$currentquantity', '$minimumquantity'] }
        }).sort({ item: 1 });

        console.log('Low inventory items found:', lowInventoryItems.length);

        // Fetch items that need cycle counts
        const allItems = await ListedInventoryItem.find({});
        const today = new Date();
        const cycleCountDueItems = allItems.filter(item => {
            const interval = item.cycleCountInterval || 90;
            if (!item.lastCycleCount) {
                return true; // Never counted
            }
            const daysSinceCount = Math.floor((today - new Date(item.lastCycleCount)) / (1000 * 60 * 60 * 24));
            return daysSinceCount >= interval;
        }).map(item => {
            const daysSinceCount = item.lastCycleCount
                ? Math.floor((today - new Date(item.lastCycleCount)) / (1000 * 60 * 60 * 24))
                : null;
            return {
                ...item.toObject(),
                daysSinceCount,
                daysOverdue: daysSinceCount ? daysSinceCount - (item.cycleCountInterval || 90) : null
            };
        }).sort((a, b) => {
            if (!a.daysSinceCount) return -1;
            if (!b.daysSinceCount) return 1;
            return b.daysSinceCount - a.daysSinceCount;
        });

        console.log('Cycle count due items found:', cycleCountDueItems.length);

        res.render('dashboard', {
            user: req.session.user,
            lowInventoryItems: lowInventoryItems,
            cycleCountDueItems: cycleCountDueItems
        });
    } catch (error) {
        console.error('Error fetching inventory items:', error);
        res.render('dashboard', {
            user: req.session.user,
            lowInventoryItems: [],
            cycleCountDueItems: []
        });
    }
});

// POST route - update cycle count and quantity
router.post('/dashboard/update-cycle-count', requireAuth, async (req, res) => {
    try {
        const { itemId, newQuantity, date } = req.body;

        if (!itemId || newQuantity === undefined) {
            return res.status(400).json({
                message: "Item ID and new quantity are required"
            });
        }

        // Get the item before update to track quantity change
        const oldItem = await ListedInventoryItem.findById(itemId);

        const updatedItem = await ListedInventoryItem.findByIdAndUpdate(
            itemId,
            {
                $set: {
                    currentquantity: newQuantity,
                    lastCycleCount: date || new Date()
                }
            },
            { new: true, runValidators: true }
        );

        if (!updatedItem) {
            return res.status(404).json({
                message: "Item not found"
            });
        }

        // Log cycle count and quantity change to history
        if (oldItem) {
            const qtyChange = newQuantity - oldItem.currentquantity;

            // Log the cycle count action
            await InventoryHistory.create({
                itemId: updatedItem._id,
                itemName: updatedItem.item,
                changeType: 'cycle_count',
                previousQuantity: oldItem.currentquantity,
                newQuantity: newQuantity,
                quantityChange: qtyChange,
                changeDate: date || new Date(),
                notes: 'Cycle count performed from dashboard',
                userId: req.session.user?.email || 'unknown'
            });
        }

        res.json({
            message: "Cycle count updated successfully",
            item: updatedItem
        });

    } catch (error) {
        console.error('Error updating cycle count:', error);
        res.status(500).json({
            message: "Error updating cycle count",
            error: error.message
        });
    }
});

module.exports = router;
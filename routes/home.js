const express = require('express');
const router = express.Router();
const requireAuth = require('../Middleware/auth');
const ListedInventoryItem = require('../models/ListedInventoryItem');
const InventoryHistory = require('../models/InventoryHistory');
const Order = require('../models/Order');

router.get('/', async (req, res) => {
    if (req.session.isLoggedIn) {
        try {
            const lowInventoryItems = await ListedInventoryItem.find({
                $expr: { $lt: ['$currentquantity', '$minimumquantity'] }
            }).sort({ item: 1 });

            // Fetch orders from the past 14 days
            const fourteenDaysAgo = new Date();
            fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
            const recentOrders = await Order.find({
                createdAt: { $gte: fourteenDaysAgo }
            }).sort({ createdAt: -1 }).lean();

            // Fetch items that need cycle counts
            const today = new Date();
            const defaultLimit = 10; // ← ADD THIS
            
            const allItems = await ListedInventoryItem.find({});
            
            const dueItems = allItems.filter(item => { // ← RENAMED from cycleCountDueItems to dueItems
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
            
            // Only send the first 10 items ← ADD THIS
            const cycleCountDueItems = dueItems.slice(0, defaultLimit);
            console.log('Sending to template:', cycleCountDueItems.length, 'items'); // Optional debug log

            res.render('dashboard', {
                user: req.session.user,
                lowInventoryItems: lowInventoryItems,
                cycleCountDueItems: cycleCountDueItems,
                totalCycleCountsDue: dueItems.length,
                recentOrders: recentOrders
            });
        } catch (error) {
            console.error('Dashboard error:', error);
            res.render('dashboard', {
                user: req.session.user,
                lowInventoryItems: [],
                cycleCountDueItems: [],
                recentOrders: [],
                error: 'Failed to load dashboard data'
            });
        }
    } else {
        res.render('home');
    }
});

// POST route - update cycle count and quantity
router.post('/update-cycle-count', requireAuth, async (req, res) => {
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
        res.status(500).json({
            message: "Error updating cycle count. Please try again later."
        });
    }
});

router.get('/cycle-counts-next', requireAuth, async (req, res) => {
    try {
        const { limit = 1, skip = 0 } = req.query;
        const today = new Date();
        
        // Get all items sorted by last cycle count date (oldest first)
        const allItems = await ListedInventoryItem.find({})
            .sort({ lastCycleCount: 1 })
            .lean();
        
        // Calculate days and filter for items that are due
        const dueItems = allItems.map(item => {
            const interval = item.cycleCountInterval || 90;
            const daysSinceCount = item.lastCycleCount 
                ? Math.floor((today - new Date(item.lastCycleCount)) / (1000 * 60 * 60 * 24))
                : null;
            const daysOverdue = daysSinceCount !== null ? Math.max(0, daysSinceCount - interval) : 0;
            
            return {
                ...item,
                daysSinceCount,
                daysOverdue
            };
        }).filter(item => {
            // Only include items that are due for cycle count
            return !item.lastCycleCount || item.daysSinceCount >= (item.cycleCountInterval || 90);
        });
        
        // Apply skip and limit
        const paginatedItems = dueItems.slice(parseInt(skip), parseInt(skip) + parseInt(limit));
        
        res.json({
            success: true,
            items: paginatedItems,
            total: dueItems.length
        });
    } catch (error) {
        console.error('Error fetching next cycle count items:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch next items'
        });
    }
});

module.exports = router;
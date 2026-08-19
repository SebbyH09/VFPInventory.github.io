const express = require('express');
const router = express.Router();
const requireAuth = require('../Middleware/auth');
const ListedInventoryItem = require('../models/ListedInventoryItem');
const InventoryHistory = require('../models/InventoryHistory');
const Order = require('../models/Order');
const Settings = require('../models/Settings');
const Location = require('../models/Location');
const Quote = require('../models/Quote');

router.get('/', async (req, res) => {
    if (req.session.isLoggedIn) {
        try {
            const settings = await Settings.getSettings();
            const lowStockAlertEnabled = settings.lowStockAlertEnabled !== false;

            const lowInventoryItems = lowStockAlertEnabled ? await ListedInventoryItem.find({
                $expr: { $lte: ['$currentquantity', '$minimumquantity'] },
                minimumquantity: { $gt: 0 },
                isActive: { $ne: false }
            }).sort({ item: 1 }).lean() : [];

            // Fetch orders from the past 14 days
            const fourteenDaysAgo = new Date();
            fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
            const recentOrders = await Order.find({
                createdAt: { $gte: fourteenDaysAgo }
            }).sort({ createdAt: -1 }).lean();

            // Fetch all open/partial orders to cross-reference with low inventory
            const openOrders = await Order.find({
                status: { $in: ['open', 'partial'] }
            }).lean();

            // Build a map: inventoryItemId -> array of order details
            const onOrderMap = {};
            openOrders.forEach(order => {
                order.items.forEach(orderItem => {
                    const itemIdStr = orderItem.itemId.toString();
                    const remaining = orderItem.quantityOrdered - orderItem.quantityReceived;
                    if (remaining > 0) {
                        if (!onOrderMap[itemIdStr]) {
                            onOrderMap[itemIdStr] = [];
                        }
                        onOrderMap[itemIdStr].push({
                            orderNumber: order.orderNumber,
                            orderStatus: order.status,
                            quantityOrdered: orderItem.quantityOrdered,
                            quantityReceived: orderItem.quantityReceived,
                            remaining: remaining,
                            cost: orderItem.cost,
                            createdAt: order.createdAt,
                            createdBy: order.createdBy
                        });
                    }
                });
            });

            // Fetch items that need cycle counts
            const today = new Date();
            const defaultLimit = 10; // ← ADD THIS
            
            const allItems = await ListedInventoryItem.find({ isActive: { $ne: false } });

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

            // Fetch location items not yet linked to inventory
            const allLocations = await Location.find().lean();
            const unlinkedLocationItems = [];
            allLocations.forEach(loc => {
                loc.items.forEach(item => {
                    if (!item.inventoryItemId) {
                        unlinkedLocationItems.push({
                            locationId: loc._id,
                            locationName: loc.name,
                            itemName: item.itemName,
                            specificLocation: item.specificLocation || ''
                        });
                    }
                });
            });

            // Quotes expiring soon (within the configured alert window).
            const quoteExpiryAlertDays = settings.quoteExpiryAlertDays != null ? settings.quoteExpiryAlertDays : 30;
            let expiringQuotes = [];
            if (quoteExpiryAlertDays > 0) {
                const alertCutoff = new Date();
                alertCutoff.setDate(alertCutoff.getDate() + quoteExpiryAlertDays);
                const rawExpiring = await Quote.find({
                    expirationDate: { $ne: null, $lte: alertCutoff }
                }).sort({ expirationDate: 1 }).lean();

                expiringQuotes = rawExpiring.map(q => {
                    const exp = new Date(q.expirationDate);
                    const daysLeft = Math.ceil((exp - today) / (1000 * 60 * 60 * 24));
                    const approvedCount = (q.lineItems || []).filter(li => li.approvalStatus === 'approved').length;
                    return {
                        _id: q._id,
                        vendor: q.vendor,
                        quoteNumber: q.quoteNumber,
                        expirationDate: q.expirationDate,
                        daysLeft,
                        approvedCount
                    };
                });
            }

            res.render('dashboard', {
                user: req.session.user,
                lowInventoryItems: lowInventoryItems,
                lowStockAlertEnabled: lowStockAlertEnabled,
                cycleCountDueItems: cycleCountDueItems,
                totalCycleCountsDue: dueItems.length,
                recentOrders: recentOrders,
                onOrderMap: onOrderMap,
                unlinkedLocationItems: unlinkedLocationItems,
                expiringQuotes: expiringQuotes
            });
        } catch (error) {
            console.error('Dashboard error:', error);
            res.render('dashboard', {
                user: req.session.user,
                lowInventoryItems: [],
                lowStockAlertEnabled: true,
                cycleCountDueItems: [],
                recentOrders: [],
                onOrderMap: {},
                unlinkedLocationItems: [],
                expiringQuotes: [],
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
        const allItems = await ListedInventoryItem.find({ isActive: { $ne: false } })
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
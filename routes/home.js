const express = require('express');
const router = express.Router();
const requireAuth = require('../Middleware/auth');
const ListedInventoryItem = require('../models/ListedInventoryItem');
const InventoryHistory = require('../models/InventoryHistory');
const Order = require('../models/Order');
const Settings = require('../models/Settings');
const Location = require('../models/Location');
const Quote = require('../models/Quote');
const { DAY_MS, startOfWeek, annotateItem, compareUrgency } = require('../services/cycleCounts');

const CONSUMPTION_TYPES = ['quantity_consumed', 'quantity_change', 'item_used'];
const CONSUMPTION_WINDOWS = [7, 30, 90];

function dayKey(d) {
    const x = new Date(d);
    return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0');
}

// Daily consumed units for the last 90 days plus the top items for each window
async function buildConsumption(now) {
    const maxDays = Math.max(...CONSUMPTION_WINDOWS);
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const since = new Date(today);
    since.setDate(since.getDate() - (maxDays - 1));

    const records = await InventoryHistory.find({
        changeType: { $in: CONSUMPTION_TYPES },
        quantityChange: { $lt: 0 },
        changeDate: { $gte: since }
    }).select('itemName quantityChange changeDate').lean();

    const days = [];
    const index = {};
    for (let i = 0; i < maxDays; i++) {
        const d = new Date(since);
        d.setDate(d.getDate() + i);
        index[dayKey(d)] = days.length;
        days.push({ date: dayKey(d), total: 0 });
    }

    const topByWindow = {};
    CONSUMPTION_WINDOWS.forEach(w => { topByWindow[w] = {}; });

    records.forEach(r => {
        const qty = Math.abs(r.quantityChange || 0);
        const i = index[dayKey(r.changeDate)];
        if (i === undefined) return;
        days[i].total += qty;
        const age = maxDays - 1 - i; // 0 = today
        CONSUMPTION_WINDOWS.forEach(w => {
            if (age < w) {
                topByWindow[w][r.itemName] = (topByWindow[w][r.itemName] || 0) + qty;
            }
        });
    });

    const top = {};
    CONSUMPTION_WINDOWS.forEach(w => {
        top[w] = Object.entries(topByWindow[w])
            .map(([name, total]) => ({ name, total }))
            .sort((a, b) => b.total - a.total)
            .slice(0, 5);
    });

    return { days, top, windows: CONSUMPTION_WINDOWS };
}

router.get('/', async (req, res) => {
    if (req.session.isLoggedIn) {
        try {
            const now = new Date();
            const settings = await Settings.getSettings();
            const lowStockAlertEnabled = settings.lowStockAlertEnabled !== false;
            const leadTimeDays = settings.leadTimeDays || 14;

            const lowInventoryItems = lowStockAlertEnabled ? await ListedInventoryItem.find({
                $expr: { $lte: ['$currentquantity', '$minimumquantity'] },
                minimumquantity: { $gt: 0 },
                isActive: { $ne: false }
            }).sort({ item: 1 }).lean() : [];

            // Fetch orders from the past 14 days
            const fourteenDaysAgo = new Date(now);
            fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
            const recentOrders = await Order.find({
                createdAt: { $gte: fourteenDaysAgo }
            }).sort({ createdAt: -1 }).lean();

            // Fetch all open/partial orders to cross-reference with low inventory
            const openOrders = await Order.find({
                status: { $in: ['open', 'partial'] }
            }).lean();

            // Expected delivery for each open order: the date set on the order,
            // otherwise an estimate of order date + configured lead time.
            const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            const expectedFor = order => {
                if (order.expectedDeliveryDate) {
                    return { date: new Date(order.expectedDeliveryDate), isEstimate: false };
                }
                const est = new Date(order.createdAt);
                est.setDate(est.getDate() + leadTimeDays);
                return { date: est, isEstimate: true };
            };

            const upcomingDeliveries = openOrders.map(order => {
                const exp = expectedFor(order);
                const expDay = new Date(exp.date.getFullYear(), exp.date.getMonth(), exp.date.getDate());
                const remainingUnits = order.items.reduce((s, oi) => s + Math.max(0, oi.quantityOrdered - oi.quantityReceived), 0);
                return {
                    _id: order._id,
                    orderNumber: order.orderNumber,
                    status: order.status,
                    itemCount: order.items.length,
                    itemNames: order.items.map(oi => oi.itemName),
                    remainingUnits,
                    expectedDate: exp.date,
                    isEstimate: exp.isEstimate,
                    daysUntil: Math.round((expDay - todayStart) / DAY_MS)
                };
            }).sort((a, b) => a.expectedDate - b.expectedDate);

            const orderExpectedMap = {};
            upcomingDeliveries.forEach(d => { orderExpectedMap[d._id.toString()] = d; });

            // Build a map: inventoryItemId -> array of order details
            const onOrderMap = {};
            openOrders.forEach(order => {
                const exp = orderExpectedMap[order._id.toString()];
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
                            createdBy: order.createdBy,
                            expectedDate: exp ? exp.expectedDate : null,
                            isEstimate: exp ? exp.isEstimate : true
                        });
                    }
                });
            });

            // Cycle counts due
            const activeItems = await ListedInventoryItem.find({ isActive: { $ne: false } }).lean();
            const dueItems = activeItems
                .map(item => annotateItem(item, now))
                .filter(item => item.isDue)
                .sort(compareUrgency);

            // Cycle counts completed this week (Mon–Sun)
            const weekStart = startOfWeek(now);
            const weekCounts = await InventoryHistory.find({
                changeType: 'cycle_count',
                changeDate: { $gte: weekStart }
            }).sort({ changeDate: -1 }).lean();
            const countedThisWeek = new Set(weekCounts.map(r => r.itemId.toString())).size;

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
                const alertCutoff = new Date(now);
                alertCutoff.setDate(alertCutoff.getDate() + quoteExpiryAlertDays);
                const rawExpiring = await Quote.find({
                    expirationDate: { $ne: null, $lte: alertCutoff }
                }).sort({ expirationDate: 1 }).lean();

                expiringQuotes = rawExpiring.map(q => {
                    const exp = new Date(q.expirationDate);
                    const daysLeft = Math.ceil((exp - now) / DAY_MS);
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

            const consumption = await buildConsumption(now);

            res.render('dashboard', {
                user: req.session.user,
                lowInventoryItems,
                lowStockAlertEnabled,
                cycleCountDueItems: dueItems.slice(0, 6),
                totalCycleCountsDue: dueItems.length,
                cycleCountsThisWeek: weekCounts.slice(0, 5),
                countedThisWeek,
                weekStart,
                recentOrders,
                upcomingDeliveries,
                onOrderMap,
                unlinkedLocationItems,
                expiringQuotes,
                consumption
            });
        } catch (error) {
            console.error('Dashboard error:', error);
            res.render('dashboard', {
                user: req.session.user,
                lowInventoryItems: [],
                lowStockAlertEnabled: true,
                cycleCountDueItems: [],
                totalCycleCountsDue: 0,
                cycleCountsThisWeek: [],
                countedThisWeek: 0,
                weekStart: startOfWeek(),
                recentOrders: [],
                upcomingDeliveries: [],
                onOrderMap: {},
                unlinkedLocationItems: [],
                expiringQuotes: [],
                consumption: { days: [], top: {}, windows: CONSUMPTION_WINDOWS },
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
        const { itemId, date, source } = req.body;
        const newQuantity = Number(req.body.newQuantity);

        if (!itemId || req.body.newQuantity === undefined || req.body.newQuantity === '') {
            return res.status(400).json({
                message: "Item ID and new quantity are required"
            });
        }
        if (!Number.isInteger(newQuantity) || newQuantity < 0) {
            return res.status(400).json({
                message: "Quantity must be a whole number of 0 or more"
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
                notes: source === 'cycle-counts'
                    ? 'Cycle count performed from Cycle Counts page'
                    : 'Cycle count performed from dashboard',
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
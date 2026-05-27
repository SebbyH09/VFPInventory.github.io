const express = require('express');
const router = express.Router();
const inventory = require('../models/ListedInventoryItem');
const InventoryHistory = require('../models/InventoryHistory');
const Order = require('../models/Order');
const Settings = require('../models/Settings');
const Location = require('../models/Location');
const requireAuth = require('../Middleware/auth');

// GET route - render page with existing inventory
router.get('/', requireAuth, async (req, res) => {
    try {
        // Fetch all inventory items from database
        const inventoryItems = await inventory.find({}).sort({ createdAt: -1 });

        // Fetch open/partial orders and build a map of itemId -> open order count
        const openOrders = await Order.find({ status: { $in: ['open', 'partial'] } });
        const orderCountMap = {};
        openOrders.forEach(order => {
            order.items.forEach(orderItem => {
                const itemIdStr = orderItem.itemId.toString();
                if (!orderCountMap[itemIdStr]) {
                    orderCountMap[itemIdStr] = 0;
                }
                const remaining = orderItem.quantityOrdered - orderItem.quantityReceived;
                if (remaining > 0) {
                    orderCountMap[itemIdStr] += remaining;
                }
            });
        });

        const settings = await Settings.getSettings();

        const allLocations = await Location.find().lean();
        let unlinkedLocationCount = 0;
        allLocations.forEach(loc => {
            loc.items.forEach(item => {
                if (!item.inventoryItemId) unlinkedLocationCount++;
            });
        });

        res.render('entry', {
            inventoryItems: inventoryItems,
            orderCountMap: orderCountMap,
            settings: settings,
            user: req.session.user,
            unlinkedLocationCount: unlinkedLocationCount
        });
    } catch (error) {
        res.render('entry', {
            inventoryItems: [],
            orderCountMap: {},
            settings: null,
            user: req.session.user,
            unlinkedLocationCount: 0,
            error: 'Failed to load inventory data'
        });
    }
});

// POST route - save new inventory
router.post("/", requireAuth, async (req, res) => {
    try {
        const { newItems, updatedItems } = req.body;
        
        const results = {
            newCount: 0,
            updatedCount: 0,
            savedItems: [],
            updatedItemsDetails: []
        };
        
        // Handle new items
        if (newItems && newItems.length > 0) {
            const itemsToInsert = newItems.map(row => {
                const itemData = {
                    item: row[0],
                    brand: row[1],
                    vendor: row[2],
                    catalog: row[3],
                    currentquantity: parseInt(row[4]) || 0,
                    minimumquantity: parseInt(row[5]) || 0,
                    maximumquantity: parseInt(row[6]) || 0,
                    location: row[7],
                    type: row[8],
                    cost: parseFloat(row[9]) || 0,
                    cycleCountInterval: parseInt(row[10]) || 90,
                    orderFrequencyPeriod: parseInt(row[11]) || 30,
                    useCycleCount: row[12] !== undefined ? row[12] : true,
                    isActive: row[14] !== undefined ? row[14] : true
                };
                if (row[13] && Array.isArray(row[13])) {
                    itemData.alternateItems = row[13];
                }
                return itemData;
            });

            const savedItems = await inventory.insertMany(itemsToInsert);
            results.savedItems = savedItems;
            results.newCount = savedItems.length;

            // Log creation of new items to history
            const historyEntries = savedItems.map(item => ({
                itemId: item._id,
                itemName: item.item,
                changeType: 'item_created',
                newQuantity: item.currentquantity,
                quantityChange: item.currentquantity,
                notes: 'Item created',
                userId: req.session.user?.email || 'unknown'
            }));
            await InventoryHistory.insertMany(historyEntries);
        }
        
        // Handle updated items
        if (updatedItems && updatedItems.length > 0) {
            for (const update of updatedItems) {
                // Get the item before update to track changes
                const oldItem = await inventory.findById(update.id);

                const updatedItem = await inventory.findByIdAndUpdate(
                    update.id,
                    { $set: update.changes },
                    { new: true, runValidators: true }
                );

                if (updatedItem && oldItem) {
                    results.updatedItemsDetails.push(updatedItem);
                    results.updatedCount++;

                    // Log quantity changes to history
                    if (update.changes.currentquantity !== undefined &&
                        oldItem.currentquantity !== update.changes.currentquantity) {
                        const qtyChange = update.changes.currentquantity - oldItem.currentquantity;
                        const costPerUnit = updatedItem.cost || oldItem.cost || 0;
                        await InventoryHistory.create({
                            itemId: updatedItem._id,
                            itemName: updatedItem.item,
                            changeType: 'quantity_change',
                            previousQuantity: oldItem.currentquantity,
                            newQuantity: update.changes.currentquantity,
                            quantityChange: qtyChange,
                            costPerUnit: costPerUnit,
                            totalCost: Math.abs(qtyChange) * costPerUnit,
                            notes: 'Quantity updated via edit',
                            userId: req.session.user?.email || 'unknown'
                        });
                    }
                }
            }
        }
        
        res.json({ 
            message: `Success! Added ${results.newCount} new item(s), updated ${results.updatedCount} item(s)`,
            results
        });
        
    } catch (error) {
        res.status(500).json({
            message: "Error saving data. Please try again later."
        });
    }
});

// PATCH route - toggle item active/inactive status
router.patch("/:id/toggle-active", requireAuth, async (req, res) => {
    try {
        const { id } = req.params;

        if (!id || id === 'undefined') {
            return res.status(400).json({ message: "Invalid item ID" });
        }

        const item = await inventory.findById(id);
        if (!item) {
            return res.status(404).json({ message: "Item not found" });
        }

        const newStatus = !item.isActive;
        item.isActive = newStatus;
        await item.save();

        // Log status change to history
        await InventoryHistory.create({
            itemId: item._id,
            itemName: item.item,
            changeType: 'item_updated',
            notes: newStatus ? 'Item reactivated' : 'Item marked inactive',
            userId: req.session.user?.email || 'unknown'
        });

        res.json({
            message: newStatus ? 'Item reactivated' : 'Item marked inactive',
            isActive: newStatus
        });
    } catch (error) {
        res.status(500).json({ message: "Error updating item status." });
    }
});

// GET route - get min/max recommendations for an item
router.get('/:id/recommendations', requireAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const item = await inventory.findById(id);
        if (!item) {
            return res.status(404).json({ message: 'Item not found' });
        }

        const settings = await Settings.getSettings();
        const lookbackDays = settings.recommendationLookbackDays || 90;
        const leadTimeDays = settings.leadTimeDays || 14;
        const reorderCycleDays = settings.defaultOrderFrequencyPeriod || 30;

        const lookbackDate = new Date();
        lookbackDate.setDate(lookbackDate.getDate() - lookbackDays);

        const history = await InventoryHistory.find({
            itemId: id,
            changeType: { $in: ['quantity_consumed', 'quantity_change'] },
            changeDate: { $gte: lookbackDate }
        }).sort({ changeDate: -1 });

        // Calculate total consumption (negative quantity changes = usage)
        let totalConsumed = 0;
        let consumptionEvents = 0;
        history.forEach(entry => {
            const change = entry.quantityChange || 0;
            if (change < 0) {
                totalConsumed += Math.abs(change);
                consumptionEvents++;
            }
        });

        // Calculate daily consumption rate
        const dailyRate = totalConsumed / lookbackDays;

        // Safety stock: enough for lead time
        const safetyStock = Math.ceil(dailyRate * leadTimeDays);
        // Recommended min: safety stock + average consumption during lead time
        const recommendedMin = Math.max(1, Math.ceil(safetyStock + (dailyRate * 7)));
        // Recommended max: enough stock for the reorder cycle
        const recommendedMax = Math.max(recommendedMin + 1, Math.ceil(dailyRate * reorderCycleDays));

        // Determine if a recommendation should be shown
        const hasData = consumptionEvents >= 2;
        const currentMin = item.minimumquantity || 0;
        const currentMax = item.maximumquantity || 0;
        const minDiffers = hasData && Math.abs(recommendedMin - currentMin) > 0;
        const maxDiffers = hasData && Math.abs(recommendedMax - currentMax) > 0;
        const hasRecommendation = minDiffers || maxDiffers;

        res.json({
            hasRecommendation,
            hasData,
            currentMin,
            currentMax,
            recommendedMin: hasData ? recommendedMin : null,
            recommendedMax: hasData ? recommendedMax : null,
            dailyRate: Math.round(dailyRate * 100) / 100,
            totalConsumed,
            consumptionEvents,
            lookbackDays
        });
    } catch (error) {
        res.status(500).json({ message: 'Error calculating recommendations' });
    }
});

// PATCH route - adopt recommendations for an item
router.patch('/:id/adopt-recommendations', requireAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const { minimumquantity, maximumquantity } = req.body;

        const item = await inventory.findById(id);
        if (!item) {
            return res.status(404).json({ message: 'Item not found' });
        }

        const oldMin = item.minimumquantity;
        const oldMax = item.maximumquantity;

        item.minimumquantity = minimumquantity;
        item.maximumquantity = maximumquantity;
        await item.save();

        // Log the change
        await InventoryHistory.create({
            itemId: item._id,
            itemName: item.item,
            changeType: 'item_updated',
            notes: `Adopted recommendations: Min ${oldMin} → ${minimumquantity}, Max ${oldMax} → ${maximumquantity}`,
            userId: req.session.user?.email || 'unknown'
        });

        res.json({ message: 'Recommendations adopted successfully', item });
    } catch (error) {
        res.status(500).json({ message: 'Error adopting recommendations' });
    }
});

// DELETE route - delete inventory item by ID
router.delete("/:id", requireAuth, async (req, res) => {
    try {
        const { id } = req.params;

        // Validate ID format
        if (!id || id === 'undefined') {
            return res.status(400).json({
                message: "Invalid item ID"
            });
        }

        // Delete the item from database
        const deletedItem = await inventory.findByIdAndDelete(id);

        if (!deletedItem) {
            return res.status(404).json({
                message: "Item not found"
            });
        }

        // Log deletion to history
        await InventoryHistory.create({
            itemId: deletedItem._id,
            itemName: deletedItem.item,
            changeType: 'item_deleted',
            previousQuantity: deletedItem.currentquantity,
            notes: 'Item deleted',
            userId: req.session.user?.email || 'unknown'
        });

        res.json({
            message: "Item deleted successfully",
            deletedItem
        });

    } catch (error) {
        res.status(500).json({
            message: "Error deleting item. Please try again later."
        });
    }
});

module.exports = router;
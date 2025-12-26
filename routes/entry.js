const express = require('express');
const router = express.Router();
const inventory = require('../models/ListedInventoryItem');
const InventoryHistory = require('../models/InventoryHistory');
const requireAuth = require('../Middleware/auth');

// GET route - render page with existing inventory
router.get('/', requireAuth, async (req, res) => {
    try {
        // Fetch all inventory items from database
        const inventoryItems = await inventory.find({}).sort({ createdAt: -1 });
        
        res.render('entry', { 
            inventoryItems: inventoryItems,
            user: req.session.user
        });
    } catch (error) {
        console.error('Error fetching inventory:', error);
        res.render('entry', { 
            inventoryItems: [],
            user: req.session.user
        });
    }
});

// POST route - save new inventory
router.post("/", requireAuth, async (req, res) => {
    try {
        console.log('Entry route hit!');
        const { newItems, updatedItems } = req.body;
        
        const results = {
            newCount: 0,
            updatedCount: 0,
            savedItems: [],
            updatedItemsDetails: []
        };
        
        // Handle new items
        if (newItems && newItems.length > 0) {
            const itemsToInsert = newItems.map(row => ({
                item: row[0],
                brand: row[1],
                vendor: row[2],
                catalog: row[3],
                currentquantity: parseInt(row[4]) || 0,
                minimumquantity: parseInt(row[5]) || 0,
                maximumquantity: parseInt(row[6]) || 0,
                location: row[7],
                type: row[8],
                cycleCountInterval: parseInt(row[9]) || 90,
                orderFrequencyPeriod: parseInt(row[10]) || 30
            }));

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
                        await InventoryHistory.create({
                            itemId: updatedItem._id,
                            itemName: updatedItem.item,
                            changeType: 'quantity_change',
                            previousQuantity: oldItem.currentquantity,
                            newQuantity: update.changes.currentquantity,
                            quantityChange: qtyChange,
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
        console.error('Error saving inventory:', error);
        res.status(500).json({
            message: "Error saving data",
            error: error.message
        });
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
        console.error('Error deleting inventory item:', error);
        res.status(500).json({
            message: "Error deleting item",
            error: error.message
        });
    }
});

// POST route - mark item as used
router.post("/mark-used", requireAuth, async (req, res) => {
    try {
        const { itemId, date } = req.body;

        if (!itemId) {
            return res.status(400).json({
                message: "Item ID is required"
            });
        }

        const updatedItem = await inventory.findByIdAndUpdate(
            itemId,
            { $set: { lastUsedDate: date || new Date() } },
            { new: true, runValidators: true }
        );

        if (!updatedItem) {
            return res.status(404).json({
                message: "Item not found"
            });
        }

        // Log usage to history
        await InventoryHistory.create({
            itemId: updatedItem._id,
            itemName: updatedItem.item,
            changeType: 'item_used',
            changeDate: date || new Date(),
            notes: 'Item marked as used',
            userId: req.session.user?.email || 'unknown'
        });

        res.json({
            message: "Item marked as used successfully",
            item: updatedItem
        });

    } catch (error) {
        console.error('Error marking item as used:', error);
        res.status(500).json({
            message: "Error marking item as used",
            error: error.message
        });
    }
});

// POST route - record an order
router.post("/record-order", requireAuth, async (req, res) => {
    try {
        const { itemId, date } = req.body;

        if (!itemId) {
            return res.status(400).json({
                message: "Item ID is required"
            });
        }

        const updatedItem = await inventory.findByIdAndUpdate(
            itemId,
            { $push: { orderHistory: date || new Date() } },
            { new: true, runValidators: true }
        );

        if (!updatedItem) {
            return res.status(404).json({
                message: "Item not found"
            });
        }

        // Log order to history
        await InventoryHistory.create({
            itemId: updatedItem._id,
            itemName: updatedItem.item,
            changeType: 'order_placed',
            changeDate: date || new Date(),
            notes: 'Order recorded',
            userId: req.session.user?.email || 'unknown'
        });

        res.json({
            message: "Order recorded successfully",
            item: updatedItem
        });

    } catch (error) {
        console.error('Error recording order:', error);
        res.status(500).json({
            message: "Error recording order",
            error: error.message
        });
    }
});

// POST route - perform cycle count
router.post("/cycle-count", requireAuth, async (req, res) => {
    try {
        const { itemId, date } = req.body;

        if (!itemId) {
            return res.status(400).json({
                message: "Item ID is required"
            });
        }

        const updatedItem = await inventory.findByIdAndUpdate(
            itemId,
            { $set: { lastCycleCount: date || new Date() } },
            { new: true, runValidators: true }
        );

        if (!updatedItem) {
            return res.status(404).json({
                message: "Item not found"
            });
        }

        // Log cycle count to history
        await InventoryHistory.create({
            itemId: updatedItem._id,
            itemName: updatedItem.item,
            changeType: 'cycle_count',
            changeDate: date || new Date(),
            notes: 'Cycle count performed',
            userId: req.session.user?.email || 'unknown'
        });

        res.json({
            message: "Cycle count recorded successfully",
            item: updatedItem
        });

    } catch (error) {
        console.error('Error recording cycle count:', error);
        res.status(500).json({
            message: "Error recording cycle count",
            error: error.message
        });
    }
});

module.exports = router;
const express = require('express');
const router = express.Router();
const inventory = require('../models/ListedInventoryItem');
const InventoryHistory = require('../models/InventoryHistory');
const requireAuth = require('../Middleware/auth');

// GET route - render consume page with existing inventory
router.get('/', requireAuth, async (req, res) => {
    try {
        // Fetch all inventory items from database
        const inventoryItems = await inventory.find({}).sort({ item: 1 });

        res.render('consume', {
            inventoryItems: inventoryItems,
            user: req.session.user
        });
    } catch (error) {
        res.render('consume', {
            inventoryItems: [],
            user: req.session.user,
            error: 'Failed to load inventory data'
        });
    }
});

// POST route - consume items
router.post("/", requireAuth, async (req, res) => {
    try {
        const { consumedItems } = req.body;

        if (!consumedItems || consumedItems.length === 0) {
            return res.status(400).json({
                message: "No items to consume"
            });
        }

        const results = {
            updatedCount: 0,
            errors: []
        };

        // Process each consumed item
        for (const consumeData of consumedItems) {
            try {
                const { itemId, quantityConsumed } = consumeData;

                if (!itemId || quantityConsumed === undefined || quantityConsumed <= 0) {
                    results.errors.push({
                        itemId,
                        message: "Invalid item data"
                    });
                    continue;
                }

                // Get the item before update
                const oldItem = await inventory.findById(itemId);

                if (!oldItem) {
                    results.errors.push({
                        itemId,
                        message: "Item not found"
                    });
                    continue;
                }

                // Calculate new quantity
                const newQuantity = Math.max(0, oldItem.currentquantity - quantityConsumed);

                // Update the item
                const updatedItem = await inventory.findByIdAndUpdate(
                    itemId,
                    {
                        $set: {
                            currentquantity: newQuantity,
                            lastUsedDate: new Date()
                        }
                    },
                    { new: true, runValidators: true }
                );

                if (updatedItem) {
                    results.updatedCount++;

                    // Log consumption to history
                    await InventoryHistory.create({
                        itemId: updatedItem._id,
                        itemName: updatedItem.item,
                        changeType: 'quantity_consumed',
                        previousQuantity: oldItem.currentquantity,
                        newQuantity: newQuantity,
                        quantityChange: -quantityConsumed,
                        costPerUnit: updatedItem.cost || 0,
                        totalCost: quantityConsumed * (updatedItem.cost || 0),
                        notes: `Consumed ${quantityConsumed} unit(s)`,
                        userId: req.session.user?.email || 'unknown'
                    });
                }
            } catch (itemError) {
                results.errors.push({
                    itemId: consumeData.itemId,
                    message: "Error processing item"
                });
            }
        }

        res.json({
            message: `Successfully consumed ${results.updatedCount} item(s)`,
            results
        });

    } catch (error) {
        res.status(500).json({
            message: "Error consuming items. Please try again later."
        });
    }
});

module.exports = router;

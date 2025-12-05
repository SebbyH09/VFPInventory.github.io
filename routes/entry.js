const express = require('express');
const router = express.Router();
const inventory = require('../models/ListedInventoryItem');
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
                maximumquantity: parseInt(row[6]) || 0
            }));
            
            const savedItems = await inventory.insertMany(itemsToInsert);
            results.savedItems = savedItems;
            results.newCount = savedItems.length;
        }
        
        // Handle updated items
        if (updatedItems && updatedItems.length > 0) {
            for (const update of updatedItems) {
                const updatedItem = await inventory.findByIdAndUpdate(
                    update.id,
                    { $set: update.changes },
                    { new: true, runValidators: true }
                );
                
                if (updatedItem) {
                    results.updatedItemsDetails.push(updatedItem);
                    results.updatedCount++;
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

module.exports = router;
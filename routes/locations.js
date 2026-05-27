const express = require('express');
const router = express.Router();
const requireAuth = require('../Middleware/auth');
const Location = require('../models/Location');
const ListedInventoryItem = require('../models/ListedInventoryItem');

router.get('/', requireAuth, async (req, res) => {
    try {
        const locations = await Location.find().sort({ name: 1 }).lean();
        const inventoryItems = await ListedInventoryItem.find({ isActive: { $ne: false } })
            .select('_id item location')
            .sort({ item: 1 })
            .lean();

        res.render('locations', {
            locations,
            inventoryItems,
            user: req.session.user
        });
    } catch (error) {
        res.render('locations', {
            locations: [],
            inventoryItems: [],
            user: req.session.user,
            error: 'Failed to load locations data'
        });
    }
});

router.post('/', requireAuth, async (req, res) => {
    try {
        const { name, description } = req.body;
        if (!name || !name.trim()) {
            return res.status(400).json({ message: 'Location name is required' });
        }
        const location = new Location({
            name: name.trim(),
            description: description ? description.trim() : ''
        });
        await location.save();
        res.json({ message: 'Location created', location });
    } catch (error) {
        if (error.code === 11000) {
            return res.status(400).json({ message: 'A location with this name already exists' });
        }
        res.status(500).json({ message: 'Error creating location' });
    }
});

router.put('/:id', requireAuth, async (req, res) => {
    try {
        const { name, description } = req.body;
        if (!name || !name.trim()) {
            return res.status(400).json({ message: 'Location name is required' });
        }
        const location = await Location.findByIdAndUpdate(
            req.params.id,
            { name: name.trim(), description: description ? description.trim() : '' },
            { new: true, runValidators: true }
        );
        if (!location) return res.status(404).json({ message: 'Location not found' });
        res.json({ message: 'Location updated', location });
    } catch (error) {
        if (error.code === 11000) {
            return res.status(400).json({ message: 'A location with this name already exists' });
        }
        res.status(500).json({ message: 'Error updating location' });
    }
});

router.delete('/:id', requireAuth, async (req, res) => {
    try {
        const location = await Location.findByIdAndDelete(req.params.id);
        if (!location) return res.status(404).json({ message: 'Location not found' });
        res.json({ message: 'Location deleted' });
    } catch (error) {
        res.status(500).json({ message: 'Error deleting location' });
    }
});

router.post('/:id/items', requireAuth, async (req, res) => {
    try {
        const { itemName, specificLocation, inventoryItemId } = req.body;
        if (!itemName || !itemName.trim()) {
            return res.status(400).json({ message: 'Item name is required' });
        }
        const location = await Location.findById(req.params.id);
        if (!location) return res.status(404).json({ message: 'Location not found' });

        location.items.push({
            itemName: itemName.trim(),
            specificLocation: specificLocation ? specificLocation.trim() : '',
            inventoryItemId: inventoryItemId || null
        });
        await location.save();
        res.json({ message: 'Item added', location });
    } catch (error) {
        res.status(500).json({ message: 'Error adding item' });
    }
});

router.patch('/:id/items/:itemId', requireAuth, async (req, res) => {
    try {
        const { itemName, specificLocation, inventoryItemId } = req.body;
        const location = await Location.findById(req.params.id);
        if (!location) return res.status(404).json({ message: 'Location not found' });

        const item = location.items.id(req.params.itemId);
        if (!item) return res.status(404).json({ message: 'Item not found' });

        if (itemName !== undefined) item.itemName = itemName.trim();
        if (specificLocation !== undefined) item.specificLocation = specificLocation.trim();
        if (inventoryItemId !== undefined) item.inventoryItemId = inventoryItemId || null;

        await location.save();
        res.json({ message: 'Item updated', location });
    } catch (error) {
        res.status(500).json({ message: 'Error updating item' });
    }
});

router.delete('/:id/items/:itemId', requireAuth, async (req, res) => {
    try {
        const location = await Location.findById(req.params.id);
        if (!location) return res.status(404).json({ message: 'Location not found' });

        location.items.pull({ _id: req.params.itemId });
        await location.save();
        res.json({ message: 'Item removed', location });
    } catch (error) {
        res.status(500).json({ message: 'Error removing item' });
    }
});

module.exports = router;

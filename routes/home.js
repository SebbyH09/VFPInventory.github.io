const express = require('express');
const router = express.Router();
const requireAuth = require('../Middleware/auth');
const ListedInventoryItem = require('../models/ListedInventoryItem');





router.get('/', async (req, res) => {
    if (req.session.isLoggedIn) {
        try {
            // First, get all items to see what we're working with
            const allItems = await ListedInventoryItem.find({});
            console.log('Total items in database:', allItems.length);

            // Log a sample item to see the data structure
            if (allItems.length > 0) {
                console.log('Sample item:', JSON.stringify(allItems[0], null, 2));
            }

            // Find items where current quantity is less than minimum quantity
            const lowInventoryItems = await ListedInventoryItem.find({}).then(items => {
                return items.filter(item => {
                    const current = Number(item.currentquantity);
                    const minimum = Number(item.minimumquantity);
                    console.log(`Item: ${item.item}, Current: ${current}, Minimum: ${minimum}, IsLow: ${current < minimum}`);
                    return current < minimum;
                });
            });

            console.log('Low inventory items found:', lowInventoryItems.length);

            res.render('dashboard', {
                user: req.session.user,
                lowInventoryItems: lowInventoryItems
            });
        } catch (error) {
            console.error('Error fetching low inventory items:', error);
            res.render('dashboard', {
                user: req.session.user,
                lowInventoryItems: []
            });
        }
    } else {
        res.render('home');
    }
});



router.get('/dashboard', requireAuth, async (req, res) => {
    try {
        // First, get all items to see what we're working with
        const allItems = await ListedInventoryItem.find({});
        console.log('Total items in database:', allItems.length);

        // Log a sample item to see the data structure
        if (allItems.length > 0) {
            console.log('Sample item:', JSON.stringify(allItems[0], null, 2));
        }

        // Find items where current quantity is less than minimum quantity
        const lowInventoryItems = await ListedInventoryItem.find({}).then(items => {
            return items.filter(item => {
                const current = Number(item.currentquantity);
                const minimum = Number(item.minimumquantity);
                console.log(`Item: ${item.item}, Current: ${current}, Minimum: ${minimum}, IsLow: ${current < minimum}`);
                return current < minimum;
            });
        });

        console.log('Low inventory items found:', lowInventoryItems.length);

        res.render('dashboard', {
            user: req.session.user,
            lowInventoryItems: lowInventoryItems
        });
    } catch (error) {
        console.error('Error fetching low inventory items:', error);
        res.render('dashboard', {
            user: req.session.user,
            lowInventoryItems: []
        });
    }
});





module.exports = router
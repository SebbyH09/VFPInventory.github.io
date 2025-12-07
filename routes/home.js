const express = require('express');
const router = express.Router();
const requireAuth = require('../Middleware/auth');
const ListedInventoryItem = require('../models/ListedInventoryItem');





router.get('/', async (req, res) => {
    if (req.session.isLoggedIn) {
        try {
            // Find items where current quantity is less than minimum quantity
            const lowInventoryItems = await ListedInventoryItem.find({
                currentquantity: { $exists: true },
                minimumquantity: { $exists: true },
                $expr: { $lt: ['$currentquantity', '$minimumquantity'] }
            }).sort({ item: 1 });

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
        // Find items where current quantity is less than minimum quantity
        const lowInventoryItems = await ListedInventoryItem.find({
            currentquantity: { $exists: true },
            minimumquantity: { $exists: true },
            $expr: { $lt: ['$currentquantity', '$minimumquantity'] }
        }).sort({ item: 1 });

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
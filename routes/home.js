const express = require('express');
const router = express.Router();
const requireAuth = require('../Middleware/auth');
const ListedInventoryItem = require('../models/ListedInventoryItem');





router.get('/', (req, res) => {
    if (req.session.isLoggedIn) {
        res.render('dashboard');
    } else {
        res.render('home');
    }
});



router.get('/dashboard', requireAuth, async (req, res) => {
    try {
        // Find items where current quantity is less than minimum quantity
        const lowInventoryItems = await ListedInventoryItem.find({
            $expr: { $lt: ['$currentquantity', '$minimumquantity'] }
        }).sort({ item: 1 });

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
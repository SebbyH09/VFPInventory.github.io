const express = require('express');
const router = express.Router();
const requireAuth = require('../Middleware/auth');
const ListedInventoryItem = require('../models/ListedInventoryItem');





router.get('/', (req, res) => {
    console.log('===== ROOT ROUTE HIT =====');
    console.log('Is logged in:', req.session.isLoggedIn);
    
    if (req.session.isLoggedIn) {
        console.log('Redirecting to /dashboard');
        res.render('dashboard');
    } else {
        console.log('Rendering home page');
        res.render('home');
    }
});

router.get('/', requireAuth, async (req, res) => {
    console.log('===== DASHBOARD ROUTE HIT =====');
    console.log('User:', req.session.user);
    
    try {
        console.log('Attempting to fetch low inventory items...');
        
        const lowInventoryItems = await ListedInventoryItem.find({
            $expr: { $lt: ['$currentquantity', '$minimumquantity'] }
        }).sort({ item: 1 });
        
        console.log('Low inventory items found:', lowInventoryItems.length);
        console.log('Items:', JSON.stringify(lowInventoryItems, null, 2));
        
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

module.exports = router;


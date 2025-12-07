const express = require('express');
const router = express.Router();
const requireAuth = require('../Middleware/auth');
const ListedInventoryItem = require('../models/ListedInventoryItem');

router.get('/', async (req, res) => {
    console.log('===== ROOT ROUTE HIT =====');
    console.log('Is logged in:', req.session.isLoggedIn);
    
    if (req.session.isLoggedIn) {
        console.log('User is logged in, fetching inventory...');
        
        try {
            const lowInventoryItems = await ListedInventoryItem.find({
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
        console.log('Rendering home page');
        res.render('home');
    }
});

router.get('/dashboard', requireAuth, async (req, res) => {
    console.log('===== DASHBOARD ROUTE HIT =====');
    
    try {
        const lowInventoryItems = await ListedInventoryItem.find({
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

module.exports = router;
const express = require('express');
const router = express.Router();
const requireAuth = require('../Middleware/auth');
const Settings = require('../models/Settings');
const LoginInfo = require('../models/login');
const bcrypt = require('bcryptjs');

// GET settings page
router.get('/', requireAuth, async (req, res) => {
    try {
        const settings = await Settings.getSettings();
        const users = await LoginInfo.find({}).select('email createdAt').sort({ createdAt: -1 }).lean();
        res.render('settings', {
            settings: settings,
            users: users,
            user: req.session.user
        });
    } catch (error) {
        res.render('settings', {
            settings: null,
            users: [],
            user: req.session.user,
            error: 'Failed to load settings'
        });
    }
});

// ===== Category Management =====

// POST - Add a new category
router.post('/categories', requireAuth, async (req, res) => {
    try {
        const { name, value } = req.body;
        if (!name || !value) {
            return res.status(400).json({ message: 'Category name and value are required' });
        }
        const settings = await Settings.getSettings();
        const exists = settings.categories.some(c => c.value === value);
        if (exists) {
            return res.status(400).json({ message: 'A category with that value already exists' });
        }
        settings.categories.push({ name, value });
        await settings.save();
        res.json({ message: 'Category added', categories: settings.categories });
    } catch (error) {
        res.status(500).json({ message: 'Error adding category' });
    }
});

// DELETE - Remove a category
router.delete('/categories/:value', requireAuth, async (req, res) => {
    try {
        const { value } = req.params;
        const settings = await Settings.getSettings();
        settings.categories = settings.categories.filter(c => c.value !== value);
        await settings.save();
        res.json({ message: 'Category removed', categories: settings.categories });
    } catch (error) {
        res.status(500).json({ message: 'Error removing category' });
    }
});

// ===== Timeframe Settings =====

// PATCH - Update timeframe settings
router.patch('/timeframes', requireAuth, async (req, res) => {
    try {
        const settings = await Settings.getSettings();
        const allowed = [
            'defaultCycleCountInterval',
            'defaultOrderFrequencyPeriod',
            'recommendationLookbackDays',
            'leadTimeDays',
            'lowStockAlertEnabled',
            'defaultMinQuantity',
            'defaultMaxQuantity'
        ];
        allowed.forEach(field => {
            if (req.body[field] !== undefined) {
                settings[field] = req.body[field];
            }
        });
        await settings.save();
        res.json({ message: 'Settings updated', settings });
    } catch (error) {
        res.status(500).json({ message: 'Error updating settings' });
    }
});

// ===== User Management =====

// POST - Add a new user
router.post('/users', requireAuth, async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ message: 'Email and password are required' });
        }
        if (password.length < 8) {
            return res.status(400).json({ message: 'Password must be at least 8 characters' });
        }
        const existing = await LoginInfo.findOne({ email: email.toLowerCase() });
        if (existing) {
            return res.status(400).json({ message: 'A user with that email already exists' });
        }
        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = await LoginInfo.create({
            email: email.toLowerCase(),
            password: hashedPassword
        });
        res.json({
            message: 'User created',
            user: { email: newUser.email, createdAt: newUser.createdAt }
        });
    } catch (error) {
        res.status(500).json({ message: 'Error creating user' });
    }
});

// DELETE - Remove a user
router.delete('/users/:id', requireAuth, async (req, res) => {
    try {
        const { id } = req.params;
        // Prevent deleting yourself
        if (req.session.userId === id) {
            return res.status(400).json({ message: 'You cannot delete your own account' });
        }
        const deleted = await LoginInfo.findByIdAndDelete(id);
        if (!deleted) {
            return res.status(404).json({ message: 'User not found' });
        }
        res.json({ message: 'User removed' });
    } catch (error) {
        res.status(500).json({ message: 'Error removing user' });
    }
});

module.exports = router;

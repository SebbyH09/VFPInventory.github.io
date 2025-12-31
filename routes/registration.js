const express = require('express');
const router = express.Router();
const LoginInfo = require('../models/login');
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const saltRounds = 10;

router.get('/', (req, res) => {
    res.render('registration');
});

router.post('/',
    // Input validation middleware
    [
        body('email')
            .trim()
            .isEmail().withMessage('Please enter a valid email address')
            .normalizeEmail(),
        body('password')
            .isLength({ min: 8 }).withMessage('Password must be at least 8 characters long')
            .matches(/[A-Z]/).withMessage('Password must contain at least one uppercase letter')
            .matches(/[a-z]/).withMessage('Password must contain at least one lowercase letter')
            .matches(/[0-9]/).withMessage('Password must contain at least one number'),
    ],
    async (req, res) => {
        try {
            // Check validation errors
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({ errors: errors.array() });
            }

            const { email, password } = req.body;

            // Check if user already exists
            const existingUser = await LoginInfo.findOne({ email: email.toLowerCase() });
            if (existingUser) {
                return res.status(400).send('An account with this email already exists');
            }

            // Hash password
            const hashedPassword = await bcrypt.hash(password, saltRounds);

            // Create new user
            const newUser = new LoginInfo({
                email: email.toLowerCase(),
                password: hashedPassword
            });

            await newUser.save();

            res.send('User Successfully Registered');

        } catch (error) {
            // Handle duplicate key error (in case of race condition)
            if (error.code === 11000) {
                return res.status(400).send('An account with this email already exists');
            }

            // Handle validation errors
            if (error.name === 'ValidationError') {
                return res.status(400).send(error.message);
            }

            // Generic error for production
            res.status(500).send('Registration failed. Please try again later.');
        }
    }
);

module.exports = router;
const express = require('express');
const router = express.Router();
const LoginInfo = require('../models/login');
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');

// get login page
router.get('/', (req, res) => {
    // Check if already logged in
    if (req.session && req.session.userId) {
        return res.redirect('/home');
    }
    res.render('login');
});

// Login form data
router.post('/',
    [
        body('email')
            .trim()
            .isEmail().withMessage('Please enter a valid email address')
            .normalizeEmail(),
        body('password')
            .notEmpty().withMessage('Password is required'),
    ],
    async (req, res) => {
        try {
            // Check validation errors
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({ errors: errors.array() });
            }

            const { email, password } = req.body;

            // find user by email
            const user = await LoginInfo.findOne({ email: email.toLowerCase() });

            // Use constant-time comparison to prevent timing attacks
            let isValid = false;
            if (user) {
                isValid = await bcrypt.compare(password, user.password);
            }

            if (user && isValid) {
                // password match - CREATE SESSION
                req.session.userId = user._id;
                req.session.email = user.email;
                req.session.isLoggedIn = true;

                return res.redirect('/home');
            } else {
                // Generic error message - don't reveal if user exists
                return res.status(401).send('Invalid email or password');
            }
        } catch (error) {
            res.status(500).send('An error occurred. Please try again later.');
        }
    }
);


router.get('/auth/status', (req, res) => {
    res.json({ 
        isLoggedIn: !!(req.session && req.session.isLoggedIn),
        email: req.session?.email || null
    });
});

module.exports = router
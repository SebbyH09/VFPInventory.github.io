const express = require('express');
const router = express.Router();
const requireAuth = require('../Middleware/auth');





router.get('/', (req, res) => {
    if (req.session.isLoggedIn) {
        res.render('dashboard');
    } else {
        res.render('home');
    }
});



router.get('/dashboard', requireAuth, (req, res) => {
    res.render('dashboard', { user: req.session.user });
});





module.exports = router
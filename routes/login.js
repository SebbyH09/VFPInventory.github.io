const express = require('express');
const router = express.Router();
const LoginInfo = require('../models/login')
const bcrypt = require('bcrypt');
const mongoose = require('mongoose');
const saltRounds = 10;
var parseUrl = require('body-parser');



// get login page
router.get('/', (req, res) => {
    // Check if already logged in
    if (req.session && req.session.userId) {
        return res.redirect('/home');
    }
    res.render('login')
})

// Login form data
router.post('/', async (req, res) => {
    try {
        console.log('Processing login...')
        const { email, password } = req.body;
        
        // find user by email
        const user = await LoginInfo.findOne({email});
        console.log(user);
        
        if (user) {
            // user match
            const match = await bcrypt.compare(password, user.password)
            if(match) {
                // password match - CREATE SESSION
                req.session.userId = user._id;
                req.session.email = user.email;
                req.session.isLoggedIn = true;
                
                res.redirect('/home');
                console.log('Login successful')
            }
            else {
                res.send('Login Failed - Invalid password');
                console.log('Password incorrect')
            }
            
        }
        else {
            res.send('Login Failed - User not found')
            console.log('User not found')
        }
    } catch (error) {
        console.log('Error', error);
        res.status(500).send('Internal Service Error');
    }
})

// Logout route
// router.post('/logout', (req, res) => {
//     req.session.destroy((err) => {
//         if (err) {
//             return res.status(500).send('Could not log out');
//         }
//         res.redirect('/login');
//     });
// });

// Auth status check (for frontend)
router.get('/auth/status', (req, res) => {
    res.json({ 
        isLoggedIn: !!(req.session && req.session.isLoggedIn),
        email: req.session?.email || null
    });
});

module.exports = router
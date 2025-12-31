const express = require('express')
const router = express.Router()
// const app = express();
const LoginInfo = require('../models/login');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const saltRounds = 10;

// app.use(express.urlencoded({ extended: true}));


router.get('/', (req, res) => {
    res.render('registration')
    }
)

router.post('/', async (req, res) => {
    console.log(req.body);
    try {

        const {email, password} = req.body;

        const hashedPassword = await bcrypt.hash(password, saltRounds);

        const newUser = new LoginInfo ({
            email: email,
            password: hashedPassword
        });

        await newUser.save();

        res.send('User Successfully Registered');

    }catch (error) {

        console.error(error);
    }


    }
);


module.exports = router
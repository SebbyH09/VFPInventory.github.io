require('dotenv').config();
const express = require('express');
const app = express();
const session = require('express-session');
const expressLayouts = require('express-ejs-layouts');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose')
const hmtl = require('html')
const fs = require('fs')
const path = require('path')
const requireAuth = require('./Middleware/auth');


app.set('trust proxy', 1);

const sessionConfig = {
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 1000 * 60 * 60 * 24 // 24 hours
  }
};

app.use(session(sessionConfig));


app.post('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            return res.status(500).send('Could not log out');
        }
        res.redirect('/login');
    });
});


app.use(express.json());
app.use(express.urlencoded({ extended: true }));



const loginRouter = require('./routes/login')
const entryRouter = require('./routes/entry')
const registrationRouter = require('./routes/registration')
const homeRouter = require('./routes/home')
const uploadRouter = require('./routes/upload')
const historyRouter = require('./routes/history')


app.use((req, res, next) => {
    res.locals.isLoggedIn = req.session.isLoggedIn || false;
    res.locals.user = req.session.user || null;
    next();
});




// CSS files from here //
app.use(express.static(path.join(__dirname, 'public/CSS')))

// Img files from here //
app.use(express.static(path.join(__dirname, 'public/Images')))

// JS files from here //
app.use(express.static(path.join(__dirname, 'public/JS')))




app.set('view engine', 'ejs')
app.set('views', __dirname + '/views')
app.set('layout', 'layouts/layout')
app.use(expressLayouts)
app.use(express.urlencoded({ extended: true}))






app.use('/registration', registrationRouter)

app.use('/login', loginRouter)

app.use('/entry', requireAuth, entryRouter);

app.use('/upload', requireAuth, uploadRouter);

app.use('/history', requireAuth, historyRouter);

app.use('/home', homeRouter)







mongoose.connect(process.env.DATABASE_URL, {
})
const db = mongoose.connection
db.on('error', error => console.error(error))
db.once('open', () => console.log('Connected to Mongoose'))


app.listen(process.env.PORT || 8080);
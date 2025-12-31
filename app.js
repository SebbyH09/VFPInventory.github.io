require('dotenv').config();

// Validate required environment variables
const requiredEnvVars = ['SESSION_SECRET'];
if (process.env.NODE_ENV === 'production') {
  requiredEnvVars.push('DATABASE_URL');
}

requiredEnvVars.forEach(varName => {
  if (!process.env[varName]) {
    console.error(`FATAL: Missing required environment variable: ${varName}`);
    process.exit(1);
  }
});

const express = require('express');
const app = express();
const session = require('express-session');
const expressLayouts = require('express-ejs-layouts');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');
const { doubleCsrf } = require('csrf-csrf');
const hmtl = require('html');
const fs = require('fs');
const path = require('path');
const requireAuth = require('./Middleware/auth');

app.set('trust proxy', 1);

// Security Headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:"],
    },
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  }
}));

// Cookie parser (required for CSRF)
app.use(cookieParser());

const sessionConfig = {
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: 'strict',
    maxAge: 1000 * 60 * 60 * 8 // 8 hours (reduced from 24)
  }
};

app.use(session(sessionConfig));

// Request size limits to prevent DoS
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// CSRF Protection
const {
  generateToken,
  doubleCsrfProtection,
} = doubleCsrf({
  getSecret: () => process.env.SESSION_SECRET,
  cookieName: '__Host-psifi.x-csrf-token',
  cookieOptions: {
    sameSite: 'strict',
    path: '/',
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true
  },
  size: 64,
  ignoredMethods: ['GET', 'HEAD', 'OPTIONS'],
});

// Make CSRF token available to all routes
app.use((req, res, next) => {
  res.locals.csrfToken = generateToken(req, res);
  next();
});

// Apply CSRF protection to state-changing routes
app.use(doubleCsrfProtection);

// Global rate limiter
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

// Authentication rate limiter (stricter)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // limit each IP to 5 requests per windowMs
  message: 'Too many authentication attempts, please try again later.',
  skipSuccessfulRequests: true,
});

app.use(globalLimiter);

app.post('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            return res.status(500).send('Could not log out');
        }
        res.redirect('/login');
    });
});



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






// Health check endpoint (no auth required)
app.get('/health', (req, res) => {
  const healthcheck = {
    uptime: process.uptime(),
    message: 'OK',
    timestamp: Date.now(),
    database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
  };
  res.status(200).json(healthcheck);
});

// Apply stricter rate limiting to auth routes
app.use('/registration', authLimiter, registrationRouter);
app.use('/login', authLimiter, loginRouter);

app.use('/entry', requireAuth, entryRouter);
app.use('/upload', requireAuth, uploadRouter);
app.use('/history', requireAuth, historyRouter);
app.use('/', homeRouter);




const isDevelopment = process.env.NODE_ENV !== 'production';
const MONGODB_URL = isDevelopment
  ? process.env.DATABASE_URL_DEV || 'mongodb://127.0.0.1/Inventory'
  : process.env.DATABASE_URL;

// Database connection with retry logic
const connectWithRetry = (retries = 5, delay = 5000) => {
  mongoose.connect(MONGODB_URL, {
    serverSelectionTimeoutMS: 5000,
  })
  .then(() => {
    if (isDevelopment) {
      console.log('Connected to MongoDB (Development)');
    }
  })
  .catch(err => {
    if (retries > 0) {
      console.error(`MongoDB connection failed. Retrying in ${delay/1000}s... (${retries} attempts left)`);
      setTimeout(() => connectWithRetry(retries - 1, delay), delay);
    } else {
      console.error('MongoDB connection failed after multiple attempts');
      process.exit(1);
    }
  });
};

connectWithRetry();

const db = mongoose.connection;
db.on('error', error => {
  if (isDevelopment) {
    console.error('MongoDB error:', error);
  }
});
db.on('disconnected', () => {
  if (isDevelopment) {
    console.log('MongoDB disconnected. Attempting to reconnect...');
  }
  connectWithRetry();
});


app.listen(process.env.PORT || 8080);
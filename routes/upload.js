const express = require('express');
const router = express.Router();
const multer = require('multer');
const XLSX = require('xlsx');
const inventory = require('../models/ListedInventoryItem');
const requireAuth = require('../Middleware/auth');

// Configure multer for file upload
const storage = multer.memoryStorage();
const upload = multer({
    storage: storage,
    fileFilter: (req, file, cb) => {
        // Accept Excel files only
        if (file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
            file.mimetype === 'application/vnd.ms-excel') {
            cb(null, true);
        } else {
            cb(new Error('Only Excel files (.xlsx, .xls) are allowed!'), false);
        }
    }
});

// GET route - render upload page
router.get('/', requireAuth, (req, res) => {
    res.render('upload', {
        user: req.session.user,
        message: null
    });
});

// POST route - handle file upload
router.post('/', requireAuth, upload.single('excelFile'), async (req, res) => {
    try {
        if (!req.file) {
            return res.render('upload', {
                user: req.session.user,
                message: { type: 'error', text: 'Please upload a file' }
            });
        }

        // Parse the Excel file
        const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

        // Skip the header row
        const rows = data.slice(1);

        if (rows.length === 0) {
            return res.render('upload', {
                user: req.session.user,
                message: { type: 'error', text: 'The Excel file is empty or has no data rows' }
            });
        }

        // Prepare items for insertion
        const itemsToInsert = [];
        const errors = [];

        rows.forEach((row, index) => {
            // Skip empty rows
            if (!row || row.length === 0 || !row[0]) {
                return;
            }

            // Validate required fields
            if (!row[0]) {
                errors.push(`Row ${index + 2}: Item name is required`);
                return;
            }

            itemsToInsert.push({
                item: row[0] || '',
                brand: row[1] || '',
                vendor: row[2] || '',
                catalog: row[3] || '',
                currentquantity: parseInt(row[4]) || 0,
                minimumquantity: parseInt(row[5]) || 0,
                maximumquantity: parseInt(row[6]) || 0,
                cycleCountInterval: parseInt(row[7]) || 90,
                orderFrequencyPeriod: parseInt(row[8]) || 30
            });
        });

        if (errors.length > 0) {
            return res.render('upload', {
                user: req.session.user,
                message: {
                    type: 'error',
                    text: 'Validation errors: ' + errors.join(', ')
                }
            });
        }

        if (itemsToInsert.length === 0) {
            return res.render('upload', {
                user: req.session.user,
                message: { type: 'error', text: 'No valid items found in the Excel file' }
            });
        }

        // Insert all items into the database
        const savedItems = await inventory.insertMany(itemsToInsert);

        res.render('upload', {
            user: req.session.user,
            message: {
                type: 'success',
                text: `Successfully uploaded ${savedItems.length} item(s) to inventory!`
            }
        });

    } catch (error) {
        console.error('Error processing file:', error);
        res.render('upload', {
            user: req.session.user,
            message: {
                type: 'error',
                text: 'Error processing file: ' + error.message
            }
        });
    }
});

module.exports = router;

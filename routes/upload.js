const express = require('express');
const router = express.Router();
const multer = require('multer');
const ExcelJS = require('exceljs');
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
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(req.file.buffer);
        const worksheet = workbook.worksheets[0];

        // Convert worksheet to array format (similar to xlsx's sheet_to_json with header: 1)
        const data = [];
        worksheet.eachRow((row, rowNumber) => {
            // row.values is 1-indexed, so we slice from index 1
            data.push(row.values.slice(1));
        });

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
        res.render('upload', {
            user: req.session.user,
            message: {
                type: 'error',
                text: 'Error processing file. Please check the file format and try again.'
            }
        });
    }
});

module.exports = router;

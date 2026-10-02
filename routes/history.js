const express = require('express');
const router = express.Router();
const InventoryHistory = require('../models/InventoryHistory');
const ListedInventoryItem = require('../models/ListedInventoryItem');

// GET /history - Display history page
router.get('/', async (req, res) => {
  try {
    res.render('history', {
      title: 'Inventory History',
      error: null
    });
  } catch (error) {
    res.status(500).render('history', {
      title: 'Inventory History',
      error: 'Failed to load history page'
    });
  }
});

// GET /history/data - Fetch history data with filters
router.get('/data', async (req, res) => {
  try {
    const {
      startDate,
      endDate,
      itemId,
      changeType,
      sortBy = 'changeDate',
      sortOrder = 'desc'
    } = req.query;

    // Build query
    let query = {};

    // Date range filter
    if (startDate || endDate) {
      query.changeDate = {};
      if (startDate) {
        query.changeDate.$gte = new Date(startDate);
      }
      if (endDate) {
        // Add one day to include the entire end date
        const endDateTime = new Date(endDate);
        endDateTime.setDate(endDateTime.getDate() + 1);
        query.changeDate.$lt = endDateTime;
      }
    }

    // Item filter
    if (itemId && itemId !== 'all') {
      query.itemId = itemId;
    }

    // Change type filter
    if (changeType && changeType !== 'all') {
      query.changeType = changeType;
    }

    // Build sort
    const sort = {};
    sort[sortBy] = sortOrder === 'asc' ? 1 : -1;

    // Execute query
    const historyRecords = await InventoryHistory.find(query)
      .sort(sort)
      .limit(1000) // Limit to prevent overwhelming the client
      .lean();

    res.json({
      success: true,
      data: historyRecords,
      count: historyRecords.length
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to fetch history data'
    });
  }
});

// GET /history/items - Get list of all items for filter dropdown
router.get('/items', async (req, res) => {
  try {
    const items = await ListedInventoryItem.find({})
      .select('_id item')
      .sort({ item: 1 })
      .lean();

    res.json({
      success: true,
      data: items
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to fetch items'
    });
  }
});

module.exports = router;

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

// GET /history/summary - Get quantity used summary for a period
router.get('/summary', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        error: 'Start date and end date are required'
      });
    }

    // Build date range
    const start = new Date(startDate);
    const end = new Date(endDate);
    end.setDate(end.getDate() + 1); // Include entire end date

    // Aggregate quantity changes by item
    const summary = await InventoryHistory.aggregate([
      {
        $match: {
          changeDate: { $gte: start, $lt: end },
          changeType: { $in: ['quantity_change', 'quantity_consumed', 'item_used'] },
          quantityChange: { $exists: true }
        }
      },
      {
        $group: {
          _id: '$itemId',
          itemName: { $first: '$itemName' },
          totalUsed: {
            $sum: {
              $cond: [
                { $lt: ['$quantityChange', 0] },
                { $abs: '$quantityChange' },
                0
              ]
            }
          },
          totalAdded: {
            $sum: {
              $cond: [
                { $gt: ['$quantityChange', 0] },
                '$quantityChange',
                0
              ]
            }
          },
          netChange: { $sum: '$quantityChange' },
          changeCount: { $sum: 1 },
          totalCostUsed: {
            $sum: {
              $cond: [
                { $and: [
                  { $lt: ['$quantityChange', 0] },
                  { $gt: ['$totalCost', 0] }
                ]},
                '$totalCost',
                0
              ]
            }
          },
          totalCostAdded: {
            $sum: {
              $cond: [
                { $and: [
                  { $gt: ['$quantityChange', 0] },
                  { $gt: ['$totalCost', 0] }
                ]},
                '$totalCost',
                0
              ]
            }
          }
        }
      },
      {
        $sort: { totalUsed: -1 }
      }
    ]);

    res.json({
      success: true,
      data: summary,
      period: {
        start: startDate,
        end: endDate
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to fetch summary data'
    });
  }
});

// GET /history/report - Generate comprehensive report for a date range
router.get('/report', async (req, res) => {
  try {
    const { startDate, endDate, itemId } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        error: 'Start date and end date are required'
      });
    }

    const start = new Date(startDate);
    const end = new Date(endDate);
    end.setDate(end.getDate() + 1); // Include entire end date

    const dateMatch = { changeDate: { $gte: start, $lt: end } };
    if (itemId && itemId !== 'all') {
      dateMatch.itemId = new (require('mongoose').Types.ObjectId)(itemId);
    }

    // Run all aggregations in parallel
    const [spendByItem, activityByType, activityByUser, topConsumed, dailyActivity] = await Promise.all([
      // 1. Spend and quantity by item
      InventoryHistory.aggregate([
        { $match: { ...dateMatch, quantityChange: { $exists: true } } },
        {
          $group: {
            _id: '$itemId',
            itemName: { $first: '$itemName' },
            totalConsumed: {
              $sum: { $cond: [{ $lt: ['$quantityChange', 0] }, { $abs: '$quantityChange' }, 0] }
            },
            totalAdded: {
              $sum: { $cond: [{ $gt: ['$quantityChange', 0] }, '$quantityChange', 0] }
            },
            netChange: { $sum: '$quantityChange' },
            spendOnConsumption: {
              $sum: {
                $cond: [
                  { $lt: ['$quantityChange', 0] },
                  { $cond: [{ $gt: ['$totalCost', 0] }, '$totalCost', { $multiply: [{ $abs: '$quantityChange' }, { $ifNull: ['$costPerUnit', 0] }] }] },
                  0
                ]
              }
            },
            spendOnAdditions: {
              $sum: {
                $cond: [
                  { $gt: ['$quantityChange', 0] },
                  { $cond: [{ $gt: ['$totalCost', 0] }, '$totalCost', { $multiply: ['$quantityChange', { $ifNull: ['$costPerUnit', 0] }] }] },
                  0
                ]
              }
            },
            avgCostPerUnit: { $avg: { $ifNull: ['$costPerUnit', 0] } },
            changeCount: { $sum: 1 }
          }
        },
        { $sort: { spendOnConsumption: -1 } }
      ]),

      // 2. Activity breakdown by change type
      InventoryHistory.aggregate([
        { $match: dateMatch },
        {
          $group: {
            _id: '$changeType',
            count: { $sum: 1 },
            totalQtyChange: {
              $sum: { $ifNull: ['$quantityChange', 0] }
            }
          }
        },
        { $sort: { count: -1 } }
      ]),

      // 3. Activity by user
      InventoryHistory.aggregate([
        { $match: dateMatch },
        {
          $group: {
            _id: '$userId',
            actionCount: { $sum: 1 },
            consumedQty: {
              $sum: {
                $cond: [
                  { $lt: ['$quantityChange', 0] },
                  { $abs: '$quantityChange' },
                  0
                ]
              }
            },
            addedQty: {
              $sum: {
                $cond: [{ $gt: ['$quantityChange', 0] }, '$quantityChange', 0]
              }
            }
          }
        },
        { $sort: { actionCount: -1 } }
      ]),

      // 4. Top consumed items (by quantity)
      InventoryHistory.aggregate([
        {
          $match: {
            ...dateMatch,
            changeType: { $in: ['quantity_consumed', 'quantity_change', 'item_used'] },
            quantityChange: { $lt: 0 }
          }
        },
        {
          $group: {
            _id: '$itemId',
            itemName: { $first: '$itemName' },
            totalConsumed: { $sum: { $abs: '$quantityChange' } },
            totalSpend: {
              $sum: {
                $cond: [
                  { $gt: ['$totalCost', 0] },
                  '$totalCost',
                  { $multiply: [{ $abs: '$quantityChange' }, { $ifNull: ['$costPerUnit', 0] }] }
                ]
              }
            },
            eventCount: { $sum: 1 }
          }
        },
        { $sort: { totalConsumed: -1 } },
        { $limit: 10 }
      ]),

      // 5. Daily activity trend
      InventoryHistory.aggregate([
        { $match: dateMatch },
        {
          $group: {
            _id: {
              $dateToString: { format: '%Y-%m-%d', date: '$changeDate' }
            },
            eventCount: { $sum: 1 },
            consumed: {
              $sum: { $cond: [{ $lt: ['$quantityChange', 0] }, { $abs: '$quantityChange' }, 0] }
            },
            added: {
              $sum: { $cond: [{ $gt: ['$quantityChange', 0] }, '$quantityChange', 0] }
            },
            dailySpend: {
              $sum: {
                $cond: [
                  { $lt: ['$quantityChange', 0] },
                  { $cond: [{ $gt: ['$totalCost', 0] }, '$totalCost', { $multiply: [{ $abs: '$quantityChange' }, { $ifNull: ['$costPerUnit', 0] }] }] },
                  0
                ]
              }
            }
          }
        },
        { $sort: { _id: 1 } }
      ])
    ]);

    // Compute totals from spendByItem
    const totals = spendByItem.reduce((acc, item) => {
      acc.totalSpend += item.spendOnConsumption;
      acc.totalConsumed += item.totalConsumed;
      acc.totalAdded += item.totalAdded;
      acc.totalSpendOnAdditions += item.spendOnAdditions;
      return acc;
    }, { totalSpend: 0, totalConsumed: 0, totalAdded: 0, totalSpendOnAdditions: 0 });

    const totalEvents = activityByType.reduce((acc, t) => acc + t.count, 0);
    const uniqueItems = spendByItem.length;

    res.json({
      success: true,
      period: { start: startDate, end: endDate },
      totals: {
        ...totals,
        totalEvents,
        uniqueItems
      },
      spendByItem,
      activityByType,
      activityByUser,
      topConsumed,
      dailyActivity
    });

  } catch (error) {
    console.error('Report generation error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate report'
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

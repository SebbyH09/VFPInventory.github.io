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

// GET /history/analytics - Comprehensive analytics data
router.get('/analytics', async (req, res) => {
  try {
    const now = new Date();

    // Date boundaries
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const currentMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthEnd = new Date(currentMonthStart);

    const dayOfWeek = now.getDay();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - dayOfWeek);
    weekStart.setHours(0, 0, 0, 0);

    const ninetyDaysAgo = new Date(now);
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    // Parallel data fetching
    const [
      allItems,
      currentMonthRecords,
      lastMonthRecords,
      last90DaysRecords,
      cycleCountRecords,
      allOrderRecords,
      consumptionByUserAgg
    ] = await Promise.all([
      ListedInventoryItem.find({}).lean(),
      InventoryHistory.find({ changeDate: { $gte: currentMonthStart, $lt: currentMonthEnd } }).lean(),
      InventoryHistory.find({ changeDate: { $gte: lastMonthStart, $lt: lastMonthEnd } }).lean(),
      InventoryHistory.find({ changeDate: { $gte: ninetyDaysAgo } }).lean(),
      InventoryHistory.find({ changeType: 'cycle_count', changeDate: { $gte: ninetyDaysAgo } }).lean(),
      InventoryHistory.find({ changeType: 'order_placed' }).lean(),
      InventoryHistory.aggregate([
        {
          $match: {
            changeDate: { $gte: ninetyDaysAgo },
            changeType: { $in: ['quantity_consumed', 'quantity_change', 'item_used'] },
            quantityChange: { $lt: 0 }
          }
        },
        {
          $group: {
            _id: '$userId',
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
            eventCount: { $sum: 1 },
            items: { $addToSet: '$itemName' }
          }
        },
        { $sort: { totalConsumed: -1 } }
      ])
    ]);

    // Build item lookup map
    const itemMap = new Map();
    for (const item of allItems) {
      itemMap.set(item._id.toString(), item);
    }

    // Helper to compute spend from a record
    const getSpend = (record) => {
      if (record.totalCost > 0) return record.totalCost;
      return Math.abs(record.quantityChange || 0) * (record.costPerUnit || 0);
    };

    // === INVENTORY SNAPSHOT ===
    const totalItems = allItems.length;
    const totalInventoryValue = allItems.reduce((sum, item) =>
      sum + (item.currentquantity || 0) * (item.cost || 0), 0
    );

    const lowStockItems = allItems.filter(i =>
      i.minimumquantity > 0 && i.currentquantity <= i.minimumquantity
    );
    const stockOutItems = allItems.filter(i => i.currentquantity === 0);
    const belowReorderItems = allItems.filter(i =>
      i.minimumquantity > 0 && i.currentquantity < i.minimumquantity
    );

    // Week-over-week item count change
    const itemsCreatedThisWeek = last90DaysRecords.filter(r =>
      r.changeType === 'item_created' && new Date(r.changeDate) >= weekStart
    ).length;
    const itemsDeletedThisWeek = last90DaysRecords.filter(r =>
      r.changeType === 'item_deleted' && new Date(r.changeDate) >= weekStart
    ).length;

    // Quantity deficits
    const quantityDeficits = lowStockItems.map(item => ({
      item: item.item,
      current: item.currentquantity,
      minimum: item.minimumquantity,
      deficit: item.minimumquantity - item.currentquantity,
      cost: item.cost || 0,
      estimatedCost: +((item.minimumquantity - item.currentquantity) * (item.cost || 0)).toFixed(2)
    })).sort((a, b) => b.deficit - a.deficit);

    // Cycle count compliance
    const cycleCountOverdue = allItems.filter(item => {
      if (!item.useCycleCount || !item.cycleCountInterval) return false;
      if (!item.lastCycleCount) return true;
      const nextDue = new Date(item.lastCycleCount);
      nextDue.setDate(nextDue.getDate() + item.cycleCountInterval);
      return nextDue <= now;
    });

    // === SPENDING ===
    const computeSpend = (records) =>
      records.filter(r => (r.quantityChange || 0) < 0).reduce((sum, r) => sum + getSpend(r), 0);

    const currentMonthSpend = computeSpend(currentMonthRecords);
    const lastMonthSpend = computeSpend(lastMonthRecords);
    const monthlySpendChange = lastMonthSpend > 0
      ? ((currentMonthSpend - lastMonthSpend) / lastMonthSpend * 100) : 0;

    // Spend by Category
    const spendByCat = {};
    for (const r of last90DaysRecords) {
      if ((r.quantityChange || 0) >= 0) continue;
      const item = itemMap.get(r.itemId?.toString());
      const cat = item?.type || 'Uncategorized';
      spendByCat[cat] = (spendByCat[cat] || 0) + getSpend(r);
    }

    // Spend by Vendor
    const spendByVend = {};
    for (const r of last90DaysRecords) {
      if ((r.quantityChange || 0) >= 0) continue;
      const item = itemMap.get(r.itemId?.toString());
      const vendor = item?.vendor || item?.brand || 'Unknown';
      spendByVend[vendor] = (spendByVend[vendor] || 0) + getSpend(r);
    }

    // Cost per unit trend (monthly)
    const cpuByMonth = {};
    for (const r of last90DaysRecords) {
      if (!r.costPerUnit || r.costPerUnit <= 0) continue;
      const key = new Date(r.changeDate).toISOString().slice(0, 7);
      if (!cpuByMonth[key]) cpuByMonth[key] = { total: 0, count: 0 };
      cpuByMonth[key].total += r.costPerUnit;
      cpuByMonth[key].count++;
    }

    // Spend trend (weekly)
    const spendByWeek = {};
    for (const r of last90DaysRecords) {
      if ((r.quantityChange || 0) >= 0) continue;
      const d = new Date(r.changeDate);
      const ws = new Date(d);
      ws.setDate(d.getDate() - d.getDay());
      const key = ws.toISOString().slice(0, 10);
      spendByWeek[key] = (spendByWeek[key] || 0) + getSpend(r);
    }

    // Top spend items
    const spendByItemName = {};
    for (const r of last90DaysRecords) {
      if ((r.quantityChange || 0) >= 0) continue;
      const name = r.itemName || 'Unknown';
      spendByItemName[name] = (spendByItemName[name] || 0) + getSpend(r);
    }

    // === CONSUMPTION ===
    const consumptionRecords = last90DaysRecords.filter(r =>
      (r.quantityChange || 0) < 0 &&
      ['quantity_consumed', 'quantity_change', 'item_used'].includes(r.changeType)
    );

    const daySpan = Math.max(1, (now - ninetyDaysAgo) / (1000 * 60 * 60 * 24));

    const consumptionByItem = {};
    for (const r of consumptionRecords) {
      if (!consumptionByItem[r.itemName]) {
        consumptionByItem[r.itemName] = { total: 0, itemId: r.itemId };
      }
      consumptionByItem[r.itemName].total += Math.abs(r.quantityChange);
    }

    const consumptionRates = Object.entries(consumptionByItem)
      .map(([name, data]) => {
        const inv = itemMap.get(data.itemId?.toString());
        return {
          item: name,
          totalConsumed: data.total,
          perDay: +(data.total / daySpan).toFixed(2),
          perWeek: +((data.total / daySpan) * 7).toFixed(2),
          perMonth: +((data.total / daySpan) * 30).toFixed(2),
          currentQty: inv?.currentquantity || 0,
          cost: inv?.cost || 0
        };
      })
      .sort((a, b) => b.totalConsumed - a.totalConsumed);

    // Days of supply
    const daysOfSupply = consumptionRates
      .filter(r => r.perDay > 0)
      .map(r => ({
        item: r.item,
        currentQty: r.currentQty,
        dailyRate: r.perDay,
        daysRemaining: +(r.currentQty / r.perDay).toFixed(1)
      }))
      .sort((a, b) => a.daysRemaining - b.daysRemaining);

    // Turnover rate (annualized)
    const totalConsumed90 = consumptionRecords.reduce((s, r) => s + Math.abs(r.quantityChange), 0);
    const annualizedConsumption = totalConsumed90 * (365 / 90);
    const avgQty = allItems.reduce((s, i) => s + (i.currentquantity || 0), 0);
    const turnoverRate = avgQty > 0 ? +(annualizedConsumption / avgQty).toFixed(2) : 0;

    // Usage trends (weekly)
    const usageByWeek = {};
    for (const r of consumptionRecords) {
      const d = new Date(r.changeDate);
      const ws = new Date(d);
      ws.setDate(d.getDate() - d.getDay());
      const key = ws.toISOString().slice(0, 10);
      usageByWeek[key] = (usageByWeek[key] || 0) + Math.abs(r.quantityChange);
    }

    // Reorder forecast
    const reorderForecast = lowStockItems.map(item => {
      const rate = consumptionByItem[item.item];
      const dailyRate = rate ? rate.total / daySpan : 0;
      const targetQty = item.maximumquantity > 0 ? item.maximumquantity : item.minimumquantity * 2;
      const deficit = Math.max(0, targetQty - item.currentquantity);
      return {
        item: item.item,
        currentQty: item.currentquantity,
        minQty: item.minimumquantity,
        maxQty: item.maximumquantity,
        deficit,
        unitCost: item.cost || 0,
        estimatedCost: +(deficit * (item.cost || 0)).toFixed(2),
        dailyConsumption: +dailyRate.toFixed(2),
        daysUntilStockout: dailyRate > 0 ? +(item.currentquantity / dailyRate).toFixed(1) : null
      };
    }).sort((a, b) => b.estimatedCost - a.estimatedCost);

    // === CYCLE COUNTS ===
    const cycleCountsThisMonth = cycleCountRecords.filter(r =>
      new Date(r.changeDate) >= currentMonthStart
    ).length;
    const cycleCountsThisWeek = cycleCountRecords.filter(r =>
      new Date(r.changeDate) >= weekStart
    ).length;

    const cycleCountsWithData = cycleCountRecords.filter(r =>
      r.previousQuantity !== undefined && r.newQuantity !== undefined
    );
    const accurateCounts = cycleCountsWithData.filter(r =>
      r.previousQuantity === r.newQuantity
    ).length;
    const accuracyRate = cycleCountsWithData.length > 0
      ? +(accurateCounts / cycleCountsWithData.length * 100).toFixed(1) : 0;

    // Average time between reorders
    const reordersByItem = {};
    for (const r of allOrderRecords) {
      if (!reordersByItem[r.itemName]) reordersByItem[r.itemName] = [];
      reordersByItem[r.itemName].push(new Date(r.changeDate));
    }
    const avgReorderTime = Object.entries(reordersByItem)
      .filter(([, dates]) => dates.length >= 2)
      .map(([item, dates]) => {
        dates.sort((a, b) => a - b);
        let totalDays = 0;
        for (let i = 1; i < dates.length; i++) {
          totalDays += (dates[i] - dates[i - 1]) / (1000 * 60 * 60 * 24);
        }
        return {
          item,
          orderCount: dates.length,
          avgDays: +(totalDays / (dates.length - 1)).toFixed(1)
        };
      })
      .sort((a, b) => a.avgDays - b.avgDays);

    // === BUILD RESPONSE ===
    res.json({
      success: true,
      inventory: {
        totalItems,
        totalInventoryValue: +totalInventoryValue.toFixed(2),
        itemCountWoWChange: itemsCreatedThisWeek - itemsDeletedThisWeek,
        lowStockCount: lowStockItems.length,
        lowStockItems: lowStockItems.map(i => ({
          item: i.item, current: i.currentquantity, minimum: i.minimumquantity,
          vendor: i.vendor, type: i.type, cost: i.cost
        })),
        stockOutCount: stockOutItems.length,
        stockOutItems: stockOutItems.map(i => ({
          item: i.item, vendor: i.vendor, type: i.type, cost: i.cost
        })),
        belowReorderCount: belowReorderItems.length,
        quantityDeficits,
        turnoverRate,
        daysOfSupply
      },
      spending: {
        currentMonthSpend: +currentMonthSpend.toFixed(2),
        lastMonthSpend: +lastMonthSpend.toFixed(2),
        monthlySpendChange: +monthlySpendChange.toFixed(1),
        spendByCategory: Object.entries(spendByCat)
          .sort(([, a], [, b]) => b - a)
          .map(([category, spend]) => ({ category, spend: +spend.toFixed(2) })),
        spendByVendor: Object.entries(spendByVend)
          .sort(([, a], [, b]) => b - a)
          .map(([vendor, spend]) => ({ vendor, spend: +spend.toFixed(2) })),
        costPerUnitTrend: Object.entries(cpuByMonth)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([month, d]) => ({ month, avgCost: +(d.total / d.count).toFixed(2) })),
        spendTrend: Object.entries(spendByWeek)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([week, spend]) => ({ week, spend: +spend.toFixed(2) })),
        topSpendItems: Object.entries(spendByItemName)
          .sort(([, a], [, b]) => b - a)
          .slice(0, 15)
          .map(([item, spend]) => ({ item, spend: +spend.toFixed(2) })),
        reorderForecast,
        totalReorderCost: +reorderForecast.reduce((s, r) => s + r.estimatedCost, 0).toFixed(2)
      },
      consumption: {
        rates: consumptionRates.slice(0, 20),
        topConsumed: consumptionRates.slice(0, 15),
        byUser: consumptionByUserAgg,
        usageTrends: Object.entries(usageByWeek)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([week, consumed]) => ({ week, consumed }))
      },
      cycleCounts: {
        overdueCount: cycleCountOverdue.length,
        overdueItems: cycleCountOverdue.map(i => ({
          item: i.item, lastCount: i.lastCycleCount, interval: i.cycleCountInterval
        })),
        completedThisMonth: cycleCountsThisMonth,
        completedThisWeek: cycleCountsThisWeek,
        accuracyRate,
        totalInPeriod: cycleCountRecords.length,
        avgTimeBetweenReorders: avgReorderTime
      }
    });

  } catch (error) {
    console.error('Analytics error:', error);
    res.status(500).json({ success: false, error: 'Failed to generate analytics' });
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

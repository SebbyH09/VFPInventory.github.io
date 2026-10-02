const express = require('express');
const router = express.Router();
const InventoryHistory = require('../models/InventoryHistory');
const ListedInventoryItem = require('../models/ListedInventoryItem');

const DAY_MS = 1000 * 60 * 60 * 24;
const CONSUMPTION_TYPES = ['quantity_consumed', 'quantity_change', 'item_used'];

// Parse a comma-separated query param into a de-duplicated array of strings
function parseList(value) {
  if (!value) return [];
  const raw = Array.isArray(value) ? value.join(',') : String(value);
  return [...new Set(raw.split(',').map(s => s.trim()).filter(Boolean))];
}

// Parse YYYY-MM-DD; returns null when missing/invalid
function parseDate(value) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = new Date(value);
  return isNaN(d) ? null : d;
}

function isoDay(d) {
  return d.toISOString().slice(0, 10);
}

// Choose a bucket size for time series based on the period length
function bucketGranularity(days) {
  if (days <= 31) return 'day';
  if (days <= 186) return 'week';
  return 'month';
}

function bucketKey(date, granularity) {
  const d = new Date(date);
  if (granularity === 'month') return d.toISOString().slice(0, 7);
  if (granularity === 'week') {
    const ws = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - d.getUTCDay()));
    return isoDay(ws);
  }
  return isoDay(d);
}

// All bucket keys from start (inclusive) to end (exclusive), so charts show
// empty periods as zero instead of skipping them
function bucketKeys(start, end, granularity) {
  const keys = [];
  const seen = new Set();
  for (let t = start.getTime(); t < end.getTime(); t += DAY_MS) {
    const k = bucketKey(new Date(t), granularity);
    if (!seen.has(k)) { seen.add(k); keys.push(k); }
  }
  return keys;
}

// Spend attributed to a history record
function getSpend(record) {
  if (record.totalCost > 0) return record.totalCost;
  return Math.abs(record.quantityChange || 0) * (record.costPerUnit || 0);
}

function isConsumption(r) {
  return (r.quantityChange || 0) < 0 && CONSUMPTION_TYPES.includes(r.changeType);
}

function round2(n) {
  return +Number(n || 0).toFixed(2);
}

// Filter options shown on the page: items, users, categories, vendors
async function loadFilterOptions() {
  const [items, users] = await Promise.all([
    ListedInventoryItem.find({}).select('_id item type vendor brand').sort({ item: 1 }).lean(),
    InventoryHistory.distinct('userId')
  ]);
  const sortCi = (a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' });
  const categories = [...new Set(items.map(i => i.type).filter(Boolean))].sort(sortCi);
  const vendors = [...new Set(items.map(i => i.vendor).filter(Boolean))].sort(sortCi);
  return {
    items: items.map(i => ({ id: String(i._id), name: i.item, type: i.type || '', vendor: i.vendor || '' })),
    users: users.filter(Boolean).map(String).sort(sortCi),
    categories,
    vendors
  };
}

// GET /analytics - Analytics dashboard page
router.get('/', async (req, res) => {
  try {
    const filterOptions = await loadFilterOptions();
    res.render('analytics', { filterOptions, error: null });
  } catch (error) {
    console.error('Analytics page error:', error);
    res.render('analytics', {
      filterOptions: { items: [], users: [], categories: [], vendors: [] },
      error: 'Failed to load filter options'
    });
  }
});

// GET /analytics/data - All analytics metrics for the given filters
//   start, end:  YYYY-MM-DD (inclusive). Defaults to the last 30 days.
//   items, users, categories, vendors: comma-separated lists (empty = all)
router.get('/data', async (req, res) => {
  try {
    const now = new Date();
    const today = new Date(isoDay(now));

    let start = parseDate(req.query.start);
    let endInclusive = parseDate(req.query.end) || today;
    if (!start) {
      start = new Date(endInclusive);
      start.setUTCDate(start.getUTCDate() - 29);
    }
    if (start > endInclusive) [start, endInclusive] = [endInclusive, start];
    const end = new Date(endInclusive);
    end.setUTCDate(end.getUTCDate() + 1); // exclusive

    const periodDays = Math.max(1, Math.round((end - start) / DAY_MS));
    const prevStart = new Date(start.getTime() - periodDays * DAY_MS);
    const granularity = bucketGranularity(periodDays);

    const itemIds = parseList(req.query.items);
    const users = parseList(req.query.users);
    const categories = parseList(req.query.categories);
    const vendors = parseList(req.query.vendors);

    // --- Item scope (items / categories / vendors) ---
    const allItems = await ListedInventoryItem.find({}).lean();
    const itemScoped = itemIds.length > 0 || categories.length > 0 || vendors.length > 0;
    const itemIdSet = new Set(itemIds);
    const categorySet = new Set(categories);
    const vendorSet = new Set(vendors);
    const scopedItems = allItems.filter(item =>
      (itemIdSet.size === 0 || itemIdSet.has(String(item._id))) &&
      (categorySet.size === 0 || categorySet.has(item.type || '')) &&
      (vendorSet.size === 0 || vendorSet.has(item.vendor || ''))
    );
    const itemMap = new Map(allItems.map(i => [String(i._id), i]));

    // --- History in the period (and the previous period for comparison) ---
    const historyQuery = { changeDate: { $gte: prevStart, $lt: end } };
    if (itemScoped) historyQuery.itemId = { $in: scopedItems.map(i => i._id) };
    if (users.length > 0) historyQuery.userId = { $in: users };

    const allRecords = await InventoryHistory.find(historyQuery).lean();
    const records = allRecords.filter(r => new Date(r.changeDate) >= start);
    const prevRecords = allRecords.filter(r => new Date(r.changeDate) < start);

    const keys = bucketKeys(start, end, granularity);
    const zeroBuckets = () => Object.fromEntries(keys.map(k => [k, 0]));

    // === INVENTORY SNAPSHOT (current state of the scoped items) ===
    const totalItems = scopedItems.length;
    const totalInventoryValue = scopedItems.reduce((sum, item) =>
      sum + (item.currentquantity || 0) * (item.cost || 0), 0);
    const lowStockItems = scopedItems.filter(i =>
      i.minimumquantity > 0 && i.currentquantity <= i.minimumquantity);
    const stockOutItems = scopedItems.filter(i => (i.currentquantity || 0) === 0);
    const belowReorderItems = scopedItems.filter(i =>
      i.minimumquantity > 0 && i.currentquantity < i.minimumquantity);

    const itemsCreated = records.filter(r => r.changeType === 'item_created').length;
    const itemsDeleted = records.filter(r => r.changeType === 'item_deleted').length;

    const quantityDeficits = lowStockItems.map(item => ({
      item: item.item,
      current: item.currentquantity,
      minimum: item.minimumquantity,
      deficit: item.minimumquantity - item.currentquantity,
      cost: item.cost || 0,
      estimatedCost: round2((item.minimumquantity - item.currentquantity) * (item.cost || 0))
    })).sort((a, b) => b.deficit - a.deficit);

    const cycleCountOverdue = scopedItems.filter(item => {
      if (!item.useCycleCount || !item.cycleCountInterval) return false;
      if (!item.lastCycleCount) return true;
      const nextDue = new Date(item.lastCycleCount);
      nextDue.setDate(nextDue.getDate() + item.cycleCountInterval);
      return nextDue <= now;
    });

    // === SPENDING ===
    const spendRecords = records.filter(r => (r.quantityChange || 0) < 0);
    const periodSpend = spendRecords.reduce((s, r) => s + getSpend(r), 0);
    const prevSpend = prevRecords.filter(r => (r.quantityChange || 0) < 0)
      .reduce((s, r) => s + getSpend(r), 0);
    const spendChange = prevSpend > 0 ? (periodSpend - prevSpend) / prevSpend * 100 : 0;

    const spendByCat = {};
    const spendByVend = {};
    const spendByItemName = {};
    const spendByBucket = zeroBuckets();
    for (const r of spendRecords) {
      const spend = getSpend(r);
      const item = itemMap.get(String(r.itemId));
      const cat = item?.type || 'Uncategorized';
      const vendor = item?.vendor || item?.brand || 'Unknown';
      const name = r.itemName || 'Unknown';
      spendByCat[cat] = (spendByCat[cat] || 0) + spend;
      spendByVend[vendor] = (spendByVend[vendor] || 0) + spend;
      spendByItemName[name] = (spendByItemName[name] || 0) + spend;
      const k = bucketKey(r.changeDate, granularity);
      if (k in spendByBucket) spendByBucket[k] += spend;
    }

    const cpuByBucket = {};
    for (const r of records) {
      if (!r.costPerUnit || r.costPerUnit <= 0) continue;
      const k = bucketKey(r.changeDate, granularity);
      if (!cpuByBucket[k]) cpuByBucket[k] = { total: 0, count: 0 };
      cpuByBucket[k].total += r.costPerUnit;
      cpuByBucket[k].count++;
    }

    // === CONSUMPTION ===
    const consumptionRecords = records.filter(isConsumption);
    const totalConsumed = consumptionRecords.reduce((s, r) => s + Math.abs(r.quantityChange), 0);
    const prevConsumed = prevRecords.filter(isConsumption)
      .reduce((s, r) => s + Math.abs(r.quantityChange), 0);
    const consumedChange = prevConsumed > 0 ? (totalConsumed - prevConsumed) / prevConsumed * 100 : 0;

    const consumptionByItem = {};
    const usageByBucket = zeroBuckets();
    const byUser = {};
    for (const r of consumptionRecords) {
      const qty = Math.abs(r.quantityChange);
      if (!consumptionByItem[r.itemName]) consumptionByItem[r.itemName] = { total: 0, itemId: r.itemId };
      consumptionByItem[r.itemName].total += qty;

      const k = bucketKey(r.changeDate, granularity);
      if (k in usageByBucket) usageByBucket[k] += qty;

      const user = r.userId || 'Unknown';
      if (!byUser[user]) byUser[user] = { _id: user, totalConsumed: 0, totalSpend: 0, eventCount: 0, items: new Set() };
      byUser[user].totalConsumed += qty;
      byUser[user].totalSpend += getSpend(r);
      byUser[user].eventCount++;
      byUser[user].items.add(r.itemName);
    }

    const consumptionRates = Object.entries(consumptionByItem).map(([name, data]) => {
      const inv = itemMap.get(String(data.itemId));
      const perDay = data.total / periodDays;
      return {
        item: name,
        totalConsumed: data.total,
        perDay: round2(perDay),
        perWeek: round2(perDay * 7),
        perMonth: round2(perDay * 30),
        currentQty: inv?.currentquantity || 0,
        cost: inv?.cost || 0,
        totalCost: round2(data.total * (inv?.cost || 0))
      };
    }).sort((a, b) => b.totalConsumed - a.totalConsumed);

    const daysOfSupply = consumptionRates
      .filter(r => r.perDay > 0)
      .map(r => ({
        item: r.item,
        currentQty: r.currentQty,
        dailyRate: r.perDay,
        daysRemaining: +(r.currentQty / r.perDay).toFixed(1)
      }))
      .sort((a, b) => a.daysRemaining - b.daysRemaining);

    // Annualized turnover over the selected period
    const onHand = scopedItems.reduce((s, i) => s + (i.currentquantity || 0), 0);
    const turnoverRate = onHand > 0 ? round2(totalConsumed * (365 / periodDays) / onHand) : 0;

    const reorderForecast = lowStockItems.map(item => {
      const rate = consumptionByItem[item.item];
      const dailyRate = rate ? rate.total / periodDays : 0;
      const targetQty = item.maximumquantity > 0 ? item.maximumquantity : item.minimumquantity * 2;
      const deficit = Math.max(0, targetQty - item.currentquantity);
      return {
        item: item.item,
        currentQty: item.currentquantity,
        minQty: item.minimumquantity,
        maxQty: item.maximumquantity,
        deficit,
        unitCost: item.cost || 0,
        estimatedCost: round2(deficit * (item.cost || 0)),
        dailyConsumption: round2(dailyRate),
        daysUntilStockout: dailyRate > 0 ? +(item.currentquantity / dailyRate).toFixed(1) : null
      };
    }).sort((a, b) => b.estimatedCost - a.estimatedCost);

    // === CYCLE COUNTS & ORDERING ===
    const cycleCountRecords = records.filter(r => r.changeType === 'cycle_count');
    const cycleCountsWithData = cycleCountRecords.filter(r =>
      r.previousQuantity !== undefined && r.newQuantity !== undefined);
    const accurateCounts = cycleCountsWithData.filter(r => r.previousQuantity === r.newQuantity).length;
    const accuracyRate = cycleCountsWithData.length > 0
      ? +(accurateCounts / cycleCountsWithData.length * 100).toFixed(1) : null;

    const orderRecords = records.filter(r => r.changeType === 'order_placed');
    const reordersByItem = {};
    for (const r of orderRecords) {
      if (!reordersByItem[r.itemName]) reordersByItem[r.itemName] = [];
      reordersByItem[r.itemName].push(new Date(r.changeDate));
    }
    const avgReorderTime = Object.entries(reordersByItem)
      .filter(([, dates]) => dates.length >= 2)
      .map(([item, dates]) => {
        dates.sort((a, b) => a - b);
        const totalDays = (dates[dates.length - 1] - dates[0]) / DAY_MS;
        return { item, orderCount: dates.length, avgDays: +(totalDays / (dates.length - 1)).toFixed(1) };
      })
      .sort((a, b) => a.avgDays - b.avgDays);

    const toSortedPairs = (obj, keyName) => Object.entries(obj)
      .sort(([, a], [, b]) => b - a)
      .map(([k, v]) => ({ [keyName]: k, spend: round2(v) }));

    res.json({
      success: true,
      period: {
        start: isoDay(start),
        end: isoDay(endInclusive),
        days: periodDays,
        previousStart: isoDay(prevStart),
        granularity
      },
      inventory: {
        totalItems,
        totalInventoryValue: round2(totalInventoryValue),
        itemsCreated,
        itemsDeleted,
        lowStockCount: lowStockItems.length,
        lowStockItems: lowStockItems.map(i => ({
          item: i.item, current: i.currentquantity, minimum: i.minimumquantity,
          vendor: i.vendor, type: i.type, cost: i.cost
        })),
        stockOutCount: stockOutItems.length,
        stockOutItems: stockOutItems.map(i => ({ item: i.item, vendor: i.vendor, type: i.type, cost: i.cost })),
        belowReorderCount: belowReorderItems.length,
        quantityDeficits,
        turnoverRate,
        daysOfSupply
      },
      spending: {
        periodSpend: round2(periodSpend),
        previousSpend: round2(prevSpend),
        spendChange: +spendChange.toFixed(1),
        spendByCategory: toSortedPairs(spendByCat, 'category'),
        spendByVendor: toSortedPairs(spendByVend, 'vendor'),
        costPerUnitTrend: Object.entries(cpuByBucket)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([bucket, d]) => ({ bucket, avgCost: round2(d.total / d.count) })),
        spendTrend: keys.map(k => ({ bucket: k, spend: round2(spendByBucket[k]) })),
        topSpendItems: toSortedPairs(spendByItemName, 'item').slice(0, 15),
        reorderForecast,
        totalReorderCost: round2(reorderForecast.reduce((s, r) => s + r.estimatedCost, 0))
      },
      consumption: {
        totalConsumed,
        previousConsumed: prevConsumed,
        consumedChange: +consumedChange.toFixed(1),
        rates: consumptionRates,
        topConsumed: consumptionRates.slice(0, 15),
        byUser: Object.values(byUser)
          .map(u => ({ ...u, totalSpend: round2(u.totalSpend), items: [...u.items] }))
          .sort((a, b) => b.totalConsumed - a.totalConsumed),
        usageTrends: keys.map(k => ({ bucket: k, consumed: usageByBucket[k] }))
      },
      cycleCounts: {
        overdueCount: cycleCountOverdue.length,
        overdueItems: cycleCountOverdue.map(i => ({
          item: i.item, lastCount: i.lastCycleCount, interval: i.cycleCountInterval
        })),
        completed: cycleCountRecords.length,
        accuracyRate,
        ordersPlaced: orderRecords.length,
        avgTimeBetweenReorders: avgReorderTime
      }
    });
  } catch (error) {
    console.error('Analytics error:', error);
    res.status(500).json({ success: false, error: 'Failed to generate analytics' });
  }
});

module.exports = router;

const express = require('express');
const router = express.Router();
const ListedInventoryItem = require('../models/ListedInventoryItem');
const InventoryHistory = require('../models/InventoryHistory');
const { startOfWeek, annotateItem, compareUrgency, UPCOMING_WINDOW_DAYS } = require('../services/cycleCounts');

// GET /cycle-counts - render the cycle counts page
router.get('/', async (req, res) => {
    try {
        const now = new Date();
        const activeItems = await ListedInventoryItem.find({ isActive: { $ne: false } }).lean();

        const items = activeItems
            .map(item => {
                const annotated = annotateItem(item, now);
                const locations = [item.location, ...(item.storedLocations || [])]
                    .map(l => (l || '').trim())
                    .filter(Boolean);
                annotated.locations = [...new Set(locations)];
                return annotated;
            })
            .sort(compareUrgency);

        const weekStart = startOfWeek(now);
        const weekCounts = await InventoryHistory.find({
            changeType: 'cycle_count',
            changeDate: { $gte: weekStart }
        }).sort({ changeDate: -1 }).lean();

        const stats = {
            due: items.filter(i => i.isDue).length,
            never: items.filter(i => i.cycleStatus === 'never').length,
            overdue: items.filter(i => i.cycleStatus === 'overdue').length,
            upcoming: items.filter(i => i.cycleStatus === 'upcoming').length,
            total: items.length,
            countedThisWeek: new Set(weekCounts.map(r => r.itemId.toString())).size
        };

        const locations = [...new Set(items.flatMap(i => i.locations))].sort((a, b) => a.localeCompare(b));

        res.render('cycleCounts', {
            items,
            weekCounts,
            weekStart,
            stats,
            locations,
            upcomingWindowDays: UPCOMING_WINDOW_DAYS,
            error: null
        });
    } catch (error) {
        console.error('Cycle counts error:', error);
        res.render('cycleCounts', {
            items: [],
            weekCounts: [],
            weekStart: startOfWeek(),
            stats: { due: 0, never: 0, overdue: 0, upcoming: 0, total: 0, countedThisWeek: 0 },
            locations: [],
            upcomingWindowDays: UPCOMING_WINDOW_DAYS,
            error: 'Failed to load cycle counts'
        });
    }
});

module.exports = router;

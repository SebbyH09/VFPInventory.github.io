/**
 * cycleCounts.js — shared cycle count helpers used by the dashboard and the
 * Cycle Counts page.
 */

const DAY_MS = 1000 * 60 * 60 * 24;
const DEFAULT_INTERVAL = 90;
const UPCOMING_WINDOW_DAYS = 14;

// Start of the current week (Monday 00:00, server local time)
function startOfWeek(now = new Date()) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const dow = d.getDay(); // 0 = Sunday
    d.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1));
    return d;
}

/**
 * Annotate an inventory item with its cycle count status.
 *   status: 'never' | 'overdue' | 'due' | 'upcoming' | 'ok'
 *   dueInDays: days until the next count is due (negative = overdue)
 */
function annotateItem(item, now = new Date()) {
    const interval = item.cycleCountInterval || DEFAULT_INTERVAL;
    const daysSinceCount = item.lastCycleCount
        ? Math.floor((now - new Date(item.lastCycleCount)) / DAY_MS)
        : null;
    const dueInDays = daysSinceCount === null ? null : interval - daysSinceCount;

    let status;
    if (daysSinceCount === null) status = 'never';
    else if (dueInDays < 0) status = 'overdue';
    else if (dueInDays === 0) status = 'due';
    else if (dueInDays <= UPCOMING_WINDOW_DAYS) status = 'upcoming';
    else status = 'ok';

    return {
        ...item,
        cycleCountInterval: interval,
        daysSinceCount,
        dueInDays,
        daysOverdue: dueInDays !== null && dueInDays < 0 ? -dueInDays : 0,
        cycleStatus: status,
        isDue: status === 'never' || status === 'overdue' || status === 'due'
    };
}

// Most urgent first: never counted, then most overdue, then soonest due
function compareUrgency(a, b) {
    if (a.daysSinceCount === null && b.daysSinceCount === null) return (a.item || '').localeCompare(b.item || '');
    if (a.daysSinceCount === null) return -1;
    if (b.daysSinceCount === null) return 1;
    return a.dueInDays - b.dueInDays;
}

module.exports = {
    DAY_MS,
    UPCOMING_WINDOW_DAYS,
    startOfWeek,
    annotateItem,
    compareUrgency
};

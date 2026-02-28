/**
 * purchaseOrders.js — Express routes for PO records
 *
 * Routes:
 *   GET    /purchase-orders          — list POs (with optional status filter)
 *   GET    /purchase-orders/:id      — view single PO details
 *   POST   /purchase-orders/poll     — manually trigger an inbox poll (dev/testing)
 *   POST   /purchase-orders/cleanup  — manually trigger email cleanup (dev/testing)
 */

const express = require('express');
const router = express.Router();
const PurchaseOrder = require('../models/PurchaseOrder');
const { pollInboxForPOs, cleanupOldEmails } = require('../services/emailPoller');

// ─────────────────────────────────────────────
// LIST POs
// ─────────────────────────────────────────────

router.get('/', async (req, res) => {
  try {
    const statusFilter = req.query.status || null;
    const query = statusFilter ? { status: statusFilter } : {};

    const purchaseOrders = await PurchaseOrder.find(query)
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();

    res.json({
      count: purchaseOrders.length,
      purchaseOrders
    });
  } catch (err) {
    console.error('[purchaseOrders] List error:', err.message);
    res.status(500).json({ error: 'Failed to fetch purchase orders.' });
  }
});

// ─────────────────────────────────────────────
// VIEW SINGLE PO
// ─────────────────────────────────────────────

router.get('/:id', async (req, res) => {
  try {
    const po = await PurchaseOrder.findById(req.params.id).lean();
    if (!po) return res.status(404).json({ error: 'Purchase order not found.' });

    res.json(po);
  } catch (err) {
    console.error('[purchaseOrders] Get error:', err.message);
    res.status(500).json({ error: 'Failed to fetch purchase order.' });
  }
});

// ─────────────────────────────────────────────
// MANUAL POLL (dev/testing)
// ─────────────────────────────────────────────

router.post('/poll', async (req, res) => {
  try {
    const results = await pollInboxForPOs();
    res.json({
      message: `Poll complete. Processed ${results.length} PO(s).`,
      results
    });
  } catch (err) {
    console.error('[purchaseOrders] Manual poll error:', err.message);
    res.status(500).json({ error: 'Poll failed: ' + err.message });
  }
});

// ─────────────────────────────────────────────
// MANUAL CLEANUP (dev/testing)
// ─────────────────────────────────────────────

router.post('/cleanup', async (req, res) => {
  try {
    const deletedCount = await cleanupOldEmails();
    res.json({
      message: `Cleanup complete. Deleted ${deletedCount} old email(s).`,
      deletedCount
    });
  } catch (err) {
    console.error('[purchaseOrders] Manual cleanup error:', err.message);
    res.status(500).json({ error: 'Cleanup failed: ' + err.message });
  }
});

module.exports = router;

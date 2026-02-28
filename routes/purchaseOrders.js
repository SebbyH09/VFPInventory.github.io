/**
 * purchaseOrders.js — Express routes for PO review queue
 *
 * Routes:
 *   GET    /purchase-orders          — list POs (pending, processed, rejected)
 *   GET    /purchase-orders/:id      — view single PO details
 *   POST   /purchase-orders/:id/sync — approve & sync a pending PO to inventory
 *   POST   /purchase-orders/:id/reject — reject a pending PO
 *   POST   /purchase-orders/poll     — manually trigger an inbox poll (dev/testing)
 *   POST   /purchase-orders/cleanup  — manually trigger email cleanup (dev/testing)
 */

const express = require('express');
const router = express.Router();
const PurchaseOrder = require('../models/PurchaseOrder');
const { syncPOToInventory, rejectPO } = require('../services/inventorySync');
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
// APPROVE & SYNC TO INVENTORY
// ─────────────────────────────────────────────

router.post('/:id/sync', async (req, res) => {
  try {
    const syncedBy = req.session.user?.email || req.session.email || 'unknown';
    const results = await syncPOToInventory(req.params.id, syncedBy);

    res.json({
      message: 'PO approved and synced to inventory.',
      results
    });
  } catch (err) {
    console.error('[purchaseOrders] Sync error:', err.message);
    res.status(400).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────
// REJECT PO
// ─────────────────────────────────────────────

router.post('/:id/reject', async (req, res) => {
  try {
    const rejectedBy = req.session.user?.email || req.session.email || 'unknown';
    const reason = req.body.reason || '';

    const po = await rejectPO(req.params.id, rejectedBy, reason);

    res.json({
      message: 'PO rejected.',
      poId: po._id,
      status: po.status
    });
  } catch (err) {
    console.error('[purchaseOrders] Reject error:', err.message);
    res.status(400).json({ error: err.message });
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

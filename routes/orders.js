const express = require('express');
const router = express.Router();
const Order = require('../models/Order');
const inventory = require('../models/ListedInventoryItem');
const InventoryHistory = require('../models/InventoryHistory');
const PurchaseOrder = require('../models/PurchaseOrder');
const requireAuth = require('../Middleware/auth');

// Generate order number: ORD-YYYYMMDD-XXXX
async function generateOrderNumber() {
    const today = new Date();
    const dateStr = today.getFullYear().toString() +
        String(today.getMonth() + 1).padStart(2, '0') +
        String(today.getDate()).padStart(2, '0');
    const prefix = 'ORD-' + dateStr + '-';

    const lastOrder = await Order.findOne({ orderNumber: { $regex: '^' + prefix } })
        .sort({ orderNumber: -1 });

    let seq = 1;
    if (lastOrder) {
        const lastSeq = parseInt(lastOrder.orderNumber.split('-').pop(), 10);
        if (!isNaN(lastSeq)) {
            seq = lastSeq + 1;
        }
    }
    return prefix + String(seq).padStart(4, '0');
}

// GET /orders/new - render new order page
router.get('/new', requireAuth, async (req, res) => {
    try {
        const inventoryItems = await inventory.find({ isActive: { $ne: false } }).sort({ item: 1 });
        res.render('newOrder', {
            inventoryItems: inventoryItems,
            user: req.session.user
        });
    } catch (error) {
        res.render('newOrder', {
            inventoryItems: [],
            user: req.session.user,
            error: 'Failed to load inventory data'
        });
    }
});

// POST /orders - create a new order
router.post('/', requireAuth, async (req, res) => {
    try {
        const { items, notes } = req.body;

        if (!items || items.length === 0) {
            return res.status(400).json({ message: 'No items in order' });
        }

        const orderNumber = await generateOrderNumber();

        const orderItems = [];
        for (const item of items) {
            const invItem = await inventory.findById(item.itemId);
            if (!invItem) {
                return res.status(400).json({ message: `Item not found: ${item.itemId}` });
            }
            const variant = item.variant || {};
            const isPrimary = variant.isPrimary !== false;
            orderItems.push({
                itemId: invItem._id,
                itemName: invItem.item,
                brand: isPrimary ? (invItem.brand || '') : (variant.brand || ''),
                vendor: isPrimary ? (invItem.vendor || '') : (variant.vendor || ''),
                catalog: isPrimary ? (invItem.catalog || '') : (variant.catalog || ''),
                variantLabel: variant.label || 'Primary',
                variantIsPrimary: isPrimary,
                quantityOrdered: item.quantity,
                quantityReceived: 0,
                cost: invItem.cost || 0
            });
        }

        const order = await Order.create({
            orderNumber: orderNumber,
            status: 'open',
            items: orderItems,
            createdBy: req.session.user?.email || 'unknown',
            notes: notes || ''
        });

        // Log order_placed for each item in inventory history
        for (const oi of orderItems) {
            const variantNote = oi.variantIsPrimary
                ? ''
                : ` (${oi.variantLabel}${oi.brand ? ' – ' + oi.brand : ''}${oi.catalog ? ' / ' + oi.catalog : ''})`;
            await InventoryHistory.create({
                itemId: oi.itemId,
                itemName: oi.itemName,
                changeType: 'order_placed',
                notes: `Order ${orderNumber}: ordered ${oi.quantityOrdered} unit(s)${variantNote}`,
                userId: req.session.user?.email || 'unknown'
            });
        }

        res.json({
            message: 'Order created successfully',
            orderNumber: order.orderNumber,
            orderId: order._id
        });
    } catch (error) {
        res.status(500).json({ message: 'Error creating order. Please try again.' });
    }
});

// GET /orders/open - render open orders page
router.get('/open', requireAuth, async (req, res) => {
    try {
        const orders = await Order.find({ status: { $in: ['open', 'partial'] } })
            .sort({ createdAt: -1 });
        res.render('openOrders', {
            orders: orders,
            user: req.session.user
        });
    } catch (error) {
        res.render('openOrders', {
            orders: [],
            user: req.session.user,
            error: 'Failed to load orders'
        });
    }
});

// GET /orders/api/all - JSON API for all non-received orders (for filtering/sorting)
router.get('/api/all', requireAuth, async (req, res) => {
    try {
        const orders = await Order.find({ status: { $in: ['open', 'partial'] } })
            .sort({ createdAt: -1 });
        res.json(orders);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching orders' });
    }
});

// GET /orders/receive - render receive page
router.get('/receive', requireAuth, async (req, res) => {
    try {
        const orders = await Order.find({ status: { $in: ['open', 'partial'] } })
            .sort({ createdAt: -1 });
        res.render('receiveOrder', {
            orders: orders,
            user: req.session.user
        });
    } catch (error) {
        res.render('receiveOrder', {
            orders: [],
            user: req.session.user,
            error: 'Failed to load orders'
        });
    }
});

// GET /orders/api/:id - get single order details
router.get('/api/:id', requireAuth, async (req, res) => {
    try {
        const order = await Order.findById(req.params.id);
        if (!order) {
            return res.status(404).json({ message: 'Order not found' });
        }
        res.json(order);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching order' });
    }
});

// POST /orders/receive - receive items from an order
router.post('/receive', requireAuth, async (req, res) => {
    try {
        const { orderId, receivedItems } = req.body;

        if (!orderId || !receivedItems || receivedItems.length === 0) {
            return res.status(400).json({ message: 'Invalid receive data' });
        }

        const order = await Order.findById(orderId);
        if (!order) {
            return res.status(404).json({ message: 'Order not found' });
        }

        const results = { updatedCount: 0, errors: [] };

        for (const received of receivedItems) {
            const orderItem = order.items.id(received.orderItemId);
            if (!orderItem) {
                results.errors.push({ orderItemId: received.orderItemId, message: 'Item not found in order' });
                continue;
            }

            const qtyToReceive = parseInt(received.quantity, 10);
            if (isNaN(qtyToReceive) || qtyToReceive <= 0) {
                results.errors.push({ orderItemId: received.orderItemId, message: 'Invalid quantity' });
                continue;
            }

            const remaining = orderItem.quantityOrdered - orderItem.quantityReceived;
            if (qtyToReceive > remaining) {
                results.errors.push({
                    orderItemId: received.orderItemId,
                    message: `Cannot receive ${qtyToReceive}. Only ${remaining} remaining.`
                });
                continue;
            }

            // Update the order item's received quantity
            orderItem.quantityReceived += qtyToReceive;

            // Update inventory current quantity
            const invItem = await inventory.findById(orderItem.itemId);
            if (invItem) {
                const prevQty = invItem.currentquantity;
                invItem.currentquantity += qtyToReceive;
                await invItem.save();

                // Log to history
                await InventoryHistory.create({
                    itemId: invItem._id,
                    itemName: invItem.item,
                    changeType: 'quantity_change',
                    previousQuantity: prevQty,
                    newQuantity: invItem.currentquantity,
                    quantityChange: qtyToReceive,
                    costPerUnit: invItem.cost || 0,
                    totalCost: qtyToReceive * (invItem.cost || 0),
                    notes: `Received ${qtyToReceive} unit(s) from order ${order.orderNumber}`,
                    userId: req.session.user?.email || 'unknown'
                });
            }

            results.updatedCount++;
        }

        // Determine new order status
        const allReceived = order.items.every(i => i.quantityReceived >= i.quantityOrdered);
        const someReceived = order.items.some(i => i.quantityReceived > 0);

        if (allReceived) {
            order.status = 'received';
        } else if (someReceived) {
            order.status = 'partial';
        }

        await order.save();

        res.json({
            message: `Received ${results.updatedCount} item(s) successfully`,
            orderStatus: order.status,
            results
        });
    } catch (error) {
        res.status(500).json({ message: 'Error receiving items. Please try again.' });
    }
});

// GET /orders/incoming - render incoming orders page
router.get('/incoming', requireAuth, async (req, res) => {
    try {
        const incomingPOs = await PurchaseOrder.find({ status: 'pending_review' })
            .sort({ createdAt: -1 });
        const inventoryItems = await inventory.find({}).sort({ item: 1 });
        res.render('incomingOrders', {
            incomingPOs: incomingPOs,
            inventoryItems: inventoryItems,
            user: req.session.user
        });
    } catch (error) {
        res.render('incomingOrders', {
            incomingPOs: [],
            inventoryItems: [],
            user: req.session.user,
            error: 'Failed to load incoming orders'
        });
    }
});

// POST /orders/incoming/:id/submit - convert a reviewed PO into an open Order
router.post('/incoming/:id/submit', requireAuth, async (req, res) => {
    try {
        const { matchedItems, notes } = req.body;

        const po = await PurchaseOrder.findById(req.params.id);
        if (!po) {
            return res.status(404).json({ message: 'Purchase order not found' });
        }
        if (po.status !== 'pending_review') {
            return res.status(400).json({ message: 'This order has already been processed' });
        }
        if (!matchedItems || matchedItems.length === 0) {
            return res.status(400).json({ message: 'At least one item must be matched to an inventory item' });
        }

        const orderNumber = await generateOrderNumber();
        const orderItems = [];

        for (const match of matchedItems) {
            const invItem = await inventory.findById(match.inventoryItemId);
            if (!invItem) continue;
            orderItems.push({
                itemId: invItem._id,
                itemName: invItem.item,
                brand: invItem.brand || '',
                quantityOrdered: parseInt(match.quantity, 10) || 1,
                quantityReceived: 0,
                cost: parseFloat(match.unitPrice) || invItem.cost || 0
            });
        }

        if (orderItems.length === 0) {
            return res.status(400).json({ message: 'No valid inventory items found for matched items' });
        }

        const poNumber = (po.parsedData && po.parsedData.poNumber) ? po.parsedData.poNumber : po._id.toString();
        const order = await Order.create({
            orderNumber,
            status: 'open',
            items: orderItems,
            createdBy: req.session.user?.email || 'unknown',
            notes: notes || ('From PO: ' + poNumber)
        });

        for (const oi of orderItems) {
            await InventoryHistory.create({
                itemId: oi.itemId,
                itemName: oi.itemName,
                changeType: 'order_placed',
                notes: `Order ${orderNumber}: ordered ${oi.quantityOrdered} unit(s) from PO ${poNumber}`,
                userId: req.session.user?.email || 'unknown'
            });
        }

        po.status = 'processed';
        po.syncedAt = new Date();
        po.syncedBy = req.session.user?.email || 'unknown';
        await po.save();

        res.json({
            message: 'Order created successfully',
            orderNumber: order.orderNumber,
            orderId: order._id
        });
    } catch (error) {
        res.status(500).json({ message: 'Error creating order. Please try again.' });
    }
});

// DELETE /orders/:id - delete (cancel) an open order with a required reason
router.delete('/:id', requireAuth, async (req, res) => {
    try {
        const { reason } = req.body;

        if (!reason || !reason.trim()) {
            return res.status(400).json({ message: 'A reason is required to close an order.' });
        }

        const order = await Order.findById(req.params.id);
        if (!order) {
            return res.status(404).json({ message: 'Order not found.' });
        }

        if (order.status === 'received') {
            return res.status(400).json({ message: 'Received orders cannot be deleted.' });
        }

        // Log cancellation to inventory history for each item
        for (const oi of order.items) {
            await InventoryHistory.create({
                itemId: oi.itemId,
                itemName: oi.itemName,
                changeType: 'order_cancelled',
                notes: `Order ${order.orderNumber} cancelled – ${reason.trim()}`,
                userId: req.session.user?.email || 'unknown'
            });
        }

        await Order.findByIdAndDelete(req.params.id);

        res.json({ message: 'Order deleted successfully.' });
    } catch (error) {
        res.status(500).json({ message: 'Error deleting order. Please try again.' });
    }
});

module.exports = router;

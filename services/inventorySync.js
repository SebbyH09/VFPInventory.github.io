/**
 * inventorySync.js
 *
 * Applies a parsed Prendio PO to your inventory.
 * POs are confirmations of orders already placed, so quantities are treated
 * as incoming stock — added to existing totals.
 */

const ListedInventoryItem = require('../models/ListedInventoryItem');
const InventoryHistory = require('../models/InventoryHistory');
const PurchaseOrder = require('../models/PurchaseOrder');

async function syncPOToInventory(poId, syncedBy) {
  const po = await PurchaseOrder.findById(poId);
  if (!po) throw new Error(`PurchaseOrder ${poId} not found.`);
  if (po.status === 'processed') throw new Error(`PO ${poId} already synced.`);
  if (po.status === 'rejected')  throw new Error(`PO ${poId} was rejected.`);

  console.log(`[inventorySync] Syncing PO ${po.parsedData.poNumber || poId} (${syncedBy})`);

  const results = { updated: [], created: [], skipped: [], errors: [] };

  for (const lineItem of po.parsedData.lineItems || []) {
    try {
      const result = await processLineItem(lineItem, po.parsedData.vendor, po.parsedData.poNumber, syncedBy);
      results[result.action]?.push(result);
    } catch (err) {
      console.error(`[inventorySync] Error on "${lineItem.description}":`, err.message);
      results.errors.push({ description: lineItem.description, error: err.message });
    }
  }

  po.status      = 'processed';
  po.syncedAt    = new Date();
  po.syncedBy    = syncedBy;
  po.syncResults = results;
  await po.save();

  console.log(`[inventorySync] Done. Updated: ${results.updated.length}, Created: ${results.created.length}, Skipped: ${results.skipped.length}, Errors: ${results.errors.length}`);

  return results;
}

async function processLineItem(lineItem, vendor, poNumber, syncedBy) {
  if (!lineItem.quantity || lineItem.quantity <= 0) {
    return { action: 'skipped', reason: 'No valid quantity', lineItem };
  }

  let existingItem = null;

  // Match by catalog number first (most reliable identifier)
  if (lineItem.catalogNumber) {
    existingItem = await ListedInventoryItem.findOne({ catalog: lineItem.catalogNumber });

    // Also check alternateItems catalog numbers
    if (!existingItem) {
      existingItem = await ListedInventoryItem.findOne({
        'alternateItems.catalogNumber': lineItem.catalogNumber
      });
    }
  }

  // Fallback: exact item name match (case-insensitive)
  if (!existingItem && lineItem.description) {
    existingItem = await ListedInventoryItem.findOne({
      item: { $regex: new RegExp(`^${escapeRegex(lineItem.description)}$`, 'i') }
    });
  }

  if (existingItem) {
    const previousQty = existingItem.currentquantity || 0;
    const newQty = previousQty + lineItem.quantity;

    existingItem.currentquantity = newQty;
    existingItem.orderHistory.push(new Date());
    if (lineItem.unitPrice) existingItem.cost = lineItem.unitPrice;
    await existingItem.save();

    // Log to inventory history
    await InventoryHistory.create({
      itemId: existingItem._id,
      itemName: existingItem.item,
      changeType: 'quantity_change',
      previousQuantity: previousQty,
      newQuantity: newQty,
      quantityChange: lineItem.quantity,
      costPerUnit: lineItem.unitPrice || existingItem.cost,
      totalCost: (lineItem.unitPrice || existingItem.cost || 0) * lineItem.quantity,
      notes: `PO ${poNumber} — auto-synced from Prendio`,
      userId: syncedBy
    });

    console.log(`[inventorySync] Updated "${existingItem.item}": ${previousQty} → ${newQty}`);
    return { action: 'updated', itemId: existingItem._id, itemName: existingItem.item, quantityAdded: lineItem.quantity, newTotal: newQty };
  } else {
    // Item not found — create a new inventory item
    const newItem = await ListedInventoryItem.create({
      item:              lineItem.description,
      catalog:           lineItem.catalogNumber || '',
      currentquantity:   lineItem.quantity,
      vendor:            vendor || '',
      cost:              lineItem.unitPrice || 0,
      orderHistory:      [new Date()]
    });

    // Log creation to inventory history
    await InventoryHistory.create({
      itemId: newItem._id,
      itemName: newItem.item,
      changeType: 'item_created',
      previousQuantity: 0,
      newQuantity: lineItem.quantity,
      quantityChange: lineItem.quantity,
      costPerUnit: lineItem.unitPrice || 0,
      totalCost: (lineItem.unitPrice || 0) * lineItem.quantity,
      notes: `PO ${poNumber} — new item created from Prendio PO`,
      userId: syncedBy
    });

    console.log(`[inventorySync] Created "${newItem.item}" (${newItem._id})`);
    return { action: 'created', itemId: newItem._id, itemName: newItem.item, quantity: lineItem.quantity };
  }
}

async function rejectPO(poId, rejectedBy, reason) {
  const po = await PurchaseOrder.findById(poId);
  if (!po) throw new Error(`PurchaseOrder ${poId} not found.`);

  po.status = 'rejected';
  po.rejectedAt = new Date();
  po.rejectedBy = rejectedBy;
  po.rejectionReason = reason || 'No reason provided';
  await po.save();

  return po;
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = { syncPOToInventory, rejectPO };

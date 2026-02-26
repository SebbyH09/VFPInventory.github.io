/**
 * inventorySync.js
 *
 * Applies a parsed Prendio PO to your inventory.
 * POs are confirmations of orders already placed, so quantities are treated
 * as incoming stock — added to existing totals.
 */

const Item = require('../models/Item');
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
      const result = await processLineItem(lineItem, po.parsedData.vendor, po.parsedData.poNumber);
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

async function processLineItem(lineItem, vendor, poNumber) {
  if (!lineItem.quantity || lineItem.quantity <= 0) {
    return { action: 'skipped', reason: 'No valid quantity', lineItem };
  }

  let existingItem = null;

  // Match by catalog number first (most reliable identifier)
  if (lineItem.catalogNumber) {
    existingItem = await Item.findOne({
      $or: [
        { catalogNumber: lineItem.catalogNumber },
        { 'vendor.catalogNumber': lineItem.catalogNumber }
      ]
    });
  }

  // Fallback: exact name match (case-insensitive)
  if (!existingItem && lineItem.description) {
    existingItem = await Item.findOne({
      name: { $regex: new RegExp(`^${escapeRegex(lineItem.description)}$`, 'i') }
    });
  }

  if (existingItem) {
    const prev = existingItem.quantity;
    existingItem.quantity          = (existingItem.quantity || 0) + lineItem.quantity;
    existingItem.lastRestockedAt   = new Date();
    existingItem.lastRestockedFrom = vendor;
    existingItem.lastPONumber      = poNumber;
    if (lineItem.unitPrice) existingItem.lastUnitPrice = lineItem.unitPrice;
    await existingItem.save();

    console.log(`[inventorySync] Updated "${existingItem.name}": ${prev} → ${existingItem.quantity}`);
    return { action: 'updated', itemId: existingItem._id, itemName: existingItem.name, quantityAdded: lineItem.quantity, newTotal: existingItem.quantity };
  } else {
    // New item — flagged needs_review so manager can fill in category, location, reorder point
    const newItem = await Item.create({
      name:              lineItem.description,
      catalogNumber:     lineItem.catalogNumber || null,
      quantity:          lineItem.quantity,
      unit:              lineItem.unit || 'each',
      vendor,
      lastUnitPrice:     lineItem.unitPrice || null,
      lastRestockedAt:   new Date(),
      lastRestockedFrom: vendor,
      lastPONumber:      poNumber,
      status:            'needs_review',
      source:            'po_import'
    });

    console.log(`[inventorySync] Created "${newItem.name}" (${newItem._id})`);
    return { action: 'created', itemId: newItem._id, itemName: newItem.name, quantity: lineItem.quantity };
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

# Prendio PO Email Parser — Implementation Plan

## Overview
Add an automated pipeline that polls a dedicated Gmail inbox for Prendio purchase order emails, extracts and parses the attached PDF, stores the parsed PO in MongoDB, and syncs incoming stock quantities into the existing inventory system.

**Flow:** Prendio PO email → Gmail inbox → IMAP poll (every 15 min) → PDF text extraction → regex parsing → catalog mapping lookup → auto-sync (all items matched) or queue for review (unmatched items) → audit trail in MongoDB

---

## Critical Adaptation: Model Field Mapping

The provided `inventorySync.js` references a generic `Item` model with fields like `name`, `catalogNumber`, `quantity`. The actual model is `ListedInventoryItem` with different field names:

| inventorySync.js expects | Actual ListedInventoryItem field |
|---|---|
| `name` | `item` |
| `catalogNumber` | `catalog` |
| `quantity` | `currentquantity` |
| `vendor` (nested) | `vendor` (top-level string) |

The `inventorySync.js` service will be adapted to use the real model and field names.

---

## Step-by-step Implementation

### Step 1: Install new dependencies
```
npm install imap mailparser pdf-parse
```
- `imap` — connect to Gmail via IMAP to fetch emails
- `mailparser` — parse raw email content and extract attachments
- `pdf-parse` — extract text from PDF buffers (no AI/OCR needed)

### Step 2: Create the `PurchaseOrder` model — `models/PurchaseOrder.js`
New Mongoose model to store parsed PO data and sync status. Fields:
- `parsedData` — object containing `poNumber`, `vendor`, `orderDate`, `lineItems[]`, `totalAmount`
- `lineItems[]` — each with `description`, `catalogNumber`, `quantity`, `unit`, `unitPrice`, `lineTotal`, `matchedItemId` (ObjectId ref to ListedInventoryItem, null until matched), `matchStatus` (enum: `auto_matched`, `user_matched`, `unmatched`)
- `status` — enum: `pending_review`, `processed`, `rejected`
- `source` — object with `emailFrom`, `emailSubject`, `emailDate`, `fileName`
- `warnings[]` — array of strings (parsing warnings that flag items for review)
- `unmatchedCount` — number of line items that could not be auto-matched (drives the review queue)
- `syncResults` — results from inventory sync (updated/created/skipped/errors)
- `syncedAt`, `syncedBy`, `rejectedAt`, `rejectedBy`, `rejectionReason`
- Indexes on `status`, `parsedData.poNumber`, `createdAt`

### Step 2b: Create the `CatalogMapping` model — `models/CatalogMapping.js`
Persistent lookup table that remembers user-confirmed catalog-to-inventory mappings so future POs auto-resolve:
- `prendioCatalog` — the catalog/part number as it appears on Prendio POs (string, unique index)
- `inventoryItemId` — ObjectId ref to `ListedInventoryItem`
- `inventoryItemName` — denormalized item name for display
- `vendor` — optional vendor string for disambiguation (two vendors could use the same part number)
- `createdBy` — email of the user who created the mapping
- `createdAt`, `updatedAt` — timestamps
- Unique compound index on `{ prendioCatalog: 1, vendor: 1 }` to handle same catalog # from different vendors

### Step 3: Create the PDF text extractor — `services/pdfExtractor.js`
Simple wrapper around `pdf-parse`:
- `extractTextFromPDF(buffer)` → returns raw text string
- Handles errors gracefully (corrupt PDF, empty content, etc.)

### Step 4: Create the PO text parser — `services/poParser.js`
Regex-based parser that takes raw PDF text and returns structured PO data:
- `parsePOData(text)` → `{ poNumber, vendor, orderDate, lineItems[], totalAmount, warnings[] }`
- Extracts PO number, vendor name, order date from header section
- Parses line items table: description, catalog #, qty, unit, unit price, line total
- Adds warnings for: missing catalog numbers, unparseable quantities, unrecognized formats
- Returns `warnings[]` array — if non-empty, the PO gets queued for review instead of auto-synced

**Note:** Regex patterns will need calibration against real Prendio PDFs. The parser includes a test mode for running against sample PDFs.

### Step 5: Create the email poller — `services/emailPoller.js`
IMAP-based Gmail polling service:
- `startPolling(intervalMinutes)` — starts the polling loop
- `stopPolling()` — clears the interval
- `pollOnce()` — single poll cycle (also useful for testing)
- Connects to Gmail IMAP using app-specific password from env vars
- Searches for unseen emails from `PRENDIO_EMAIL_SENDER`
- For each email: extracts PDF attachment → runs through extractor → parser
- After parsing, runs each line item through the matching pipeline (see Step 5b)
- If all items matched and no warnings: auto-syncs to inventory via `inventorySync`
- If any items unmatched or warnings found: saves PO with `pending_review` status for manager
- Marks processed emails as seen
- Daily cleanup: deletes emails older than 7 days from the mailbox
- All errors logged but never crash the polling loop

### Step 5b: Create the catalog matching service — `services/catalogMatcher.js`
Three-tier matching pipeline that runs for each PO line item:

**Tier 1 — Saved mapping lookup:**
- Query `CatalogMapping` for `prendioCatalog` + `vendor` combo
- If found: set `matchedItemId` and `matchStatus: 'auto_matched'`

**Tier 2 — Direct inventory match:**
- If no saved mapping, query `ListedInventoryItem` where `catalog` matches the PO's catalog number (case-insensitive)
- If exactly one match: set `matchedItemId`, `matchStatus: 'auto_matched'`, and **save a new CatalogMapping** so this resolves instantly next time
- If multiple matches (ambiguous): leave as `unmatched` with a warning noting the ambiguity

**Tier 3 — Unmatched:**
- If no match found: set `matchStatus: 'unmatched'`, `matchedItemId: null`
- The PO will be queued for user review

**Exported functions:**
- `matchLineItems(lineItems, vendor)` — runs the pipeline on all line items, returns updated items with match info + count of unmatched
- `saveUserMatch(prendioCatalog, vendor, inventoryItemId, userId)` — saves a mapping after the user manually matches an item (called from the route when user confirms a match)

### Step 6: Create the inventory sync service — `services/inventorySync.js`
Adapted from the provided code to work with the actual `ListedInventoryItem` model:
- `syncPOToInventory(poId, syncedBy)` — processes a PO's line items
- **Prerequisite check:** all line items must have `matchStatus !== 'unmatched'` — if any are unmatched, sync is blocked and returns an error telling the user to match them first
- For each line item:
  - Uses the already-resolved `matchedItemId` (set by catalogMatcher or user)
  - Add `quantity` to `currentquantity` on the matched `ListedInventoryItem`
  - Push order date to `orderHistory`, update `lastUsedDate`
  - Log to `InventoryHistory` using existing `quantity_change` change type
- `rejectPO(poId, rejectedBy, reason)` — marks a PO as rejected
- Updates PO status to `processed` with sync results when done

### Step 7: Create purchase order routes — `routes/purchaseOrders.js`
REST API + page routes for managing POs:
- `GET /purchase-orders` — render the PO management page (list of pending/processed/rejected POs)
- `GET /purchase-orders/api/list` — JSON list of POs with optional status filter
- `GET /purchase-orders/api/:id` — single PO detail
- `POST /purchase-orders/:id/sync` — manually trigger sync for a pending PO (blocked if unmatched items remain)
- `POST /purchase-orders/:id/reject` — reject a PO with reason
- `GET /purchase-orders/api/inventory-search?q=term` — search inventory items by name/catalog/vendor (used by the matching UI autocomplete)
- `POST /purchase-orders/:id/match-item` — user matches an unmatched line item to an inventory item; body: `{ lineItemIndex, inventoryItemId }`. Saves the match on the PO **and** creates a `CatalogMapping` so future POs auto-resolve
- `GET /purchase-orders/api/mappings` — list all saved catalog mappings (admin view)
- `DELETE /purchase-orders/api/mappings/:id` — delete a mapping if it was made in error
- All routes require authentication via `requireAuth` middleware

### Step 8: Create purchase orders view — `views/purchaseOrders.ejs`
Manager review page showing:
- Tabs/filter for Pending Review | Processed | Rejected
- Each PO card shows: PO number, vendor, date, line items table, warnings (highlighted)
- **Unmatched items are highlighted in the line items table** with an orange/yellow row background and a "Match" button
- Clicking "Match" opens a modal with:
  - The unmatched item's description, catalog #, and vendor from the PO
  - A searchable dropdown/autocomplete of existing inventory items (searches by name, catalog, vendor)
  - A "Confirm Match" button that saves the mapping
- Once all items are matched, the "Approve & Sync" button becomes enabled
- Pending POs with zero unmatched items show "Approve & Sync" and "Reject" action buttons
- Processed POs show sync results (what was updated/created/skipped)
- Optional "Catalog Mappings" section showing saved mappings with ability to delete incorrect ones
- Styling uses existing `orders.css` patterns for consistency

### Step 9: Create client-side JS — `public/JS/purchaseOrders.js`
Frontend logic for the PO management page:
- Filter/tab switching between PO statuses
- **Item matching flow:**
  - "Match" button click → opens match modal for that line item
  - Debounced search input → `GET /purchase-orders/api/inventory-search?q=...`
  - Results displayed as selectable cards showing item name, catalog, vendor, current qty
  - "Confirm Match" → `POST /purchase-orders/:id/match-item` → updates the line item row in-place (orange → green, shows matched item name)
  - Tracks remaining unmatched count; when 0, enables the "Approve & Sync" button
- Approve (sync) button → `POST /purchase-orders/:id/sync`
- Reject button → modal with reason input → `POST /purchase-orders/:id/reject`
- Status updates reflected in real-time without full page reload

### Step 10: Update `app.js` — Register route and start poller
- Add `purchaseOrderRoutes` require and `app.use('/purchase-orders', ...)`
- After MongoDB connects successfully, start email polling in production mode
- Add `PARSER_EMAIL`, `PARSER_APP_PASSWORD`, `PRENDIO_EMAIL_SENDER` to required env validation (production only)

### Step 11: Update `.env.example` — Document new env vars
Add:
```
PARSER_EMAIL=parse.vfpinventory@gmail.com
PARSER_APP_PASSWORD=xxxx-xxxx-xxxx-xxxx
PRENDIO_EMAIL_SENDER=noreply@procure.prendio.com
```

### Step 12: Update navigation — Add PO link to layout
Add "Purchase Orders" link to the nav bar in `views/layouts/layout.ejs`, likely under the existing "Order" dropdown.

---

## New files created
| File | Purpose |
|---|---|
| `models/PurchaseOrder.js` | Mongoose model for parsed PO records |
| `models/CatalogMapping.js` | Persistent Prendio catalog → inventory item lookup table |
| `services/pdfExtractor.js` | PDF → text extraction |
| `services/poParser.js` | Regex parser for Prendio PO text |
| `services/catalogMatcher.js` | Three-tier matching pipeline + user match persistence |
| `services/emailPoller.js` | IMAP Gmail polling + orchestration |
| `services/inventorySync.js` | PO → inventory sync logic |
| `routes/purchaseOrders.js` | Express routes for PO management + matching |
| `views/purchaseOrders.ejs` | EJS view for PO review + item matching page |
| `public/JS/purchaseOrders.js` | Client-side JS for PO page + matching UI |

## Existing files modified
| File | Change |
|---|---|
| `package.json` | Add `imap`, `mailparser`, `pdf-parse` dependencies |
| `app.js` | Register PO routes, start poller after DB connect |
| `.env.example` | Add email/parser env vars |
| `views/layouts/layout.ejs` | Add "Purchase Orders" nav link |

---

## Key design decisions
1. **Adapt to existing schema** — The sync service will use `ListedInventoryItem` fields (`item`, `catalog`, `currentquantity`) rather than introducing a new `Item` model
2. **Leverage existing history tracking** — All inventory changes go through `InventoryHistory` using existing change types
3. **No new CSS file** — Reuse `orders.css` patterns for consistency
4. **Polling only in production** — Development mode won't auto-poll to avoid email conflicts
5. **Auto-sync vs. review** — POs with clean parses and all items matched sync automatically; those with warnings or unmatched items queue for manager review
6. **Never auto-create inventory items** — When a PO line item doesn't match anything in inventory, it is flagged as `unmatched` and the user must manually match it to an existing item. This prevents phantom/duplicate items from being created
7. **Catalog mappings are learned** — Every user match is saved to `CatalogMapping`, so the same Prendio catalog number auto-resolves on all future POs. The mapping table grows organically as POs come in
8. **Mappings are vendor-scoped** — Compound index on `(prendioCatalog, vendor)` handles the edge case where two different vendors use the same part number for different products
9. **Sync is blocked until all items matched** — The "Approve & Sync" button is disabled until `unmatchedCount === 0`, preventing partial syncs that could leave orphaned quantities

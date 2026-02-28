/**
 * emailPoller.js
 *
 * Polls a Gmail inbox for Prendio PO confirmation emails, processes any
 * PDF attachments, and handles automatic email cleanup after 7 days.
 *
 * Uses ImapFlow (replaces the deprecated `imap` package which had 3 high-
 * severity vulnerabilities). ImapFlow is promise-based, so no callback wrappers
 * are needed.
 *
 * Two scheduled jobs run in parallel:
 *   1. pollInboxForPOs()   — every N min, finds new unread PO emails
 *   2. cleanupOldEmails()  — once daily, permanently deletes emails older than 7 days
 */

const { ImapFlow } = require('imapflow');
const { simpleParser } = require('mailparser');
const { extractTextFromPDF } = require('./pdfExtractor');
const { parsePOData } = require('./poParser');
const { syncPOToInventory } = require('./inventorySync');
const PurchaseOrder = require('../models/PurchaseOrder');

// ─────────────────────────────────────────────
// IMAP CONNECTION
// ─────────────────────────────────────────────

function createClient() {
  return new ImapFlow({
    host: 'imap.gmail.com',
    port: 993,
    secure: true,
    auth: {
      user: process.env.PARSER_EMAIL,
      pass: process.env.PARSER_APP_PASSWORD
    },
    logger: false
  });
}

// ─────────────────────────────────────────────
// JOB 1: POLL FOR NEW PO EMAILS
// ─────────────────────────────────────────────

async function pollInboxForPOs() {
  console.log(`[emailPoller] Polling inbox at ${new Date().toISOString()}`);

  const client = createClient();
  const results = [];

  try {
    await client.connect();

    const lock = await client.getMailboxLock('INBOX');
    try {
      const sender = process.env.PRENDIO_EMAIL_SENDER || 'noreply@procure.prendio.com';

      // Search for unseen emails from the Prendio sender
      const uids = await client.search({
        seen: false,
        from: sender
      });

      if (!uids || uids.length === 0) {
        console.log('[emailPoller] No new PO emails.');
        return results;
      }

      console.log(`[emailPoller] Found ${uids.length} new Prendio email(s).`);

      // Fetch and process each message
      for (const uid of uids) {
        try {
          const message = await client.fetchOne(uid, { source: true });
          const parsed = await simpleParser(message.source);
          const result = await processEmail(parsed);
          if (result) results.push(...(Array.isArray(result) ? result : [result]));

          // Mark as seen
          await client.messageFlagsAdd(uid, ['\\Seen']);
        } catch (err) {
          console.error(`[emailPoller] Error processing UID ${uid}:`, err.message);
        }
      }
    } finally {
      lock.release();
    }
  } catch (err) {
    console.error('[emailPoller] Poll error:', err.message);
  } finally {
    await client.logout().catch(() => {});
  }

  return results;
}

// ─────────────────────────────────────────────
// PROCESS A SINGLE EMAIL
// ─────────────────────────────────────────────

async function processEmail(parsedEmail) {
  const { subject, from, date, attachments } = parsedEmail;

  const pdfAttachments = (attachments || []).filter(att =>
    att.contentType === 'application/pdf' ||
    (att.filename && att.filename.toLowerCase().endsWith('.pdf'))
  );

  if (pdfAttachments.length === 0) {
    console.log(`[emailPoller] No PDF in email "${subject}" — skipping.`);
    return null;
  }

  const results = [];

  for (const attachment of pdfAttachments) {
    try {
      // Extract text from the PDF
      const rawText = await extractTextFromPDF(attachment.content);

      // Parse the PO data using regex patterns
      const parsedData = parsePOData(rawText, {
        emailSubject: subject,
        emailFrom:    from?.text,
        emailDate:    date,
        filename:     attachment.filename
      });

      // Determine status based on parse quality.
      // If there are warnings (missing fields), route to manual review.
      // If it parsed cleanly, auto-apply to inventory.
      const hasWarnings = parsedData.warnings && parsedData.warnings.length > 0;
      const status = hasWarnings ? 'pending_review' : 'auto_approved';

      // Save the PO record
      const poRecord = await PurchaseOrder.create({
        source: 'email',
        emailMetadata: {
          subject,
          from:       from?.text,
          filename:   attachment.filename
        },
        rawText,
        parsedData,
        status,
        emailReceivedAt: date || new Date()
      });

      console.log(`[emailPoller] PO saved: ${poRecord._id} (status: ${status})`);

      // If it parsed cleanly, automatically sync to inventory
      if (status === 'auto_approved') {
        await syncPOToInventory(poRecord._id, 'system_auto');
        console.log(`[emailPoller] PO ${poRecord._id} auto-synced to inventory.`);
      } else {
        console.log(`[emailPoller] PO ${poRecord._id} queued for review — warnings: ${parsedData.warnings.join(', ')}`);
      }

      results.push(poRecord);
    } catch (err) {
      console.error(`[emailPoller] Failed on attachment "${attachment.filename}":`, err.message);
    }
  }

  return results.length > 0 ? results : null;
}

// ─────────────────────────────────────────────
// JOB 2: EMAIL CLEANUP — DELETE AFTER 7 DAYS
// ─────────────────────────────────────────────

/**
 * Permanently deletes Prendio emails older than 7 days from the Gmail inbox.
 *
 * ImapFlow deletion flow:
 *   1. Search for Prendio emails received before the 7-day cutoff
 *   2. Add the \Deleted flag to each one
 *   3. Call expunge to permanently remove them
 *
 * Runs once daily (see scheduler below).
 */
async function cleanupOldEmails() {
  console.log(`[emailPoller] Running cleanup at ${new Date().toISOString()}`);

  const client = createClient();
  let deletedCount = 0;

  try {
    await client.connect();

    const lock = await client.getMailboxLock('INBOX');
    try {
      const sender = process.env.PRENDIO_EMAIL_SENDER || 'noreply@procure.prendio.com';

      // Calculate the cutoff date (7 days ago)
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - 7);

      console.log(`[emailPoller] Deleting Prendio emails before ${cutoffDate.toISOString()}`);

      // Search for old emails from the Prendio sender
      const uids = await client.search({
        from: sender,
        before: cutoffDate
      });

      if (!uids || uids.length === 0) {
        console.log('[emailPoller] No old emails to delete.');
        return 0;
      }

      console.log(`[emailPoller] Flagging ${uids.length} email(s) for deletion.`);

      // Flag as deleted and expunge
      await client.messageFlagsAdd(uids, ['\\Deleted']);
      await client.messageDelete(uids);

      deletedCount = uids.length;
      console.log(`[emailPoller] Deleted ${deletedCount} old Prendio email(s).`);
    } finally {
      lock.release();
    }
  } catch (err) {
    console.error('[emailPoller] Cleanup error:', err.message);
  } finally {
    await client.logout().catch(() => {});
  }

  return deletedCount;
}

// ─────────────────────────────────────────────
// SCHEDULER
// ─────────────────────────────────────────────

let pollInterval    = null;
let cleanupInterval = null;

function startPolling(pollIntervalMinutes = 15) {
  if (pollInterval) {
    console.warn('[emailPoller] Already running.');
    return;
  }

  console.log(`[emailPoller] Starting — polling every ${pollIntervalMinutes} min, cleanup daily.`);

  // Poll immediately on startup, then on schedule
  pollInboxForPOs().catch(err =>
    console.error('[emailPoller] Initial poll error:', err.message)
  );

  pollInterval = setInterval(() => {
    pollInboxForPOs().catch(err =>
      console.error('[emailPoller] Poll error:', err.message)
    );
  }, pollIntervalMinutes * 60 * 1000);

  // Run cleanup once daily
  cleanupInterval = setInterval(() => {
    cleanupOldEmails().catch(err =>
      console.error('[emailPoller] Cleanup error:', err.message)
    );
  }, 24 * 60 * 60 * 1000);
}

function stopPolling() {
  if (pollInterval)    { clearInterval(pollInterval);    pollInterval    = null; }
  if (cleanupInterval) { clearInterval(cleanupInterval); cleanupInterval = null; }
  console.log('[emailPoller] Stopped.');
}

module.exports = { startPolling, stopPolling, pollInboxForPOs, cleanupOldEmails };

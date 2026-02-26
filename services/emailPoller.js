/**
 * emailPoller.js
 *
 * Polls a Gmail inbox for Prendio PO confirmation emails, processes any
 * PDF attachments, and handles automatic email cleanup after 7 days.
 *
 * Two scheduled jobs run in parallel:
 *   1. pollInboxForPOs()   — every 15 min, finds new unread PO emails
 *   2. cleanupOldEmails()  — once daily, permanently deletes emails older than 7 days
 */
const Imap = require('imap');
const { simpleParser } = require('mailparser');
const { extractTextFromPDF } = require('./pdfExtractor');
const { parsePOData } = require('./poParser');
const { syncPOToInventory } = require('./inventorySync');
const PurchaseOrder = require('../models/PurchaseOrder');

// ─────────────────────────────────────────────
// IMAP CONNECTION
// ─────────────────────────────────────────────

function createImapConnection() {
  return new Imap({
    user: process.env.PARSER_EMAIL,
    password: process.env.PARSER_APP_PASSWORD,
    host: 'imap.gmail.com',
    port: 993,
    tls: true,
    tlsOptions: { rejectUnauthorized: true },
    authTimeout: 10000
  });
}

// Promisified wrapper — IMAP uses callbacks but we want async/await throughout
function withImap(fn) {
  return new Promise((resolve, reject) => {
    const imap = createImapConnection();
    imap.once('ready', () => fn(imap, resolve, reject));
    imap.once('error', reject);
    imap.connect();
  });
}

// ─────────────────────────────────────────────
// JOB 1: POLL FOR NEW PO EMAILS
// ─────────────────────────────────────────────

async function pollInboxForPOs() {
  console.log(`[emailPoller] Polling inbox at ${new Date().toISOString()}`);

  return withImap((imap, resolve, reject) => {
    imap.openBox('INBOX', false, (err) => {
      if (err) { imap.end(); return reject(err); }

      const searchCriteria = [
        'UNSEEN',
        ['FROM', process.env.PRENDIO_EMAIL_SENDER || 'noreply@procure.prendio.com']
      ];

      imap.search(searchCriteria, async (err, uids) => {
        if (err) { imap.end(); return reject(err); }

        if (!uids || uids.length === 0) {
          console.log('[emailPoller] No new PO emails.');
          imap.end();
          return resolve([]);
        }

        console.log(`[emailPoller] Found ${uids.length} new Prendio email(s).`);
        const fetch = imap.fetch(uids, { bodies: 'BODY[]', markSeen: true });
        const results = [];

        fetch.on('message', (msg) => {
          let rawEmail = '';
          msg.on('body', (stream) => {
            stream.on('data', (chunk) => rawEmail += chunk.toString('utf8'));
          });
          msg.once('end', async () => {
            try {
              const parsed = await simpleParser(rawEmail);
              const result = await processEmail(parsed);
              if (result) results.push(result);
            } catch (err) {
              console.error('[emailPoller] Error processing email:', err.message);
            }
          });
        });

        fetch.once('end', () => {
          imap.end();
          resolve(results);
        });
        fetch.once('error', (err) => {
          console.error('[emailPoller] Fetch error:', err.message);
          imap.end();
          reject(err);
        });
      });
    });
  });
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
 * Gmail's IMAP deletion flow:
 *   1. Search for Prendio emails received before the 7-day cutoff
 *   2. Add the \Deleted flag to each one
 *   3. Call EXPUNGE to permanently remove them
 *
 * Runs once daily (see scheduler below).
 */
async function cleanupOldEmails() {
  console.log(`[emailPoller] Running cleanup at ${new Date().toISOString()}`);

  return withImap((imap, resolve, reject) => {
    imap.openBox('INBOX', false, (err) => {
      if (err) { imap.end(); return reject(err); }

      // Calculate the cutoff date (7 days ago)
      // IMAP BEFORE format: DD-Mon-YYYY  e.g. "15-Jan-2024"
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - 7);
      const imapDateStr = formatImapDate(cutoffDate);

      console.log(`[emailPoller] Deleting Prendio emails before ${imapDateStr}`);

      const searchCriteria = [
        ['BEFORE', imapDateStr],
        ['FROM', process.env.PRENDIO_EMAIL_SENDER || 'noreply@procure.prendio.com']
      ];

      imap.search(searchCriteria, (err, uids) => {
        if (err) { imap.end(); return reject(err); }

        if (!uids || uids.length === 0) {
          console.log('[emailPoller] No old emails to delete.');
          imap.end();
          return resolve(0);
        }

        console.log(`[emailPoller] Flagging ${uids.length} email(s) for deletion.`);

        // Step 1: Flag as deleted
        imap.addFlags(uids, '\\Deleted', (err) => {
          if (err) { imap.end(); return reject(err); }

          // Step 2: Expunge — permanently removes flagged emails
          imap.expunge((err) => {
            if (err) { imap.end(); return reject(err); }

            console.log(`[emailPoller] Deleted ${uids.length} old Prendio email(s).`);
            imap.end();
            resolve(uids.length);
          });
        });
      });
    });
  });
}

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────

/**
 * Format a JS Date to IMAP's required format: DD-Mon-YYYY
 * e.g., new Date('2024-01-15') → "15-Jan-2024"
 */
function formatImapDate(date) {
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const day   = date.getDate().toString().padStart(2, '0');
  const month = months[date.getMonth()];
  const year  = date.getFullYear();
  return `${day}-${month}-${year}`;
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

/**
 * quotes.js — client logic for the Quotes pages.
 *
 * Two pages share this file:
 *   - /quotes           (list + upload): dropzone, delete
 *   - /quotes/:id        (review): edit header, edit line items, approve/reject
 * Each block guards on the presence of its elements so nothing runs on the
 * wrong page.
 */
(function () {
  'use strict';

  // ─────────────────────────────────────────────
  // UPLOAD PAGE — dropzone + file selection
  // ─────────────────────────────────────────────
  const dropzone = document.getElementById('quoteDropzone');
  const fileInput = document.getElementById('quoteFileInput');
  const fileNameEl = document.getElementById('quoteFileName');
  const uploadBtn = document.getElementById('quoteUploadBtn');
  const uploadForm = document.getElementById('quoteUploadForm');

  if (dropzone && fileInput) {
    dropzone.addEventListener('click', () => fileInput.click());

    dropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropzone.classList.add('dragover');
    });
    dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
    dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzone.classList.remove('dragover');
      if (e.dataTransfer.files.length) {
        fileInput.files = e.dataTransfer.files;
        onFilePicked();
      }
    });

    fileInput.addEventListener('change', onFilePicked);

    function onFilePicked() {
      const f = fileInput.files[0];
      if (f) {
        fileNameEl.textContent = f.name;
        dropzone.classList.add('has-file');
        if (uploadBtn) uploadBtn.disabled = false;
      }
    }

    if (uploadForm) {
      uploadForm.addEventListener('submit', () => {
        if (uploadBtn) {
          uploadBtn.disabled = true;
          const label = uploadBtn.querySelector('.btn-label');
          const spinner = uploadBtn.querySelector('.btn-spinner');
          if (label) label.textContent = 'Parsing…';
          if (spinner) spinner.hidden = false;
        }
      });
    }
  }

  // ─────────────────────────────────────────────
  // Delete a quote (list page)
  // ─────────────────────────────────────────────
  document.querySelectorAll('.quote-delete-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-quote-id');
      if (!confirm('Delete this quote? Inventory items tied to it will be unlinked.')) return;
      try {
        const res = await fetch('/quotes/' + id, { method: 'DELETE' });
        const data = await res.json();
        if (res.ok) {
          const row = btn.closest('.quote-row');
          if (row) row.remove();
        } else {
          alert(data.message || 'Failed to delete quote.');
        }
      } catch (err) {
        alert('Failed to delete quote.');
      }
    });
  });

  // ─────────────────────────────────────────────
  // REVIEW PAGE
  // ─────────────────────────────────────────────
  const detail = document.getElementById('quoteDetail');
  if (!detail) return;
  const quoteId = detail.getAttribute('data-quote-id');

  // Save quote header (vendor / number / dates)
  const saveHeaderBtn = document.getElementById('saveHeaderBtn');
  if (saveHeaderBtn) {
    saveHeaderBtn.addEventListener('click', async () => {
      const hint = document.getElementById('headerSaveHint');
      const body = {
        vendor: val('qhVendor'),
        quoteNumber: val('qhNumber'),
        quoteDate: val('qhDate'),
        expirationDate: val('qhExpiration')
      };
      saveHeaderBtn.disabled = true;
      try {
        const res = await fetch('/quotes/' + quoteId, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
        const data = await res.json();
        if (hint) {
          hint.textContent = res.ok ? 'Saved ✓' : (data.message || 'Save failed');
          hint.className = 'save-hint ' + (res.ok ? 'ok' : 'err');
          setTimeout(() => { hint.textContent = ''; }, 2500);
        }
      } catch (err) {
        if (hint) { hint.textContent = 'Save failed'; hint.className = 'save-hint err'; }
      } finally {
        saveHeaderBtn.disabled = false;
      }
    });
  }

  // Persist a line-item field edit on change.
  detail.querySelectorAll('.line-item-card').forEach((card) => {
    const index = card.getAttribute('data-index');

    card.querySelectorAll('.li-input').forEach((input) => {
      input.addEventListener('change', async () => {
        const field = input.getAttribute('data-field');
        const body = {};
        body[field] = input.value;
        try {
          await fetch('/quotes/' + quoteId + '/line/' + index, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
          });
          flash(input);
        } catch (err) { /* non-fatal */ }
      });
    });

    // Approve & tie
    const approveBtn = card.querySelector('.li-approve-btn');
    if (approveBtn) {
      approveBtn.addEventListener('click', async () => {
        const select = card.querySelector('.li-inventory-select');
        const inventoryItemId = select ? select.value : '';
        if (!inventoryItemId) {
          alert('Choose an inventory item to tie this quote line to.');
          return;
        }
        const quotedPrice = fieldVal(card, 'quotedPrice');
        const originalPrice = fieldVal(card, 'originalPrice');
        await postLine(index, 'approve', { inventoryItemId, quotedPrice, originalPrice });
      });
    }

    const rejectBtn = card.querySelector('.li-reject-btn');
    if (rejectBtn) rejectBtn.addEventListener('click', () => postLine(index, 'reject', {}));

    const resetBtn = card.querySelector('.li-reset-btn');
    if (resetBtn) resetBtn.addEventListener('click', () => postLine(index, 'reset', {}));
  });

  async function postLine(index, action, body) {
    try {
      const res = await fetch('/quotes/' + quoteId + '/line/' + index + '/' + action, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body || {})
      });
      const data = await res.json();
      if (res.ok) {
        window.location.reload();
      } else {
        alert(data.message || 'Action failed.');
      }
    } catch (err) {
      alert('Action failed.');
    }
  }

  function val(id) {
    const el = document.getElementById(id);
    return el ? el.value.trim() : '';
  }
  function fieldVal(card, field) {
    const el = card.querySelector('.li-input[data-field="' + field + '"]');
    return el ? el.value : '';
  }
  function flash(el) {
    el.classList.add('field-saved');
    setTimeout(() => el.classList.remove('field-saved'), 800);
  }
})();

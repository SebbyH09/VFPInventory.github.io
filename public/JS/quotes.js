/**
 * quotes.js — client logic for the Quotes pages.
 *
 * Two pages share this file:
 *   - /quotes           (list + upload): dropzone, delete, prepaid deliveries
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
  // Prepaid monthly deliveries (list page)
  // ─────────────────────────────────────────────
  const ppCard = document.getElementById('prepaidFormCard');
  const ppForm = document.getElementById('prepaidForm');
  if (ppCard && ppForm) {
    const toggleBtn = document.getElementById('prepaidToggleBtn');
    const cancelBtn = document.getElementById('prepaidCancelBtn');
    const titleEl = document.getElementById('prepaidFormTitle');
    const submitBtn = document.getElementById('prepaidSubmitBtn');
    const invSelect = document.getElementById('ppInventoryItem');
    const summaryEl = document.getElementById('prepaidSummary');

    // Form field id → data-* attribute on the Edit button
    const fieldMap = {
      ppVendor: 'vendor', ppItem: 'item', ppCatalog: 'catalogNumber', ppRef: 'referenceNumber',
      ppInventoryItem: 'inventoryItemId', ppQty: 'quantityPerMonth', ppUnit: 'unit',
      ppUnitPrice: 'unitPrice', ppAmountPaid: 'amountPaid', ppStart: 'startDate',
      ppEnd: 'endDate', ppDay: 'deliveryDay', ppNotes: 'notes'
    };

    function openForm(editBtn) {
      ppForm.reset();
      if (editBtn) {
        Object.keys(fieldMap).forEach((id) => {
          document.getElementById(id).value = editBtn.dataset[fieldMap[id]] || '';
        });
        ppForm.action = '/quotes/prepaid/' + editBtn.dataset.prepaidId;
        titleEl.textContent = 'Edit Prepaid Delivery';
        submitBtn.textContent = 'Save Changes';
      } else {
        ppForm.action = ppForm.dataset.createAction;
        titleEl.textContent = 'New Prepaid Delivery';
        submitBtn.textContent = 'Save Prepaid Delivery';
      }
      ppCard.hidden = false;
      updateSummary();
      ppCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
      document.getElementById('ppVendor').focus({ preventScroll: true });
    }

    function closeForm() {
      ppForm.reset();
      ppCard.hidden = true;
    }

    if (toggleBtn) toggleBtn.addEventListener('click', () => (ppCard.hidden ? openForm(null) : closeForm()));
    if (cancelBtn) cancelBtn.addEventListener('click', closeForm);
    document.querySelectorAll('.prepaid-edit-btn').forEach((btn) => {
      btn.addEventListener('click', () => openForm(btn));
    });

    // Picking an inventory item pre-fills blank item / vendor / catalog fields.
    if (invSelect) {
      invSelect.addEventListener('change', () => {
        const opt = invSelect.selectedOptions[0];
        if (!opt || !opt.value) return;
        const fill = (id, v) => { const el = document.getElementById(id); if (el && !el.value && v) el.value = v; };
        fill('ppItem', opt.dataset.name);
        fill('ppVendor', opt.dataset.vendor);
        fill('ppCatalog', opt.dataset.catalog);
      });
    }

    // Live "N months · $X/month · $Y total" summary under the form.
    function updateSummary() {
      if (!summaryEl) return;
      const start = val('ppStart'), end = val('ppEnd');
      const qty = parseFloat(val('ppQty')), price = parseFloat(val('ppUnitPrice'));
      const parts = [];
      let months = 0;
      if (start && end && end >= start) {
        const s = start.split('-').map(Number), e = end.split('-').map(Number);
        months = (e[0] - s[0]) * 12 + (e[1] - s[1]) + 1;
        parts.push(months + ' monthly deliver' + (months === 1 ? 'y' : 'ies'));
      }
      if (!isNaN(qty) && !isNaN(price)) {
        const monthly = qty * price;
        parts.push(money(monthly) + ' / month');
        if (months) parts.push(money(monthly * months) + ' total');
      }
      summaryEl.textContent = parts.join(' · ');
    }
    ['ppStart', 'ppEnd', 'ppQty', 'ppUnitPrice'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('input', updateSummary);
    });

    ppForm.addEventListener('submit', (e) => {
      if (!val('ppItem') && !val('ppInventoryItem')) {
        e.preventDefault();
        alert('Enter an item description or link an inventory item.');
        return;
      }
      if (val('ppStart') && val('ppEnd') && val('ppEnd') < val('ppStart')) {
        e.preventDefault();
        alert('End date must be on or after the start date.');
      }
    });

    async function prepaidAction(btn, url, method, confirmMsg) {
      if (confirmMsg && !confirm(confirmMsg)) return;
      btn.disabled = true;
      try {
        const res = await fetch(url, { method });
        const data = await res.json();
        if (res.ok) {
          window.location.reload();
        } else {
          alert(data.message || 'Action failed.');
          btn.disabled = false;
        }
      } catch (err) {
        alert('Action failed.');
        btn.disabled = false;
      }
    }

    document.querySelectorAll('.prepaid-received-btn').forEach((btn) => {
      btn.addEventListener('click', () =>
        prepaidAction(btn, '/quotes/prepaid/' + btn.dataset.prepaidId + '/received', 'POST'));
    });
    document.querySelectorAll('.prepaid-undo-btn').forEach((btn) => {
      btn.addEventListener('click', () =>
        prepaidAction(btn, '/quotes/prepaid/' + btn.dataset.prepaidId + '/undo-received', 'POST',
          'Remove the most recently logged delivery?'));
    });
    document.querySelectorAll('.prepaid-delete-btn').forEach((btn) => {
      btn.addEventListener('click', () =>
        prepaidAction(btn, '/quotes/prepaid/' + btn.dataset.prepaidId, 'DELETE',
          'Delete this prepaid delivery and its received log?'));
    });
  }

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
  function money(n) {
    return '$' + n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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

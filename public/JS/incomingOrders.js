(function () {
    'use strict';

    // ── Load server-side data ────────────────────────────────────────────────
    const incomingPOs = JSON.parse(
        document.getElementById('incoming-pos-data').textContent
    );
    const inventoryItems = JSON.parse(
        document.getElementById('inventory-items-data').textContent
    );

    let selectedPO = null;

    // ── DOM refs ─────────────────────────────────────────────────────────────
    const poSelectList       = document.getElementById('po-select-list');
    const matchingContainer  = document.getElementById('matching-container');
    const submitBtn          = document.getElementById('submit-order-btn');
    const notesSection       = document.getElementById('notes-section');
    const panelHint          = document.getElementById('panel-hint');
    const tabPOs             = document.getElementById('tab-pos');
    const tabMatch           = document.getElementById('tab-match');
    const leftPanel          = document.getElementById('left-panel');
    const rightPanel         = document.getElementById('right-panel');

    // ── Mobile tabs ──────────────────────────────────────────────────────────
    if (tabPOs && tabMatch) {
        tabPOs.addEventListener('click', function () {
            tabPOs.classList.add('active');
            tabMatch.classList.remove('active');
            leftPanel.classList.remove('mobile-hidden');
            rightPanel.classList.add('mobile-hidden');
        });
        tabMatch.addEventListener('click', function () {
            tabMatch.classList.add('active');
            tabPOs.classList.remove('active');
            rightPanel.classList.remove('mobile-hidden');
            leftPanel.classList.add('mobile-hidden');
        });
    }

    // ── PO card selection ────────────────────────────────────────────────────
    if (poSelectList) {
        poSelectList.addEventListener('click', function (e) {
            const card = e.target.closest('.order-select-card');
            if (!card) return;

            document.querySelectorAll('.order-select-card').forEach(function (c) {
                c.classList.remove('selected');
            });
            card.classList.add('selected');

            const poId = card.dataset.poId;
            selectedPO = incomingPOs.find(function (p) { return p.id === poId; });

            if (selectedPO) {
                renderMatchingUI(selectedPO);
                // Switch to match tab on mobile
                if (tabMatch && window.innerWidth <= 768) {
                    tabMatch.click();
                }
            }
        });
    }

    // ── Build the matching UI for a selected PO ───────────────────────────────
    function renderMatchingUI(po) {
        if (panelHint) {
            panelHint.textContent =
                'PO: ' + (po.poNumber || 'N/A') + '  |  Vendor: ' + (po.vendor || 'N/A') +
                (po.orderDate ? '  |  Date: ' + po.orderDate : '');
        }
        if (notesSection) notesSection.style.display = 'block';
        submitBtn.disabled = false;
        clearMessage();

        if (!po.lineItems || po.lineItems.length === 0) {
            matchingContainer.innerHTML =
                '<div class="empty-message">This purchase order has no line items to match.</div>';
            return;
        }

        var tableHeader =
            '<table class="po-line-items-table">' +
                '<thead><tr>' +
                    '<th>Qty</th>' +
                    '<th>Item Code / Description</th>' +
                    '<th>PO#</th>' +
                    '<th>Unit Price</th>' +
                    '<th>Match</th>' +
                '</tr></thead>' +
                '<tbody>';

        var tableRows = po.lineItems.map(function (item, index) {
            var suggested = suggestMatch(item);
            var optionsHtml = buildOptions(suggested ? suggested.id : '');
            var codeDesc = '';
            if (item.catalogNumber) codeDesc += escapeHtml(item.catalogNumber) + ' — ';
            codeDesc += escapeHtml(item.description || 'No description');

            return (
                '<tr class="po-line-row" data-line-index="' + index + '">' +
                    '<td class="po-col-qty">' + (item.quantity || 0) + '</td>' +
                    '<td class="po-col-desc">' + codeDesc + '</td>' +
                    '<td class="po-col-po">' + escapeHtml(po.poNumber || 'N/A') + '</td>' +
                    '<td class="po-col-price">' + (item.unitPrice ? '$' + Number(item.unitPrice).toFixed(2) : '—') + '</td>' +
                    '<td class="po-col-match">' +
                        '<select class="match-inv-select" data-line-index="' + index + '">' +
                            optionsHtml +
                        '</select>' +
                        (suggested ? '<p class="match-suggestion">Suggested: ' + escapeHtml(suggested.name) + '</p>' : '') +
                        '<input type="text" class="match-search-input" placeholder="Filter..." data-line-index="' + index + '">' +
                        '<div class="po-row-actions">' +
                            '<input type="number" class="match-qty-input" value="' + (item.quantity || 1) + '" min="1" data-line-index="' + index + '" title="Order qty">' +
                            '<label class="skip-label">' +
                                '<input type="checkbox" class="skip-checkbox" data-line-index="' + index + '">' +
                                ' Skip' +
                            '</label>' +
                        '</div>' +
                    '</td>' +
                '</tr>'
            );
        }).join('');

        matchingContainer.innerHTML = tableHeader + tableRows + '</tbody></table>';

        // Wire up search inputs
        matchingContainer.querySelectorAll('.match-search-input').forEach(function (input) {
            input.addEventListener('input', function () {
                filterOptions(this);
            });
        });

        // Wire up skip checkboxes
        matchingContainer.querySelectorAll('.skip-checkbox').forEach(function (cb) {
            cb.addEventListener('change', function () {
                var row = this.closest('.po-line-row');
                var sel  = row.querySelector('.match-inv-select');
                var qty  = row.querySelector('.match-qty-input');
                var srch = row.querySelector('.match-search-input');
                var skipped = this.checked;
                sel.disabled  = skipped;
                qty.disabled  = skipped;
                srch.disabled = skipped;
                row.classList.toggle('skipped', skipped);
                row.classList.remove('match-error');
            });
        });
    }

    // ── Build <option> list for a select ────────────────────────────────────
    function buildOptions(preselectedId) {
        var opts = '<option value="">-- Select Inventory Item --</option>';
        inventoryItems.forEach(function (inv) {
            var label = escapeHtml(inv.name);
            if (inv.brand)   label += ' \u2014 ' + escapeHtml(inv.brand);
            if (inv.catalog) label += ' (' + escapeHtml(inv.catalog) + ')';
            opts += '<option value="' + inv.id + '"' +
                    (inv.id === preselectedId ? ' selected' : '') +
                    ' data-name="'    + escapeHtml(inv.name)    + '"' +
                    ' data-brand="'   + escapeHtml(inv.brand)   + '"' +
                    ' data-catalog="' + escapeHtml(inv.catalog) + '"' +
                    ' data-vendor="'  + escapeHtml(inv.vendor)  + '">' +
                    label +
                    '</option>';
        });
        return opts;
    }

    // ── Filter select options as user types in search box ───────────────────
    function filterOptions(searchInput) {
        var query      = searchInput.value.toLowerCase().trim();
        var lineIndex  = searchInput.dataset.lineIndex;
        var select     = matchingContainer.querySelector('.match-inv-select[data-line-index="' + lineIndex + '"]');
        if (!select) return;

        var options = select.querySelectorAll('option');
        options.forEach(function (opt) {
            if (!opt.value) return; // keep placeholder
            if (!query) {
                opt.style.display = '';
                return;
            }
            var name    = (opt.dataset.name    || '').toLowerCase();
            var brand   = (opt.dataset.brand   || '').toLowerCase();
            var catalog = (opt.dataset.catalog || '').toLowerCase();
            var vendor  = (opt.dataset.vendor  || '').toLowerCase();
            var visible = name.includes(query) || brand.includes(query) ||
                          catalog.includes(query) || vendor.includes(query);
            opt.style.display = visible ? '' : 'none';
        });

        // Clear selection if currently selected option is now hidden
        var chosen = select.options[select.selectedIndex];
        if (chosen && chosen.value && chosen.style.display === 'none') {
            select.value = '';
        }
    }

    // ── Suggest an inventory match based on catalog number or name ───────────
    function suggestMatch(lineItem) {
        if (!lineItem) return null;
        var cat  = (lineItem.catalogNumber || '').toLowerCase().trim();
        var desc = (lineItem.description   || '').toLowerCase().trim();

        // Exact catalog number match
        if (cat) {
            var exactCat = inventoryItems.find(function (inv) {
                return (inv.catalog || '').toLowerCase().trim() === cat;
            });
            if (exactCat) return exactCat;
        }

        // First word of description contained in inventory name
        if (desc) {
            var firstWord = desc.split(/\s+/)[0];
            if (firstWord.length >= 4) {
                var nameMatch = inventoryItems.find(function (inv) {
                    return inv.name.toLowerCase().includes(firstWord);
                });
                if (nameMatch) return nameMatch;
            }
        }

        return null;
    }

    // ── Submit handler ───────────────────────────────────────────────────────
    if (submitBtn) {
        submitBtn.addEventListener('click', async function () {
            if (!selectedPO) return;

            var matchedItems = [];
            var hasUnresolved = false;

            matchingContainer.querySelectorAll('.po-line-row').forEach(function (row) {
                var lineIndex = parseInt(row.dataset.lineIndex, 10);
                var skipCb   = row.querySelector('.skip-checkbox');

                if (skipCb && skipCb.checked) return; // intentionally skipped

                var sel = row.querySelector('.match-inv-select');
                var qty = row.querySelector('.match-qty-input');

                if (!sel || !sel.value) {
                    row.classList.add('match-error');
                    hasUnresolved = true;
                    return;
                }
                row.classList.remove('match-error');

                matchedItems.push({
                    lineIndex:       lineIndex,
                    inventoryItemId: sel.value,
                    quantity:        parseInt(qty.value, 10) || 1,
                    unitPrice:       selectedPO.lineItems[lineIndex]
                                         ? (selectedPO.lineItems[lineIndex].unitPrice || 0)
                                         : 0
                });
            });

            if (hasUnresolved) {
                showMessage('Please match all items or mark them as skipped before submitting.', 'error');
                return;
            }
            if (matchedItems.length === 0) {
                showMessage('At least one item must be matched to an inventory item.', 'error');
                return;
            }

            var notes = document.getElementById('order-notes')
                            ? document.getElementById('order-notes').value
                            : '';

            submitBtn.disabled    = true;
            submitBtn.textContent = 'Submitting\u2026';

            try {
                var response = await fetch('/orders/incoming/' + selectedPO.id + '/submit', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ matchedItems: matchedItems, notes: notes })
                });

                var data = await response.json();

                if (!response.ok) {
                    throw new Error(data.message || 'Failed to submit order');
                }

                showMessage(
                    'Order ' + data.orderNumber + ' created successfully! Redirecting to Open Orders\u2026',
                    'success'
                );

                // Remove the submitted PO card from the left panel
                var card = poSelectList.querySelector('[data-po-id="' + selectedPO.id + '"]');
                if (card) card.remove();

                // Reset right panel after short delay then redirect
                setTimeout(function () {
                    window.location.href = '/orders/open';
                }, 1800);

            } catch (err) {
                showMessage(err.message || 'Error submitting order. Please try again.', 'error');
                submitBtn.disabled    = false;
                submitBtn.textContent = 'Submit Order';
            }
        });
    }

    // ── Utility: feedback message ────────────────────────────────────────────
    function showMessage(text, type) {
        var msgEl = document.getElementById('submit-message');
        if (!msgEl) {
            msgEl = document.createElement('div');
            msgEl.id = 'submit-message';
            submitBtn.parentElement.insertAdjacentElement('afterend', msgEl);
        }
        msgEl.textContent  = text;
        msgEl.className    = 'submit-message ' + type;
    }

    function clearMessage() {
        var msgEl = document.getElementById('submit-message');
        if (msgEl) msgEl.remove();
    }

    // ── Utility: HTML escaping ───────────────────────────────────────────────
    function escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g,  '&amp;')
            .replace(/</g,  '&lt;')
            .replace(/>/g,  '&gt;')
            .replace(/"/g,  '&quot;')
            .replace(/'/g,  '&#39;');
    }

}());

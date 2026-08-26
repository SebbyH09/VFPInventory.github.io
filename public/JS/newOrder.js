document.addEventListener('DOMContentLoaded', function () {
    window._orderCart = new Map(); // exposed for cart integration
    const cart = window._orderCart;
    // Cart entries:
    // { itemId, name, brand, vendor, catalog, quantity, cost, currentQty,
    //   alternates: [...], selectedVariant: { label, brand, vendor, catalog, isPrimary } }

    const searchBar = document.getElementById('orderSearchBar');
    const searchButton = document.getElementById('searchButton');
    const clearButton = document.getElementById('clearButton');
    const addToCartBtn = document.getElementById('addToCartBtn');
    const submitOrderBtn = document.getElementById('submitOrderBtn');
    const cartContainer = document.getElementById('cartContainer');
    const orderNotes = document.getElementById('orderNotes');

    // ----- Mobile tabs -----
    (function setupMobileTabs() {
        const tabs = document.querySelectorAll('.mobile-tab');
        const panels = document.querySelectorAll('.order-layout > [data-panel]');
        if (!tabs.length) return;

        tabs.forEach(tab => {
            tab.addEventListener('click', function() {
                const target = this.dataset.tab;
                tabs.forEach(t => t.classList.remove('active'));
                this.classList.add('active');
                panels.forEach(panel => {
                    if (panel.dataset.panel === target) {
                        panel.classList.remove('mobile-hidden');
                    } else {
                        panel.classList.add('mobile-hidden');
                    }
                });
            });
        });

        const activeTab = document.querySelector('.mobile-tab.active');
        if (activeTab) activeTab.click();
    })();

    // ----- Helpers -----
    function parseAlternates(row) {
        const raw = row.dataset.itemAlternates;
        if (!raw) return [];
        try {
            const arr = JSON.parse(raw);
            return Array.isArray(arr) ? arr : [];
        } catch (e) {
            return [];
        }
    }

    function rowToBaseItem(row) {
        return {
            itemId: row.dataset.itemId,
            name: row.dataset.itemName,
            brand: row.dataset.itemBrand || '',
            vendor: row.dataset.itemVendor || '',
            catalog: row.dataset.itemCatalog || '',
            quantity: 1,
            cost: parseFloat(row.dataset.itemCost) || 0,
            currentQty: parseInt(row.dataset.itemQuantity, 10) || 0,
            alternates: parseAlternates(row)
        };
    }

    function addToCart(baseItem, variant) {
        if (cart.has(baseItem.itemId)) return;
        cart.set(baseItem.itemId, {
            ...baseItem,
            selectedVariant: variant || {
                label: 'Primary',
                brand: baseItem.brand,
                vendor: baseItem.vendor,
                catalog: baseItem.catalog,
                isPrimary: true
            }
        });
    }

    // ----- Alternate Items Modal -----
    const altModal = document.getElementById('alternateItemsModal');
    const altList = document.getElementById('altOptionsList');
    const altTitle = document.getElementById('altModalTitle');
    const altConfirmBtn = document.getElementById('altModalConfirmBtn');
    const altCancelBtn = document.getElementById('altModalCancelBtn');
    const altCloseBtn = document.getElementById('altModalCloseBtn');

    // Modal state: queue of { baseItem } to process, current selection
    const altQueue = [];
    let altCurrent = null;
    let altSelectedIdx = 0; // 0 = primary, 1..N = alternates

    function openAltModal() {
        if (!altModal || altQueue.length === 0) return;
        altCurrent = altQueue.shift();
        altSelectedIdx = 0;
        renderAltOptions();
        altTitle.textContent = 'Choose variant for "' + altCurrent.baseItem.name + '"';
        altModal.classList.add('show');
        altModal.setAttribute('aria-hidden', 'false');
    }

    function closeAltModal(skipRemaining) {
        altModal.classList.remove('show');
        altModal.setAttribute('aria-hidden', 'true');
        altCurrent = null;
        if (skipRemaining) {
            altQueue.length = 0;
        } else if (altQueue.length > 0) {
            setTimeout(openAltModal, 60);
        } else {
            renderCart();
            const cartTab = document.querySelector('.mobile-tab[data-tab="cart"]');
            if (cartTab && window.innerWidth <= 768) cartTab.click();
        }
    }

    function renderAltOptions() {
        if (!altCurrent || !altList) return;
        const base = altCurrent.baseItem;
        const options = buildVariantOptions(base);

        let html = '';
        options.forEach((opt, idx) => {
            const selected = idx === altSelectedIdx;
            html +=
                '<div class="alt-option-card' + (opt.isPrimary ? ' primary' : '') + (selected ? ' selected' : '') + '" data-idx="' + idx + '">' +
                    '<div class="alt-option-header">' +
                        '<span class="alt-option-label">' + escapeHtml(opt.label) + '</span>' +
                        '<span class="alt-option-indicator"></span>' +
                    '</div>' +
                    '<div class="alt-option-fields">' +
                        fieldHtml('Brand', opt.brand) +
                        fieldHtml('Vendor', opt.vendor) +
                        fieldHtml('Catalog #', opt.catalog) +
                    '</div>' +
                '</div>';
        });
        altList.innerHTML = html;

        altList.querySelectorAll('.alt-option-card').forEach(card => {
            card.addEventListener('click', function() {
                altSelectedIdx = parseInt(this.dataset.idx, 10);
                renderAltOptions();
            });
        });
    }

    function fieldHtml(label, value) {
        return '<div class="alt-option-field">' +
            '<span class="alt-option-field-label">' + escapeHtml(label) + '</span>' +
            '<span class="alt-option-field-value">' + escapeHtml(value || '—') + '</span>' +
        '</div>';
    }

    function buildVariantOptions(base) {
        const opts = [{
            label: 'Primary',
            brand: base.brand,
            vendor: base.vendor,
            catalog: base.catalog,
            isPrimary: true
        }];
        (base.alternates || []).forEach((alt, i) => {
            opts.push({
                label: 'Alternate ' + (i + 1),
                brand: alt.brand || '',
                vendor: alt.vendor || '',
                catalog: alt.catalogNumber || '',
                isPrimary: false
            });
        });
        return opts;
    }

    if (altConfirmBtn) {
        altConfirmBtn.addEventListener('click', function() {
            if (!altCurrent) return;
            const options = buildVariantOptions(altCurrent.baseItem);
            const chosen = options[altSelectedIdx] || options[0];
            addToCart(altCurrent.baseItem, chosen);
            closeAltModal(false);
        });
    }

    if (altCancelBtn) altCancelBtn.addEventListener('click', function() { closeAltModal(true); });
    if (altCloseBtn) altCloseBtn.addEventListener('click', function() { closeAltModal(true); });
    if (altModal) {
        altModal.addEventListener('click', function(e) {
            if (e.target === altModal) closeAltModal(true);
        });
    }

    // ----- Add All Recommended -----
    // ----- Recommended order collapse/expand -----
    const recommendedToggleBtn = document.getElementById('recommendedToggleBtn');
    if (recommendedToggleBtn) {
        const recommendedSection = recommendedToggleBtn.closest('.recommended-order-section');
        recommendedToggleBtn.addEventListener('click', function () {
            const collapsed = recommendedSection.classList.toggle('collapsed');
            recommendedToggleBtn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
            recommendedToggleBtn.setAttribute('title', collapsed ? 'Expand recommended order' : 'Collapse recommended order');
        });
    }

    const addAllRecommendedBtn = document.getElementById('addAllRecommendedBtn');
    if (addAllRecommendedBtn) {
        addAllRecommendedBtn.addEventListener('click', function () {
            const recommendedRows = document.querySelectorAll('.recommended-table tbody tr');
            const itemsNeedingChoice = [];
            recommendedRows.forEach(row => {
                if (cart.has(row.dataset.itemId)) return;
                const base = rowToBaseItem(row);
                if (base.alternates.length > 0) {
                    itemsNeedingChoice.push({ baseItem: base });
                } else {
                    addToCart(base, null);
                }
            });

            if (itemsNeedingChoice.length > 0) {
                altQueue.push(...itemsNeedingChoice);
                renderCart();
                openAltModal();
            } else {
                renderCart();
                const cartTab = document.querySelector('.mobile-tab[data-tab="cart"]');
                if (cartTab && window.innerWidth <= 768) cartTab.click();
            }
        });
    }

    // ----- Search -----
    // Fuzzy matcher over name/brand/catalog, keyed by itemId. Built once
    // (rows are static after render). Falls back to substring matching.
    let itemMatcher = null;
    function ensureItemMatcher() {
        if (itemMatcher) return itemMatcher;
        if (typeof window.createFuzzyFilter !== 'function') return null;
        const records = [];
        document.querySelectorAll('#inventoryTable tbody tr').forEach(row => {
            if (!row.dataset.itemId) return;
            const text = [row.dataset.itemName, row.dataset.itemBrand, row.dataset.itemCatalog]
                .filter(Boolean).join(' ');
            records.push({ key: row.dataset.itemId, text: text });
        });
        itemMatcher = window.createFuzzyFilter(records);
        return itemMatcher;
    }

    function filterTable() {
        const query = searchBar.value.toLowerCase().trim();
        const rows = document.querySelectorAll('#inventoryTable tbody tr');
        const matcher = query !== '' ? ensureItemMatcher() : null;
        const matchSet = matcher ? matcher(query) : null;
        rows.forEach(row => {
            if (!row.dataset.itemId) { row.style.display = ''; return; }
            if (query === '') { row.style.display = ''; return; }
            let matched;
            if (matchSet) {
                matched = matchSet.has(row.dataset.itemId);
            } else {
                const name = (row.dataset.itemName || '').toLowerCase();
                const brand = (row.dataset.itemBrand || '').toLowerCase();
                const catalog = (row.dataset.itemCatalog || '').toLowerCase();
                matched = name.includes(query) || brand.includes(query) || catalog.includes(query);
            }
            row.style.display = matched ? '' : 'none';
        });
    }

    searchButton.addEventListener('click', filterTable);
    searchBar.addEventListener('keyup', function (e) {
        if (e.key === 'Enter') filterTable();
    });
    clearButton.addEventListener('click', function () {
        searchBar.value = '';
        filterTable();
    });

    // ----- Row click toggles checkbox -----
    document.querySelectorAll('#inventoryTable tbody tr').forEach(row => {
        row.addEventListener('click', function(event) {
            if (event.target.classList.contains('item-checkbox')) return;
            const checkbox = row.querySelector('.item-checkbox');
            if (!checkbox) return;
            checkbox.checked = !checkbox.checked;
        });
    });

    // ----- Add checked items to cart -----
    addToCartBtn.addEventListener('click', function () {
        const checkboxes = document.querySelectorAll('.item-checkbox:checked');
        if (checkboxes.length === 0) return;

        const itemsNeedingChoice = [];

        checkboxes.forEach(cb => {
            const row = cb.closest('tr');
            cb.checked = false;
            if (cart.has(row.dataset.itemId)) return;
            const base = rowToBaseItem(row);
            if (base.alternates.length > 0) {
                itemsNeedingChoice.push({ baseItem: base });
            } else {
                addToCart(base, null);
            }
        });

        if (itemsNeedingChoice.length > 0) {
            altQueue.push(...itemsNeedingChoice);
            renderCart();
            openAltModal();
        } else {
            renderCart();
            const cartTab = document.querySelector('.mobile-tab[data-tab="cart"]');
            if (cartTab && window.innerWidth <= 768) cartTab.click();
        }
    });

    // ----- Cart rendering -----
    window._renderOrderCart = renderCart;
    function renderCart() {
        if (cart.size === 0) {
            cartContainer.innerHTML = '<p class="empty-message">No items in cart. Select items from the left and click "Add to Order".</p>';
            return;
        }

        let html = '';
        cart.forEach((item, itemId) => {
            const variant = item.selectedVariant || {};
            const variantTag = variant.isPrimary
                ? ''
                : '<span class="cart-item-variant-tag">' + escapeHtml(variant.label || 'Alternate') + '</span>';
            const changeBtn = (item.alternates && item.alternates.length > 0)
                ? '<button class="change-variant-btn" data-item-id="' + escapeAttr(itemId) + '">Change variant</button>'
                : '';

            html += '' +
                '<div class="cart-item-card" data-item-id="' + escapeAttr(itemId) + '">' +
                    '<div class="cart-item-header">' +
                        '<div class="cart-item-title">' +
                            escapeHtml(item.name) +
                            (variantTag ? '<br>' + variantTag : '') +
                        '</div>' +
                        '<button class="remove-cart-item-btn" data-item-id="' + escapeAttr(itemId) + '">Remove</button>' +
                    '</div>' +
                    '<div class="cart-item-body">' +
                        '<div class="cart-item-detail"><span class="cart-item-label">Brand:</span><span>' + escapeHtml(variant.brand || '—') + '</span></div>' +
                        '<div class="cart-item-detail"><span class="cart-item-label">Vendor:</span><span>' + escapeHtml(variant.vendor || '—') + '</span></div>' +
                        '<div class="cart-item-detail"><span class="cart-item-label">Catalog #:</span><span>' + escapeHtml(variant.catalog || '—') + '</span></div>' +
                        '<div class="cart-item-detail"><span class="cart-item-label">Current Stock:</span><span>' + item.currentQty + '</span></div>' +
                        '<div class="cart-item-detail"><span class="cart-item-label">Cost/Unit:</span><span>$' + item.cost.toFixed(2) + '</span></div>' +
                        '<div class="cart-quantity-section">' +
                            '<label>Order Qty:</label>' +
                            '<input type="number" class="cart-quantity-input" data-item-id="' + escapeAttr(itemId) + '" value="' + item.quantity + '" min="1">' +
                            changeBtn +
                        '</div>' +
                    '</div>' +
                '</div>';
        });

        cartContainer.innerHTML = html;

        cartContainer.querySelectorAll('.cart-quantity-input').forEach(input => {
            input.addEventListener('change', function () {
                const id = this.dataset.itemId;
                const val = parseInt(this.value, 10);
                if (val > 0 && cart.has(id)) {
                    cart.get(id).quantity = val;
                } else {
                    this.value = cart.get(id)?.quantity || 1;
                }
            });
        });

        cartContainer.querySelectorAll('.remove-cart-item-btn').forEach(btn => {
            btn.addEventListener('click', function () {
                cart.delete(this.dataset.itemId);
                renderCart();
            });
        });

        cartContainer.querySelectorAll('.change-variant-btn').forEach(btn => {
            btn.addEventListener('click', function () {
                const id = this.dataset.itemId;
                const existing = cart.get(id);
                if (!existing) return;
                cart.delete(id);
                renderCart();
                altQueue.push({ baseItem: {
                    itemId: existing.itemId,
                    name: existing.name,
                    brand: existing.brand,
                    vendor: existing.vendor,
                    catalog: existing.catalog,
                    quantity: existing.quantity,
                    cost: existing.cost,
                    currentQty: existing.currentQty,
                    alternates: existing.alternates || []
                }});
                openAltModal();
            });
        });
    }

    // ----- Submit order -----
    submitOrderBtn.addEventListener('click', async function () {
        if (cart.size === 0) {
            alert('Add items to the order before submitting.');
            return;
        }

        const items = [];
        cart.forEach(item => {
            const variant = item.selectedVariant || {};
            items.push({
                itemId: item.itemId,
                quantity: item.quantity,
                variant: {
                    label: variant.label || 'Primary',
                    brand: variant.brand || '',
                    vendor: variant.vendor || '',
                    catalog: variant.catalog || '',
                    isPrimary: variant.isPrimary !== false
                }
            });
        });

        submitOrderBtn.disabled = true;
        submitOrderBtn.textContent = 'Submitting...';

        try {
            const response = await fetch('/orders', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ items: items, notes: orderNotes.value.trim() })
            });

            const result = await response.json();

            if (response.ok) {
                alert('Order ' + result.orderNumber + ' created successfully!');
                cart.clear();
                renderCart();
                orderNotes.value = '';
            } else {
                alert('Error: ' + (result.message || 'Failed to create order'));
            }
        } catch (error) {
            alert('Network error. Please try again.');
        } finally {
            submitOrderBtn.disabled = false;
            submitOrderBtn.textContent = 'Submit Order';
        }
    });

    function escapeHtml(str) {
        if (str === null || str === undefined) return '';
        const div = document.createElement('div');
        div.appendChild(document.createTextNode(String(str)));
        return div.innerHTML;
    }

    function escapeAttr(str) {
        return escapeHtml(str).replace(/"/g, '&quot;');
    }
});

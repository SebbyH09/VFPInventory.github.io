// Order Cart page: review the shared order cart (CartManager, localStorage),
// adjust quantities / variants, and submit it as an order.
document.addEventListener('DOMContentLoaded', function () {
    if (!window.CartManager) return;

    const index = window.__INVENTORY_INDEX__ || null; // null = couldn't load fresh data
    const linesEl = document.getElementById('cartLines');
    const layoutEl = document.getElementById('cartLayout');
    const emptyEl = document.getElementById('cartEmpty');
    const successEl = document.getElementById('cartSuccess');
    const submitBtn = document.getElementById('submitOrderBtn');
    const clearBtn = document.getElementById('clearCartBtn');
    const notesEl = document.getElementById('orderNotes');

    // ----- Refresh cart entries with current inventory data -----
    // Items added from other pages (dashboard, item view) don't carry vendor or
    // alternates, and stock/cost may have changed since the item was added.
    function syncWithInventory() {
        if (!index) return;
        const cart = CartManager.getOrderCart();
        Object.keys(cart).forEach(itemId => {
            const fresh = index[itemId];
            if (!fresh) return;
            const entry = cart[itemId];
            const changes = {
                name: fresh.name,
                brand: fresh.brand,
                vendor: fresh.vendor,
                catalog: fresh.catalog,
                cost: fresh.cost,
                currentQty: fresh.currentQty,
                minQty: fresh.minQty,
                maxQty: fresh.maxQty,
                alternates: fresh.alternates
            };
            const variant = entry.selectedVariant;
            const altIdx = variant && !variant.isPrimary
                ? parseInt(String(variant.label).replace(/\D/g, ''), 10) - 1
                : -1;
            if (altIdx >= 0 && fresh.alternates[altIdx]) {
                const alt = fresh.alternates[altIdx];
                changes.selectedVariant = {
                    label: variant.label,
                    brand: alt.brand,
                    vendor: alt.vendor,
                    catalog: alt.catalogNumber,
                    isPrimary: false
                };
            } else {
                // Primary, or an alternate that no longer exists
                changes.selectedVariant = OrderVariantPicker.primaryVariant(fresh);
            }
            CartManager.updateOrderCartItem(itemId, changes);
        });
    }

    function variantOf(entry) {
        return entry.selectedVariant || OrderVariantPicker.primaryVariant(entry);
    }

    function formatMoney(n) {
        return '$' + (Number(n) || 0).toFixed(2);
    }

    // ----- Rendering -----
    function render() {
        const cart = CartManager.getOrderCart();
        const entries = Object.values(cart);
        CartManager.updateCartBadges();

        if (!successEl.hidden) return;
        layoutEl.hidden = entries.length === 0;
        emptyEl.hidden = entries.length > 0;
        if (entries.length === 0) return;

        // Group lines by the vendor they'll be ordered from.
        const groups = new Map();
        entries.forEach(entry => {
            const vendor = variantOf(entry).vendor || 'No vendor';
            if (!groups.has(vendor)) groups.set(vendor, []);
            groups.get(vendor).push(entry);
        });
        const vendors = Array.from(groups.keys()).sort((a, b) => {
            if (a === 'No vendor') return 1;
            if (b === 'No vendor') return -1;
            return a.localeCompare(b, undefined, { sensitivity: 'base' });
        });

        let html = '';
        let units = 0;
        let total = 0;
        vendors.forEach(vendor => {
            const lines = groups.get(vendor).sort((a, b) => String(a.name).localeCompare(String(b.name)));
            const subtotal = lines.reduce((sum, e) => sum + (e.cost || 0) * (e.quantity || 0), 0);
            html +=
                '<div class="cart-vendor-group">' +
                    '<div class="cart-vendor-header">' +
                        '<h3>' + escapeHtml(vendor) + '</h3>' +
                        '<span>' + lines.length + ' item' + (lines.length !== 1 ? 's' : '') + ' · ' + formatMoney(subtotal) + '</span>' +
                    '</div>';
            lines.forEach(entry => {
                units += entry.quantity || 0;
                total += (entry.cost || 0) * (entry.quantity || 0);
                html += lineHtml(entry);
            });
            html += '</div>';
        });
        linesEl.innerHTML = html;

        document.getElementById('summaryItems').textContent = entries.length;
        document.getElementById('summaryUnits').textContent = units;
        document.getElementById('summaryVendors').textContent = vendors.length;
        document.getElementById('summaryTotal').textContent = formatMoney(total);
    }

    function lineHtml(entry) {
        const id = escapeAttr(entry.itemId);
        const variant = variantOf(entry);
        const missing = index && !index[entry.itemId];
        const low = entry.minQty > 0 && entry.currentQty <= entry.minQty;
        const meta = [variant.brand, variant.catalog ? '#' + variant.catalog : '']
            .filter(Boolean).map(escapeHtml).join(' · ');
        const hasAlternates = entry.alternates && entry.alternates.length > 0;

        return '' +
            '<div class="cart-line" data-item-id="' + id + '">' +
                '<div class="cart-line-info">' +
                    '<div class="cart-line-name">' +
                        escapeHtml(entry.name) +
                        (variant.isPrimary ? '' : '<span class="cart-item-variant-tag">' + escapeHtml(variant.label) + '</span>') +
                        (missing ? '<span class="cart-line-warning">No longer active</span>' : '') +
                    '</div>' +
                    (meta ? '<div class="cart-line-meta">' + meta + '</div>' : '') +
                    '<div class="cart-line-stock' + (low ? ' low' : '') + '">' +
                        (entry.currentQty || 0) + ' on hand' + (entry.minQty > 0 ? ' · min ' + entry.minQty : '') +
                    '</div>' +
                    '<div class="cart-line-links">' +
                        (hasAlternates ? '<button type="button" data-action="variant">Change variant</button>' : '') +
                        '<button type="button" data-action="remove" class="danger">Remove</button>' +
                    '</div>' +
                '</div>' +
                '<div class="cart-line-price">' + formatMoney(entry.cost) + '<span> each</span></div>' +
                '<div class="qty-stepper">' +
                    '<button type="button" data-action="dec" aria-label="Decrease quantity">−</button>' +
                    '<input type="number" min="1" value="' + (entry.quantity || 1) + '" data-action="qty" aria-label="Quantity">' +
                    '<button type="button" data-action="inc" aria-label="Increase quantity">+</button>' +
                '</div>' +
                '<div class="cart-line-total">' + formatMoney((entry.cost || 0) * (entry.quantity || 0)) + '</div>' +
            '</div>';
    }

    // ----- Line actions -----
    linesEl.addEventListener('click', async function (e) {
        const btn = e.target.closest('[data-action]');
        if (!btn || btn.tagName === 'INPUT') return;
        const itemId = btn.closest('.cart-line').dataset.itemId;
        const entry = CartManager.getOrderCart()[itemId];
        if (!entry) return;

        switch (btn.dataset.action) {
            case 'inc':
                CartManager.updateOrderCartItem(itemId, { quantity: (entry.quantity || 1) + 1 });
                break;
            case 'dec':
                if ((entry.quantity || 1) > 1) {
                    CartManager.updateOrderCartItem(itemId, { quantity: entry.quantity - 1 });
                }
                break;
            case 'remove':
                CartManager.removeFromOrderCart(itemId);
                break;
            case 'variant': {
                const variant = await OrderVariantPicker.choose(entry, variantOf(entry));
                if (variant) CartManager.updateOrderCartItem(itemId, { selectedVariant: variant });
                break;
            }
        }
        render();
    });

    linesEl.addEventListener('change', function (e) {
        if (e.target.dataset.action !== 'qty') return;
        const itemId = e.target.closest('.cart-line').dataset.itemId;
        const val = parseInt(e.target.value, 10);
        if (val > 0) CartManager.updateOrderCartItem(itemId, { quantity: val });
        render();
    });

    clearBtn.addEventListener('click', function () {
        if (!confirm('Remove all items from the cart?')) return;
        CartManager.clearOrderCart();
        render();
    });

    // ----- Submit -----
    submitBtn.addEventListener('click', async function () {
        const entries = Object.values(CartManager.getOrderCart());
        if (entries.length === 0) return;

        const items = entries.map(entry => {
            const variant = variantOf(entry);
            return {
                itemId: entry.itemId,
                quantity: entry.quantity,
                variant: {
                    label: variant.label || 'Primary',
                    brand: variant.brand || '',
                    vendor: variant.vendor || '',
                    catalog: variant.catalog || '',
                    isPrimary: variant.isPrimary !== false
                }
            };
        });

        submitBtn.disabled = true;
        submitBtn.textContent = 'Submitting...';
        try {
            const response = await fetch('/orders', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ items: items, notes: notesEl.value.trim() })
            });
            const result = await response.json();
            if (response.ok) {
                CartManager.clearOrderCart();
                notesEl.value = '';
                document.getElementById('cartSuccessNumber').textContent = result.orderNumber;
                successEl.hidden = false;
                layoutEl.hidden = true;
                emptyEl.hidden = true;
            } else {
                alert('Error: ' + (result.message || 'Failed to create order'));
            }
        } catch (error) {
            alert('Network error. Please try again.');
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Submit Order';
        }
    });

    // Keep in sync if the cart changes in another tab (e.g. the shop page).
    window.addEventListener('storage', function (e) {
        if (e.key === 'vfp_orderCart') render();
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

    syncWithInventory();
    render();
});

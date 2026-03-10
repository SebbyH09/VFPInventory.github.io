document.addEventListener('DOMContentLoaded', function () {
    const cart = new Map(); // itemId -> { itemId, name, brand, quantity, cost, currentQty }

    const searchBar = document.getElementById('orderSearchBar');
    const searchButton = document.getElementById('searchButton');
    const clearButton = document.getElementById('clearButton');
    const addToCartBtn = document.getElementById('addToCartBtn');
    const submitOrderBtn = document.getElementById('submitOrderBtn');
    const cartContainer = document.getElementById('cartContainer');
    const orderNotes = document.getElementById('orderNotes');

    // Mobile tabs
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

        // Initialize panel visibility for the active tab on page load
        const activeTab = document.querySelector('.mobile-tab.active');
        if (activeTab) {
            activeTab.click();
        }
    })();

    // Search functionality
    function filterTable() {
        const query = searchBar.value.toLowerCase().trim();
        const rows = document.querySelectorAll('#inventoryTable tbody tr');
        rows.forEach(row => {
            if (!row.dataset.itemId) { row.style.display = ''; return; }
            const name = (row.dataset.itemName || '').toLowerCase();
            const brand = (row.dataset.itemBrand || '').toLowerCase();
            const catalog = (row.dataset.itemCatalog || '').toLowerCase();
            row.style.display = (name.includes(query) || brand.includes(query) || catalog.includes(query)) ? '' : 'none';
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

    // Make table rows clickable (toggle checkbox on row click)
    const tableRows = document.querySelectorAll('#inventoryTable tbody tr');
    tableRows.forEach(row => {
        row.addEventListener('click', function(event) {
            if (event.target.classList.contains('item-checkbox')) return;
            const checkbox = row.querySelector('.item-checkbox');
            if (!checkbox) return;
            checkbox.checked = !checkbox.checked;
        });
    });

    // Add checked items to cart
    addToCartBtn.addEventListener('click', function () {
        const checkboxes = document.querySelectorAll('.item-checkbox:checked');
        if (checkboxes.length === 0) return;

        checkboxes.forEach(cb => {
            const row = cb.closest('tr');
            const itemId = row.dataset.itemId;
            if (!cart.has(itemId)) {
                cart.set(itemId, {
                    itemId: itemId,
                    name: row.dataset.itemName,
                    brand: row.dataset.itemBrand,
                    quantity: 1,
                    cost: parseFloat(row.dataset.itemCost) || 0,
                    currentQty: parseInt(row.dataset.itemQuantity, 10) || 0
                });
            }
            cb.checked = false;
        });

        renderCart();

        // Auto-switch to cart tab on mobile
        const cartTab = document.querySelector('.mobile-tab[data-tab="cart"]');
        if (cartTab && window.innerWidth <= 768) {
            cartTab.click();
        }
    });

    function renderCart() {
        if (cart.size === 0) {
            cartContainer.innerHTML = '<p class="empty-message">No items in cart. Select items from the left and click "Add to Order".</p>';
            return;
        }

        let html = '';
        cart.forEach((item, itemId) => {
            html += `
                <div class="cart-item-card" data-item-id="${escapeHtml(itemId)}">
                    <div class="cart-item-header">
                        <span class="cart-item-title">${escapeHtml(item.name)}</span>
                        <button class="remove-cart-item-btn" data-item-id="${escapeHtml(itemId)}">Remove</button>
                    </div>
                    <div class="cart-item-body">
                        <div class="cart-item-detail">
                            <span class="cart-item-label">Brand:</span>
                            <span>${escapeHtml(item.brand)}</span>
                        </div>
                        <div class="cart-item-detail">
                            <span class="cart-item-label">Current Stock:</span>
                            <span>${item.currentQty}</span>
                        </div>
                        <div class="cart-item-detail">
                            <span class="cart-item-label">Cost/Unit:</span>
                            <span>$${item.cost.toFixed(2)}</span>
                        </div>
                        <div class="cart-quantity-section">
                            <label>Order Qty:</label>
                            <input type="number" class="cart-quantity-input" data-item-id="${escapeHtml(itemId)}" value="${item.quantity}" min="1">
                        </div>
                    </div>
                </div>
            `;
        });

        cartContainer.innerHTML = html;

        // Attach quantity change listeners
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

        // Attach remove listeners
        cartContainer.querySelectorAll('.remove-cart-item-btn').forEach(btn => {
            btn.addEventListener('click', function () {
                cart.delete(this.dataset.itemId);
                renderCart();
            });
        });
    }

    // Submit order
    submitOrderBtn.addEventListener('click', async function () {
        if (cart.size === 0) {
            alert('Add items to the order before submitting.');
            return;
        }

        const items = [];
        cart.forEach(item => {
            items.push({ itemId: item.itemId, quantity: item.quantity });
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
        if (!str) return '';
        const div = document.createElement('div');
        div.appendChild(document.createTextNode(str));
        return div.innerHTML;
    }
});

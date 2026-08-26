document.addEventListener('DOMContentLoaded', function () {
    const filterInput = document.getElementById('orderFilterInput');
    const statusFilter = document.getElementById('statusFilter');
    const sortField = document.getElementById('sortField');
    const sortDirectionBtn = document.getElementById('sortDirectionBtn');

    let sortDirection = 'desc';

    function getOrderCards() {
        return Array.from(document.querySelectorAll('.order-card'));
    }

    // Fuzzy matcher over order number, creator and item names, keyed by
    // order id. Built once (cards are static after render). Falls back to
    // substring matching if unavailable.
    let orderMatcher = null;
    function ensureOrderMatcher() {
        if (orderMatcher) return orderMatcher;
        if (typeof window.createFuzzyFilter !== 'function') return null;
        const records = getOrderCards().map(card => {
            const itemNames = Array.from(card.querySelectorAll('.order-items-table tbody td:first-child'))
                .map(td => td.textContent);
            const text = [card.dataset.orderNumber, card.dataset.createdBy]
                .concat(itemNames).filter(Boolean).join(' ');
            return { key: card.dataset.orderId, text: text };
        });
        orderMatcher = window.createFuzzyFilter(records);
        return orderMatcher;
    }

    function applyFilterAndSort() {
        const query = (filterInput.value || '').toLowerCase().trim();
        const statusVal = statusFilter.value;
        const field = sortField.value;

        const cards = getOrderCards();
        const matcher = query ? ensureOrderMatcher() : null;
        const matchSet = matcher ? matcher(query) : null;

        // Filter
        cards.forEach(card => {
            const status = card.dataset.status;

            let matchesQuery;
            if (!query) {
                matchesQuery = true;
            } else if (matchSet) {
                matchesQuery = matchSet.has(card.dataset.orderId);
            } else {
                const orderNum = (card.dataset.orderNumber || '').toLowerCase();
                const createdBy = (card.dataset.createdBy || '').toLowerCase();
                const itemNames = Array.from(card.querySelectorAll('.order-items-table tbody td:first-child'))
                    .map(td => td.textContent.toLowerCase());
                matchesQuery = orderNum.includes(query) ||
                    createdBy.includes(query) ||
                    itemNames.some(name => name.includes(query));
            }

            const matchesStatus = statusVal === 'all' || status === statusVal;

            card.style.display = (matchesQuery && matchesStatus) ? '' : 'none';
        });

        // Sort visible cards
        const visibleCards = cards.filter(c => c.style.display !== 'none');
        visibleCards.sort((a, b) => {
            let valA, valB;
            switch (field) {
                case 'createdAt':
                    valA = new Date(a.dataset.created).getTime();
                    valB = new Date(b.dataset.created).getTime();
                    break;
                case 'orderNumber':
                    valA = a.dataset.orderNumber;
                    valB = b.dataset.orderNumber;
                    break;
                case 'status':
                    valA = a.dataset.status;
                    valB = b.dataset.status;
                    break;
                case 'itemCount':
                    valA = parseInt(a.dataset.itemCount, 10) || 0;
                    valB = parseInt(b.dataset.itemCount, 10) || 0;
                    break;
                default:
                    valA = a.dataset.created;
                    valB = b.dataset.created;
            }

            let cmp;
            if (typeof valA === 'number') {
                cmp = valA - valB;
            } else {
                cmp = String(valA).localeCompare(String(valB));
            }
            return sortDirection === 'asc' ? cmp : -cmp;
        });

        const list = document.getElementById('ordersList');
        visibleCards.forEach(card => list.appendChild(card));
    }

    filterInput.addEventListener('input', applyFilterAndSort);
    statusFilter.addEventListener('change', applyFilterAndSort);
    sortField.addEventListener('change', applyFilterAndSort);

    sortDirectionBtn.addEventListener('click', function () {
        sortDirection = sortDirection === 'desc' ? 'asc' : 'desc';
        this.innerHTML = sortDirection === 'desc' ? '&#9660;' : '&#9650;';
        this.title = sortDirection === 'desc' ? 'Descending' : 'Ascending';
        applyFilterAndSort();
    });

    // ===== Delete Order Modal =====
    const deleteModal = document.getElementById('deleteOrderModal');
    const deleteOrderNumberEl = document.getElementById('deleteOrderNumber');
    const deleteOrderReason = document.getElementById('deleteOrderReason');
    const deleteOrderError = document.getElementById('deleteOrderError');
    const deleteOrderConfirmBtn = document.getElementById('deleteOrderConfirmBtn');
    const deleteOrderCancelBtn = document.getElementById('deleteOrderCancelBtn');
    const deleteOrderModalClose = document.getElementById('deleteOrderModalClose');

    let pendingDeleteOrderId = null;

    function openDeleteModal(orderId, orderNumber) {
        pendingDeleteOrderId = orderId;
        deleteOrderNumberEl.textContent = orderNumber;
        deleteOrderReason.value = '';
        deleteOrderError.style.display = 'none';
        deleteOrderError.textContent = '';
        deleteModal.style.display = 'flex';
        deleteOrderReason.focus();
    }

    function closeDeleteModal() {
        deleteModal.style.display = 'none';
        pendingDeleteOrderId = null;
    }

    deleteOrderModalClose.addEventListener('click', closeDeleteModal);
    deleteOrderCancelBtn.addEventListener('click', closeDeleteModal);

    deleteModal.addEventListener('click', function (e) {
        if (e.target === deleteModal) closeDeleteModal();
    });

    deleteOrderConfirmBtn.addEventListener('click', async function () {
        const reason = deleteOrderReason.value.trim();
        if (!reason) {
            deleteOrderError.textContent = 'Please enter a reason before closing this order.';
            deleteOrderError.style.display = 'block';
            deleteOrderReason.focus();
            return;
        }

        deleteOrderConfirmBtn.disabled = true;
        deleteOrderConfirmBtn.textContent = 'Closing...';
        deleteOrderError.style.display = 'none';

        try {
            const resp = await fetch(`/orders/${pendingDeleteOrderId}`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ reason })
            });
            const data = await resp.json();

            if (!resp.ok) {
                deleteOrderError.textContent = data.message || 'Failed to delete order.';
                deleteOrderError.style.display = 'block';
                deleteOrderConfirmBtn.disabled = false;
                deleteOrderConfirmBtn.textContent = 'Close Order';
                return;
            }

            // Remove the card from the DOM
            const card = document.querySelector(`.order-card[data-order-id="${pendingDeleteOrderId}"]`);
            if (card) card.remove();

            closeDeleteModal();

            // Show empty state if no cards remain
            const remaining = document.querySelectorAll('.order-card');
            if (remaining.length === 0) {
                document.getElementById('ordersList').innerHTML =
                    '<div class="no-orders"><p>No open orders found.</p></div>';
            }
        } catch (err) {
            deleteOrderError.textContent = 'Network error. Please try again.';
            deleteOrderError.style.display = 'block';
            deleteOrderConfirmBtn.disabled = false;
            deleteOrderConfirmBtn.textContent = 'Close Order';
        }
    });

    // Delegate click events for all delete buttons
    document.getElementById('ordersList').addEventListener('click', function (e) {
        const btn = e.target.closest('.delete-order-btn');
        if (!btn) return;
        openDeleteModal(btn.dataset.orderId, btn.dataset.orderNumber);
    });
});

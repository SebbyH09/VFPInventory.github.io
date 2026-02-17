document.addEventListener('DOMContentLoaded', function () {
    const orderSelectList = document.getElementById('orderSelectList');
    const receiveItemsContainer = document.getElementById('receiveItemsContainer');
    const receiveBtn = document.getElementById('receiveBtn');
    const receiveOrderTitle = document.getElementById('receiveOrderTitle');

    let selectedOrderId = null;
    let selectedOrderData = null;

    // Mobile tabs
    (function setupMobileTabs() {
        const tabs = document.querySelectorAll('.mobile-tab');
        const panels = document.querySelectorAll('.receive-layout > [data-panel]');
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

    // Click on order to select it
    orderSelectList.addEventListener('click', async function (e) {
        const card = e.target.closest('.order-select-card');
        if (!card) return;

        // Highlight selected
        document.querySelectorAll('.order-select-card').forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');

        selectedOrderId = card.dataset.orderId;

        // Fetch order details
        try {
            const response = await fetch('/orders/api/' + selectedOrderId);
            if (!response.ok) throw new Error('Failed to fetch');
            selectedOrderData = await response.json();
            renderReceiveItems();

            // Auto-switch to receive tab on mobile
            const receiveTab = document.querySelector('.mobile-tab[data-tab="receive"]');
            if (receiveTab && window.innerWidth <= 768) {
                receiveTab.click();
            }
        } catch (error) {
            receiveItemsContainer.innerHTML = '<p class="empty-message">Error loading order details.</p>';
            receiveBtn.disabled = true;
        }
    });

    function renderReceiveItems() {
        if (!selectedOrderData) return;

        receiveOrderTitle.textContent = 'Receive: ' + selectedOrderData.orderNumber;

        const items = selectedOrderData.items;
        const hasReceivable = items.some(i => i.quantityReceived < i.quantityOrdered);
        receiveBtn.disabled = !hasReceivable;

        let html = '<div class="receive-items-list">';
        items.forEach(item => {
            const remaining = item.quantityOrdered - item.quantityReceived;
            const fullyReceived = remaining <= 0;

            html += `
                <div class="receive-item-card ${fullyReceived ? 'fully-received' : ''}" data-order-item-id="${escapeHtml(item._id)}">
                    <div class="receive-item-header">
                        <span class="receive-item-title">${escapeHtml(item.itemName)}</span>
                        <span class="receive-item-status ${fullyReceived ? 'received' : item.quantityReceived > 0 ? 'partial' : 'pending'}">
                            ${fullyReceived ? 'Received' : item.quantityReceived > 0 ? 'Partial' : 'Pending'}
                        </span>
                    </div>
                    <div class="receive-item-body">
                        <div class="receive-item-detail">
                            <span class="receive-item-label">Brand:</span>
                            <span>${escapeHtml(item.brand)}</span>
                        </div>
                        <div class="receive-item-detail">
                            <span class="receive-item-label">Ordered:</span>
                            <span>${item.quantityOrdered}</span>
                        </div>
                        <div class="receive-item-detail">
                            <span class="receive-item-label">Received:</span>
                            <span>${item.quantityReceived}</span>
                        </div>
                        <div class="receive-item-detail">
                            <span class="receive-item-label">Remaining:</span>
                            <span>${remaining}</span>
                        </div>
                        ${!fullyReceived ? `
                        <div class="receive-quantity-section">
                            <label>Receive Qty:</label>
                            <input type="number" class="receive-quantity-input" data-order-item-id="${escapeHtml(item._id)}" value="0" min="0" max="${remaining}">
                        </div>
                        ` : ''}
                    </div>
                </div>
            `;
        });
        html += '</div>';

        receiveItemsContainer.innerHTML = html;
    }

    // Receive button
    receiveBtn.addEventListener('click', async function () {
        if (!selectedOrderId) return;

        const inputs = receiveItemsContainer.querySelectorAll('.receive-quantity-input');
        const receivedItems = [];

        inputs.forEach(input => {
            const qty = parseInt(input.value, 10);
            if (qty > 0) {
                receivedItems.push({
                    orderItemId: input.dataset.orderItemId,
                    quantity: qty
                });
            }
        });

        if (receivedItems.length === 0) {
            alert('Enter a quantity for at least one item to receive.');
            return;
        }

        receiveBtn.disabled = true;
        receiveBtn.textContent = 'Receiving...';

        try {
            const response = await fetch('/orders/receive', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    orderId: selectedOrderId,
                    receivedItems: receivedItems
                })
            });

            const result = await response.json();

            if (response.ok) {
                alert(result.message);

                // Refresh order data
                const refreshResponse = await fetch('/orders/api/' + selectedOrderId);
                if (refreshResponse.ok) {
                    selectedOrderData = await refreshResponse.json();
                    renderReceiveItems();
                }

                // Update the left panel status
                const card = document.querySelector(`.order-select-card[data-order-id="${selectedOrderId}"]`);
                if (card) {
                    const statusSpan = card.querySelector('.order-status');
                    if (result.orderStatus === 'received') {
                        // Order fully received - remove from the list
                        card.remove();
                        selectedOrderId = null;
                        selectedOrderData = null;
                        receiveOrderTitle.textContent = 'Select an order to receive';
                        receiveItemsContainer.innerHTML = '<p class="empty-message">Order fully received! Select another order.</p>';
                        receiveBtn.disabled = true;
                    } else if (result.orderStatus === 'partial') {
                        statusSpan.textContent = 'Partial';
                        statusSpan.className = 'order-status status-partial';
                    }
                }
            } else {
                alert('Error: ' + (result.message || 'Failed to receive items'));
            }
        } catch (error) {
            alert('Network error. Please try again.');
        } finally {
            receiveBtn.disabled = false;
            receiveBtn.textContent = 'Receive Selected';
        }
    });

    function escapeHtml(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.appendChild(document.createTextNode(str));
        return div.innerHTML;
    }
});

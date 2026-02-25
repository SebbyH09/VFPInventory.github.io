// Dashboard JavaScript
// Extracted from inline script for CSP compliance

let currentItemId = null;

async function updateCycleCountDisplay() {
    const limit = document.getElementById('cycleCountLimit').value;
    const currentCards = document.querySelectorAll('.cycle-count-card');
    
    console.log('Limit changed to:', limit);
    console.log('Current cards:', currentCards.length);
    
    if (limit === 'all') {
        // Fetch all remaining items
        try {
            const response = await fetch(`/dashboard/api/cycle-counts-next?limit=1000&skip=${currentCards.length}`);
            if (response.ok) {
                const result = await response.json();
                if (result.success && result.items && result.items.length > 0) {
                    const container = document.getElementById('cycleCountCardsContainer');
                    result.items.forEach((item, index) => {
                        const newCard = createCycleCountCard(item, currentCards.length + index);
                        container.appendChild(newCard);
                        
                        const updateBtn = newCard.querySelector('.cycle-count-update-btn');
                        updateBtn.addEventListener('click', function() {
                            const card = this.closest('.card');
                            const itemId = card.getAttribute('data-item-id');
                            const itemName = card.querySelector('.field-value').textContent;
                            const currentQty = card.getAttribute('data-current-qty');
                            openCycleCountModal(itemId, itemName, currentQty);
                        });
                    });
                }
            }
        } catch (error) {
            console.error('Error fetching all items:', error);
        }
    } else {
        // Fetch items to reach the new limit
        const limitNum = parseInt(limit);
        const needToFetch = limitNum - currentCards.length;
        
        if (needToFetch > 0) {
            try {
                const response = await fetch(`/dashboard/api/cycle-counts-next?limit=${needToFetch}&skip=${currentCards.length}`);
                if (response.ok) {
                    const result = await response.json();
                    if (result.success && result.items && result.items.length > 0) {
                        const container = document.getElementById('cycleCountCardsContainer');
                        result.items.forEach((item, index) => {
                            const newCard = createCycleCountCard(item, currentCards.length + index);
                            container.appendChild(newCard);
                            
                            const updateBtn = newCard.querySelector('.cycle-count-update-btn');
                            updateBtn.addEventListener('click', function() {
                                const card = this.closest('.card');
                                const itemId = card.getAttribute('data-item-id');
                                const itemName = card.querySelector('.field-value').textContent;
                                const currentQty = card.getAttribute('data-current-qty');
                                openCycleCountModal(itemId, itemName, currentQty);
                            });
                        });
                    }
                }
            } catch (error) {
                console.error('Error fetching items:', error);
            }
        }
    }
}

function openCycleCountModal(itemId, itemName, currentQty) {
    currentItemId = itemId;
    document.getElementById('modalItemName').textContent = itemName;
    document.getElementById('currentQty').value = currentQty;
    document.getElementById('updatedQty').value = '';
    document.getElementById('cycleCountModal').style.display = 'block';
}

function closeCycleCountModal() {
    document.getElementById('cycleCountModal').style.display = 'none';
    currentItemId = null;
}

function openOrderItemsModal(orderNumber, items) {
    document.getElementById('orderItemsModalNumber').textContent = orderNumber;
    const tbody = document.getElementById('orderItemsModalBody');
    tbody.innerHTML = '';

    items.forEach(item => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${escapeHtml(item.itemName)}</td>
            <td>${escapeHtml(item.brand || 'N/A')}</td>
            <td>${item.quantityOrdered}</td>
            <td>${item.quantityReceived}</td>
            <td>$${item.cost ? item.cost.toFixed(2) : '0.00'}</td>
        `;
        tbody.appendChild(tr);
    });

    document.getElementById('orderItemsModal').style.display = 'block';
}

function closeOrderItemsModal() {
    document.getElementById('orderItemsModal').style.display = 'none';
}

function openOnOrderDetailsModal(itemName, orderDetails) {
    document.getElementById('onOrderItemName').textContent = itemName;
    const tbody = document.getElementById('onOrderDetailsBody');
    tbody.innerHTML = '';

    orderDetails.forEach(detail => {
        const tr = document.createElement('tr');
        const statusClass = detail.orderStatus === 'open' ? 'status-open' :
                            detail.orderStatus === 'partial' ? 'status-partial' : 'status-received';
        const statusLabel = detail.orderStatus.charAt(0).toUpperCase() + detail.orderStatus.slice(1);
        tr.innerHTML = `
            <td>${escapeHtml(detail.orderNumber)}</td>
            <td><span class="status-badge ${statusClass}">${statusLabel}</span></td>
            <td>${detail.quantityOrdered}</td>
            <td>${detail.quantityReceived}</td>
            <td>${detail.remaining}</td>
            <td>${new Date(detail.createdAt).toLocaleDateString()}</td>
        `;
        tbody.appendChild(tr);
    });

    document.getElementById('onOrderDetailsModal').style.display = 'block';
}

function closeOnOrderDetailsModal() {
    document.getElementById('onOrderDetailsModal').style.display = 'none';
}

async function submitCycleCount() {
    const updatedQty = document.getElementById('updatedQty').value;

    if (!updatedQty || updatedQty === '') {
        alert('Please enter an updated quantity');
        return;
    }

    try {
        const response = await fetch('/update-cycle-count', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                itemId: currentItemId,
                newQuantity: parseInt(updatedQty),
                date: new Date().toISOString()
            })
        });


        if (response.ok) {
            
            // Remove the card from the DOM
            const card = document.querySelector(`.cycle-count-card[data-item-id="${currentItemId}"]`);
            if (card) {
                card.remove();
            }

            closeCycleCountModal();

            await refreshCycleCountCards();
            alert('Cycle count updated successfully!');
            
        } else {
            const error = await response.json();
            alert('Failed to update cycle count: ' + (error.message || 'Unknown error'));
        }
    } catch (error) {
        console.error('Error updating cycle count:', error);
        alert('Error updating cycle count');
    }
}

// Initialize display and restore saved sizes on page load
document.addEventListener('DOMContentLoaded', function() {
    const cycleCountLimit = document.getElementById('cycleCountLimit');
    if (cycleCountLimit) {
        cycleCountLimit.addEventListener('change', updateCycleCountDisplay);
    }

    // Set up event listeners for cycle count modal buttons
    const closeButtons = document.querySelectorAll('#cycleCountModal .close');
    closeButtons.forEach(button => {
        button.addEventListener('click', closeCycleCountModal);
    });

    // Set up event listeners for order items modal close button
    const orderModalCloseButtons = document.querySelectorAll('.order-modal-close');
    orderModalCloseButtons.forEach(button => {
        button.addEventListener('click', closeOrderItemsModal);
    });

    // Set up event listeners for on-order details modal close button
    const onOrderModalCloseButtons = document.querySelectorAll('.on-order-modal-close');
    onOrderModalCloseButtons.forEach(button => {
        button.addEventListener('click', closeOnOrderDetailsModal);
    });

    // Set up clickable on-order inventory cards
    const onOrderCards = document.querySelectorAll('.on-order-card.clickable-card');
    onOrderCards.forEach(card => {
        card.addEventListener('click', function() {
            const itemName = this.getAttribute('data-item-name');
            const detailsJson = decodeURIComponent(this.getAttribute('data-order-details'));
            const details = JSON.parse(detailsJson);
            openOnOrderDetailsModal(itemName, details);
        });
    });

    const submitButton = document.querySelector('.btn-submit');
    if (submitButton) {
        submitButton.addEventListener('click', submitCycleCount);
    }

    const cancelButton = document.querySelector('.btn-cancel');
    if (cancelButton) {
        cancelButton.addEventListener('click', closeCycleCountModal);
    }

    // Set up event listeners for cycle count update buttons
    const updateButtons = document.querySelectorAll('.cycle-count-update-btn');
    updateButtons.forEach(button => {
        button.addEventListener('click', function() {
            const card = this.closest('.card');
            const itemId = card.getAttribute('data-item-id');
            const itemName = card.querySelector('.field-value').textContent;
            const currentQty = card.getAttribute('data-current-qty');
            openCycleCountModal(itemId, itemName, currentQty);
        });
    });

    // Close modals when clicking outside of them
    window.onclick = function(event) {
        const cycleModal = document.getElementById('cycleCountModal');
        if (event.target == cycleModal) {
            closeCycleCountModal();
        }
        const orderModal = document.getElementById('orderItemsModal');
        if (event.target == orderModal) {
            closeOrderItemsModal();
        }
        const onOrderModal = document.getElementById('onOrderDetailsModal');
        if (event.target == onOrderModal) {
            closeOnOrderDetailsModal();
        }
    };

    // Set up clickable order cards to open items modal
    const orderCards = document.querySelectorAll('.order-card.clickable-card');
    orderCards.forEach(card => {
        card.addEventListener('click', function() {
            const orderNumber = this.getAttribute('data-order-number');
            const itemsJson = decodeURIComponent(this.getAttribute('data-order-items'));
            const items = JSON.parse(itemsJson);
            openOrderItemsModal(orderNumber, items);
        });
    });

    updateCycleCountDisplay();
});


async function refreshCycleCountCards() {
    console.log('=== refreshCycleCountCards CALLED ===');
    
    const container = document.getElementById('cycleCountCardsContainer');
    const limit = document.getElementById('cycleCountLimit').value;
    const currentCards = document.querySelectorAll('.cycle-count-card');
    
    console.log('Current cards in DOM:', currentCards.length);
    console.log('Selected limit:', limit);
    
    // If no cards left, show empty state
    if (currentCards.length === 0) {
        console.log('No cards left - showing empty state');
        container.innerHTML = '<div class="empty-state">No cycle counts due</div>';
        return;
    }
    
    // If we're below the limit, fetch one more item
    if (limit !== 'all') {
        const limitNum = parseInt(limit);
        console.log('Need', limitNum, 'cards, have', currentCards.length);
        
        if (currentCards.length < limitNum) {
            console.log('Fetching next item...');
            try {
                const response = await fetch(`/cycle-counts-next?limit=1&skip=${currentCards.length}`);
                console.log('Response status:', response.status);
                
                if (response.ok) {
                    const result = await response.json();
                    console.log('Result:', result);
                    
                    if (result.success && result.items && result.items.length > 0) {
                        const nextItem = result.items[0];
                        const newCard = createCycleCountCard(nextItem, currentCards.length);
                        container.appendChild(newCard);
                        
                        // Attach event listener
                        const updateBtn = newCard.querySelector('.cycle-count-update-btn');
                        updateBtn.addEventListener('click', function() {
                            const card = this.closest('.card');
                            const itemId = card.getAttribute('data-item-id');
                            const itemName = card.querySelector('.field-value').textContent;
                            const currentQty = card.getAttribute('data-current-qty');
                            openCycleCountModal(itemId, itemName, currentQty);
                        });
                        
                        console.log('Successfully added new card');
                    } else {
                        console.log('No more items available');
                    }
                }
            } catch (error) {
                console.error('Error fetching next item:', error);
            }
        } else {
            console.log('Already have enough cards');
        }
    }
    
    console.log('=== refreshCycleCountCards COMPLETE ===');
}

function createCycleCountCard(item, index) {
    const card = document.createElement('div');
    card.className = 'card cycle-count-card';
    card.setAttribute('data-index', index);
    card.setAttribute('data-item-id', item._id);
    card.setAttribute('data-current-qty', item.currentquantity);
    
    const lastCount = item.lastCycleCount 
        ? new Date(item.lastCycleCount).toLocaleDateString() 
        : 'Never';
    
    const statusBadge = getStatusBadge(item);
    
    card.innerHTML = `
        <div class="card-field">
            <span class="field-label">Item:</span>
            <span class="field-value">${escapeHtml(item.item)}</span>
        </div>
        <div class="card-field">
            <span class="field-label">Brand:</span>
            <span class="field-value">${escapeHtml(item.brand || 'N/A')}</span>
        </div>
        <div class="card-field">
            <span class="field-label">Last Count:</span>
            <span class="field-value">${lastCount}</span>
        </div>
        <div class="card-field">
            <span class="field-label">Days Since:</span>
            <span class="field-value">${item.daysSinceCount !== null ? item.daysSinceCount : 'N/A'}</span>
        </div>
        <div class="card-field">
            <span class="field-label">Interval:</span>
            <span class="field-value">${item.cycleCountInterval || 90} days</span>
        </div>
        <div class="card-field">
            <span class="field-label">Status:</span>
            <span class="field-value">${statusBadge}</span>
        </div>
        <div class="card-action">
            <button class="cycle-count-update-btn">Update Count</button>
        </div>
    `;
    
    return card;
}

function getStatusBadge(item) {
    if (!item.lastCycleCount) {
        return '<span class="status-badge status-overdue">Never Counted</span>';
    } else if (item.daysOverdue > 0) {
        return `<span class="status-badge status-overdue">Overdue by ${item.daysOverdue} days</span>`;
    } else {
        return '<span class="status-badge status-due">Due Now</span>';
    }
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
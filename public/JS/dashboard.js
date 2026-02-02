// Dashboard JavaScript
// Extracted from inline script for CSP compliance

let currentItemId = null;

function adjustCardSize(wrapperId, size) {
    const wrapper = document.getElementById(wrapperId);

    // Remove existing size classes
    wrapper.classList.remove('card-size-small', 'card-size-medium', 'card-size-large');

    // Add new size class
    wrapper.classList.add('card-size-' + size);

    // Save preference to localStorage
    localStorage.setItem(wrapperId + '-size', size);
}

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
    // Set up event listeners for size controls
    const ordersCardSize = document.getElementById('ordersCardSize');
    if (ordersCardSize) {
        ordersCardSize.addEventListener('change', function() {
            adjustCardSize('ordersCardWrapper', this.value);
        });
    }

    const inventoryCardSize = document.getElementById('inventoryCardSize');
    if (inventoryCardSize) {
        inventoryCardSize.addEventListener('change', function() {
            adjustCardSize('inventoryCardWrapper', this.value);
        });
    }

    const cycleCountCardSize = document.getElementById('cycleCountCardSize');
    if (cycleCountCardSize) {
        cycleCountCardSize.addEventListener('change', function() {
            adjustCardSize('cycleCountCardWrapper', this.value);
        });
    }

    const cycleCountLimit = document.getElementById('cycleCountLimit');
    if (cycleCountLimit) {
        cycleCountLimit.addEventListener('change', updateCycleCountDisplay);
    }

    // Set up event listeners for modal buttons
    const closeButtons = document.querySelectorAll('.close');
    closeButtons.forEach(button => {
        button.addEventListener('click', closeCycleCountModal);
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

    // Close modal when clicking outside of it
    window.onclick = function(event) {
        const modal = document.getElementById('cycleCountModal');
        if (event.target == modal) {
            closeCycleCountModal();
        }
    };

    updateCycleCountDisplay();

    // Restore saved card sizes from localStorage
    const cardWrappers = ['ordersCardWrapper', 'inventoryCardWrapper', 'cycleCountCardWrapper'];
    cardWrappers.forEach(wrapperId => {
        const savedSize = localStorage.getItem(wrapperId + '-size');
        if (savedSize) {
            const wrapper = document.getElementById(wrapperId);
            const select = wrapper.querySelector('select[id$="CardSize"]');
            if (select && wrapper) {
                select.value = savedSize;
                wrapper.classList.add('card-size-' + savedSize);
            }
        } else {
            // Apply default medium size
            const wrapper = document.getElementById(wrapperId);
            if (wrapper) {
                wrapper.classList.add('card-size-medium');
            }
        }
    });
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
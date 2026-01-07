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

function updateCycleCountDisplay() {
    const limit = document.getElementById('cycleCountLimit').value;
    const cards = document.querySelectorAll('.cycle-count-card');

    cards.forEach((card, index) => {
        if (limit === 'all') {
            card.style.display = '';
        } else {
            const limitNum = parseInt(limit);
            card.style.display = index < limitNum ? '' : 'none';
        }
    });
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
            alert('Cycle count updated successfully!');

            // Remove the card from the DOM
            const card = document.querySelector(`.cycle-count-card[data-item-id="${currentItemId}"]`);
            if (card) {
                card.remove();

                // Check if there are any cards left
                const remainingCards = document.querySelectorAll('.cycle-count-card');
                if (remainingCards.length === 0) {
                    // Show empty state message
                    const container = document.getElementById('cycleCountCardsContainer');
                    container.innerHTML = '<div class="empty-state">No cycle counts due</div>';
                }
            }

            closeCycleCountModal();
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

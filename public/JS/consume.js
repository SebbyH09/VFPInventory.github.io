document.addEventListener('DOMContentLoaded', function() {
    initializeConsumeTable();
    setupSearchFunctionality();
    setupAddItemsButton();
    setupConsumeButton();
    });

let selectedItems = new Map();

function initializeConsumeTable() {
    const table = document.getElementById('inventoryTable');
    if (!table) return;

    const checkboxes = table.querySelectorAll('.item-checkbox');
    checkboxes.forEach(checkbox => {
        checkbox.addEventListener('change', handleCheckboxChange);
    });
}

function handleCheckboxChange(event) {
    const checkbox = event.target;
    const row = checkbox.closest('tr');
    const itemId = row.getAttribute('data-item-id');

    if (checkbox.checked) {
        row.classList.add('selected-row');
    } else {
        row.classList.remove('selected-row');
    }
}

function setupSearchFunctionality() {
    const searchBar = document.getElementById('consumeSearchBar');
    const searchButton = document.getElementById('searchButton');
    const clearButton = document.getElementById('clearButton');

    if (!searchBar) return;

    searchButton.addEventListener('click', performSearch);
    searchBar.addEventListener('keypress', function(event) {
        if (event.key === 'Enter') {
            performSearch();
        }
    });

    clearButton.addEventListener('click', clearSearch);
}

function performSearch() {
    const searchBar = document.getElementById('consumeSearchBar');
    const searchTerm = searchBar.value.toLowerCase().trim();
    const table = document.getElementById('inventoryTable');
    const rows = table.querySelectorAll('tbody tr');

    rows.forEach(row => {
        const itemName = row.querySelector('td:nth-child(1)')?.textContent.toLowerCase() || '';
        const itemBrand = row.querySelector('td:nth-child(2)')?.textContent.toLowerCase() || '';

        if (itemName.includes(searchTerm) || itemBrand.includes(searchTerm)) {
            row.style.display = '';
        } else {
            row.style.display = 'none';
        }
    });
}

function clearSearch() {
    const searchBar = document.getElementById('consumeSearchBar');
    searchBar.value = '';

    const table = document.getElementById('inventoryTable');
    const rows = table.querySelectorAll('tbody tr');

    rows.forEach(row => {
        row.style.display = '';
    });
}

function setupAddItemsButton() {
    const addItemsBtn = document.getElementById('addItemsBtn');
    if (!addItemsBtn) return;

    addItemsBtn.addEventListener('click', addSelectedItems);
}

function addSelectedItems() {
    const table = document.getElementById('inventoryTable');
    const checkboxes = table.querySelectorAll('.item-checkbox:checked');

    if (checkboxes.length === 0) {
        alert('Please select at least one item to add.');
        return;
    }

    checkboxes.forEach(checkbox => {
        const row = checkbox.closest('tr');
        const itemId = row.getAttribute('data-item-id');
        const itemName = row.getAttribute('data-item-name');
        const itemBrand = row.getAttribute('data-item-brand');
        const itemQuantity = parseInt(row.getAttribute('data-item-quantity'));

        if (!selectedItems.has(itemId)) {
            selectedItems.set(itemId, {
                id: itemId,
                name: itemName,
                brand: itemBrand,
                currentQuantity: itemQuantity,
                consumeQuantity: 1
            });
        }

        checkbox.checked = false;
        row.classList.remove('selected-row');
    });

    renderSelectedItems();
}

function renderSelectedItems() {
    const container = document.getElementById('selectedItemsContainer');
    container.innerHTML = '';

    if (selectedItems.size === 0) {
        container.innerHTML = '<p class="empty-message">No items selected. Check items from the left and click "Add Items".</p>';
        return;
    }

    selectedItems.forEach((item, itemId) => {
        const card = createItemCard(item);
        container.appendChild(card);
    });
}

function createItemCard(item) {
    const card = document.createElement('div');
    card.className = 'item-card';
    card.setAttribute('data-item-id', item.id);
    
    card.innerHTML = `
        <div class="item-card-header">
            <div class="item-card-title">${item.name}</div>
            <button class="remove-item-btn" data-item-id="${item.id}">Remove</button>
        </div>
        <div class="item-card-body">
            <div class="item-detail">
                <span class="item-detail-label">Brand:</span>
                <span class="item-detail-value">${item.brand || 'N/A'}</span>
            </div>
            <div class="item-detail">
                <span class="item-detail-label">Current Quantity:</span>
                <span class="item-detail-value">${item.currentQuantity}</span>
            </div>
            <div class="consume-quantity-section">
                <label for="consume-${item.id}">Quantity to Consume:</label>
                <input
                    type="number"
                    id="consume-${item.id}"
                    class="consume-quantity-input"
                    value="${item.consumeQuantity}"
                    min="1"
                    max="${item.currentQuantity}"
                    >
            </div>
        </div>
    `;

    const removeBtn = card.querySelector('.remove-item-btn');
    removeBtn.addEventListener('click', () => {
        const itemId = removeBtn.dataset.itemId;
        removeItem(itemId);
    });

    const quantityInput = card.querySelector('.consume-quantity-input');
    quantityInput.addEventListener('change', (e) => {
        const itemId = e.target.dataset.itemId;
        const value = e.target.value;
        updateConsumeQuantity(itemId, value);
    })
    return card;
}


function removeItem(itemId) {
    selectedItems.delete(itemId);
    renderSelectedItems();
}

function updateConsumeQuantity(itemId, value) {
    const item = selectedItems.get(itemId);
    if (item) {
        const quantity = parseInt(value);
        if (quantity > 0 && quantity <= item.currentQuantity) {
            item.consumeQuantity = quantity;
        } else {
            alert(`Please enter a quantity between 1 and ${item.currentQuantity}`);
            document.getElementById(`consume-${itemId}`).value = item.consumeQuantity;
        }
    }
}

function setupConsumeButton() {
    const consumeBtn = document.getElementById('consumeBtn');
    if (!consumeBtn) return;

    consumeBtn.addEventListener('click', consumeItems);
}

async function consumeItems() {
    if (selectedItems.size === 0) {
        alert('No items to consume. Please add items first.');
        return;
    }

    const confirmMessage = `Are you sure you want to consume ${selectedItems.size} item(s)?`;
    if (!confirm(confirmMessage)) {
        return;
    }

    const consumedItems = Array.from(selectedItems.values()).map(item => ({
        itemId: item.id,
        quantityConsumed: item.consumeQuantity
    }));

    try {
        const response = await fetch('/consume', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ consumedItems })
        });

        if (response.ok) {
            const result = await response.json();
            alert(result.message);

            selectedItems.clear();
            renderSelectedItems();

            window.location.reload();
        } else {
            const error = await response.json();
            alert('Failed to consume items: ' + (error.message || 'Unknown error'));
        }
    } catch (error) {
        console.error('Error consuming items:', error);
        alert('Error consuming items. Please try again.');
    }
}

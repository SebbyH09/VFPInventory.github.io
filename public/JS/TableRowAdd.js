document.addEventListener('DOMContentLoaded', function() {
    const createNewRowButton = document.getElementById("newRowAdditionBtn");
    const mainTableToAddRow = document.getElementById("mainTable1");

    if (!createNewRowButton || !mainTableToAddRow) {
        console.error('Table or button not found');
        return;
    }

    const tbody = mainTableToAddRow.querySelector('tbody');

    // Open the add item modal when button is clicked
    createNewRowButton.addEventListener('click', function() {
        console.log('Opening add item modal...');
        openAddModal();
    });

    // Global function to delete row and update row numbers
    window.updateRowNumbers = async function(event) {
        const row = event.target.closest('tr');
        const itemId = row.dataset.itemId;

        // If this is an existing item (has an ID), delete it from the database
        if (itemId && itemId !== 'undefined') {
            try {
                const response = await fetch(`/entry/${itemId}`, {
                    method: 'DELETE',
                    headers: {
                        'Content-Type': 'application/json'
                    }
                });

                if (!response.ok) {
                    const error = await response.json();
                    console.error('Error deleting item:', error);
                    alert('Failed to delete item: ' + (error.message || 'Unknown error'));
                    return; // Don't remove the row if delete failed
                }

                console.log('Item deleted successfully from database');
            } catch (error) {
                console.error('Error deleting item:', error);
                alert('Failed to delete item. Please try again.');
                return; // Don't remove the row if delete failed
            }
        }

        // Remove the row from the DOM
        row.remove();

        // Then renumber all remaining rows
        const rows = tbody.querySelectorAll('tr');
        rows.forEach((row, index) => {
            const numberCell = row.querySelector('.row-number');
            if (numberCell) {
                numberCell.textContent = index + 1;
            }
        });
    };

    // Handle delete button clicks using event delegation
    document.addEventListener('click', function(event) {
        if (event.target.classList.contains('delete-btn')) {
            window.updateRowNumbers(event);
        }
    });
});

// Open the add item modal
function openAddModal() {
    const modal = document.getElementById('addModal');
    if (modal) {
        // Clear all input fields
        document.getElementById('addItem').value = '';
        document.getElementById('addBrand').value = '';
        document.getElementById('addVendor').value = '';
        document.getElementById('addCatalog').value = '';
        document.getElementById('addCurrentQty').value = '';
        document.getElementById('addMinQty').value = '';
        document.getElementById('addMaxQty').value = '';
        document.getElementById('addLocation').value = '';
        document.getElementById('addType').value = '';
        document.getElementById('addCost').value = '0';
        document.getElementById('addCycleInterval').value = '90';
        document.getElementById('addUseCycleCount').checked = true;

        // Reset alternate items
        document.getElementById('addAlternateItems').checked = false;
        document.getElementById('addAlternateItemsSection').style.display = 'none';
        document.getElementById('addAlternateItemsContainer').innerHTML = '';

        modal.style.display = 'block';
    }
}

// Close the add item modal
function closeAddModal() {
    const modal = document.getElementById('addModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

// Submit the add item modal
async function submitAddModal() {
    // Collect alternate items if enabled
    const alternateItems = collectAlternateItems('add');

    // Get all the values from the modal
    const itemData = [
        document.getElementById('addItem').value.trim(),
        document.getElementById('addBrand').value.trim(),
        document.getElementById('addVendor').value.trim(),
        document.getElementById('addCatalog').value.trim(),
        document.getElementById('addCurrentQty').value.trim(),
        document.getElementById('addMinQty').value.trim(),
        document.getElementById('addMaxQty').value.trim(),
        document.getElementById('addLocation').value.trim(),
        document.getElementById('addType').value,
        document.getElementById('addCost').value.trim() || '0',
        document.getElementById('addCycleInterval').value.trim() || '90',
        '30',
        document.getElementById('addUseCycleCount').checked,
        alternateItems
    ];

    // Validate required field (only item name is required)
    if (itemData[0] === '') {
        alert('Please enter an item name');
        return;
    }

    // Send to server
    try {
        const response = await fetch("/entry", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                newItems: [itemData],
                updatedItems: []
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Error response:', errorText);
            throw new Error(`Server error: ${response.status}`);
        }

        const result = await response.json();
        console.log("Server response:", result);

        alert(result.message || "Item added successfully!");

        // Close modal and reload page
        closeAddModal();
        window.location.reload();

    } catch (error) {
        console.error("Request failed:", error);
        alert("Failed to add item: " + error.message);
    }
}

// Alternate items helpers (shared between add and edit modals)
var ALTERNATE_ITEMS_MAX = 5;

function createAlternateItemRow(prefix, data) {
    const container = document.getElementById(prefix + 'AlternateItemsContainer');
    const currentCount = container.querySelectorAll('.alternate-item-row').length;

    if (currentCount >= ALTERNATE_ITEMS_MAX) {
        return;
    }

    const row = document.createElement('div');
    row.className = 'alternate-item-row';
    row.innerHTML =
        '<input type="text" class="edit-input alt-brand" placeholder="Brand" value="' + (data && data.brand ? data.brand : '') + '">' +
        '<input type="text" class="edit-input alt-vendor" placeholder="Vendor" value="' + (data && data.vendor ? data.vendor : '') + '">' +
        '<input type="text" class="edit-input alt-catalog" placeholder="Catalog #" value="' + (data && data.catalogNumber ? data.catalogNumber : '') + '">' +
        '<button type="button" class="remove-alternate-btn" title="Remove">&times;</button>';

    row.querySelector('.remove-alternate-btn').addEventListener('click', function() {
        row.remove();
        updateAddAlternateBtn(prefix);
    });

    container.appendChild(row);
    updateAddAlternateBtn(prefix);
}

function updateAddAlternateBtn(prefix) {
    const container = document.getElementById(prefix + 'AlternateItemsContainer');
    const btn = document.getElementById(prefix + 'AlternateItemBtn');
    const currentCount = container.querySelectorAll('.alternate-item-row').length;
    if (btn) {
        btn.style.display = currentCount >= ALTERNATE_ITEMS_MAX ? 'none' : 'inline-block';
    }
}

function collectAlternateItems(prefix) {
    const checkbox = document.getElementById(prefix + 'AlternateItems');
    if (!checkbox || !checkbox.checked) return [];

    const container = document.getElementById(prefix + 'AlternateItemsContainer');
    const rows = container.querySelectorAll('.alternate-item-row');
    const items = [];

    rows.forEach(function(row) {
        const brand = row.querySelector('.alt-brand').value.trim();
        const vendor = row.querySelector('.alt-vendor').value.trim();
        const catalogNumber = row.querySelector('.alt-catalog').value.trim();
        if (brand || vendor || catalogNumber) {
            items.push({ brand: brand, vendor: vendor, catalogNumber: catalogNumber });
        }
    });

    return items;
}

function setupAlternateItemsToggle(prefix) {
    var checkbox = document.getElementById(prefix + 'AlternateItems');
    var section = document.getElementById(prefix + 'AlternateItemsSection');
    var addBtn = document.getElementById(prefix + 'AlternateItemBtn');

    if (checkbox) {
        checkbox.addEventListener('change', function() {
            section.style.display = checkbox.checked ? 'block' : 'none';
            if (checkbox.checked) {
                var container = document.getElementById(prefix + 'AlternateItemsContainer');
                if (container.querySelectorAll('.alternate-item-row').length === 0) {
                    createAlternateItemRow(prefix);
                }
            }
        });
    }

    if (addBtn) {
        addBtn.addEventListener('click', function() {
            createAlternateItemRow(prefix);
        });
    }
}

// Initialize add modal event listeners
document.addEventListener('DOMContentLoaded', function() {
    // Close button
    const addModalClose = document.querySelector('#addModal .close-modal');
    if (addModalClose) {
        addModalClose.addEventListener('click', closeAddModal);
    }

    // Submit button
    const addSubmitBtn = document.querySelector('#addModal .btn-submit');
    if (addSubmitBtn) {
        addSubmitBtn.addEventListener('click', submitAddModal);
    }

    // Cancel button
    const addCancelBtn = document.querySelector('#addModal .btn-cancel');
    if (addCancelBtn) {
        addCancelBtn.addEventListener('click', closeAddModal);
    }

    // Close modal when clicking outside of it
    window.addEventListener('click', function(event) {
        const addModal = document.getElementById('addModal');
        if (event.target === addModal) {
            closeAddModal();
        }
    });

    // Alternate items toggle for add modal
    setupAlternateItemsToggle('add');
});

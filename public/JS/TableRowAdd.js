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
        // Read default values from settings (rendered as data attributes)
        const defaultMin = modal.dataset.defaultMin || '0';
        const defaultMax = modal.dataset.defaultMax || '0';
        const defaultCycleInterval = modal.dataset.defaultCycleInterval || '90';

        // Clear all input fields
        document.getElementById('addItem').value = '';
        document.getElementById('addBrand').value = '';
        document.getElementById('addVendor').value = '';
        document.getElementById('addCatalog').value = '';
        document.getElementById('addCurrentQty').value = '';
        document.getElementById('addMinQty').value = defaultMin;
        document.getElementById('addMaxQty').value = defaultMax;
        setLocationInputs('addStoredContainer', []);
        setLocationInputs('addStockedContainer', []);
        document.getElementById('addType').value = '';
        document.getElementById('addCost').value = '0';
        document.getElementById('addCycleInterval').value = defaultCycleInterval;
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

    const modal = document.getElementById('addModal');
    const defaultCycleInterval = (modal && modal.dataset.defaultCycleInterval) || '90';
    const defaultOrderFrequency = (modal && modal.dataset.defaultOrderFrequency) || '30';

    // Get all the values from the modal
    const itemData = [
        document.getElementById('addItem').value.trim(),          // 0 item
        document.getElementById('addBrand').value.trim(),         // 1 brand
        document.getElementById('addVendor').value.trim(),        // 2 vendor
        document.getElementById('addCatalog').value.trim(),       // 3 catalog
        document.getElementById('addCurrentQty').value.trim(),    // 4 currentquantity
        document.getElementById('addMinQty').value.trim(),        // 5 minimumquantity
        document.getElementById('addMaxQty').value.trim(),        // 6 maximumquantity
        collectLocationInputs('addStoredContainer'),              // 7 storedLocations
        document.getElementById('addType').value,                 // 8 type
        document.getElementById('addCost').value.trim() || '0',   // 9 cost
        document.getElementById('addCycleInterval').value.trim() || defaultCycleInterval, // 10 cycleCountInterval
        defaultOrderFrequency,                                    // 11 orderFrequencyPeriod
        document.getElementById('addUseCycleCount').checked,      // 12 useCycleCount
        alternateItems,                                           // 13 alternateItems
        true,                                                     // 14 isActive
        collectLocationInputs('addStockedContainer')              // 15 stockedInLocations
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

// ===== Multi-value location helpers (shared between add and edit modals) =====
// Each of "Stored" and "Stocked In" can hold several locations; a "+" button
// adds another input row and each row has an "x" to remove it.
function createLocationInput(containerId, value) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const row = document.createElement('div');
    row.className = 'location-input-row';
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'edit-input location-value';
    input.placeholder = 'e.g. Room 101, Shelf B';
    input.value = value || '';
    // Suggest existing locations so items tie back to the Locations page
    if (document.getElementById('locationDatalist')) {
        input.setAttribute('list', 'locationDatalist');
    }
    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'remove-location-btn';
    removeBtn.title = 'Remove';
    removeBtn.innerHTML = '&times;';
    removeBtn.addEventListener('click', function() { row.remove(); });
    row.appendChild(input);
    row.appendChild(removeBtn);
    container.appendChild(row);
}

// Reset a location container to the provided list of values (always keeps at
// least one empty input so the user has somewhere to type).
function setLocationInputs(containerId, values) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = '';
    const list = Array.isArray(values)
        ? values.filter(function(v) { return v && String(v).trim(); })
        : [];
    if (list.length === 0) {
        createLocationInput(containerId, '');
    } else {
        list.forEach(function(v) { createLocationInput(containerId, v); });
    }
}

function collectLocationInputs(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return [];
    const values = [];
    container.querySelectorAll('.location-value').forEach(function(input) {
        const v = input.value.trim();
        if (v) values.push(v);
    });
    return values;
}

// Wire up all "+ Add location" buttons via event delegation
document.addEventListener('click', function(event) {
    const btn = event.target.closest('.add-location-btn');
    if (btn) {
        event.preventDefault();
        createLocationInput(btn.getAttribute('data-loc-target'), '');
    }
});

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

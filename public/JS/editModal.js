let currentEditItemId = null;
let currentEditRow = null;

function openEditModal(itemId) {
    currentEditItemId = itemId;
    const modal = document.getElementById('editModal');
    const tbody = document.querySelector('#mainTable1 tbody');

    // Find the row with this item ID
    currentEditRow = tbody.querySelector(`tr[data-item-id="${itemId}"]`);

    if (!currentEditRow) {
        console.error('Row not found for item ID:', itemId);
        return;
    }

    // Get the original data
    const originalData = JSON.parse(currentEditRow.getAttribute('data-original'));

    // Populate the form fields
    document.getElementById('editItem').value = originalData.item || '';
    document.getElementById('editBrand').value = originalData.brand || '';
    document.getElementById('editVendor').value = originalData.vendor || '';
    document.getElementById('editCatalog').value = originalData.catalogNumber || '';
    document.getElementById('editCurrentQty').value = originalData.currentQuantity || 0;
    document.getElementById('editMinQty').value = originalData.minimumQuantity || 0;
    document.getElementById('editMaxQty').value = originalData.maxQuantity || 0;
    document.getElementById('editLocation').value = originalData.location || '';
    document.getElementById('editType').value = originalData.type || '';
    document.getElementById('editCost').value = originalData.cost || 0;
    document.getElementById('editCycleInterval').value = originalData.cycleCountInterval || 90;
    document.getElementById('editOrderPeriod').value = originalData.orderFrequencyPeriod || 30;
    document.getElementById('editUseCycleCount').checked = originalData.useCycleCount !== undefined ? originalData.useCycleCount : true;

    // Show the modal with blur effect
    modal.style.display = 'block';
    document.body.classList.add('modal-open');
}

function closeEditModal() {
    const modal = document.getElementById('editModal');
    modal.style.display = 'none';
    document.body.classList.remove('modal-open');
    currentEditItemId = null;
    currentEditRow = null;
}

async function submitEditModal() {
    if (!currentEditItemId || !currentEditRow) {
        alert('No item selected for editing');
        return;
    }

    // Get all the values from the form
    const changes = {};
    const originalData = JSON.parse(currentEditRow.getAttribute('data-original'));

    const newItem = document.getElementById('editItem').value.trim();
    const newBrand = document.getElementById('editBrand').value.trim();
    const newVendor = document.getElementById('editVendor').value.trim();
    const newCatalog = document.getElementById('editCatalog').value.trim();
    const newCurrentQty = parseInt(document.getElementById('editCurrentQty').value) || 0;
    const newMinQty = parseInt(document.getElementById('editMinQty').value) || 0;
    const newMaxQty = parseInt(document.getElementById('editMaxQty').value) || 0;
    const newLocation = document.getElementById('editLocation').value.trim();
    const newType = document.getElementById('editType').value.trim();
    const newCost = parseFloat(document.getElementById('editCost').value) || 0;
    const newCycleInterval = parseInt(document.getElementById('editCycleInterval').value) || 90;
    const newOrderPeriod = parseInt(document.getElementById('editOrderPeriod').value) || 30;
    const newUseCycleCount = document.getElementById('editUseCycleCount').checked;

    // Check what changed
    if (newItem !== originalData.item) changes.item = newItem;
    if (newBrand !== originalData.brand) changes.brand = newBrand;
    if (newVendor !== originalData.vendor) changes.vendor = newVendor;
    if (newCatalog !== originalData.catalogNumber) changes.catalog = newCatalog;
    if (newCurrentQty !== originalData.currentQuantity) {
        changes.currentquantity = newCurrentQty;
        changes.lastUsedDate = new Date().toISOString();
    }
    if (newMinQty !== originalData.minimumQuantity) changes.minimumquantity = newMinQty;
    if (newMaxQty !== originalData.maxQuantity) changes.maximumquantity = newMaxQty;
    if (newLocation !== originalData.location) changes.location = newLocation;
    if (newType !== originalData.type) changes.type = newType;
    if (newCost !== originalData.cost) changes.cost = newCost;
    if (newCycleInterval !== originalData.cycleCountInterval) changes.cycleCountInterval = newCycleInterval;
    if (newOrderPeriod !== originalData.orderFrequencyPeriod) changes.orderFrequencyPeriod = newOrderPeriod;
    if (newUseCycleCount !== originalData.useCycleCount) changes.useCycleCount = newUseCycleCount;

    // If nothing changed, just close the modal
    if (Object.keys(changes).length === 0) {
        closeEditModal();
        return;
    }

    try {
        const response = await fetch('/entry', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                newItems: [],
                updatedItems: [{
                    id: currentEditItemId,
                    changes: changes
                }]
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Error response:', errorText);
            throw new Error(`Server error: ${response.status}`);
        }

        const result = await response.json();
        alert(result.message || 'Item updated successfully!');

        // Reload page to get fresh data
        window.location.reload();

    } catch (error) {
        console.error('Error updating item:', error);
        alert('Failed to update item: ' + error.message);
    }
}

async function markItemAsUsedFromModal() {
    if (!currentEditItemId) {
        alert('No item selected');
        return;
    }

    const today = new Date().toISOString();

    try {
        const response = await fetch('/entry/mark-used', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ itemId: currentEditItemId, date: today })
        });

        if (response.ok) {
            alert('Item marked as used');
            closeEditModal();
            window.location.reload();
        } else {
            alert('Failed to mark item as used');
        }
    } catch (error) {
        console.error('Error marking item as used:', error);
        alert('Error marking item as used');
    }
}

async function recordItemOrderFromModal() {
    if (!currentEditItemId) {
        alert('No item selected');
        return;
    }

    const today = new Date().toISOString();

    try {
        const response = await fetch('/entry/record-order', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ itemId: currentEditItemId, date: today })
        });

        if (response.ok) {
            alert('Order recorded');
            closeEditModal();
            window.location.reload();
        } else {
            alert('Failed to record order');
        }
    } catch (error) {
        console.error('Error recording order:', error);
        alert('Error recording order');
    }
}

async function deleteItemFromModal() {
    if (!currentEditItemId) {
        alert('No item selected');
        return;
    }

    if (!confirm('Are you sure you want to delete this item?')) {
        return;
    }

    try {
        const response = await fetch(`/entry/${currentEditItemId}`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            const error = await response.json();
            console.error('Error deleting item:', error);
            alert('Failed to delete item: ' + (error.message || 'Unknown error'));
            return;
        }

        alert('Item deleted successfully!');
        closeEditModal();
        window.location.reload();

    } catch (error) {
        console.error('Error deleting item:', error);
        alert('Failed to delete item. Please try again.');
    }
}

// Initialize event listeners when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    // Close modal button
    const editModalClose = document.querySelector('#editModal .close-modal');
    if (editModalClose) {
        editModalClose.addEventListener('click', closeEditModal);
    }

    // Submit button
    const editSubmitBtn = document.querySelector('#editModal .btn-submit');
    if (editSubmitBtn) {
        editSubmitBtn.addEventListener('click', submitEditModal);
    }

    // Cancel button
    const editCancelBtn = document.querySelector('#editModal .btn-cancel');
    if (editCancelBtn) {
        editCancelBtn.addEventListener('click', closeEditModal);
    }

    // Mark as used button
    const markUsedBtn = document.querySelector('.mark-used-btn-modal');
    if (markUsedBtn) {
        markUsedBtn.addEventListener('click', markItemAsUsedFromModal);
    }

    // Record order button
    const recordOrderBtn = document.querySelector('.record-order-btn-modal');
    if (recordOrderBtn) {
        recordOrderBtn.addEventListener('click', recordItemOrderFromModal);
    }

    // Delete button
    const deleteBtn = document.querySelector('.delete-btn-modal');
    if (deleteBtn) {
        deleteBtn.addEventListener('click', deleteItemFromModal);
    }

    // Row edit buttons (dynamically added, use event delegation)
    document.addEventListener('click', function(event) {
        if (event.target.classList.contains('row-edit-btn')) {
            const row = event.target.closest('tr');
            const itemId = row.getAttribute('data-item-id');
            if (itemId) {
                openEditModal(itemId);
            }
        }
    });

    // Close modal when clicking outside of it
    window.onclick = function(event) {
        const modal = document.getElementById('editModal');
        if (event.target == modal) {
            closeEditModal();
        }
    };
});

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
    document.getElementById('editUseCycleCount').checked = originalData.useCycleCount !== undefined ? originalData.useCycleCount : true;

    // Update toggle active button text based on current status
    const toggleActiveBtn = document.querySelector('.toggle-active-btn-modal');
    if (toggleActiveBtn) {
        const isActive = originalData.isActive !== false;
        if (isActive) {
            toggleActiveBtn.textContent = 'Mark Inactive';
            toggleActiveBtn.classList.remove('reactivate');
        } else {
            toggleActiveBtn.textContent = 'Reactivate';
            toggleActiveBtn.classList.add('reactivate');
        }
    }

    // Populate alternate items
    const altCheckbox = document.getElementById('editAlternateItems');
    const altSection = document.getElementById('editAlternateItemsSection');
    const altContainer = document.getElementById('editAlternateItemsContainer');
    altContainer.innerHTML = '';

    const alternates = originalData.alternateItems || [];
    if (alternates.length > 0) {
        altCheckbox.checked = true;
        altSection.style.display = 'block';
        alternates.forEach(function(alt) {
            createAlternateItemRow('edit', alt);
        });
    } else {
        altCheckbox.checked = false;
        altSection.style.display = 'none';
    }

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
    if (newUseCycleCount !== originalData.useCycleCount) changes.useCycleCount = newUseCycleCount;

    // Always send alternate items (compare as JSON to detect changes)
    const newAlternateItems = collectAlternateItems('edit');
    const oldAlternateItems = originalData.alternateItems || [];
    if (JSON.stringify(newAlternateItems) !== JSON.stringify(oldAlternateItems)) {
        changes.alternateItems = newAlternateItems;
    }

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

async function toggleActiveFromModal() {
    if (!currentEditItemId) {
        alert('No item selected');
        return;
    }

    const originalData = JSON.parse(currentEditRow.getAttribute('data-original'));
    const isCurrentlyActive = originalData.isActive !== false;
    const action = isCurrentlyActive ? 'mark as inactive' : 'reactivate';

    if (!confirm(`Are you sure you want to ${action} this item?`)) {
        return;
    }

    try {
        const response = await fetch(`/entry/${currentEditItemId}/toggle-active`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            const error = await response.json();
            alert('Failed to update status: ' + (error.message || 'Unknown error'));
            return;
        }

        const result = await response.json();
        alert(result.message);
        closeEditModal();
        window.location.reload();

    } catch (error) {
        console.error('Error toggling active status:', error);
        alert('Failed to update item status. Please try again.');
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

    // Delete button
    const deleteBtn = document.querySelector('.delete-btn-modal');
    if (deleteBtn) {
        deleteBtn.addEventListener('click', deleteItemFromModal);
    }

    // Toggle active button
    const toggleActiveBtn = document.querySelector('.toggle-active-btn-modal');
    if (toggleActiveBtn) {
        toggleActiveBtn.addEventListener('click', toggleActiveFromModal);
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

    // Row click opens read-only view modal (but not if clicking a button or link)
    const mainTable = document.getElementById('mainTable1');
    if (mainTable) {
        mainTable.querySelector('tbody').addEventListener('click', function(event) {
            // Ignore clicks on buttons, links, or inputs
            if (event.target.closest('button') || event.target.closest('a') || event.target.closest('input')) {
                return;
            }
            const row = event.target.closest('tr');
            if (row && row.getAttribute('data-item-id')) {
                openViewModal(row);
            }
        });
    }

    // View modal close button (× icon)
    const viewModalClose = document.getElementById('viewModalClose');
    if (viewModalClose) {
        viewModalClose.addEventListener('click', closeViewModal);
    }

    // View modal bottom Close button
    const viewModalCloseBtn = document.getElementById('viewModalCloseBtn');
    if (viewModalCloseBtn) {
        viewModalCloseBtn.addEventListener('click', closeViewModal);
    }

    // Close modals when clicking outside of them
    window.onclick = function(event) {
        const editModal = document.getElementById('editModal');
        const viewModal = document.getElementById('viewModal');
        if (event.target == editModal) {
            closeEditModal();
        }
        if (event.target == viewModal) {
            closeViewModal();
        }
    };

    // Alternate items toggle for edit modal
    setupAlternateItemsToggle('edit');
});

function openViewModal(row) {
    const originalData = JSON.parse(row.getAttribute('data-original'));
    const viewModal = document.getElementById('viewModal');

    document.getElementById('viewItem').textContent = originalData.item || '-';
    document.getElementById('viewBrand').textContent = originalData.brand || '-';
    document.getElementById('viewVendor').textContent = originalData.vendor || '-';
    document.getElementById('viewCatalog').textContent = originalData.catalogNumber || '-';
    document.getElementById('viewCurrentQty').textContent = originalData.currentQuantity != null ? originalData.currentQuantity : '-';
    document.getElementById('viewMinQty').textContent = originalData.minimumQuantity != null ? originalData.minimumQuantity : '-';
    document.getElementById('viewMaxQty').textContent = originalData.maxQuantity != null ? originalData.maxQuantity : '-';
    document.getElementById('viewLocation').textContent = originalData.location || '-';
    document.getElementById('viewType').textContent = originalData.type || '-';
    document.getElementById('viewCost').textContent = '$' + (originalData.cost || 0).toFixed(2);

    // Days since last use
    const lastUsed = row.getAttribute('data-last-used');
    if (lastUsed) {
        const diffDays = Math.floor(Math.abs(new Date() - new Date(lastUsed)) / (1000 * 60 * 60 * 24));
        document.getElementById('viewDaysSinceUse').textContent = diffDays;
    } else {
        document.getElementById('viewDaysSinceUse').textContent = 'Never';
    }

    // Open orders
    const openOrders = row.getAttribute('data-open-orders') || '0';
    document.getElementById('viewOrderFrequency').textContent = openOrders;

    // Last cycle count
    const lastCycleCountCell = row.querySelector('.last-cycle-count p');
    document.getElementById('viewLastCycleCount').textContent = lastCycleCountCell ? lastCycleCountCell.textContent : 'Never';

    // Cycle interval (hidden from table, shown here)
    document.getElementById('viewCycleInterval').textContent = originalData.cycleCountInterval || 90;

    // Status
    const viewStatus = document.getElementById('viewStatus');
    if (viewStatus) {
        const isActive = originalData.isActive !== false;
        viewStatus.textContent = isActive ? 'Active' : 'Inactive';
        viewStatus.style.color = isActive ? '#166534' : '#6b7280';
    }

    // Alternate items
    const altSection = document.getElementById('viewAlternateItemsSection');
    const altContainer = document.getElementById('viewAlternateItemsContainer');
    altContainer.innerHTML = '';
    const alternates = originalData.alternateItems || [];
    if (alternates.length > 0) {
        altSection.style.display = 'block';
        alternates.forEach(function(alt, idx) {
            var card = document.createElement('div');
            card.className = 'view-alternate-item';
            card.innerHTML =
                '<span class="alt-item-number">#' + (idx + 1) + '</span>' +
                '<div class="view-row">' +
                    '<div class="view-field"><span class="view-label">Brand</span><span class="view-value">' + (alt.brand || '-') + '</span></div>' +
                    '<div class="view-field"><span class="view-label">Vendor</span><span class="view-value">' + (alt.vendor || '-') + '</span></div>' +
                    '<div class="view-field"><span class="view-label">Catalog #</span><span class="view-value">' + (alt.catalogNumber || '-') + '</span></div>' +
                '</div>';
            altContainer.appendChild(card);
        });
    } else {
        altSection.style.display = 'none';
    }

    // Fetch and display recommendations
    fetchRecommendations(row.getAttribute('data-item-id'));

    // Store item data for cart buttons
    window._viewModalItemData = {
        itemId: row.getAttribute('data-item-id'),
        name: originalData.item || '',
        brand: originalData.brand || '',
        catalog: originalData.catalogNumber || '',
        currentQty: originalData.currentQuantity || 0,
        minQty: originalData.minimumQuantity || 0,
        maxQty: originalData.maxQuantity || 0,
        cost: originalData.cost || 0
    };

    // Reset cart button states
    var orderBtn = document.getElementById('viewAddToOrderBtn');
    var consumeBtn = document.getElementById('viewAddToConsumeBtn');
    if (orderBtn) {
        orderBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg> Add to Order Cart';
        orderBtn.disabled = false;
        orderBtn.style.backgroundColor = '';
    }
    if (consumeBtn) {
        consumeBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg> Add to Consume Cart';
        consumeBtn.disabled = false;
        consumeBtn.style.backgroundColor = '';
    }

    viewModal.style.display = 'block';
    document.body.classList.add('modal-open');
}

function closeViewModal() {
    const viewModal = document.getElementById('viewModal');
    viewModal.style.display = 'none';
    document.body.classList.remove('modal-open');
}

// Recommendations logic
function fetchRecommendations(itemId) {
    var section = document.getElementById('viewRecommendationsSection');
    section.style.display = 'none';

    fetch('/entry/' + itemId + '/recommendations')
        .then(function(res) { return res.json(); })
        .then(function(data) {
            if (!data.hasRecommendation || !data.hasData) {
                section.style.display = 'none';
                return;
            }
            document.getElementById('recCurrentMin').textContent = data.currentMin;
            document.getElementById('recCurrentMax').textContent = data.currentMax;
            document.getElementById('recSuggestedMin').textContent = data.recommendedMin;
            document.getElementById('recSuggestedMax').textContent = data.recommendedMax;
            document.getElementById('recBasis').textContent =
                'Based on ' + data.totalConsumed + ' units consumed over ' + data.lookbackDays +
                ' days (' + data.dailyRate + '/day) across ' + data.consumptionEvents + ' events.';

            // Store recommendation data for adopt button
            window._recData = {
                itemId: itemId,
                recommendedMin: data.recommendedMin,
                recommendedMax: data.recommendedMax
            };

            // Reset button states
            var adoptBtn = document.getElementById('recAdoptBtn');
            var ignoreBtn = document.getElementById('recIgnoreBtn');
            adoptBtn.disabled = false;
            adoptBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg> Adopt';
            ignoreBtn.disabled = false;

            section.style.display = 'block';
        })
        .catch(function() {
            section.style.display = 'none';
        });
}

// Recommendation button handlers
document.addEventListener('DOMContentLoaded', function() {
    var adoptBtn = document.getElementById('recAdoptBtn');
    var ignoreBtn = document.getElementById('recIgnoreBtn');

    if (adoptBtn) {
        adoptBtn.addEventListener('click', function() {
            if (!window._recData) return;
            adoptBtn.disabled = true;
            adoptBtn.textContent = 'Saving...';

            fetch('/entry/' + window._recData.itemId + '/adopt-recommendations', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    minimumquantity: window._recData.recommendedMin,
                    maximumquantity: window._recData.recommendedMax
                })
            })
            .then(function(res) {
                if (!res.ok) throw new Error('Failed');
                return res.json();
            })
            .then(function() {
                adoptBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg> Adopted!';
                adoptBtn.style.backgroundColor = '#16a34a';
                // Update the displayed values in the modal
                document.getElementById('viewMinQty').textContent = window._recData.recommendedMin;
                document.getElementById('viewMaxQty').textContent = window._recData.recommendedMax;
                // Reload after brief delay to update the table
                setTimeout(function() { window.location.reload(); }, 1200);
            })
            .catch(function() {
                adoptBtn.textContent = 'Error - Retry';
                adoptBtn.disabled = false;
            });
        });
    }

    if (ignoreBtn) {
        ignoreBtn.addEventListener('click', function() {
            document.getElementById('viewRecommendationsSection').style.display = 'none';
        });
    }
});

// View modal cart button handlers
(function() {
    document.addEventListener('DOMContentLoaded', function() {
        var orderBtn = document.getElementById('viewAddToOrderBtn');
        var consumeBtn = document.getElementById('viewAddToConsumeBtn');

        if (orderBtn) {
            orderBtn.addEventListener('click', function() {
                if (!window.CartManager || !window._viewModalItemData) return;
                var item = window._viewModalItemData;
                CartManager.addToOrderCart({
                    itemId: item.itemId,
                    name: item.name,
                    brand: item.brand,
                    catalog: item.catalog,
                    quantity: 1,
                    cost: item.cost,
                    currentQty: item.currentQty,
                    minQty: item.minQty,
                    maxQty: item.maxQty
                });
                CartManager.showToast(item.name + ' added to order cart');
                this.textContent = 'Added to Order Cart';
                this.style.backgroundColor = '#4CAF50';
                this.disabled = true;
            });
        }

        if (consumeBtn) {
            consumeBtn.addEventListener('click', function() {
                if (!window.CartManager || !window._viewModalItemData) return;
                var item = window._viewModalItemData;
                CartManager.addToConsumeCart({
                    itemId: item.itemId,
                    name: item.name,
                    brand: item.brand,
                    catalog: item.catalog,
                    consumeQuantity: 1,
                    currentQty: item.currentQty
                });
                CartManager.showToast(item.name + ' added to consume cart');
                this.textContent = 'Added to Consume Cart';
                this.style.backgroundColor = '#4CAF50';
                this.disabled = true;
            });
        }
    });
})();

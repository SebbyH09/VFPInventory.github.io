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
    window.updateRowNumbers = async function() {
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
        document.getElementById('addOrderPeriod').value = '30';
        document.getElementById('addUseCycleCount').checked = true;

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
        document.getElementById('addOrderPeriod').value.trim() || '30',
        document.getElementById('addUseCycleCount').checked
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

// Close modal when clicking outside of it
window.addEventListener('click', function(event) {
    const addModal = document.getElementById('addModal');
    if (event.target === addModal) {
        closeAddModal();
    }
});

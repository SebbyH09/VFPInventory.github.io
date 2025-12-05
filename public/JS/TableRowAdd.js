document.addEventListener('DOMContentLoaded', function() {
    const createNewRowButton = document.getElementById("newRowAdditionBtn");
    const mainTableToAddRow = document.getElementById("mainTable1");
    
    if (!createNewRowButton || !mainTableToAddRow) {
        console.error('Table or button not found');
        return;
    }
    
    const tbody = mainTableToAddRow.querySelector('tbody');
    const headerCells = mainTableToAddRow.querySelectorAll('thead th');
    const columnCount = headerCells.length;
    
    createNewRowButton.addEventListener('click', function() {
        console.log('Adding new row...');
        
        const newRow = tbody.insertRow(-1);
        const rowNumber = tbody.rows.length;
        
        for (let i = 0; i < columnCount; i++) {
            const cell = newRow.insertCell(i);
            
            if (i === 0) {
                // First column: Row number (non-editable)
                cell.innerHTML = `<span class="row-number">${rowNumber}</span>`;
                cell.classList.add('row-number-cell');
            } else if (i === columnCount - 1) {
                // Last column: Delete button (visible in edit mode)
                cell.innerHTML = '<button class="delete-btn" onclick="updateRowNumbers()">Delete</button>';
            } else {
                // Data columns: input fields
                cell.innerHTML = '<input type="text" class="inventoryitem">';
            }
        }
        
        console.log('Row added successfully');
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









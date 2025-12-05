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
    
    // Global function to update row numbers after deletion
    window.updateRowNumbers = function() {
        // Remove the row first (the button's parent row)
        event.target.closest('tr').remove();
        
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









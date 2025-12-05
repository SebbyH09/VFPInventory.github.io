document.addEventListener('DOMContentLoaded', function() {
    const submitButton = document.getElementById("submitEndOfRow");
    const mainTableToAddRow = document.getElementById("mainTable1");
    
    if (!submitButton || !mainTableToAddRow) {
        console.error('Submit button or table not found');
        return;
    }
    
    const tbody = mainTableToAddRow.querySelector('tbody');
    
    submitButton.addEventListener('click', async function() {
        console.log('Submit button clicked');
        
        const rows = tbody.querySelectorAll('tr');
        const newItems = [];
        const updatedItems = [];
        let hasEmptyFields = false;
        
        // Collect data and determine if row is new or existing
        rows.forEach((row) => {
            const cells = row.querySelectorAll('td');
            const itemId = row.getAttribute('data-item-id');
            const originalData = row.getAttribute('data-original');
            const rowData = [];
            
            // Collect current values
            for (let i = 1; i < cells.length - 1; i++) {
                const input = cells[i].querySelector('input.inventoryitem');
                
                if (input) {
                    const value = input.value.trim();
                    rowData.push(value);
                    
                    if (value === '') {
                        hasEmptyFields = true;
                    }
                } else {
                    const p = cells[i].querySelector('p.inventoryitem');
                    rowData.push(p ? p.textContent : '');
                }
            }
            
            // Skip empty rows
            if (!rowData.some(val => val !== '')) {
                return;
            }
            
            // Check if this is a new item or existing item
            if (itemId && originalData) {
                // Existing item - check what changed
                const original = JSON.parse(originalData);
                const changes = {};
                
                if (rowData[0] !== original.item) changes.item = rowData[0];
                if (rowData[1] !== original.brand) changes.brand = rowData[1];
                if (rowData[2] !== original.vendor) changes.vendor = rowData[2];
                if (rowData[2] !== original.catalogNumber) changes.catalog = rowData[3];
                if (parseInt(rowData[3]) !== original.currentQuantity) changes.currentquantity = parseInt(rowData[4]) || 0;
                if (parseInt(rowData[4]) !== original.minimumQuantity) changes.minimumquantity = parseInt(rowData[5]) || 0;
                if (parseInt(rowData[5]) !== original.maxQuantity) changes.maximumquantity = parseInt(rowData[6]) || 0;
                
                // Only add to update list if something changed
                if (Object.keys(changes).length > 0) {
                    updatedItems.push({
                        id: itemId,
                        changes: changes
                    });
                }
            } else {
                // New item
                newItems.push(rowData);
            }
        });
        
        console.log('New items:', newItems);
        console.log('Updated items:', updatedItems);
        
        // Validation
        if (newItems.length === 0 && updatedItems.length === 0) {
            alert('No changes detected');
            return;
        }
        
        if (hasEmptyFields) {
            alert('Please fill in all fields before submitting');
            return;
        }
        
        // Convert inputs to paragraphs (visual update)
        rows.forEach((row) => {
            const cells = row.querySelectorAll('td');
            
            for (let i = 1; i < cells.length - 1; i++) {
                const input = cells[i].querySelector('input.inventoryitem');
                
                if (input) {
                    const value = input.value.trim();
                    cells[i].innerHTML = `<p class="inventoryitem">${value}</p>`;
                }
            }
        });
        
        // Send data to server
        try {
            const response = await fetch("/entry", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ 
                    newItems: newItems,
                    updatedItems: updatedItems
                })
            });
            
            console.log('Response status:', response.status);
            
            if (!response.ok) {
                const errorText = await response.text();
                console.error('Error response:', errorText);
                throw new Error(`Server error: ${response.status}`);
            }
            
            const result = await response.json();
            console.log("Server response:", result);
            
            alert(result.message || "Inventory data saved successfully!");
            
            // Reload page to get fresh data with IDs
            window.location.reload();
            
        } catch (error) {
            console.error("Request failed:", error);
            alert("Failed to save data: " + error.message);
            
            // Revert to inputs if save failed
            rows.forEach((row) => {
                const cells = row.querySelectorAll('td');
                
                for (let i = 1; i < cells.length - 1; i++) {
                    const p = cells[i].querySelector('p.inventoryitem');
                    
                    if (p) {
                        const value = p.textContent;
                        cells[i].innerHTML = `<input type="text" class="inventoryitem" value="${value}">`;
                    }
                }
            });
        }
    });
});
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

            // Collect current values (skip calculated tracking fields and action columns)
            for (let i = 1; i < cells.length - 2; i++) { // -2 to skip Actions and Edit columns
                const input = cells[i].querySelector('input.inventoryitem');
                const select = cells[i].querySelector('select.inventoryitem');
                const p = cells[i].querySelector('p.inventoryitem');

                // Skip calculated tracking fields
                if (p && p.classList.contains('tracking-field')) {
                    continue;
                }

                if (input) {
                    const value = input.value.trim();
                    rowData.push(value);

                    if (value === '' && i < 10) { // Updated to account for Location and Type columns
                        hasEmptyFields = true;
                    }
                } else if (select) {
                    rowData.push(select.value);
                } else if (p) {
                    rowData.push(p.textContent);
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
                if (rowData[3] !== original.catalogNumber) changes.catalog = rowData[3];

                // Check if current quantity changed
                const currentQtyChanged = parseInt(rowData[4]) !== original.currentQuantity;
                if (currentQtyChanged) {
                    changes.currentquantity = parseInt(rowData[4]) || 0;
                    // Update last used date when quantity changes
                    changes.lastUsedDate = new Date().toISOString();
                }

                if (parseInt(rowData[5]) !== original.minimumQuantity) changes.minimumquantity = parseInt(rowData[5]) || 0;
                if (parseInt(rowData[6]) !== original.maxQuantity) changes.maximumquantity = parseInt(rowData[6]) || 0;
                if (rowData[7] !== original.location) changes.location = rowData[7];
                if (rowData[8] !== original.type) changes.type = rowData[8];
                if (parseInt(rowData[9]) !== original.cycleCountInterval) changes.cycleCountInterval = parseInt(rowData[9]) || 90;
                if (parseInt(rowData[10]) !== original.orderFrequencyPeriod) changes.orderFrequencyPeriod = parseInt(rowData[10]) || 30;

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

        // Validation - only check for empty fields in new items
        if (hasEmptyFields && newItems.length > 0) {
            alert('Please fill in all fields before submitting');
            return;
        }

        // If no changes, just exit edit mode without server request
        if (newItems.length === 0 && updatedItems.length === 0) {
            console.log('No changes detected, exiting edit mode');

            // Convert inputs to paragraphs (visual update)
            rows.forEach((row) => {
                const cells = row.querySelectorAll('td');

                for (let i = 1; i < cells.length - 2; i++) { // -2 to skip Actions and Edit columns
                    const input = cells[i].querySelector('input.inventoryitem');
                    const select = cells[i].querySelector('select.inventoryitem');

                    if (input) {
                        const value = input.value.trim();
                        cells[i].innerHTML = `<p class="inventoryitem">${value}</p>`;
                    } else if (select) {
                        const value = select.value;
                        cells[i].innerHTML = `<p class="inventoryitem">${value}</p>`;
                    }
                }
            });

            // Exit edit mode
            if (window.hideEditButtons) {
                window.hideEditButtons();
            }

            return;
        }

        // Convert inputs to paragraphs (visual update)
        rows.forEach((row) => {
            const cells = row.querySelectorAll('td');

            for (let i = 1; i < cells.length - 2; i++) { // -2 to skip Actions and Edit columns
                const input = cells[i].querySelector('input.inventoryitem');
                const select = cells[i].querySelector('select.inventoryitem');

                if (input) {
                    const value = input.value.trim();
                    cells[i].innerHTML = `<p class="inventoryitem">${value}</p>`;
                } else if (select) {
                    const value = select.value;
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

                for (let i = 1; i < cells.length - 2; i++) { // -2 to skip Actions and Edit columns
                    const p = cells[i].querySelector('p.inventoryitem');

                    if (p && !p.classList.contains('tracking-field')) {
                        const value = p.textContent;
                        // Check if this is the Type column (column 9)
                        if (i === 9) {
                            cells[i].innerHTML = `
                                <select class="inventoryitem">
                                    <option value="">Select Type</option>
                                    <option value="Reagent" ${value === 'Reagent' ? 'selected' : ''}>Reagent</option>
                                    <option value="Equipment" ${value === 'Equipment' ? 'selected' : ''}>Equipment</option>
                                    <option value="Consumable" ${value === 'Consumable' ? 'selected' : ''}>Consumable</option>
                                    <option value="Tool" ${value === 'Tool' ? 'selected' : ''}>Tool</option>
                                    <option value="Chemical" ${value === 'Chemical' ? 'selected' : ''}>Chemical</option>
                                    <option value="Other" ${value === 'Other' ? 'selected' : ''}>Other</option>
                                </select>
                            `;
                        } else {
                            cells[i].innerHTML = `<input type="text" class="inventoryitem" value="${value}">`;
                        }
                    }
                }
            });
        }
    });
});
document.addEventListener('DOMContentLoaded', function() {
    const createNewRowButton = document.getElementById("newRowAdditionBtn");
    const submitButton = document.getElementById("submitEndOfRow");
    const editButton = document.getElementById("editEndOfRow");
    const tbody = document.querySelector('#mainTable1 tbody');
    
    if (!createNewRowButton || !submitButton || !editButton) {
        console.error('Button elements not found');
        return;
    }
    
    // When Edit is clicked
    editButton.addEventListener('click', () => {
        editButton.classList.add('hidden');
        createNewRowButton.classList.remove('hidden');
        submitButton.classList.remove('hidden');
        
        // Enable edit mode
        document.body.classList.add('edit-mode');
        
        // Convert all paragraphs to inputs for editing
        const rows = tbody.querySelectorAll('tr');
        rows.forEach(row => {
            const cells = row.querySelectorAll('td');

            // Skip first (row number), last two (actions, edit), and calculated tracking fields
            for (let i = 1; i < cells.length - 2; i++) {
                const cell = cells[i];
                const p = cell.querySelector('p.inventoryitem');

                // Skip calculated tracking fields (they have tracking-field class)
                if (p && !p.classList.contains('tracking-field')) {
                    const value = p.textContent;

                    // Check if this is the Type column (column 9)
                    if (i === 9) {
                        cell.innerHTML = `
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
                        cell.innerHTML = `<input type="text" class="inventoryitem" value="${value}">`;
                    }
                }
            }
        });
    });
    
    // When Submit is clicked (will be triggered from submitbutton.js)
    window.hideEditButtons = function() {
        createNewRowButton.classList.add('hidden');
        submitButton.classList.add('hidden');
        editButton.classList.remove('hidden');
        
        // Disable edit mode
        document.body.classList.remove('edit-mode');
    };
});
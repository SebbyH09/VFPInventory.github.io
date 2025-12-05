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
            
            // Skip first (row number) and last (actions) columns
            for (let i = 1; i < cells.length - 1; i++) {
                const p = cells[i].querySelector('p.inventoryitem');
                if (p) {
                    const value = p.textContent;
                    cells[i].innerHTML = `<input type="text" class="inventoryitem" value="${value}">`;
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
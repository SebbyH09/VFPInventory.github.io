/**
 * Conditional Formatting for Inventory Table
 * Applies color coding to the Current Quantity column based on:
 * - Darker red when quantity is 0
 * - Light red when quantity is less than minimum quantity
 */

function applyConditionalFormatting() {
    const table = document.getElementById('mainTable1');
    if (!table) return;

    const rows = table.querySelectorAll('tbody tr');

    rows.forEach(row => {
        // Get the cells for current quantity (index 5) and minimum quantity (index 6)
        const cells = row.querySelectorAll('td');
        if (cells.length < 7) return; // Skip if row doesn't have enough cells

        const currentQuantityCell = cells[5];
        const minimumQuantityCell = cells[6];

        // Get the values from the paragraphs inside the cells
        const currentQuantityText = currentQuantityCell.querySelector('p.inventoryitem');
        const minimumQuantityText = minimumQuantityCell.querySelector('p.inventoryitem');

        if (!currentQuantityText || !minimumQuantityText) return;

        const currentQuantity = parseFloat(currentQuantityText.textContent);
        const minimumQuantity = parseFloat(minimumQuantityText.textContent);

        // Remove any existing conditional formatting classes
        currentQuantityCell.classList.remove('qty-zero', 'qty-low');

        // Apply conditional formatting based on quantity levels
        if (currentQuantity === 0) {
            // Darker red for zero quantity
            currentQuantityCell.classList.add('qty-zero');
        } else if (currentQuantity < minimumQuantity) {
            // Light red for below minimum
            currentQuantityCell.classList.add('qty-low');
        }
    });
}

// Apply formatting when the page loads
document.addEventListener('DOMContentLoaded', function() {
    applyConditionalFormatting();
});

// Reapply formatting when table content changes (useful for dynamic updates)
// This will work with MutationObserver to detect changes in the table
const observer = new MutationObserver(function(mutations) {
    applyConditionalFormatting();
});

// Start observing the table for changes once DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    const table = document.getElementById('mainTable1');
    if (table) {
        observer.observe(table, {
            childList: true,
            subtree: true,
            characterData: true
        });
    }
});

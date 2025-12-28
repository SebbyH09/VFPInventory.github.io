// Table sorting functionality
document.addEventListener('DOMContentLoaded', function() {
    const table = document.getElementById('mainTable1');
    if (!table) return;

    const headers = table.querySelectorAll('thead th');
    const tbody = table.querySelector('tbody');

    // Track sort state for each column
    const sortState = {};

    headers.forEach((header, index) => {
        // Skip the first column (#) and last column (Actions)
        if (index === 0 || index === headers.length - 1) {
            return;
        }

        // Make header clickable
        header.style.cursor = 'pointer';
        header.style.userSelect = 'none';

        // Add click event
        header.addEventListener('click', function() {
            sortTable(index);
        });

        // Initialize sort state
        sortState[index] = 'none'; // none, asc, desc
    });

    function sortTable(columnIndex) {
        const rows = Array.from(tbody.querySelectorAll('tr'));

        // Determine sort direction
        let direction = sortState[columnIndex] === 'asc' ? 'desc' : 'asc';
        sortState[columnIndex] = direction;

        // Clear all header indicators
        headers.forEach(h => {
            h.classList.remove('sort-asc', 'sort-desc');
        });

        // Add indicator to current header
        headers[columnIndex].classList.add(direction === 'asc' ? 'sort-asc' : 'sort-desc');

        // Sort rows
        rows.sort((a, b) => {
            let aValue, bValue;

            // Special handling for different column types
            if (columnIndex === 10) { // Days Since Last Use
                aValue = getDaysSinceUse(a);
                bValue = getDaysSinceUse(b);
            } else if (columnIndex === 11) { // Orders (Last X days)
                aValue = getOrderCount(a);
                bValue = getOrderCount(b);
            } else if (columnIndex === 12) { // Last Cycle Count
                aValue = getLastCycleCount(a);
                bValue = getLastCycleCount(b);
            } else {
                // Get cell text content
                const aCell = a.cells[columnIndex];
                const bCell = b.cells[columnIndex];

                if (!aCell || !bCell) return 0;

                aValue = aCell.textContent.trim();
                bValue = bCell.textContent.trim();

                // Try to parse as number
                const aNum = parseFloat(aValue);
                const bNum = parseFloat(bValue);

                if (!isNaN(aNum) && !isNaN(bNum)) {
                    aValue = aNum;
                    bValue = bNum;
                }
            }

            // Compare values
            let comparison = 0;
            if (typeof aValue === 'number' && typeof bValue === 'number') {
                comparison = aValue - bValue;
            } else {
                // Handle null/undefined
                if (aValue === null || aValue === undefined) aValue = '';
                if (bValue === null || bValue === undefined) bValue = '';

                comparison = String(aValue).localeCompare(String(bValue), undefined, { numeric: true });
            }

            return direction === 'asc' ? comparison : -comparison;
        });

        // Re-append rows in sorted order
        rows.forEach(row => tbody.appendChild(row));

        // Update row numbers
        updateRowNumbers();
    }

    function getDaysSinceUse(row) {
        const lastUsedAttr = row.getAttribute('data-last-used');
        if (!lastUsedAttr) return Infinity; // Never used goes to the end

        const lastUsed = new Date(lastUsedAttr);
        const today = new Date();
        const diffTime = Math.abs(today - lastUsed);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        return diffDays;
    }

    function getOrderCount(row) {
        const orderHistoryAttr = row.getAttribute('data-order-history');
        if (!orderHistoryAttr) return 0;

        try {
            const orderHistory = JSON.parse(orderHistoryAttr);
            const originalData = JSON.parse(row.getAttribute('data-original'));
            const orderPeriod = originalData.orderFrequencyPeriod || 30;

            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - orderPeriod);

            const recentOrders = orderHistory.filter(order => {
                const orderDate = new Date(order.date || order);
                return orderDate >= cutoffDate;
            });

            return recentOrders.length;
        } catch (e) {
            return 0;
        }
    }

    function getLastCycleCount(row) {
        const lastCycleCountAttr = row.getAttribute('data-last-cycle-count');
        if (!lastCycleCountAttr) return new Date(0); // Never counted goes first

        return new Date(lastCycleCountAttr);
    }

    function updateRowNumbers() {
        const rows = tbody.querySelectorAll('tr');
        rows.forEach((row, index) => {
            const numberCell = row.querySelector('.row-number');
            if (numberCell) {
                numberCell.textContent = index + 1;
            }
        });
    }
});

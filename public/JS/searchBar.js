document.addEventListener('DOMContentLoaded', function() {
    const searchBar = document.getElementById('inventorySearchBar');
    const table = document.getElementById('mainTable1');

    if (!searchBar || !table) {
        console.error('Search bar or table not found');
        return;
    }

    const tbody = table.querySelector('tbody');

    // Search on Enter key press
    searchBar.addEventListener('keypress', function(event) {
        if (event.key === 'Enter') {
            performSearch();
        }
    });

    function performSearch() {
        const searchTerm = searchBar.value.toLowerCase().trim();
        const rows = tbody.querySelectorAll('tr');

        rows.forEach(row => {
            if (searchTerm === '') {
                // Show all rows if search is empty
                row.style.display = '';
            } else {
                // Search through all text content in the row
                const rowText = row.textContent.toLowerCase();

                if (rowText.includes(searchTerm)) {
                    row.style.display = '';
                } else {
                    row.style.display = 'none';
                }
            }
        });
    }
});

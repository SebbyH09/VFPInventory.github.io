document.addEventListener('DOMContentLoaded', function() {
    const searchBar = document.getElementById('inventorySearchBar');
    const searchButton = document.getElementById('searchButton');
    const table = document.getElementById('mainTable1');
    const filterType = document.getElementById('filterType');
    const filterLocation = document.getElementById('filterLocation');
    const filterStock = document.getElementById('filterStock');
    const clearFiltersBtn = document.getElementById('clearFiltersBtn');

    if (!searchBar || !table) {
        console.error('Search bar or table not found');
        return;
    }

    const tbody = table.querySelector('tbody');

    // Populate location filter from existing data
    populateLocationFilter();

    // Search on Enter key press
    searchBar.addEventListener('keypress', function(event) {
        if (event.key === 'Enter') {
            applyAllFilters();
        }
    });

    // Search on button click
    if (searchButton) {
        searchButton.addEventListener('click', function() {
            applyAllFilters();
        });
    }

    // Also filter as user types (live search)
    searchBar.addEventListener('input', function() {
        applyAllFilters();
    });

    // Filter dropdown change events
    if (filterType) {
        filterType.addEventListener('change', applyAllFilters);
    }
    if (filterLocation) {
        filterLocation.addEventListener('change', applyAllFilters);
    }
    if (filterStock) {
        filterStock.addEventListener('change', applyAllFilters);
    }

    // Clear filters button
    if (clearFiltersBtn) {
        clearFiltersBtn.addEventListener('click', function() {
            searchBar.value = '';
            if (filterType) filterType.value = '';
            if (filterLocation) filterLocation.value = '';
            if (filterStock) filterStock.value = '';
            applyAllFilters();
        });
    }

    function populateLocationFilter() {
        if (!filterLocation) return;

        const rows = tbody.querySelectorAll('tr');
        const locations = new Set();

        rows.forEach(row => {
            const originalData = row.getAttribute('data-original');
            if (originalData) {
                try {
                    const data = JSON.parse(originalData);
                    if (data.location && data.location.trim()) {
                        locations.add(data.location.trim());
                    }
                } catch (e) {
                    // skip invalid data
                }
            }
        });

        // Sort locations alphabetically and add options
        Array.from(locations).sort().forEach(location => {
            const option = document.createElement('option');
            option.value = location;
            option.textContent = location;
            filterLocation.appendChild(option);
        });
    }

    function applyAllFilters() {
        const searchTerm = searchBar.value.toLowerCase().trim();
        const typeValue = filterType ? filterType.value : '';
        const locationValue = filterLocation ? filterLocation.value : '';
        const stockValue = filterStock ? filterStock.value : '';
        const rows = tbody.querySelectorAll('tr');

        rows.forEach(row => {
            let visible = true;

            // Text search filter
            if (searchTerm !== '') {
                const rowText = row.textContent.toLowerCase();
                if (!rowText.includes(searchTerm)) {
                    visible = false;
                }
            }

            // Parse original data for structured filtering
            let originalData = {};
            try {
                originalData = JSON.parse(row.getAttribute('data-original') || '{}');
            } catch (e) {
                // skip
            }

            // Type filter
            if (visible && typeValue !== '') {
                const itemType = (originalData.type || '').trim();
                if (itemType !== typeValue) {
                    visible = false;
                }
            }

            // Location filter
            if (visible && locationValue !== '') {
                const itemLocation = (originalData.location || '').trim();
                if (itemLocation !== locationValue) {
                    visible = false;
                }
            }

            // Stock status filter
            if (visible && stockValue !== '') {
                const currentQty = originalData.currentQuantity || 0;
                const minQty = originalData.minimumQuantity || 0;

                if (stockValue === 'out' && currentQty !== 0) {
                    visible = false;
                } else if (stockValue === 'low' && (currentQty === 0 || currentQty >= minQty)) {
                    visible = false;
                } else if (stockValue === 'ok' && currentQty < minQty) {
                    visible = false;
                }
            }

            row.style.display = visible ? '' : 'none';
        });
    }
});

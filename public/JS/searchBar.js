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

    // Capture the original row order so it can be restored when the search box
    // is cleared, and give each row a stable key for relevance ranking.
    const originalOrder = Array.from(tbody.querySelectorAll('tr'));
    originalOrder.forEach((row, index) => { row.dataset.fuzzyKey = String(index); });

    // Ranked fuzzy matcher over full row text (rows are static after render).
    // Built lazily on first use. Falls back to substring matching if the
    // ranked helper is unavailable.
    let rowTextMatcher = null;
    function ensureRowMatcher() {
        if (rowTextMatcher) return rowTextMatcher;
        if (typeof window.createRankedFuzzyFilter !== 'function') return null;
        const records = originalOrder.map((row, index) => ({ key: index, text: row.textContent }));
        rowTextMatcher = window.createRankedFuzzyFilter(records);
        return rowTextMatcher;
    }

    // Reorder rows: matched rows first in relevance order while searching;
    // original order when the query is cleared.
    function reorderRows(ranked) {
        const byKey = new Map(originalOrder.map(r => [Number(r.dataset.fuzzyKey), r]));
        if (ranked) {
            const placed = new Set();
            ranked.order.forEach(key => {
                const row = byKey.get(key);
                if (row && row.style.display !== 'none') { tbody.appendChild(row); placed.add(key); }
            });
            originalOrder.forEach(row => {
                if (!placed.has(Number(row.dataset.fuzzyKey))) tbody.appendChild(row);
            });
        } else {
            originalOrder.forEach(row => tbody.appendChild(row));
        }
    }

    // Collect all locations (stored + stocked-in, with legacy fallback) for an item
    function getItemLocations(data) {
        const result = [];
        const stored = Array.isArray(data.storedLocations) ? data.storedLocations : [];
        const stocked = Array.isArray(data.stockedInLocations) ? data.stockedInLocations : [];
        stored.concat(stocked).forEach(loc => {
            if (loc && loc.trim()) result.push(loc.trim());
        });
        if (result.length === 0 && data.location && data.location.trim()) {
            result.push(data.location.trim());
        }
        return result;
    }

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
                    getItemLocations(data).forEach(loc => locations.add(loc));
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

    // Apply filters on page load to hide inactive items by default
    setTimeout(applyAllFilters, 0);

    function applyAllFilters() {
        const searchTerm = searchBar.value.toLowerCase().trim();
        const typeValue = filterType ? filterType.value : '';
        const locationValue = filterLocation ? filterLocation.value : '';
        const stockValue = filterStock ? filterStock.value : '';
        const rows = tbody.querySelectorAll('tr');

        // Ranked matches (best-first) for the current query, or null when the
        // query is empty. `.set` gives membership, `.order` gives relevance.
        const matcher = searchTerm !== '' ? ensureRowMatcher() : null;
        const ranked = matcher ? matcher(searchTerm) : null;

        rows.forEach(row => {
            const key = Number(row.dataset.fuzzyKey);
            let visible = true;

            // Text search filter (fuzzy, with substring fallback)
            if (searchTerm !== '') {
                const matched = ranked
                    ? ranked.set.has(key)
                    : row.textContent.toLowerCase().includes(searchTerm);
                if (!matched) {
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

            // Location filter (matches either stored or stocked-in locations)
            if (visible && locationValue !== '') {
                if (getItemLocations(originalData).indexOf(locationValue) === -1) {
                    visible = false;
                }
            }

            // Active/Inactive filter
            const isActive = originalData.isActive !== false;

            if (stockValue === 'inactive') {
                // Show only inactive items
                if (visible && isActive) {
                    visible = false;
                }
            } else {
                // For all other filters, hide inactive items by default
                if (visible && !isActive) {
                    visible = false;
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
            }

            row.style.display = visible ? '' : 'none';
        });

        // Float best matches to the top while searching; restore order when cleared.
        reorderRows(ranked);
    }
});

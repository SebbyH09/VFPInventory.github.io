document.addEventListener('DOMContentLoaded', function() {
    // Category pill filter logic
    document.querySelectorAll('.category-pill').forEach(function(pill) {
        pill.addEventListener('click', function() {
            document.querySelectorAll('.category-pill').forEach(function(p) {
                p.classList.remove('active');
            });
            this.classList.add('active');
            var filterType = document.getElementById('filterType');
            if (filterType) {
                filterType.value = this.dataset.category;
                filterType.dispatchEvent(new Event('change'));
            }
        });
    });

    // Stock status filter logic
    document.querySelectorAll('.stock-filter-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
            document.querySelectorAll('.stock-filter-btn').forEach(function(b) {
                b.classList.remove('active');
            });
            this.classList.add('active');
            var filterStock = document.getElementById('filterStock');
            if (filterStock) {
                filterStock.value = this.dataset.stockFilter;
                filterStock.dispatchEvent(new Event('change'));
            }
        });
    });

    // Empty state add button
    var emptyStateAddBtn = document.getElementById('emptyStateAddBtn');
    if (emptyStateAddBtn) {
        emptyStateAddBtn.addEventListener('click', function() {
            var newRowBtn = document.getElementById('newRowAdditionBtn');
            if (newRowBtn) newRowBtn.click();
        });
    }
});

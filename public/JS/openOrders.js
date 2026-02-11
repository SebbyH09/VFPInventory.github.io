document.addEventListener('DOMContentLoaded', function () {
    const filterInput = document.getElementById('orderFilterInput');
    const statusFilter = document.getElementById('statusFilter');
    const sortField = document.getElementById('sortField');
    const sortDirectionBtn = document.getElementById('sortDirectionBtn');

    let sortDirection = 'desc';

    function getOrderCards() {
        return Array.from(document.querySelectorAll('.order-card'));
    }

    function applyFilterAndSort() {
        const query = (filterInput.value || '').toLowerCase().trim();
        const statusVal = statusFilter.value;
        const field = sortField.value;

        const cards = getOrderCards();

        // Filter
        cards.forEach(card => {
            const orderNum = (card.dataset.orderNumber || '').toLowerCase();
            const createdBy = (card.dataset.createdBy || '').toLowerCase();
            const status = card.dataset.status;

            // Check item names in the table rows
            const itemNames = Array.from(card.querySelectorAll('.order-items-table tbody td:first-child'))
                .map(td => td.textContent.toLowerCase());

            const matchesQuery = !query ||
                orderNum.includes(query) ||
                createdBy.includes(query) ||
                itemNames.some(name => name.includes(query));

            const matchesStatus = statusVal === 'all' || status === statusVal;

            card.style.display = (matchesQuery && matchesStatus) ? '' : 'none';
        });

        // Sort visible cards
        const visibleCards = cards.filter(c => c.style.display !== 'none');
        visibleCards.sort((a, b) => {
            let valA, valB;
            switch (field) {
                case 'createdAt':
                    valA = new Date(a.dataset.created).getTime();
                    valB = new Date(b.dataset.created).getTime();
                    break;
                case 'orderNumber':
                    valA = a.dataset.orderNumber;
                    valB = b.dataset.orderNumber;
                    break;
                case 'status':
                    valA = a.dataset.status;
                    valB = b.dataset.status;
                    break;
                case 'itemCount':
                    valA = parseInt(a.dataset.itemCount, 10) || 0;
                    valB = parseInt(b.dataset.itemCount, 10) || 0;
                    break;
                default:
                    valA = a.dataset.created;
                    valB = b.dataset.created;
            }

            let cmp;
            if (typeof valA === 'number') {
                cmp = valA - valB;
            } else {
                cmp = String(valA).localeCompare(String(valB));
            }
            return sortDirection === 'asc' ? cmp : -cmp;
        });

        const list = document.getElementById('ordersList');
        visibleCards.forEach(card => list.appendChild(card));
    }

    filterInput.addEventListener('input', applyFilterAndSort);
    statusFilter.addEventListener('change', applyFilterAndSort);
    sortField.addEventListener('change', applyFilterAndSort);

    sortDirectionBtn.addEventListener('click', function () {
        sortDirection = sortDirection === 'desc' ? 'asc' : 'desc';
        this.innerHTML = sortDirection === 'desc' ? '&#9660;' : '&#9650;';
        this.title = sortDirection === 'desc' ? 'Descending' : 'Ascending';
        applyFilterAndSort();
    });
});

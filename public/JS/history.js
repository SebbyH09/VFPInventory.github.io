// ================================================
// VFP Inventory - History Page
// ================================================

// --- State ---
let currentSort = { column: 'changeDate', order: 'desc' };
let historyData = [];
let historyRequestId = 0; // ignore responses from superseded requests

// --- Helpers ---
function escapeHtml(text) {
    if (text === null || text === undefined) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ================================================
// INITIALIZATION
// ================================================
document.addEventListener('DOMContentLoaded', () => {
    initializePage();
});

async function initializePage() {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30);

    document.getElementById('startDate').valueAsDate = startDate;
    document.getElementById('endDate').valueAsDate = endDate;

    await loadItems();
    await loadHistoryData();
    setupEventListeners();
}

function setupEventListeners() {
    // Filters apply as soon as they change
    ['startDate', 'endDate', 'itemFilter', 'changeTypeFilter'].forEach(id => {
        document.getElementById(id).addEventListener('change', loadHistoryData);
    });
    document.getElementById('resetFilters').addEventListener('click', resetFilters);
    // Sortable column headers
    document.querySelectorAll('th.sortable').forEach(header => {
        header.addEventListener('click', () => handleSort(header.dataset.column));
    });
}

// ================================================
// HISTORY TABLE (existing functionality)
// ================================================
async function loadItems() {
    try {
        const response = await fetch('/history/items');
        const result = await response.json();
        if (result.success) {
            const itemFilter = document.getElementById('itemFilter');
            result.data.forEach(item => {
                const option = document.createElement('option');
                option.value = item._id;
                option.textContent = item.item;
                itemFilter.appendChild(option);
            });
        }
    } catch (error) {
        console.error('Error loading items:', error);
    }
}

async function loadHistoryData() {
    const requestId = ++historyRequestId;
    const tableBody = document.getElementById('historyTableBody');
    const noDataMessage = document.getElementById('noDataMessage');

    tableBody.innerHTML = '<tr><td colspan="7" class="loading-message">Loading history data...</td></tr>';
    noDataMessage.classList.add('hidden');

    try {
        const params = new URLSearchParams({
            startDate: document.getElementById('startDate').value,
            endDate: document.getElementById('endDate').value,
            itemId: document.getElementById('itemFilter').value,
            changeType: document.getElementById('changeTypeFilter').value,
            sortBy: currentSort.column,
            sortOrder: currentSort.order
        });

        const response = await fetch(`/history/data?${params}`);
        const result = await response.json();
        if (requestId !== historyRequestId) return;

        if (result.success) {
            historyData = result.data;
            displayHistoryData(result.data);
        } else {
            throw new Error(result.error || 'Failed to load history data');
        }
    } catch (error) {
        if (requestId !== historyRequestId) return;
        console.error('Error loading history data:', error);
        const tr = document.createElement('tr');
        const td = document.createElement('td');
        td.colSpan = 7;
        td.className = 'loading-message';
        td.textContent = 'Error loading data. Please try again later.';
        tr.appendChild(td);
        tableBody.innerHTML = '';
        tableBody.appendChild(tr);
    }
}

function displayHistoryData(data) {
    const tableBody = document.getElementById('historyTableBody');
    const noDataMessage = document.getElementById('noDataMessage');

    if (!data || data.length === 0) {
        tableBody.innerHTML = '';
        noDataMessage.classList.remove('hidden');
        return;
    }

    noDataMessage.classList.add('hidden');

    tableBody.innerHTML = data.map(record => {
        const date = escapeHtml(new Date(record.changeDate).toLocaleString());
        const changeType = formatChangeType(record.changeType);
        const prevQty = record.previousQuantity !== undefined ? escapeHtml(record.previousQuantity) : '-';
        const newQty = record.newQuantity !== undefined ? escapeHtml(record.newQuantity) : '-';
        const qtyChange = formatQuantityChange(record.quantityChange);
        const notes = escapeHtml(record.notes) || '-';

        return `
            <tr>
                <td>${date}</td>
                <td>${escapeHtml(record.itemName)}</td>
                <td>${changeType}</td>
                <td>${prevQty}</td>
                <td>${newQty}</td>
                <td>${qtyChange}</td>
                <td>${notes}</td>
            </tr>
        `;
    }).join('');
}

function formatChangeType(type) {
    const typeMap = {
        'quantity_change': 'Quantity Change',
        'quantity_consumed': 'Quantity Consumed',
        'item_used': 'Item Used',
        'order_placed': 'Order Placed',
        'cycle_count': 'Cycle Count',
        'item_created': 'Item Created',
        'item_updated': 'Item Updated',
        'item_deleted': 'Item Deleted'
    };
    const displayText = typeMap[type] || escapeHtml(type);
    const safeType = escapeHtml(type);
    return `<span class="change-type-badge change-type-${safeType}">${displayText}</span>`;
}

function formatQuantityChange(change) {
    if (change === undefined || change === null) return '-';
    const sign = change > 0 ? '+' : '';
    const className = change > 0 ? 'qty-increase' : change < 0 ? 'qty-decrease' : 'qty-neutral';
    return `<span class="${className}">${sign}${change}</span>`;
}

function handleSort(column) {
    if (currentSort.column === column) {
        currentSort.order = currentSort.order === 'asc' ? 'desc' : 'asc';
    } else {
        currentSort.column = column;
        currentSort.order = 'desc';
    }

    document.querySelectorAll('.sort-indicator').forEach(ind => { ind.textContent = ''; });
    const activeHeader = document.querySelector(`th[data-column="${column}"]`);
    activeHeader.querySelector('.sort-indicator').textContent = currentSort.order === 'asc' ? '\u25B2' : '\u25BC';

    loadHistoryData();
}

function resetFilters() {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30);

    document.getElementById('startDate').valueAsDate = startDate;
    document.getElementById('endDate').valueAsDate = endDate;
    document.getElementById('itemFilter').value = 'all';
    document.getElementById('changeTypeFilter').value = 'all';

    currentSort = { column: 'changeDate', order: 'desc' };
    document.querySelectorAll('.sort-indicator').forEach(ind => { ind.textContent = ''; });
    document.querySelector('th[data-column="changeDate"] .sort-indicator').textContent = '\u25BC';

    loadHistoryData();
}

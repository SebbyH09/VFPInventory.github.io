// History Page JavaScript

let currentSort = { column: 'changeDate', order: 'desc' };
let historyData = [];

// Initialize page on load
document.addEventListener('DOMContentLoaded', () => {
    initializePage();
});

async function initializePage() {
    // Set default dates (last 30 days)
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30);

    document.getElementById('startDate').valueAsDate = startDate;
    document.getElementById('endDate').valueAsDate = endDate;

    // Load items for filter dropdown
    await loadItems();

    // Load initial history data
    await loadHistoryData();

    // Set up event listeners
    setupEventListeners();
}

function setupEventListeners() {
    // Filter buttons
    document.getElementById('applyFilters').addEventListener('click', loadHistoryData);
    document.getElementById('resetFilters').addEventListener('click', resetFilters);
    document.getElementById('showSummary').addEventListener('click', toggleSummary);

    // Sortable column headers
    document.querySelectorAll('th.sortable').forEach(header => {
        header.addEventListener('click', () => {
            const column = header.dataset.column;
            handleSort(column);
        });
    });
}

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
    const tableBody = document.getElementById('historyTableBody');
    const noDataMessage = document.getElementById('noDataMessage');

    // Show loading
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

        if (result.success) {
            historyData = result.data;
            displayHistoryData(result.data);
        } else {
            throw new Error(result.error || 'Failed to load history data');
        }
    } catch (error) {
        console.error('Error loading history data:', error);
        tableBody.innerHTML = `<tr><td colspan="7" class="loading-message">Error loading data: ${error.message}</td></tr>`;
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
        const date = new Date(record.changeDate).toLocaleString();
        const changeType = formatChangeType(record.changeType);
        const prevQty = record.previousQuantity !== undefined ? record.previousQuantity : '-';
        const newQty = record.newQuantity !== undefined ? record.newQuantity : '-';
        const qtyChange = formatQuantityChange(record.quantityChange);
        const notes = record.notes || '-';

        return `
            <tr>
                <td>${date}</td>
                <td>${record.itemName}</td>
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
        'item_used': 'Item Used',
        'order_placed': 'Order Placed',
        'cycle_count': 'Cycle Count',
        'item_created': 'Item Created',
        'item_updated': 'Item Updated',
        'item_deleted': 'Item Deleted'
    };

    const displayText = typeMap[type] || type;
    return `<span class="change-type-badge change-type-${type}">${displayText}</span>`;
}

function formatQuantityChange(change) {
    if (change === undefined || change === null) {
        return '-';
    }

    const absChange = Math.abs(change);
    const sign = change > 0 ? '+' : '';
    const className = change > 0 ? 'qty-increase' : change < 0 ? 'qty-decrease' : 'qty-neutral';

    return `<span class="${className}">${sign}${change}</span>`;
}

function handleSort(column) {
    // Toggle sort order if clicking the same column
    if (currentSort.column === column) {
        currentSort.order = currentSort.order === 'asc' ? 'desc' : 'asc';
    } else {
        currentSort.column = column;
        currentSort.order = 'desc';
    }

    // Update sort indicators
    document.querySelectorAll('.sort-indicator').forEach(indicator => {
        indicator.textContent = '';
    });

    const activeHeader = document.querySelector(`th[data-column="${column}"]`);
    const indicator = activeHeader.querySelector('.sort-indicator');
    indicator.textContent = currentSort.order === 'asc' ? '▲' : '▼';

    // Reload data with new sort
    loadHistoryData();
}

function resetFilters() {
    // Reset to last 30 days
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30);

    document.getElementById('startDate').valueAsDate = startDate;
    document.getElementById('endDate').valueAsDate = endDate;
    document.getElementById('itemFilter').value = 'all';
    document.getElementById('changeTypeFilter').value = 'all';

    // Reset sort
    currentSort = { column: 'changeDate', order: 'desc' };

    // Update sort indicators
    document.querySelectorAll('.sort-indicator').forEach(indicator => {
        indicator.textContent = '';
    });
    document.querySelector('th[data-column="changeDate"] .sort-indicator').textContent = '▼';

    // Hide summary
    document.getElementById('summarySection').classList.add('hidden');

    // Reload data
    loadHistoryData();
}

async function toggleSummary() {
    const summarySection = document.getElementById('summarySection');
    const summaryContent = document.getElementById('summaryContent');

    if (!summarySection.classList.contains('hidden')) {
        summarySection.classList.add('hidden');
        return;
    }

    // Show loading
    summaryContent.innerHTML = '<p>Loading summary...</p>';
    summarySection.classList.remove('hidden');

    try {
        const params = new URLSearchParams({
            startDate: document.getElementById('startDate').value,
            endDate: document.getElementById('endDate').value
        });

        const response = await fetch(`/history/summary?${params}`);
        const result = await response.json();

        if (result.success) {
            displaySummary(result.data, result.period);
        } else {
            throw new Error(result.error || 'Failed to load summary');
        }
    } catch (error) {
        console.error('Error loading summary:', error);
        summaryContent.innerHTML = `<p style="color: red;">Error loading summary: ${error.message}</p>`;
    }
}

function displaySummary(data, period) {
    const summaryContent = document.getElementById('summaryContent');

    if (!data || data.length === 0) {
        summaryContent.innerHTML = `
            <p>No quantity changes found for the period ${period.start} to ${period.end}.</p>
        `;
        return;
    }

    const tableHTML = `
        <p><strong>Period:</strong> ${period.start} to ${period.end}</p>
        <table class="summary-table">
            <thead>
                <tr>
                    <th>Item</th>
                    <th>Quantity Used</th>
                    <th>Quantity Added</th>
                    <th>Net Change</th>
                    <th>Number of Changes</th>
                </tr>
            </thead>
            <tbody>
                ${data.map(item => {
                    const netChangeClass = item.netChange > 0 ? 'positive' : item.netChange < 0 ? 'negative' : '';
                    const netChangeSign = item.netChange > 0 ? '+' : '';

                    return `
                        <tr>
                            <td>${item.itemName}</td>
                            <td class="qty-used">${item.totalUsed}</td>
                            <td class="qty-added">+${item.totalAdded}</td>
                            <td class="net-change ${netChangeClass}">${netChangeSign}${item.netChange}</td>
                            <td>${item.changeCount}</td>
                        </tr>
                    `;
                }).join('')}
            </tbody>
        </table>
    `;

    summaryContent.innerHTML = tableHTML;
}

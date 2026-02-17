// History Page JavaScript

let currentSort = { column: 'changeDate', order: 'desc' };
let historyData = [];

// Helper function to escape HTML and prevent XSS
function escapeHtml(text) {
    if (text === null || text === undefined) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

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
    document.getElementById('generateReport').addEventListener('click', generateReport);
    document.getElementById('closeReport').addEventListener('click', closeReport);

    // Report tabs
    document.querySelectorAll('.report-tab').forEach(tab => {
        tab.addEventListener('click', () => switchReportTab(tab));
    });

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

    // Hide summary and report
    document.getElementById('summarySection').classList.add('hidden');
    document.getElementById('reportSection').classList.add('hidden');

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
        const errorMsg = document.createElement('p');
        errorMsg.style.color = 'red';
        errorMsg.textContent = 'Error loading summary. Please try again later.';
        summaryContent.innerHTML = '';
        summaryContent.appendChild(errorMsg);
    }
}

function displaySummary(data, period) {
    const summaryContent = document.getElementById('summaryContent');

    if (!data || data.length === 0) {
        summaryContent.innerHTML = `
            <p>No quantity changes found for the period ${escapeHtml(period.start)} to ${escapeHtml(period.end)}.</p>
        `;
        return;
    }

    const tableHTML = `
        <p><strong>Period:</strong> ${escapeHtml(period.start)} to ${escapeHtml(period.end)}</p>
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
                            <td>${escapeHtml(item.itemName)}</td>
                            <td class="qty-used">${escapeHtml(item.totalUsed)}</td>
                            <td class="qty-added">+${escapeHtml(item.totalAdded)}</td>
                            <td class="net-change ${netChangeClass}">${netChangeSign}${escapeHtml(item.netChange)}</td>
                            <td>${escapeHtml(item.changeCount)}</td>
                        </tr>
                    `;
                }).join('')}
            </tbody>
        </table>
    `;

    summaryContent.innerHTML = tableHTML;
}

// =====================
// Report Functions
// =====================

function formatCurrency(value) {
    return '$' + Number(value || 0).toFixed(2);
}

function switchReportTab(tab) {
    document.querySelectorAll('.report-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.report-tab-content').forEach(c => c.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById(tab.dataset.tab).classList.add('active');
}

function closeReport() {
    document.getElementById('reportSection').classList.add('hidden');
}

async function generateReport() {
    const reportSection = document.getElementById('reportSection');
    const reportCards = document.getElementById('reportCards');
    const reportPeriod = document.getElementById('reportPeriod');

    // Show loading state
    reportSection.classList.remove('hidden');
    reportCards.innerHTML = '<p class="report-loading">Generating report...</p>';
    reportPeriod.innerHTML = '';
    document.querySelectorAll('.report-tab-content').forEach(c => c.innerHTML = '');

    // Reset to first tab
    document.querySelectorAll('.report-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.report-tab-content').forEach(c => c.classList.remove('active'));
    document.querySelector('.report-tab[data-tab="spendTab"]').classList.add('active');
    document.getElementById('spendTab').classList.add('active');

    try {
        const params = new URLSearchParams({
            startDate: document.getElementById('startDate').value,
            endDate: document.getElementById('endDate').value,
            itemId: document.getElementById('itemFilter').value
        });

        const response = await fetch(`/history/report?${params}`);
        const result = await response.json();

        if (result.success) {
            renderReport(result);
        } else {
            throw new Error(result.error || 'Failed to generate report');
        }
    } catch (error) {
        console.error('Error generating report:', error);
        reportCards.innerHTML = '';
        const errorMsg = document.createElement('p');
        errorMsg.style.color = '#dc3545';
        errorMsg.textContent = 'Error generating report. Please try again.';
        reportCards.appendChild(errorMsg);
    }
}

function renderReport(data) {
    const { period, totals, spendByItem, activityByType, activityByUser, topConsumed, dailyActivity } = data;

    // Period header
    document.getElementById('reportPeriod').innerHTML =
        `<strong>Report Period:</strong> ${escapeHtml(period.start)} to ${escapeHtml(period.end)}`;

    // Summary cards
    renderReportCards(totals);

    // Tab contents
    renderSpendByItem(spendByItem);
    renderTopConsumed(topConsumed);
    renderActivityByType(activityByType);
    renderUserActivity(activityByUser);
    renderDailyTrend(dailyActivity);
}

function renderReportCards(totals) {
    const cards = document.getElementById('reportCards');
    cards.innerHTML = `
        <div class="report-card">
            <div class="report-card-label">Total Consumption Spend</div>
            <div class="report-card-value spend">${formatCurrency(totals.totalSpend)}</div>
        </div>
        <div class="report-card">
            <div class="report-card-label">Total Addition Spend</div>
            <div class="report-card-value added">${formatCurrency(totals.totalSpendOnAdditions)}</div>
        </div>
        <div class="report-card">
            <div class="report-card-label">Total Items Consumed</div>
            <div class="report-card-value consumed">${escapeHtml(totals.totalConsumed)}</div>
        </div>
        <div class="report-card">
            <div class="report-card-label">Total Items Added</div>
            <div class="report-card-value added">${escapeHtml(totals.totalAdded)}</div>
        </div>
        <div class="report-card">
            <div class="report-card-label">Total Events</div>
            <div class="report-card-value">${escapeHtml(totals.totalEvents)}</div>
        </div>
        <div class="report-card">
            <div class="report-card-label">Unique Items</div>
            <div class="report-card-value">${escapeHtml(totals.uniqueItems)}</div>
        </div>
    `;
}

function renderSpendByItem(items) {
    const container = document.getElementById('spendTab');
    if (!items || items.length === 0) {
        container.innerHTML = '<p class="report-empty">No spend data for this period.</p>';
        return;
    }
    container.innerHTML = `
        <table class="report-table">
            <thead>
                <tr>
                    <th>Item</th>
                    <th>Qty Consumed</th>
                    <th>Qty Added</th>
                    <th>Net Change</th>
                    <th>Consumption Spend</th>
                    <th>Addition Spend</th>
                    <th>Avg Cost/Unit</th>
                    <th>Events</th>
                </tr>
            </thead>
            <tbody>
                ${items.map(item => {
                    const netClass = item.netChange > 0 ? 'positive' : item.netChange < 0 ? 'negative' : '';
                    const netSign = item.netChange > 0 ? '+' : '';
                    return `
                        <tr>
                            <td>${escapeHtml(item.itemName)}</td>
                            <td class="qty-used">${escapeHtml(item.totalConsumed)}</td>
                            <td class="qty-added">+${escapeHtml(item.totalAdded)}</td>
                            <td class="net-change ${netClass}">${netSign}${escapeHtml(item.netChange)}</td>
                            <td class="spend-col">${formatCurrency(item.spendOnConsumption)}</td>
                            <td class="spend-col">${formatCurrency(item.spendOnAdditions)}</td>
                            <td>${formatCurrency(item.avgCostPerUnit)}</td>
                            <td>${escapeHtml(item.changeCount)}</td>
                        </tr>
                    `;
                }).join('')}
            </tbody>
            <tfoot>
                <tr>
                    <td><strong>Totals</strong></td>
                    <td class="qty-used"><strong>${items.reduce((s, i) => s + i.totalConsumed, 0)}</strong></td>
                    <td class="qty-added"><strong>+${items.reduce((s, i) => s + i.totalAdded, 0)}</strong></td>
                    <td><strong>${items.reduce((s, i) => s + i.netChange, 0)}</strong></td>
                    <td class="spend-col"><strong>${formatCurrency(items.reduce((s, i) => s + i.spendOnConsumption, 0))}</strong></td>
                    <td class="spend-col"><strong>${formatCurrency(items.reduce((s, i) => s + i.spendOnAdditions, 0))}</strong></td>
                    <td></td>
                    <td><strong>${items.reduce((s, i) => s + i.changeCount, 0)}</strong></td>
                </tr>
            </tfoot>
        </table>
    `;
}

function renderTopConsumed(items) {
    const container = document.getElementById('topConsumedTab');
    if (!items || items.length === 0) {
        container.innerHTML = '<p class="report-empty">No consumption data for this period.</p>';
        return;
    }

    const maxConsumed = items[0].totalConsumed;
    container.innerHTML = `
        <h4>Top 10 Most Consumed Items</h4>
        <div class="top-consumed-list">
            ${items.map(item => {
                const pct = maxConsumed > 0 ? (item.totalConsumed / maxConsumed * 100) : 0;
                return `
                    <div class="top-consumed-item">
                        <div class="top-consumed-info">
                            <span class="top-consumed-name">${escapeHtml(item.itemName)}</span>
                            <span class="top-consumed-stats">
                                ${escapeHtml(item.totalConsumed)} units &middot; ${formatCurrency(item.totalSpend)} &middot; ${escapeHtml(item.eventCount)} events
                            </span>
                        </div>
                        <div class="top-consumed-bar-bg">
                            <div class="top-consumed-bar" style="width: ${pct}%"></div>
                        </div>
                    </div>
                `;
            }).join('')}
        </div>
    `;
}

function renderActivityByType(types) {
    const container = document.getElementById('activityTypeTab');
    if (!types || types.length === 0) {
        container.innerHTML = '<p class="report-empty">No activity data for this period.</p>';
        return;
    }

    const typeLabels = {
        'quantity_change': 'Quantity Change',
        'quantity_consumed': 'Quantity Consumed',
        'item_used': 'Item Used',
        'order_placed': 'Order Placed',
        'cycle_count': 'Cycle Count',
        'item_created': 'Item Created',
        'item_updated': 'Item Updated',
        'item_deleted': 'Item Deleted'
    };

    const total = types.reduce((s, t) => s + t.count, 0);

    container.innerHTML = `
        <table class="report-table">
            <thead>
                <tr>
                    <th>Change Type</th>
                    <th>Count</th>
                    <th>% of Total</th>
                    <th>Distribution</th>
                </tr>
            </thead>
            <tbody>
                ${types.map(t => {
                    const pct = total > 0 ? (t.count / total * 100) : 0;
                    const label = typeLabels[t._id] || t._id;
                    return `
                        <tr>
                            <td><span class="change-type-badge change-type-${escapeHtml(t._id)}">${escapeHtml(label)}</span></td>
                            <td>${escapeHtml(t.count)}</td>
                            <td>${pct.toFixed(1)}%</td>
                            <td>
                                <div class="activity-bar-bg">
                                    <div class="activity-bar" style="width: ${pct}%"></div>
                                </div>
                            </td>
                        </tr>
                    `;
                }).join('')}
            </tbody>
        </table>
    `;
}

function renderUserActivity(users) {
    const container = document.getElementById('userActivityTab');
    if (!users || users.length === 0) {
        container.innerHTML = '<p class="report-empty">No user activity data for this period.</p>';
        return;
    }

    container.innerHTML = `
        <table class="report-table">
            <thead>
                <tr>
                    <th>User</th>
                    <th>Actions</th>
                    <th>Qty Consumed</th>
                    <th>Qty Added</th>
                </tr>
            </thead>
            <tbody>
                ${users.map(u => `
                    <tr>
                        <td>${escapeHtml(u._id || 'Unknown')}</td>
                        <td>${escapeHtml(u.actionCount)}</td>
                        <td class="qty-used">${escapeHtml(u.consumedQty)}</td>
                        <td class="qty-added">+${escapeHtml(u.addedQty)}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
}

function renderDailyTrend(days) {
    const container = document.getElementById('dailyTrendTab');
    if (!days || days.length === 0) {
        container.innerHTML = '<p class="report-empty">No daily trend data for this period.</p>';
        return;
    }

    const maxEvents = Math.max(...days.map(d => d.eventCount));

    container.innerHTML = `
        <table class="report-table">
            <thead>
                <tr>
                    <th>Date</th>
                    <th>Events</th>
                    <th>Consumed</th>
                    <th>Added</th>
                    <th>Daily Spend</th>
                    <th>Activity</th>
                </tr>
            </thead>
            <tbody>
                ${days.map(d => {
                    const pct = maxEvents > 0 ? (d.eventCount / maxEvents * 100) : 0;
                    return `
                        <tr>
                            <td>${escapeHtml(d._id)}</td>
                            <td>${escapeHtml(d.eventCount)}</td>
                            <td class="qty-used">${escapeHtml(d.consumed)}</td>
                            <td class="qty-added">+${escapeHtml(d.added)}</td>
                            <td class="spend-col">${formatCurrency(d.dailySpend)}</td>
                            <td>
                                <div class="activity-bar-bg">
                                    <div class="activity-bar trend-bar" style="width: ${pct}%"></div>
                                </div>
                            </td>
                        </tr>
                    `;
                }).join('')}
            </tbody>
            <tfoot>
                <tr>
                    <td><strong>Totals</strong></td>
                    <td><strong>${days.reduce((s, d) => s + d.eventCount, 0)}</strong></td>
                    <td class="qty-used"><strong>${days.reduce((s, d) => s + d.consumed, 0)}</strong></td>
                    <td class="qty-added"><strong>+${days.reduce((s, d) => s + d.added, 0)}</strong></td>
                    <td class="spend-col"><strong>${formatCurrency(days.reduce((s, d) => s + d.dailySpend, 0))}</strong></td>
                    <td></td>
                </tr>
            </tfoot>
        </table>
    `;
}

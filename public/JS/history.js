// ================================================
// VFP Inventory - History Page
// ================================================

// --- State ---
let currentSort = { column: 'changeDate', order: 'desc' };
let historyData = [];
let analyticsData = null;
let chartInstances = [];

// --- Constants ---
const CHART_COLORS = [
    '#007bff', '#28a745', '#dc3545', '#ffc107', '#17a2b8',
    '#6f42c1', '#fd7e14', '#20c997', '#e83e8c', '#6c757d',
    '#0dcaf0', '#198754', '#ab2e3c', '#cc9a06', '#0d6efd'
];

// --- Helpers ---
function escapeHtml(text) {
    if (text === null || text === undefined) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatCurrency(value) {
    return '$' + Number(value || 0).toFixed(2);
}

function formatPct(value) {
    const v = Number(value || 0);
    const sign = v > 0 ? '+' : '';
    return sign + v.toFixed(1) + '%';
}

function formatNumber(value) {
    return Number(value || 0).toLocaleString();
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
    // Filter buttons
    document.getElementById('applyFilters').addEventListener('click', loadHistoryData);
    document.getElementById('resetFilters').addEventListener('click', resetFilters);
    // Sortable column headers
    document.querySelectorAll('th.sortable').forEach(header => {
        header.addEventListener('click', () => handleSort(header.dataset.column));
    });

    // Analytics panel
    document.getElementById('openAnalytics').addEventListener('click', toggleAnalyticsPanel);
    document.getElementById('selectAllMetrics').addEventListener('click', () => toggleAllMetrics(true));
    document.getElementById('deselectAllMetrics').addEventListener('click', () => toggleAllMetrics(false));
    document.getElementById('generateAnalytics').addEventListener('click', generateAnalytics);
    document.getElementById('closeAnalyticsModal').addEventListener('click', closeAnalyticsModal);
    document.getElementById('exportExcel').addEventListener('click', exportToExcel);

    // Show budget input when budget metric is toggled
    const budgetCheckbox = document.querySelector('input[value="budgetVsActual"]');
    if (budgetCheckbox) {
        budgetCheckbox.addEventListener('change', () => {
            document.getElementById('budgetInputGroup').classList.toggle('hidden', !budgetCheckbox.checked);
        });
    }

    // Close modal on backdrop click
    document.getElementById('analyticsModal').addEventListener('click', (e) => {
        if (e.target === e.currentTarget) closeAnalyticsModal();
    });

    // Close modal on Escape
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeAnalyticsModal();
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

// ================================================
// ANALYTICS DASHBOARD
// ================================================
function toggleAnalyticsPanel() {
    const panel = document.getElementById('analyticsPanel');
    panel.classList.toggle('hidden');
}

function toggleAllMetrics(checked) {
    document.querySelectorAll('input[name="metric"]').forEach(cb => { cb.checked = checked; });
    const budgetCb = document.querySelector('input[value="budgetVsActual"]');
    document.getElementById('budgetInputGroup').classList.toggle('hidden', !budgetCb.checked);
}

function getSelectedMetrics() {
    return Array.from(document.querySelectorAll('input[name="metric"]:checked')).map(cb => cb.value);
}

async function generateAnalytics() {
    const selected = getSelectedMetrics();
    if (selected.length === 0) {
        alert('Please select at least one metric.');
        return;
    }

    // Show modal with loading state
    const modal = document.getElementById('analyticsModal');
    const body = document.getElementById('analyticsModalBody');
    modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    body.innerHTML = '<div class="analytics-loading">Loading analytics data...</div>';

    try {
        const response = await fetch('/history/analytics');
        const result = await response.json();

        if (!result.success) throw new Error(result.error || 'Failed to load analytics');

        analyticsData = result;
        renderAnalyticsDashboard(selected, result);
    } catch (error) {
        console.error('Analytics error:', error);
        body.innerHTML = '<div class="analytics-loading" style="color: #dc3545;">Error loading analytics. Please try again.</div>';
    }
}

function closeAnalyticsModal() {
    document.getElementById('analyticsModal').classList.add('hidden');
    document.body.style.overflow = '';
    destroyAllCharts();
}

function destroyAllCharts() {
    chartInstances.forEach(chart => {
        if (chart && typeof chart.destroy === 'function') chart.destroy();
    });
    chartInstances = [];
}

function createChart(canvas, config) {
    const chart = new Chart(canvas, config);
    chartInstances.push(chart);
    return chart;
}

// ================================================
// RENDER ANALYTICS DASHBOARD
// ================================================
function renderAnalyticsDashboard(selected, data) {
    destroyAllCharts();
    const body = document.getElementById('analyticsModalBody');
    body.innerHTML = '';

    // Summary cards section
    const summaryCards = [];

    // Render each selected metric
    selected.forEach(metric => {
        switch (metric) {
            case 'monthlySpend': summaryCards.push(renderMonthlySpend(data)); break;
            case 'totalItems': summaryCards.push(renderTotalItems(data)); break;
            case 'totalInventoryValue': summaryCards.push(renderTotalInventoryValue(data)); break;
            case 'lowStockAlerts': summaryCards.push(renderLowStockAlerts(data)); break;
            case 'stockOutCount': summaryCards.push(renderStockOutCount(data)); break;
            case 'belowReorderPoint': summaryCards.push(renderBelowReorderPoint(data)); break;
            case 'turnoverRate': summaryCards.push(renderTurnoverRate(data)); break;
            case 'cycleCountCompliance': summaryCards.push(renderCycleCountCompliance(data)); break;
            case 'cycleCountsCompleted': summaryCards.push(renderCycleCountsCompleted(data)); break;
            case 'accuracyRate': summaryCards.push(renderAccuracyRate(data)); break;
        }
    });

    // Add summary cards grid if any
    if (summaryCards.length > 0) {
        const cardsSection = document.createElement('div');
        cardsSection.className = 'analytics-cards-grid';
        summaryCards.forEach(card => { if (card) cardsSection.appendChild(card); });
        body.appendChild(cardsSection);
    }

    // Chart metrics
    const chartMetrics = ['spendByCategory', 'spendByVendor', 'costPerUnit', 'budgetVsActual',
        'spendTrend', 'topSpendItems', 'topConsumed', 'consumptionByUser',
        'usageTrends', 'daysOfSupply', 'quantityDeficit'];

    const chartsGrid = document.createElement('div');
    chartsGrid.className = 'analytics-charts-grid';

    selected.forEach(metric => {
        if (chartMetrics.includes(metric)) {
            const tile = createChartTile(metric, data);
            if (tile) chartsGrid.appendChild(tile);
        }
    });

    if (chartsGrid.children.length > 0) body.appendChild(chartsGrid);

    // Table metrics
    const tableMetrics = ['reorderForecast', 'consumptionRate', 'avgReorderTime'];

    selected.forEach(metric => {
        if (tableMetrics.includes(metric)) {
            const tile = createTableTile(metric, data);
            if (tile) body.appendChild(tile);
        }
    });
}

// ================================================
// SUMMARY CARD RENDERERS
// ================================================
function makeSummaryCard(title, value, subtitle, colorClass) {
    const card = document.createElement('div');
    card.className = 'analytics-summary-card';
    card.innerHTML = `
        <div class="analytics-card-label">${escapeHtml(title)}</div>
        <div class="analytics-card-value ${colorClass || ''}">${value}</div>
        ${subtitle ? `<div class="analytics-card-subtitle">${subtitle}</div>` : ''}
    `;
    return card;
}

function renderMonthlySpend(data) {
    const s = data.spending;
    const change = s.monthlySpendChange;
    const changeClass = change > 0 ? 'change-up' : change < 0 ? 'change-down' : '';
    const subtitle = `<span class="${changeClass}">${formatPct(change)} vs last month</span> (Last: ${formatCurrency(s.lastMonthSpend)})`;
    return makeSummaryCard('Monthly Spend', formatCurrency(s.currentMonthSpend), subtitle, 'spend');
}

function renderTotalItems(data) {
    const inv = data.inventory;
    const wow = inv.itemCountWoWChange;
    const wowStr = wow > 0 ? `+${wow}` : wow < 0 ? `${wow}` : '0';
    const changeClass = wow > 0 ? 'change-up' : wow < 0 ? 'change-down' : '';
    return makeSummaryCard('Total Items', formatNumber(inv.totalItems),
        `<span class="${changeClass}">${wowStr} this week</span>`, '');
}

function renderTotalInventoryValue(data) {
    return makeSummaryCard('Total Inventory Value',
        formatCurrency(data.inventory.totalInventoryValue), null, 'value');
}

function renderLowStockAlerts(data) {
    const count = data.inventory.lowStockCount;
    return makeSummaryCard('Low Stock Alerts', formatNumber(count),
        count > 0 ? `${count} item${count !== 1 ? 's' : ''} at or below minimum` : 'All items adequately stocked',
        count > 0 ? 'warning' : 'good');
}

function renderStockOutCount(data) {
    const count = data.inventory.stockOutCount;
    return makeSummaryCard('Stock-Out Count', formatNumber(count),
        count > 0 ? `${count} item${count !== 1 ? 's' : ''} at zero quantity` : 'No stock-outs',
        count > 0 ? 'danger' : 'good');
}

function renderBelowReorderPoint(data) {
    const count = data.inventory.belowReorderCount;
    return makeSummaryCard('Below Reorder Point', formatNumber(count),
        count > 0 ? `${count} item${count !== 1 ? 's' : ''} need reordering` : 'All items above reorder point',
        count > 0 ? 'warning' : 'good');
}

function renderTurnoverRate(data) {
    return makeSummaryCard('Inventory Turnover Rate',
        data.inventory.turnoverRate + 'x',
        'Annualized (based on last 90 days)', '');
}

function renderCycleCountCompliance(data) {
    const cc = data.cycleCounts;
    return makeSummaryCard('Cycle Count Compliance',
        formatNumber(cc.overdueCount) + ' overdue',
        cc.overdueCount > 0 ? `${cc.overdueCount} item${cc.overdueCount !== 1 ? 's' : ''} past due` : 'All cycle counts current',
        cc.overdueCount > 0 ? 'warning' : 'good');
}

function renderCycleCountsCompleted(data) {
    const cc = data.cycleCounts;
    return makeSummaryCard('Cycle Counts Completed',
        formatNumber(cc.completedThisMonth),
        `This month: ${cc.completedThisMonth} | This week: ${cc.completedThisWeek}`, '');
}

function renderAccuracyRate(data) {
    const rate = data.cycleCounts.accuracyRate;
    return makeSummaryCard('Inventory Accuracy Rate',
        rate + '%',
        `Based on ${data.cycleCounts.totalInPeriod} cycle counts (90 days)`,
        rate >= 95 ? 'good' : rate >= 80 ? 'warning' : 'danger');
}

// ================================================
// CHART TILE RENDERERS
// ================================================
function createChartTile(metric, data) {
    const tile = document.createElement('div');
    tile.className = 'analytics-chart-tile';

    const renderers = {
        spendByCategory: () => renderSpendByCategoryChart(tile, data),
        spendByVendor: () => renderSpendByVendorChart(tile, data),
        costPerUnit: () => renderCostPerUnitChart(tile, data),
        budgetVsActual: () => renderBudgetVsActualChart(tile, data),
        spendTrend: () => renderSpendTrendChart(tile, data),
        topSpendItems: () => renderTopSpendItemsChart(tile, data),
        topConsumed: () => renderTopConsumedChart(tile, data),
        consumptionByUser: () => renderConsumptionByUserChart(tile, data),
        usageTrends: () => renderUsageTrendsChart(tile, data),
        daysOfSupply: () => renderDaysOfSupplyChart(tile, data),
        quantityDeficit: () => renderQuantityDeficitChart(tile, data),
    };

    const renderer = renderers[metric];
    if (renderer) {
        renderer();
        return tile;
    }
    return null;
}

function makeChartCanvas(tile, title) {
    tile.innerHTML = `<h4 class="chart-tile-title">${escapeHtml(title)}</h4><div class="chart-container"><canvas></canvas></div>`;
    return tile.querySelector('canvas');
}

function renderSpendByCategoryChart(tile, data) {
    const items = data.spending.spendByCategory;
    const canvas = makeChartCanvas(tile, 'Spend by Category (Last 90 Days)');
    if (!items.length) { tile.querySelector('.chart-container').innerHTML = '<p class="no-chart-data">No category spend data available.</p>'; return; }

    createChart(canvas, {
        type: 'doughnut',
        data: {
            labels: items.map(i => i.category),
            datasets: [{
                data: items.map(i => i.spend),
                backgroundColor: CHART_COLORS.slice(0, items.length),
                borderWidth: 2,
                borderColor: '#fff'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'right', labels: { boxWidth: 12, padding: 10 } },
                tooltip: { callbacks: { label: ctx => `${ctx.label}: ${formatCurrency(ctx.raw)}` } }
            }
        }
    });
}

function renderSpendByVendorChart(tile, data) {
    const items = data.spending.spendByVendor.slice(0, 10);
    const canvas = makeChartCanvas(tile, 'Spend by Vendor/Brand (Last 90 Days)');
    if (!items.length) { tile.querySelector('.chart-container').innerHTML = '<p class="no-chart-data">No vendor spend data available.</p>'; return; }

    createChart(canvas, {
        type: 'bar',
        data: {
            labels: items.map(i => i.vendor),
            datasets: [{
                label: 'Spend',
                data: items.map(i => i.spend),
                backgroundColor: CHART_COLORS.slice(0, items.length),
                borderRadius: 4
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: { callbacks: { label: ctx => formatCurrency(ctx.raw) } }
            },
            scales: {
                x: { ticks: { callback: v => '$' + v } }
            }
        }
    });
}

function renderCostPerUnitChart(tile, data) {
    const items = data.spending.costPerUnitTrend;
    const canvas = makeChartCanvas(tile, 'Average Cost per Unit Over Time');
    if (!items.length) { tile.querySelector('.chart-container').innerHTML = '<p class="no-chart-data">No cost per unit data available.</p>'; return; }

    createChart(canvas, {
        type: 'line',
        data: {
            labels: items.map(i => i.month),
            datasets: [{
                label: 'Avg Cost/Unit',
                data: items.map(i => i.avgCost),
                borderColor: '#007bff',
                backgroundColor: 'rgba(0, 123, 255, 0.1)',
                fill: true,
                tension: 0.3,
                pointRadius: 4,
                pointHoverRadius: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: { callbacks: { label: ctx => formatCurrency(ctx.raw) } }
            },
            scales: {
                y: { ticks: { callback: v => '$' + v } }
            }
        }
    });
}

function renderBudgetVsActualChart(tile, data) {
    const budget = parseFloat(document.getElementById('monthlyBudget').value) || 0;
    const actual = data.spending.currentMonthSpend;
    const canvas = makeChartCanvas(tile, 'Budget vs. Actual (Current Month)');

    if (budget <= 0) {
        tile.querySelector('.chart-container').innerHTML = '<p class="no-chart-data">Set a monthly budget above to see this chart.</p>';
        return;
    }

    const remaining = Math.max(0, budget - actual);
    const over = Math.max(0, actual - budget);
    const pctUsed = ((actual / budget) * 100).toFixed(1);

    createChart(canvas, {
        type: 'bar',
        data: {
            labels: ['Budget', 'Actual'],
            datasets: [{
                label: 'Amount',
                data: [budget, actual],
                backgroundColor: [
                    '#17a2b8',
                    actual > budget ? '#dc3545' : '#28a745'
                ],
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: { callbacks: { label: ctx => formatCurrency(ctx.raw) } },
                title: {
                    display: true,
                    text: `${pctUsed}% of budget used` + (over > 0 ? ` (${formatCurrency(over)} over)` : ` (${formatCurrency(remaining)} remaining)`),
                    font: { size: 13 }
                }
            },
            scales: {
                y: { ticks: { callback: v => '$' + v }, beginAtZero: true }
            }
        }
    });
}

function renderSpendTrendChart(tile, data) {
    const items = data.spending.spendTrend;
    const canvas = makeChartCanvas(tile, 'Spend Trend Over Time (Weekly)');
    if (!items.length) { tile.querySelector('.chart-container').innerHTML = '<p class="no-chart-data">No spend trend data available.</p>'; return; }

    createChart(canvas, {
        type: 'line',
        data: {
            labels: items.map(i => i.week),
            datasets: [{
                label: 'Weekly Spend',
                data: items.map(i => i.spend),
                borderColor: '#dc3545',
                backgroundColor: 'rgba(220, 53, 69, 0.1)',
                fill: true,
                tension: 0.3,
                pointRadius: 4,
                pointHoverRadius: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: { callbacks: { label: ctx => formatCurrency(ctx.raw) } }
            },
            scales: {
                y: { ticks: { callback: v => '$' + v }, beginAtZero: true },
                x: { ticks: { maxRotation: 45 } }
            }
        }
    });
}

function renderTopSpendItemsChart(tile, data) {
    const items = data.spending.topSpendItems.slice(0, 10);
    const canvas = makeChartCanvas(tile, 'Top Spend Items (Last 90 Days)');
    if (!items.length) { tile.querySelector('.chart-container').innerHTML = '<p class="no-chart-data">No spend item data available.</p>'; return; }

    createChart(canvas, {
        type: 'bar',
        data: {
            labels: items.map(i => i.item),
            datasets: [{
                label: 'Total Spend',
                data: items.map(i => i.spend),
                backgroundColor: CHART_COLORS.slice(0, items.length),
                borderRadius: 4
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: { callbacks: { label: ctx => formatCurrency(ctx.raw) } }
            },
            scales: {
                x: { ticks: { callback: v => '$' + v }, beginAtZero: true }
            }
        }
    });
}

function renderTopConsumedChart(tile, data) {
    const items = data.consumption.topConsumed.slice(0, 10);
    const canvas = makeChartCanvas(tile, 'Top Consumed Items (Last 90 Days)');
    if (!items.length) { tile.querySelector('.chart-container').innerHTML = '<p class="no-chart-data">No consumption data available.</p>'; return; }

    createChart(canvas, {
        type: 'bar',
        data: {
            labels: items.map(i => i.item),
            datasets: [{
                label: 'Units Consumed',
                data: items.map(i => i.totalConsumed),
                backgroundColor: '#dc3545',
                borderRadius: 4
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: { callbacks: { label: ctx => ctx.raw + ' units' } }
            },
            scales: {
                x: { beginAtZero: true }
            }
        }
    });
}

function renderConsumptionByUserChart(tile, data) {
    const users = data.consumption.byUser;
    const canvas = makeChartCanvas(tile, 'Consumption by User (Last 90 Days)');
    if (!users.length) { tile.querySelector('.chart-container').innerHTML = '<p class="no-chart-data">No user consumption data available.</p>'; return; }

    createChart(canvas, {
        type: 'doughnut',
        data: {
            labels: users.map(u => u._id || 'Unknown'),
            datasets: [{
                data: users.map(u => u.totalConsumed),
                backgroundColor: CHART_COLORS.slice(0, users.length),
                borderWidth: 2,
                borderColor: '#fff'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'right', labels: { boxWidth: 12, padding: 10 } },
                tooltip: { callbacks: { label: ctx => `${ctx.label}: ${ctx.raw} units (${formatCurrency(users[ctx.dataIndex].totalSpend)})` } }
            }
        }
    });
}

function renderUsageTrendsChart(tile, data) {
    const items = data.consumption.usageTrends;
    const canvas = makeChartCanvas(tile, 'Usage Trends (Weekly Consumption)');
    if (!items.length) { tile.querySelector('.chart-container').innerHTML = '<p class="no-chart-data">No usage trend data available.</p>'; return; }

    createChart(canvas, {
        type: 'line',
        data: {
            labels: items.map(i => i.week),
            datasets: [{
                label: 'Units Consumed',
                data: items.map(i => i.consumed),
                borderColor: '#6f42c1',
                backgroundColor: 'rgba(111, 66, 193, 0.1)',
                fill: true,
                tension: 0.3,
                pointRadius: 4,
                pointHoverRadius: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            },
            scales: {
                y: { beginAtZero: true },
                x: { ticks: { maxRotation: 45 } }
            }
        }
    });
}

function renderDaysOfSupplyChart(tile, data) {
    const items = data.inventory.daysOfSupply.slice(0, 15);
    const canvas = makeChartCanvas(tile, 'Days of Supply Remaining');
    if (!items.length) { tile.querySelector('.chart-container').innerHTML = '<p class="no-chart-data">No supply data available (consumption data needed).</p>'; return; }

    createChart(canvas, {
        type: 'bar',
        data: {
            labels: items.map(i => i.item),
            datasets: [{
                label: 'Days Remaining',
                data: items.map(i => i.daysRemaining),
                backgroundColor: items.map(i =>
                    i.daysRemaining <= 7 ? '#dc3545' :
                    i.daysRemaining <= 30 ? '#ffc107' : '#28a745'
                ),
                borderRadius: 4
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: { callbacks: { label: ctx => ctx.raw + ' days' } }
            },
            scales: {
                x: { beginAtZero: true, title: { display: true, text: 'Days' } }
            }
        }
    });
}

function renderQuantityDeficitChart(tile, data) {
    const items = data.inventory.quantityDeficits.slice(0, 15);
    const canvas = makeChartCanvas(tile, 'Quantity Deficit (Low Stock Items)');
    if (!items.length) { tile.querySelector('.chart-container').innerHTML = '<p class="no-chart-data">No quantity deficits - all items adequately stocked.</p>'; return; }

    createChart(canvas, {
        type: 'bar',
        data: {
            labels: items.map(i => i.item),
            datasets: [
                {
                    label: 'Current Qty',
                    data: items.map(i => i.current),
                    backgroundColor: '#dc3545',
                    borderRadius: 4
                },
                {
                    label: 'Minimum Qty',
                    data: items.map(i => i.minimum),
                    backgroundColor: '#6c757d',
                    borderRadius: 4
                }
            ]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'top' }
            },
            scales: {
                x: { beginAtZero: true, stacked: false }
            }
        }
    });
}

// ================================================
// TABLE TILE RENDERERS
// ================================================
function createTableTile(metric, data) {
    const tile = document.createElement('div');
    tile.className = 'analytics-table-tile';

    const renderers = {
        reorderForecast: () => renderReorderForecastTable(tile, data),
        consumptionRate: () => renderConsumptionRateTable(tile, data),
        avgReorderTime: () => renderAvgReorderTimeTable(tile, data),
    };

    const renderer = renderers[metric];
    if (renderer) {
        renderer();
        return tile;
    }
    return null;
}

function renderReorderForecastTable(tile, data) {
    const items = data.spending.reorderForecast;
    tile.innerHTML = `
        <h4 class="table-tile-title">Reorder Cost Forecast</h4>
        <div class="table-tile-summary">Total Estimated Reorder Cost: <strong>${formatCurrency(data.spending.totalReorderCost)}</strong></div>
        ${items.length === 0 ? '<p class="no-chart-data">No low-stock items requiring reorder.</p>' : `
        <div class="table-tile-scroll">
            <table class="analytics-table">
                <thead><tr>
                    <th>Item</th><th>Current</th><th>Min</th><th>Max</th>
                    <th>Deficit</th><th>Unit Cost</th><th>Est. Cost</th>
                    <th>Daily Use</th><th>Days Until Stockout</th>
                </tr></thead>
                <tbody>
                    ${items.map(i => `<tr>
                        <td>${escapeHtml(i.item)}</td>
                        <td>${i.currentQty}</td>
                        <td>${i.minQty}</td>
                        <td>${i.maxQty}</td>
                        <td class="qty-used">${i.deficit}</td>
                        <td>${formatCurrency(i.unitCost)}</td>
                        <td class="spend-col">${formatCurrency(i.estimatedCost)}</td>
                        <td>${i.dailyConsumption}</td>
                        <td class="${i.daysUntilStockout !== null && i.daysUntilStockout <= 7 ? 'qty-used' : ''}">${i.daysUntilStockout !== null ? i.daysUntilStockout + ' days' : 'N/A'}</td>
                    </tr>`).join('')}
                </tbody>
            </table>
        </div>`}
    `;
}

function renderConsumptionRateTable(tile, data) {
    const items = data.consumption.rates;
    tile.innerHTML = `
        <h4 class="table-tile-title">Consumption Rate (Last 90 Days)</h4>
        ${items.length === 0 ? '<p class="no-chart-data">No consumption data available.</p>' : `
        <div class="table-tile-scroll">
            <table class="analytics-table">
                <thead><tr>
                    <th>Item</th><th>Total Consumed</th><th>Per Day</th>
                    <th>Per Week</th><th>Per Month</th><th>Current Qty</th><th>Unit Cost</th><th>Total Cost</th>
                </tr></thead>
                <tbody>
                    ${items.map(i => `<tr>
                        <td>${escapeHtml(i.item)}</td>
                        <td>${i.totalConsumed}</td>
                        <td>${i.perDay}</td>
                        <td>${i.perWeek}</td>
                        <td>${i.perMonth}</td>
                        <td>${i.currentQty}</td>
                        <td>${formatCurrency(i.cost)}</td>
                        <td>${formatCurrency(i.totalCost)}</td>
                    </tr>`).join('')}
                </tbody>
            </table>
        </div>`}
    `;
}

function renderAvgReorderTimeTable(tile, data) {
    const items = data.cycleCounts.avgTimeBetweenReorders;
    tile.innerHTML = `
        <h4 class="table-tile-title">Average Time Between Reorders</h4>
        ${items.length === 0 ? '<p class="no-chart-data">Not enough order history (need 2+ orders per item).</p>' : `
        <div class="table-tile-scroll">
            <table class="analytics-table">
                <thead><tr>
                    <th>Item</th><th>Order Count</th><th>Avg Days Between Orders</th>
                </tr></thead>
                <tbody>
                    ${items.map(i => `<tr>
                        <td>${escapeHtml(i.item)}</td>
                        <td>${i.orderCount}</td>
                        <td>${i.avgDays} days</td>
                    </tr>`).join('')}
                </tbody>
            </table>
        </div>`}
    `;
}

// ================================================
// EXCEL EXPORT
// ================================================
function exportToExcel() {
    if (!analyticsData) {
        alert('No analytics data to export. Generate the dashboard first.');
        return;
    }

    const wb = XLSX.utils.book_new();
    const selected = getSelectedMetrics();
    const data = analyticsData;

    selected.forEach(metric => {
        switch (metric) {
            case 'monthlySpend': {
                const ws = XLSX.utils.aoa_to_sheet([
                    ['Monthly Spend Report'],
                    ['Metric', 'Value'],
                    ['Current Month Spend', data.spending.currentMonthSpend],
                    ['Last Month Spend', data.spending.lastMonthSpend],
                    ['Change (%)', data.spending.monthlySpendChange]
                ]);
                XLSX.utils.book_append_sheet(wb, ws, 'Monthly Spend');
                break;
            }
            case 'spendByCategory': {
                const rows = [['Category', 'Spend']];
                data.spending.spendByCategory.forEach(i => rows.push([i.category, i.spend]));
                XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Spend by Category');
                break;
            }
            case 'spendByVendor': {
                const rows = [['Vendor', 'Spend']];
                data.spending.spendByVendor.forEach(i => rows.push([i.vendor, i.spend]));
                XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Spend by Vendor');
                break;
            }
            case 'costPerUnit': {
                const rows = [['Month', 'Avg Cost Per Unit']];
                data.spending.costPerUnitTrend.forEach(i => rows.push([i.month, i.avgCost]));
                XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Cost Per Unit');
                break;
            }
            case 'budgetVsActual': {
                const budget = parseFloat(document.getElementById('monthlyBudget').value) || 0;
                const ws = XLSX.utils.aoa_to_sheet([
                    ['Budget vs Actual'],
                    ['Metric', 'Value'],
                    ['Monthly Budget', budget],
                    ['Actual Spend', data.spending.currentMonthSpend],
                    ['Difference', budget - data.spending.currentMonthSpend],
                    ['% Used', budget > 0 ? ((data.spending.currentMonthSpend / budget) * 100).toFixed(1) + '%' : 'N/A']
                ]);
                XLSX.utils.book_append_sheet(wb, ws, 'Budget vs Actual');
                break;
            }
            case 'spendTrend': {
                const rows = [['Week', 'Spend']];
                data.spending.spendTrend.forEach(i => rows.push([i.week, i.spend]));
                XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Spend Trend');
                break;
            }
            case 'topSpendItems': {
                const rows = [['Item', 'Total Spend']];
                data.spending.topSpendItems.forEach(i => rows.push([i.item, i.spend]));
                XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Top Spend Items');
                break;
            }
            case 'reorderForecast': {
                const rows = [['Item', 'Current Qty', 'Min Qty', 'Max Qty', 'Deficit', 'Unit Cost', 'Est. Reorder Cost', 'Daily Consumption', 'Days Until Stockout']];
                data.spending.reorderForecast.forEach(i => rows.push([i.item, i.currentQty, i.minQty, i.maxQty, i.deficit, i.unitCost, i.estimatedCost, i.dailyConsumption, i.daysUntilStockout]));
                rows.push([]);
                rows.push(['Total Estimated Reorder Cost', data.spending.totalReorderCost]);
                XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Reorder Forecast');
                break;
            }
            case 'totalItems': {
                const ws = XLSX.utils.aoa_to_sheet([
                    ['Total Items Report'],
                    ['Metric', 'Value'],
                    ['Total Items', data.inventory.totalItems],
                    ['Week-over-Week Change', data.inventory.itemCountWoWChange]
                ]);
                XLSX.utils.book_append_sheet(wb, ws, 'Total Items');
                break;
            }
            case 'totalInventoryValue': {
                const ws = XLSX.utils.aoa_to_sheet([
                    ['Total Inventory Value'],
                    ['Value', data.inventory.totalInventoryValue]
                ]);
                XLSX.utils.book_append_sheet(wb, ws, 'Inventory Value');
                break;
            }
            case 'lowStockAlerts': {
                const rows = [['Item', 'Current Qty', 'Minimum Qty', 'Vendor', 'Type', 'Cost']];
                data.inventory.lowStockItems.forEach(i => rows.push([i.item, i.current, i.minimum, i.vendor, i.type, i.cost]));
                XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Low Stock Alerts');
                break;
            }
            case 'belowReorderPoint': {
                const ws = XLSX.utils.aoa_to_sheet([
                    ['Items Below Reorder Point'],
                    ['Count', data.inventory.belowReorderCount]
                ]);
                XLSX.utils.book_append_sheet(wb, ws, 'Below Reorder');
                break;
            }
            case 'stockOutCount': {
                const rows = [['Item', 'Vendor', 'Type', 'Cost']];
                data.inventory.stockOutItems.forEach(i => rows.push([i.item, i.vendor, i.type, i.cost]));
                XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Stock-Outs');
                break;
            }
            case 'turnoverRate': {
                const ws = XLSX.utils.aoa_to_sheet([
                    ['Inventory Turnover Rate'],
                    ['Rate (Annualized)', data.inventory.turnoverRate]
                ]);
                XLSX.utils.book_append_sheet(wb, ws, 'Turnover Rate');
                break;
            }
            case 'daysOfSupply': {
                const rows = [['Item', 'Current Qty', 'Daily Rate', 'Days Remaining']];
                data.inventory.daysOfSupply.forEach(i => rows.push([i.item, i.currentQty, i.dailyRate, i.daysRemaining]));
                XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Days of Supply');
                break;
            }
            case 'quantityDeficit': {
                const rows = [['Item', 'Current Qty', 'Minimum Qty', 'Deficit', 'Unit Cost', 'Est. Cost to Fill']];
                data.inventory.quantityDeficits.forEach(i => rows.push([i.item, i.current, i.minimum, i.deficit, i.cost, i.estimatedCost]));
                XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Quantity Deficit');
                break;
            }
            case 'consumptionRate': {
                const rows = [['Item', 'Total Consumed', 'Per Day', 'Per Week', 'Per Month', 'Current Qty', 'Unit Cost', 'Total Cost']];
                data.consumption.rates.forEach(i => rows.push([i.item, i.totalConsumed, i.perDay, i.perWeek, i.perMonth, i.currentQty, i.cost, i.totalCost]));
                XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Consumption Rate');
                break;
            }
            case 'topConsumed': {
                const rows = [['Item', 'Total Consumed', 'Per Day', 'Per Week', 'Per Month']];
                data.consumption.topConsumed.forEach(i => rows.push([i.item, i.totalConsumed, i.perDay, i.perWeek, i.perMonth]));
                XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Top Consumed');
                break;
            }
            case 'consumptionByUser': {
                const rows = [['User', 'Total Consumed', 'Total Spend', 'Event Count']];
                data.consumption.byUser.forEach(u => rows.push([u._id || 'Unknown', u.totalConsumed, u.totalSpend, u.eventCount]));
                XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Consumption by User');
                break;
            }
            case 'usageTrends': {
                const rows = [['Week', 'Units Consumed']];
                data.consumption.usageTrends.forEach(i => rows.push([i.week, i.consumed]));
                XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Usage Trends');
                break;
            }
            case 'cycleCountCompliance': {
                const rows = [['Item', 'Last Count', 'Interval (Days)']];
                data.cycleCounts.overdueItems.forEach(i => rows.push([i.item, i.lastCount || 'Never', i.interval]));
                rows.unshift(['Cycle Count Compliance - Overdue: ' + data.cycleCounts.overdueCount]);
                XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Cycle Compliance');
                break;
            }
            case 'cycleCountsCompleted': {
                const ws = XLSX.utils.aoa_to_sheet([
                    ['Cycle Counts Completed'],
                    ['Period', 'Count'],
                    ['This Month', data.cycleCounts.completedThisMonth],
                    ['This Week', data.cycleCounts.completedThisWeek],
                    ['Last 90 Days', data.cycleCounts.totalInPeriod]
                ]);
                XLSX.utils.book_append_sheet(wb, ws, 'Cycle Counts Done');
                break;
            }
            case 'accuracyRate': {
                const ws = XLSX.utils.aoa_to_sheet([
                    ['Inventory Accuracy Rate'],
                    ['Accuracy (%)', data.cycleCounts.accuracyRate],
                    ['Total Cycle Counts (90 Days)', data.cycleCounts.totalInPeriod]
                ]);
                XLSX.utils.book_append_sheet(wb, ws, 'Accuracy Rate');
                break;
            }
            case 'avgReorderTime': {
                const rows = [['Item', 'Order Count', 'Avg Days Between Orders']];
                data.cycleCounts.avgTimeBetweenReorders.forEach(i => rows.push([i.item, i.orderCount, i.avgDays]));
                XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Avg Reorder Time');
                break;
            }
        }
    });

    // If no sheets were added, add a placeholder
    if (wb.SheetNames.length === 0) {
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['No metrics selected']]), 'Info');
    }

    const today = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `VFP_Analytics_${today}.xlsx`);
}

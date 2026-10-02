// ================================================
// VFP Inventory - Analytics Page
// Every metric is shown at once and refreshes automatically whenever a
// filter (date range, items, categories, vendors, users) changes.
// ================================================

const FILTER_OPTIONS = window.__ANALYTICS_FILTER_OPTIONS__ || { items: [], users: [], categories: [], vendors: [] };
const BUDGET_KEY = 'vfp_analyticsMonthlyBudget';
const DEFAULT_PRESET = '30d';

const CHART_COLORS = [
    '#3b82f6', '#10b981', '#ef4444', '#f59e0b', '#06b6d4',
    '#8b5cf6', '#f97316', '#14b8a6', '#ec4899', '#64748b',
    '#0ea5e9', '#22c55e', '#be123c', '#ca8a04', '#2563eb'
];

const state = {
    preset: DEFAULT_PRESET,
    start: '',
    end: '',
    items: [],
    categories: [],
    vendors: [],
    users: []
};

let analyticsData = null;
let charts = [];
let fetchController = null;
let refreshTimer = null;
const multiselects = {};

// --- Helpers ---
function escapeHtml(text) {
    if (text === null || text === undefined) return '';
    const div = document.createElement('div');
    div.textContent = String(text);
    return div.innerHTML;
}

function formatCurrency(value) {
    return '$' + Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatPct(value) {
    const v = Number(value || 0);
    return (v > 0 ? '+' : '') + v.toFixed(1) + '%';
}

function formatNumber(value) {
    return Number(value || 0).toLocaleString();
}

function toIsoDate(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

function parseIsoDate(s) {
    const [y, m, d] = s.split('-').map(Number);
    return new Date(y, m - 1, d);
}

function formatDateLabel(s) {
    return parseIsoDate(s).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatBucket(key, granularity) {
    if (granularity === 'month') {
        const [y, m] = key.split('-').map(Number);
        return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
    }
    const label = parseIsoDate(key).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    return granularity === 'week' ? 'Wk of ' + label : label;
}

function presetRange(preset) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const start = new Date(today);
    let end = new Date(today);
    switch (preset) {
        case '7d': start.setDate(today.getDate() - 6); break;
        case '30d': start.setDate(today.getDate() - 29); break;
        case '90d': start.setDate(today.getDate() - 89); break;
        case 'month': start.setDate(1); break;
        case 'lastmonth':
            start.setMonth(today.getMonth() - 1, 1);
            end = new Date(today.getFullYear(), today.getMonth(), 0);
            break;
        case 'ytd': start.setMonth(0, 1); break;
        case '12m': start.setFullYear(today.getFullYear() - 1); start.setDate(start.getDate() + 1); break;
        default: return null;
    }
    return { start: toIsoDate(start), end: toIsoDate(end) };
}

// ================================================
// URL <-> state (so a filtered view can be bookmarked or shared)
// ================================================
const LIST_KEYS = ['items', 'categories', 'vendors', 'users'];

function readStateFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const preset = params.get('range');
    if (preset && presetRange(preset)) {
        state.preset = preset;
    } else if (params.get('start') && params.get('end')) {
        state.preset = 'custom';
        state.start = params.get('start');
        state.end = params.get('end');
    }
    LIST_KEYS.forEach(key => {
        const raw = params.get(key);
        state[key] = raw ? raw.split(',').filter(Boolean) : [];
    });
    if (state.preset !== 'custom') Object.assign(state, presetRange(state.preset));
}

function writeStateToUrl() {
    const params = new URLSearchParams();
    if (state.preset !== 'custom') {
        if (state.preset !== DEFAULT_PRESET) params.set('range', state.preset);
    } else {
        params.set('start', state.start);
        params.set('end', state.end);
    }
    LIST_KEYS.forEach(key => { if (state[key].length) params.set(key, state[key].join(',')); });
    const qs = params.toString();
    history.replaceState(null, '', window.location.pathname + (qs ? '?' + qs : ''));
}

// ================================================
// MULTI-SELECT DROPDOWNS
// ================================================
function optionListFor(key) {
    switch (key) {
        case 'items': {
            // Narrow the item list to the chosen categories / vendors
            const cats = new Set(state.categories);
            const vends = new Set(state.vendors);
            return FILTER_OPTIONS.items
                .filter(i => (!cats.size || cats.has(i.type)) && (!vends.size || vends.has(i.vendor)))
                .map(i => ({ value: i.id, label: i.name, hint: [i.type, i.vendor].filter(Boolean).join(' · ') }));
        }
        case 'categories': return FILTER_OPTIONS.categories.map(c => ({ value: c, label: c }));
        case 'vendors': return FILTER_OPTIONS.vendors.map(v => ({ value: v, label: v }));
        case 'users': return FILTER_OPTIONS.users.map(u => ({ value: u, label: u }));
    }
    return [];
}

function labelFor(key, value) {
    if (key === 'items') {
        const item = FILTER_OPTIONS.items.find(i => i.id === value);
        return item ? item.name : 'Unknown item';
    }
    return value;
}

function createMultiselect(container) {
    const key = container.dataset.filter;
    const allLabel = container.dataset.allLabel;
    const noun = container.dataset.noun;

    container.innerHTML = `
        <button type="button" class="an-ms-toggle" aria-haspopup="true" aria-expanded="false">
            <span class="an-ms-label"></span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
        </button>
        <div class="an-ms-panel" hidden>
            <input type="search" class="an-ms-search" placeholder="Search ${escapeHtml(noun)}..." autocomplete="off">
            <div class="an-ms-actions">
                <button type="button" data-ms-action="all">Select shown</button>
                <button type="button" data-ms-action="clear">Clear</button>
            </div>
            <div class="an-ms-list" role="listbox" aria-multiselectable="true"></div>
        </div>`;

    const toggle = container.querySelector('.an-ms-toggle');
    const panel = container.querySelector('.an-ms-panel');
    const search = container.querySelector('.an-ms-search');
    const list = container.querySelector('.an-ms-list');

    function visibleOptions() {
        const q = search.value.trim().toLowerCase();
        return optionListFor(key).filter(o =>
            !q || o.label.toLowerCase().includes(q) || (o.hint || '').toLowerCase().includes(q));
    }

    function renderList() {
        const selected = new Set(state[key]);
        const options = visibleOptions();
        if (options.length === 0) {
            list.innerHTML = `<p class="an-ms-empty">No ${escapeHtml(noun)} found</p>`;
            return;
        }
        list.innerHTML = options.map(o => `
            <label class="an-ms-option">
                <input type="checkbox" value="${escapeHtml(o.value)}" ${selected.has(o.value) ? 'checked' : ''}>
                <span class="an-ms-option-text">
                    <span>${escapeHtml(o.label)}</span>
                    ${o.hint ? `<small>${escapeHtml(o.hint)}</small>` : ''}
                </span>
            </label>`).join('');
    }

    function renderLabel() {
        const sel = state[key];
        const labelEl = container.querySelector('.an-ms-label');
        if (sel.length === 0) labelEl.textContent = allLabel;
        else if (sel.length === 1) labelEl.textContent = labelFor(key, sel[0]);
        else labelEl.textContent = `${sel.length} ${noun}`;
        container.classList.toggle('has-selection', sel.length > 0);
    }

    function open() {
        Object.values(multiselects).forEach(ms => { if (ms !== api) ms.close(); });
        panel.hidden = false;
        toggle.setAttribute('aria-expanded', 'true');
        renderList();
        search.focus();
    }

    function close() {
        if (panel.hidden) return;
        panel.hidden = true;
        toggle.setAttribute('aria-expanded', 'false');
        search.value = '';
    }

    toggle.addEventListener('click', () => (panel.hidden ? open() : close()));
    search.addEventListener('input', renderList);
    list.addEventListener('change', (e) => {
        if (e.target.type !== 'checkbox') return;
        const value = e.target.value;
        state[key] = e.target.checked
            ? [...state[key], value]
            : state[key].filter(v => v !== value);
        onFiltersChanged();
    });
    container.querySelector('[data-ms-action="all"]').addEventListener('click', () => {
        const set = new Set(state[key]);
        visibleOptions().forEach(o => set.add(o.value));
        state[key] = [...set];
        renderList();
        onFiltersChanged();
    });
    container.querySelector('[data-ms-action="clear"]').addEventListener('click', () => {
        state[key] = [];
        renderList();
        onFiltersChanged();
    });

    const api = { key, open, close, renderLabel, renderList, contains: el => container.contains(el) };
    renderLabel();
    return api;
}

// ================================================
// FILTER UI
// ================================================
function syncFilterUi() {
    document.querySelectorAll('.an-preset').forEach(btn =>
        btn.classList.toggle('active', btn.dataset.preset === state.preset));
    document.getElementById('startDate').value = state.start;
    document.getElementById('endDate').value = state.end;
    Object.values(multiselects).forEach(ms => ms.renderLabel());
    renderActiveFilters();
}

function renderActiveFilters() {
    const el = document.getElementById('activeFilters');
    const chips = [];
    LIST_KEYS.forEach(key => {
        state[key].forEach(value => {
            chips.push(`<span class="an-chip">${escapeHtml(labelFor(key, value))}
                <button type="button" data-key="${key}" data-value="${escapeHtml(value)}" aria-label="Remove filter">×</button></span>`);
        });
    });
    el.innerHTML = chips.join('');
    el.hidden = chips.length === 0;
}

function onFiltersChanged() {
    // Drop selected items that the category/vendor filters now exclude
    const allowedItems = new Set(optionListFor('items').map(o => o.value));
    state.items = state.items.filter(id => allowedItems.has(id));
    syncFilterUi();
    scheduleRefresh();
}

function scheduleRefresh() {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(loadAnalytics, 250);
}

function setupFilters() {
    document.querySelectorAll('.an-multiselect').forEach(el => {
        const ms = createMultiselect(el);
        multiselects[ms.key] = ms;
    });

    document.querySelectorAll('.an-preset').forEach(btn => {
        btn.addEventListener('click', () => {
            state.preset = btn.dataset.preset;
            Object.assign(state, presetRange(state.preset));
            onFiltersChanged();
        });
    });

    ['startDate', 'endDate'].forEach(id => {
        document.getElementById(id).addEventListener('change', () => {
            const start = document.getElementById('startDate').value;
            const end = document.getElementById('endDate').value;
            if (!start || !end) return;
            state.preset = 'custom';
            state.start = start <= end ? start : end;
            state.end = start <= end ? end : start;
            onFiltersChanged();
        });
    });

    document.getElementById('resetFilters').addEventListener('click', () => {
        state.preset = DEFAULT_PRESET;
        Object.assign(state, presetRange(DEFAULT_PRESET));
        LIST_KEYS.forEach(key => { state[key] = []; });
        onFiltersChanged();
    });

    document.getElementById('activeFilters').addEventListener('click', (e) => {
        const btn = e.target.closest('button[data-key]');
        if (!btn) return;
        state[btn.dataset.key] = state[btn.dataset.key].filter(v => v !== btn.dataset.value);
        onFiltersChanged();
    });

    const budgetInput = document.getElementById('monthlyBudget');
    try { budgetInput.value = localStorage.getItem(BUDGET_KEY) || ''; } catch (e) { /* storage unavailable */ }
    budgetInput.addEventListener('input', () => {
        try { localStorage.setItem(BUDGET_KEY, budgetInput.value); } catch (e) { /* storage unavailable */ }
        if (analyticsData) renderDashboard(analyticsData);
    });

    document.addEventListener('click', (e) => {
        Object.values(multiselects).forEach(ms => { if (!ms.contains(e.target)) ms.close(); });
    });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') Object.values(multiselects).forEach(ms => ms.close());
    });

    document.getElementById('exportExcel').addEventListener('click', exportToExcel);
}

// ================================================
// DATA LOADING
// ================================================
async function loadAnalytics() {
    writeStateToUrl();
    if (fetchController) fetchController.abort();
    fetchController = new AbortController();

    const dashboard = document.getElementById('dashboard');
    const status = document.getElementById('anStatus');
    dashboard.classList.add('is-loading');
    status.hidden = true;

    const params = new URLSearchParams({ start: state.start, end: state.end });
    LIST_KEYS.forEach(key => { if (state[key].length) params.set(key, state[key].join(',')); });

    try {
        const response = await fetch('/analytics/data?' + params, { signal: fetchController.signal });
        const result = await response.json();
        if (!result.success) throw new Error(result.error || 'Failed to load analytics');
        analyticsData = result;
        renderDashboard(result);
        dashboard.classList.remove('is-loading');
    } catch (error) {
        if (error.name === 'AbortError') return;
        console.error('Analytics error:', error);
        dashboard.classList.remove('is-loading');
        status.textContent = 'Could not load analytics. Please try again.';
        status.hidden = false;
    }
}

// ================================================
// RENDERING
// ================================================
function destroyCharts() {
    charts.forEach(c => c.destroy());
    charts = [];
}

function renderDashboard(data) {
    destroyCharts();
    const p = data.period;
    const scope = LIST_KEYS.some(k => state[k].length) ? ' · filtered' : '';
    document.getElementById('periodLabel').textContent =
        `${formatDateLabel(p.start)} – ${formatDateLabel(p.end)} (${p.days} day${p.days !== 1 ? 's' : ''})${scope}`;

    renderKpis(data);
    Object.entries(TILE_RENDERERS).forEach(([name, render]) => {
        const tile = document.querySelector(`[data-tile="${name}"]`);
        if (tile) render(tile, data);
    });
}

function budgetForPeriod(days) {
    const monthly = parseFloat(document.getElementById('monthlyBudget').value) || 0;
    return monthly * (days / 30.4375);
}

function kpiCard({ label, value, sub, tone }) {
    return `<div class="an-kpi ${tone ? 'tone-' + tone : ''}">
        <div class="an-kpi-label">${escapeHtml(label)}</div>
        <div class="an-kpi-value">${value}</div>
        ${sub ? `<div class="an-kpi-sub">${sub}</div>` : ''}
    </div>`;
}

// upIsBad: true = increase shown red, false = increase shown green, null = neutral
function changeBadge(pct, upIsBad) {
    if (!pct) return '<span class="an-delta">no change</span>';
    if (upIsBad === null) return `<span class="an-delta">${formatPct(pct)}</span>`;
    const bad = upIsBad ? pct > 0 : pct < 0;
    return `<span class="an-delta ${bad ? 'bad' : 'good'}">${formatPct(pct)}</span>`;
}

function renderKpis(data) {
    const { spending: s, consumption: c, inventory: inv, cycleCounts: cc, period } = data;
    const budget = budgetForPeriod(period.days);
    const cards = [
        {
            label: 'Spend',
            value: formatCurrency(s.periodSpend),
            sub: `${changeBadge(s.spendChange, true)} vs previous ${period.days} days`
                + (budget > 0 ? ` · ${(s.periodSpend / budget * 100).toFixed(0)}% of budget` : ''),
            tone: budget > 0 && s.periodSpend > budget ? 'danger' : ''
        },
        {
            label: 'Units consumed',
            value: formatNumber(c.totalConsumed),
            sub: `${changeBadge(c.consumedChange, null)} vs previous ${period.days} days`
        },
        { label: 'Inventory value', value: formatCurrency(inv.totalInventoryValue), sub: 'Current on-hand value', tone: 'info' },
        {
            label: 'Total items',
            value: formatNumber(inv.totalItems),
            sub: `+${inv.itemsCreated} created · −${inv.itemsDeleted} deleted in period`
        },
        {
            label: 'Low stock',
            value: formatNumber(inv.lowStockCount),
            sub: inv.lowStockCount ? `${inv.belowReorderCount} below reorder point` : 'All items adequately stocked',
            tone: inv.lowStockCount ? 'warning' : 'good'
        },
        {
            label: 'Stock-outs',
            value: formatNumber(inv.stockOutCount),
            sub: inv.stockOutCount ? 'Items at zero quantity' : 'No stock-outs',
            tone: inv.stockOutCount ? 'danger' : 'good'
        },
        { label: 'Turnover rate', value: inv.turnoverRate + 'x', sub: 'Annualized from this period' },
        { label: 'Orders placed', value: formatNumber(cc.ordersPlaced), sub: 'Order line items in period' },
        { label: 'Cycle counts', value: formatNumber(cc.completed), sub: `${cc.overdueCount} overdue now`, tone: cc.overdueCount ? 'warning' : '' },
        {
            label: 'Count accuracy',
            value: cc.accuracyRate === null ? '—' : cc.accuracyRate + '%',
            sub: cc.accuracyRate === null ? 'No cycle counts in period' : `Across ${cc.completed} cycle counts`,
            tone: cc.accuracyRate === null ? '' : cc.accuracyRate >= 95 ? 'good' : cc.accuracyRate >= 80 ? 'warning' : 'danger'
        }
    ];
    document.getElementById('kpis').innerHTML = cards.map(kpiCard).join('');
}

// --- Tile helpers ---
function chartTile(tile, title, subtitle) {
    tile.innerHTML = `
        <div class="an-tile-head">
            <h3>${escapeHtml(title)}</h3>
            ${subtitle ? `<span>${subtitle}</span>` : ''}
        </div>
        <div class="an-chart"><canvas></canvas></div>`;
    return tile.querySelector('canvas');
}

function emptyTile(tile, title, message) {
    tile.innerHTML = `
        <div class="an-tile-head"><h3>${escapeHtml(title)}</h3></div>
        <p class="an-empty">${escapeHtml(message)}</p>`;
}

function tableTile(tile, title, subtitle, headers, rows, emptyMessage) {
    if (!rows.length) return emptyTile(tile, title, emptyMessage);
    tile.innerHTML = `
        <div class="an-tile-head">
            <h3>${escapeHtml(title)}</h3>
            ${subtitle ? `<span>${subtitle}</span>` : ''}
        </div>
        <div class="an-table-scroll">
            <table class="an-table">
                <thead><tr>${headers.map(h => `<th>${escapeHtml(h)}</th>`).join('')}</tr></thead>
                <tbody>${rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody>
            </table>
        </div>`;
}

function addChart(canvas, config) {
    if (typeof Chart === 'undefined') {
        // Chart library failed to load; keep the rest of the dashboard working
        canvas.parentElement.innerHTML = '<p class="an-empty">Chart unavailable — the charting library could not be loaded.</p>';
        return;
    }
    charts.push(new Chart(canvas, config));
}

const moneyTick = v => '$' + Number(v).toLocaleString();

function horizontalBar(canvas, labels, values, opts) {
    addChart(canvas, {
        type: 'bar',
        data: {
            labels,
            datasets: [{ data: values, backgroundColor: opts.colors || CHART_COLORS, borderRadius: 4 }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: { callbacks: { label: opts.tooltip } }
            },
            scales: { x: { beginAtZero: true, ticks: opts.money ? { callback: moneyTick } : {} } }
        }
    });
}

function lineChart(canvas, labels, values, color, opts) {
    addChart(canvas, {
        type: 'line',
        data: {
            labels,
            datasets: [{
                data: values,
                borderColor: color,
                backgroundColor: color + '1a',
                fill: true,
                tension: 0.3,
                pointRadius: labels.length > 45 ? 0 : 3,
                pointHoverRadius: 5
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { display: false },
                tooltip: { callbacks: { label: opts.tooltip } }
            },
            scales: {
                y: { beginAtZero: true, ticks: opts.money ? { callback: moneyTick } : {} },
                x: { ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 10 } }
            }
        }
    });
}

function doughnut(canvas, labels, values, tooltip) {
    addChart(canvas, {
        type: 'doughnut',
        data: {
            labels,
            datasets: [{ data: values, backgroundColor: CHART_COLORS, borderWidth: 2, borderColor: '#fff' }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'right', labels: { boxWidth: 12, padding: 10 } },
                tooltip: { callbacks: { label: tooltip } }
            }
        }
    });
}

const granularityWord = { day: 'Daily', week: 'Weekly', month: 'Monthly' };

const TILE_RENDERERS = {
    spendTrend(tile, data) {
        const items = data.spending.spendTrend;
        const title = 'Spend over time';
        if (!items.some(i => i.spend > 0)) return emptyTile(tile, title, 'No spend recorded in this period.');
        const g = data.period.granularity;
        lineChart(chartTile(tile, title, granularityWord[g] + ' · total ' + formatCurrency(data.spending.periodSpend)),
            items.map(i => formatBucket(i.bucket, g)), items.map(i => i.spend), '#ef4444',
            { money: true, tooltip: ctx => formatCurrency(ctx.raw) });
    },
    spendByCategory(tile, data) {
        const items = data.spending.spendByCategory;
        if (!items.length) return emptyTile(tile, 'Spend by category', 'No category spend in this period.');
        doughnut(chartTile(tile, 'Spend by category'), items.map(i => i.category), items.map(i => i.spend),
            ctx => `${ctx.label}: ${formatCurrency(ctx.raw)}`);
    },
    spendByVendor(tile, data) {
        const items = data.spending.spendByVendor.slice(0, 10);
        if (!items.length) return emptyTile(tile, 'Spend by vendor', 'No vendor spend in this period.');
        horizontalBar(chartTile(tile, 'Spend by vendor', 'Top 10'), items.map(i => i.vendor), items.map(i => i.spend),
            { money: true, tooltip: ctx => formatCurrency(ctx.raw) });
    },
    topSpendItems(tile, data) {
        const items = data.spending.topSpendItems.slice(0, 10);
        if (!items.length) return emptyTile(tile, 'Top spend items', 'No item spend in this period.');
        horizontalBar(chartTile(tile, 'Top spend items', 'Top 10'), items.map(i => i.item), items.map(i => i.spend),
            { money: true, tooltip: ctx => formatCurrency(ctx.raw) });
    },
    budgetVsActual(tile, data) {
        const budget = budgetForPeriod(data.period.days);
        const actual = data.spending.periodSpend;
        if (budget <= 0) return emptyTile(tile, 'Budget vs. actual', 'Enter a monthly budget in the filters above to compare.');
        const pct = (actual / budget * 100).toFixed(1);
        const diff = budget - actual;
        const canvas = chartTile(tile, 'Budget vs. actual',
            `${pct}% used · ${diff >= 0 ? formatCurrency(diff) + ' remaining' : formatCurrency(-diff) + ' over'}`);
        addChart(canvas, {
            type: 'bar',
            data: {
                labels: ['Budget (prorated)', 'Actual'],
                datasets: [{ data: [budget, actual], backgroundColor: ['#06b6d4', actual > budget ? '#ef4444' : '#10b981'], borderRadius: 4 }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => formatCurrency(ctx.raw) } } },
                scales: { y: { beginAtZero: true, ticks: { callback: moneyTick } } }
            }
        });
    },
    costPerUnit(tile, data) {
        const items = data.spending.costPerUnitTrend;
        if (!items.length) return emptyTile(tile, 'Average cost per unit', 'No cost data in this period.');
        const g = data.period.granularity;
        lineChart(chartTile(tile, 'Average cost per unit', granularityWord[g]),
            items.map(i => formatBucket(i.bucket, g)), items.map(i => i.avgCost), '#3b82f6',
            { money: true, tooltip: ctx => formatCurrency(ctx.raw) });
    },
    usageTrends(tile, data) {
        const items = data.consumption.usageTrends;
        const title = 'Consumption over time';
        if (!items.some(i => i.consumed > 0)) return emptyTile(tile, title, 'No consumption recorded in this period.');
        const g = data.period.granularity;
        lineChart(chartTile(tile, title, granularityWord[g] + ' · ' + formatNumber(data.consumption.totalConsumed) + ' units'),
            items.map(i => formatBucket(i.bucket, g)), items.map(i => i.consumed), '#8b5cf6',
            { tooltip: ctx => ctx.raw + ' units' });
    },
    topConsumed(tile, data) {
        const items = data.consumption.topConsumed.slice(0, 10);
        if (!items.length) return emptyTile(tile, 'Top consumed items', 'No consumption in this period.');
        horizontalBar(chartTile(tile, 'Top consumed items', 'Top 10'), items.map(i => i.item), items.map(i => i.totalConsumed),
            { colors: '#ef4444', tooltip: ctx => ctx.raw + ' units' });
    },
    consumptionByUser(tile, data) {
        const users = data.consumption.byUser;
        if (!users.length) return emptyTile(tile, 'Consumption by user', 'No consumption by any user in this period.');
        doughnut(chartTile(tile, 'Consumption by user'), users.map(u => u._id), users.map(u => u.totalConsumed),
            ctx => `${ctx.label}: ${ctx.raw} units (${formatCurrency(users[ctx.dataIndex].totalSpend)})`);
    },
    consumptionRate(tile, data) {
        tableTile(tile, 'Consumption rate by item', `${data.consumption.rates.length} items`,
            ['Item', 'Consumed', 'Per day', 'Per week', 'Per month', 'On hand', 'Unit cost', 'Total cost'],
            data.consumption.rates.map(i => [
                escapeHtml(i.item), i.totalConsumed, i.perDay, i.perWeek, i.perMonth, i.currentQty,
                formatCurrency(i.cost), formatCurrency(i.totalCost)
            ]),
            'No consumption in this period.');
    },
    daysOfSupply(tile, data) {
        const items = data.inventory.daysOfSupply.slice(0, 15);
        if (!items.length) return emptyTile(tile, 'Days of supply remaining', 'Needs consumption in this period to estimate.');
        horizontalBar(chartTile(tile, 'Days of supply remaining', 'At this period\'s usage rate'),
            items.map(i => i.item), items.map(i => i.daysRemaining),
            {
                colors: items.map(i => i.daysRemaining <= 7 ? '#ef4444' : i.daysRemaining <= 30 ? '#f59e0b' : '#10b981'),
                tooltip: ctx => ctx.raw + ' days'
            });
    },
    quantityDeficit(tile, data) {
        const items = data.inventory.quantityDeficits.slice(0, 15);
        if (!items.length) return emptyTile(tile, 'Quantity deficit', 'No deficits — all items adequately stocked.');
        const canvas = chartTile(tile, 'Quantity deficit', 'Low stock items');
        addChart(canvas, {
            type: 'bar',
            data: {
                labels: items.map(i => i.item),
                datasets: [
                    { label: 'Current', data: items.map(i => i.current), backgroundColor: '#ef4444', borderRadius: 4 },
                    { label: 'Minimum', data: items.map(i => i.minimum), backgroundColor: '#94a3b8', borderRadius: 4 }
                ]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { position: 'top' } },
                scales: { x: { beginAtZero: true } }
            }
        });
    },
    reorderForecast(tile, data) {
        const items = data.spending.reorderForecast;
        tableTile(tile, 'Reorder cost forecast', 'Estimated total: <strong>' + formatCurrency(data.spending.totalReorderCost) + '</strong>',
            ['Item', 'On hand', 'Min', 'Max', 'To order', 'Unit cost', 'Est. cost', 'Daily use', 'Stockout in'],
            items.map(i => [
                escapeHtml(i.item), i.currentQty, i.minQty, i.maxQty,
                `<span class="an-bad">${i.deficit}</span>`, formatCurrency(i.unitCost),
                `<strong>${formatCurrency(i.estimatedCost)}</strong>`, i.dailyConsumption,
                i.daysUntilStockout === null ? '—'
                    : `<span class="${i.daysUntilStockout <= 7 ? 'an-bad' : ''}">${i.daysUntilStockout} days</span>`
            ]),
            'No low-stock items need reordering.');
    },
    cycleOverdue(tile, data) {
        const items = data.cycleCounts.overdueItems;
        tableTile(tile, 'Overdue cycle counts', `${items.length} overdue`,
            ['Item', 'Last counted', 'Interval'],
            items.map(i => [
                escapeHtml(i.item),
                i.lastCount ? escapeHtml(new Date(i.lastCount).toLocaleDateString()) : 'Never',
                i.interval + ' days'
            ]),
            'All cycle counts are up to date.');
    },
    avgReorderTime(tile, data) {
        const items = data.cycleCounts.avgTimeBetweenReorders;
        tableTile(tile, 'Average time between reorders', '',
            ['Item', 'Orders', 'Avg days between'],
            items.map(i => [escapeHtml(i.item), i.orderCount, i.avgDays + ' days']),
            'Needs 2+ orders of an item within this period.');
    }
};

// ================================================
// EXCEL EXPORT (everything currently on screen)
// ================================================
function exportToExcel() {
    if (!analyticsData || typeof XLSX === 'undefined') {
        alert('Analytics are still loading. Please try again in a moment.');
        return;
    }
    const d = analyticsData;
    const wb = XLSX.utils.book_new();
    const add = (name, rows) => XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), name);
    const budget = budgetForPeriod(d.period.days);
    const listLabel = key => state[key].length ? state[key].map(v => labelFor(key, v)).join(', ') : 'All';

    add('Summary', [
        ['VFP Inventory Analytics'],
        ['Period', `${d.period.start} to ${d.period.end}`, `${d.period.days} days`],
        ['Items', listLabel('items')],
        ['Categories', listLabel('categories')],
        ['Vendors', listLabel('vendors')],
        ['Users', listLabel('users')],
        [],
        ['Metric', 'Value'],
        ['Spend', d.spending.periodSpend],
        ['Spend (previous period)', d.spending.previousSpend],
        ['Spend change (%)', d.spending.spendChange],
        ['Budget (prorated)', budget > 0 ? +budget.toFixed(2) : 'Not set'],
        ['Units consumed', d.consumption.totalConsumed],
        ['Units consumed (previous period)', d.consumption.previousConsumed],
        ['Inventory value', d.inventory.totalInventoryValue],
        ['Total items', d.inventory.totalItems],
        ['Low stock items', d.inventory.lowStockCount],
        ['Below reorder point', d.inventory.belowReorderCount],
        ['Stock-outs', d.inventory.stockOutCount],
        ['Turnover rate (annualized)', d.inventory.turnoverRate],
        ['Orders placed', d.cycleCounts.ordersPlaced],
        ['Cycle counts completed', d.cycleCounts.completed],
        ['Cycle counts overdue', d.cycleCounts.overdueCount],
        ['Count accuracy (%)', d.cycleCounts.accuracyRate === null ? 'N/A' : d.cycleCounts.accuracyRate],
        ['Estimated reorder cost', d.spending.totalReorderCost]
    ]);
    add('Spend Trend', [['Period', 'Spend'], ...d.spending.spendTrend.map(i => [i.bucket, i.spend])]);
    add('Spend by Category', [['Category', 'Spend'], ...d.spending.spendByCategory.map(i => [i.category, i.spend])]);
    add('Spend by Vendor', [['Vendor', 'Spend'], ...d.spending.spendByVendor.map(i => [i.vendor, i.spend])]);
    add('Top Spend Items', [['Item', 'Spend'], ...d.spending.topSpendItems.map(i => [i.item, i.spend])]);
    add('Cost Per Unit', [['Period', 'Avg Cost Per Unit'], ...d.spending.costPerUnitTrend.map(i => [i.bucket, i.avgCost])]);
    add('Usage Trend', [['Period', 'Units Consumed'], ...d.consumption.usageTrends.map(i => [i.bucket, i.consumed])]);
    add('Consumption Rate', [
        ['Item', 'Total Consumed', 'Per Day', 'Per Week', 'Per Month', 'On Hand', 'Unit Cost', 'Total Cost'],
        ...d.consumption.rates.map(i => [i.item, i.totalConsumed, i.perDay, i.perWeek, i.perMonth, i.currentQty, i.cost, i.totalCost])
    ]);
    add('Consumption by User', [
        ['User', 'Units Consumed', 'Spend', 'Events'],
        ...d.consumption.byUser.map(u => [u._id, u.totalConsumed, u.totalSpend, u.eventCount])
    ]);
    add('Days of Supply', [
        ['Item', 'On Hand', 'Daily Rate', 'Days Remaining'],
        ...d.inventory.daysOfSupply.map(i => [i.item, i.currentQty, i.dailyRate, i.daysRemaining])
    ]);
    add('Low Stock', [
        ['Item', 'Current', 'Minimum', 'Vendor', 'Category', 'Cost'],
        ...d.inventory.lowStockItems.map(i => [i.item, i.current, i.minimum, i.vendor, i.type, i.cost])
    ]);
    add('Stock-Outs', [['Item', 'Vendor', 'Category', 'Cost'], ...d.inventory.stockOutItems.map(i => [i.item, i.vendor, i.type, i.cost])]);
    add('Reorder Forecast', [
        ['Item', 'On Hand', 'Min', 'Max', 'To Order', 'Unit Cost', 'Est. Cost', 'Daily Use', 'Days Until Stockout'],
        ...d.spending.reorderForecast.map(i => [i.item, i.currentQty, i.minQty, i.maxQty, i.deficit, i.unitCost, i.estimatedCost, i.dailyConsumption, i.daysUntilStockout]),
        [],
        ['Total Estimated Reorder Cost', d.spending.totalReorderCost]
    ]);
    add('Overdue Cycle Counts', [
        ['Item', 'Last Count', 'Interval (Days)'],
        ...d.cycleCounts.overdueItems.map(i => [i.item, i.lastCount || 'Never', i.interval])
    ]);
    add('Avg Reorder Time', [
        ['Item', 'Orders', 'Avg Days Between'],
        ...d.cycleCounts.avgTimeBetweenReorders.map(i => [i.item, i.orderCount, i.avgDays])
    ]);

    XLSX.writeFile(wb, `VFP_Analytics_${d.period.start}_to_${d.period.end}.xlsx`);
}

// ================================================
// INIT
// ================================================
document.addEventListener('DOMContentLoaded', () => {
    readStateFromUrl();
    setupFilters();
    syncFilterUi();
    loadAnalytics();
});

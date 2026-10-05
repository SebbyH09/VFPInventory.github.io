// Dashboard JavaScript
// Extracted from inline script for CSP compliance

let currentCycleRow = null;
let consumptionChart = null;

function escapeHtml(text) {
    if (text === null || text === undefined) return '';
    const div = document.createElement('div');
    div.textContent = String(text);
    return div.innerHTML;
}

function fmtDate(value) {
    if (!value) return '—';
    return new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function openModal(id) { document.getElementById(id).style.display = 'block'; }
function closeModal(id) { document.getElementById(id).style.display = 'none'; }

// ---------- Consumption chart ----------

function initConsumption() {
    const panel = document.getElementById('consumptionPanel');
    if (!panel) return;

    let data;
    try {
        data = JSON.parse(decodeURIComponent(panel.getAttribute('data-consumption')));
    } catch (e) {
        return;
    }
    if (!data || !data.days) return;

    const render = windowDays => {
        const days = data.days.slice(-windowDays);
        const total = days.reduce((s, d) => s + d.total, 0);
        document.getElementById('consumedTotal').textContent = total.toLocaleString();
        document.getElementById('consumedWindowLabel').textContent = windowDays + ' days';

        // Top items
        const list = document.getElementById('topConsumedList');
        const top = (data.top && data.top[windowDays]) || [];
        list.innerHTML = top.length
            ? top.map(t => `<li><span class="top-name" title="${escapeHtml(t.name)}">${escapeHtml(t.name)}</span><span class="top-val">${t.total.toLocaleString()}</span></li>`).join('')
            : '<li class="empty">No consumption logged</li>';

        // Table view
        document.getElementById('consumptionTableBody').innerHTML = days.slice().reverse()
            .map(d => `<tr><td>${labelFor(d.date, true)}</td><td>${d.total}</td></tr>`).join('');

        // Chart
        if (typeof Chart === 'undefined') return;
        const labels = days.map(d => labelFor(d.date, false));
        const values = days.map(d => d.total);
        if (consumptionChart) {
            consumptionChart.data.labels = labels;
            consumptionChart.data.datasets[0].data = values;
            consumptionChart.$fullDates = days.map(d => labelFor(d.date, true));
            consumptionChart.update();
            return;
        }
        const ctx = document.getElementById('consumptionChart');
        consumptionChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels,
                datasets: [{
                    label: 'Units consumed',
                    data: values,
                    backgroundColor: '#3b82f6',
                    hoverBackgroundColor: '#1d4ed8',
                    borderRadius: { topLeft: 4, topRight: 4 },
                    borderSkipped: 'bottom',
                    maxBarThickness: 18,
                    categoryPercentage: 0.85,
                    barPercentage: 0.9
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: { duration: 250 },
                interaction: { mode: 'index', intersect: false },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        displayColors: false,
                        callbacks: {
                            title: items => consumptionChart.$fullDates[items[0].dataIndex],
                            label: item => item.parsed.y + ' unit' + (item.parsed.y === 1 ? '' : 's')
                        }
                    }
                },
                scales: {
                    x: {
                        grid: { display: false },
                        border: { color: '#e5e7eb' },
                        ticks: { color: '#6b7280', font: { size: 11 }, maxRotation: 0, autoSkip: true, maxTicksLimit: 8 }
                    },
                    y: {
                        beginAtZero: true,
                        grid: { color: '#f1f3f5' },
                        border: { display: false },
                        ticks: { color: '#6b7280', font: { size: 11 }, precision: 0, maxTicksLimit: 5 }
                    }
                }
            }
        });
        consumptionChart.$fullDates = days.map(d => labelFor(d.date, true));
    };

    panel.querySelectorAll('.seg-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            panel.querySelectorAll('.seg-btn').forEach(b => b.classList.toggle('active', b === btn));
            render(parseInt(btn.getAttribute('data-window'), 10));
        });
    });

    const active = panel.querySelector('.seg-btn.active');
    render(active ? parseInt(active.getAttribute('data-window'), 10) : 30);
}

// "YYYY-MM-DD" -> "Oct 5" / "Mon, Oct 5"
function labelFor(key, long) {
    const [y, m, d] = key.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    return date.toLocaleDateString('en-US', long
        ? { weekday: 'short', month: 'short', day: 'numeric' }
        : { month: 'short', day: 'numeric' });
}

// ---------- Modals ----------

function openOrderItemsModal(orderNumber, items) {
    document.getElementById('orderItemsModalNumber').textContent = orderNumber;
    const tbody = document.getElementById('orderItemsModalBody');
    tbody.innerHTML = items.map(item => `
        <tr>
            <td>${escapeHtml(item.itemName)}</td>
            <td>${escapeHtml(item.brand || 'N/A')}</td>
            <td>${item.quantityOrdered}</td>
            <td>${item.quantityReceived}</td>
            <td>$${item.cost ? Number(item.cost).toFixed(2) : '0.00'}</td>
        </tr>`).join('');
    openModal('orderItemsModal');
}

function openOnOrderDetailsModal(itemName, orderDetails) {
    document.getElementById('onOrderItemName').textContent = itemName;
    const tbody = document.getElementById('onOrderDetailsBody');
    tbody.innerHTML = orderDetails.map(detail => {
        const statusClass = detail.orderStatus === 'partial' ? 'badge-warning' : 'badge-info';
        const statusLabel = detail.orderStatus.charAt(0).toUpperCase() + detail.orderStatus.slice(1);
        return `
        <tr>
            <td>${escapeHtml(detail.orderNumber)}</td>
            <td><span class="badge ${statusClass}">${statusLabel}</span></td>
            <td>${detail.quantityOrdered}</td>
            <td>${detail.remaining}</td>
            <td>${fmtDate(detail.createdAt)}</td>
            <td>${fmtDate(detail.expectedDate)}${detail.isEstimate ? ' <span class="est-tag">est.</span>' : ''}</td>
        </tr>`;
    }).join('');
    openModal('onOrderDetailsModal');
}

function openCycleCountModal(row) {
    currentCycleRow = row;
    document.getElementById('modalItemName').textContent = row.getAttribute('data-item-name');
    document.getElementById('modalCatalogNumber').textContent = row.getAttribute('data-item-catalog') || 'N/A';
    document.getElementById('currentQty').value = row.getAttribute('data-current-qty');
    document.getElementById('updatedQty').value = '';
    openModal('cycleCountModal');
    document.getElementById('updatedQty').focus();
}

function closeCycleCountModal() {
    closeModal('cycleCountModal');
    currentCycleRow = null;
}

async function submitCycleCount() {
    const raw = document.getElementById('updatedQty').value;
    const qty = Number(raw);
    if (raw === '' || !Number.isInteger(qty) || qty < 0) {
        alert('Please enter a whole number of 0 or more');
        return;
    }
    if (!currentCycleRow) return;

    try {
        const response = await fetch('/update-cycle-count', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                itemId: currentCycleRow.getAttribute('data-item-id'),
                newQuantity: qty,
                date: new Date().toISOString()
            })
        });

        if (response.ok) {
            closeCycleCountModal();
            // Reload so the counts, progress, and "done this week" list stay in sync
            window.location.reload();
        } else {
            const error = await response.json().catch(() => ({}));
            alert('Failed to update cycle count: ' + (error.message || 'Unknown error'));
        }
    } catch (error) {
        console.error('Error updating cycle count:', error);
        alert('Error updating cycle count');
    }
}

// ---------- Expected delivery editing ----------

function initDeliveryEditing() {
    document.querySelectorAll('.delivery-row').forEach(row => {
        const form = row.querySelector('.delivery-edit');
        const input = form.querySelector('input[type="date"]');
        const original = input.value;

        row.querySelector('.edit-delivery-btn').addEventListener('click', () => {
            form.hidden = !form.hidden;
            if (!form.hidden) input.focus();
        });
        form.querySelector('.delivery-cancel').addEventListener('click', () => {
            input.value = original;
            form.hidden = true;
        });
        const clearBtn = form.querySelector('.delivery-clear');
        if (clearBtn) {
            clearBtn.addEventListener('click', () => saveExpectedDelivery(row, ''));
        }
        form.addEventListener('submit', e => {
            e.preventDefault();
            if (!input.value) return;
            saveExpectedDelivery(row, input.value);
        });
    });
}

async function saveExpectedDelivery(row, value) {
    try {
        const response = await fetch(`/orders/${row.getAttribute('data-order-id')}/expected-delivery`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ expectedDeliveryDate: value })
        });
        if (response.ok) {
            window.location.reload();
        } else {
            const error = await response.json().catch(() => ({}));
            alert(error.message || 'Failed to update expected delivery');
        }
    } catch (error) {
        console.error('Error updating expected delivery:', error);
        alert('Error updating expected delivery');
    }
}

// ---------- Need to order ----------

function getRowItemData(row) {
    return {
        itemId: row.getAttribute('data-item-id'),
        name: row.getAttribute('data-item-name'),
        brand: row.getAttribute('data-item-brand') || '',
        catalog: row.getAttribute('data-item-catalog') || '',
        currentQty: parseInt(row.getAttribute('data-item-quantity')) || 0,
        minQty: parseInt(row.getAttribute('data-item-min')) || 0,
        maxQty: parseInt(row.getAttribute('data-item-max')) || 0,
        cost: parseFloat(row.getAttribute('data-item-cost')) || 0,
        quantity: 1
    };
}

// ---------- Init ----------

document.addEventListener('DOMContentLoaded', function() {
    initConsumption();
    initDeliveryEditing();

    // Recent order rows -> items modal
    document.querySelectorAll('.order-row').forEach(row => {
        const open = () => openOrderItemsModal(
            row.getAttribute('data-order-number'),
            JSON.parse(decodeURIComponent(row.getAttribute('data-order-items')))
        );
        row.addEventListener('click', open);
        row.addEventListener('keydown', e => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
        });
    });

    // "On order" chips -> order details modal
    document.querySelectorAll('.on-order-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const row = btn.closest('.low-row');
            openOnOrderDetailsModal(
                row.getAttribute('data-item-name'),
                JSON.parse(decodeURIComponent(btn.getAttribute('data-order-details')))
            );
        });
    });

    // Add to order cart
    document.querySelectorAll('.card-add-order-btn').forEach(btn => {
        btn.addEventListener('click', function(e) {
            e.stopPropagation();
            const item = getRowItemData(this.closest('.low-row'));
            if (window.CartManager) {
                CartManager.addToOrderCart(item);
                CartManager.showToast(item.name + ' added to order cart');
                this.classList.add('added');
                setTimeout(() => this.classList.remove('added'), 1500);
            }
        });
    });

    // Cycle count buttons
    document.querySelectorAll('.cycle-count-update-btn').forEach(btn => {
        btn.addEventListener('click', () => openCycleCountModal(btn.closest('.cycle-row')));
    });

    document.querySelector('.cycle-modal-close').addEventListener('click', closeCycleCountModal);
    document.querySelector('#cycleCountModal .btn-cancel').addEventListener('click', closeCycleCountModal);
    document.querySelector('#cycleCountModal .btn-submit').addEventListener('click', submitCycleCount);
    document.getElementById('updatedQty').addEventListener('keydown', e => {
        if (e.key === 'Enter') submitCycleCount();
    });
    document.querySelector('.order-modal-close').addEventListener('click', () => closeModal('orderItemsModal'));
    document.querySelector('.on-order-modal-close').addEventListener('click', () => closeModal('onOrderDetailsModal'));

    // Close modals when clicking the backdrop or pressing Escape
    window.addEventListener('click', event => {
        if (event.target.id === 'cycleCountModal') closeCycleCountModal();
        if (event.target.id === 'orderItemsModal') closeModal('orderItemsModal');
        if (event.target.id === 'onOrderDetailsModal') closeModal('onOrderDetailsModal');
    });
    document.addEventListener('keydown', e => {
        if (e.key !== 'Escape') return;
        closeCycleCountModal();
        closeModal('orderItemsModal');
        closeModal('onOrderDetailsModal');
    });
});

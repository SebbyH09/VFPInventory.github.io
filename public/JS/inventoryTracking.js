document.addEventListener('DOMContentLoaded', function() {
    calculateTrackingFields();
    addTrackingActionButtons();
    observeTableChanges();
});

function calculateTrackingFields() {
    const rows = document.querySelectorAll('#mainTable1 tbody tr');

    rows.forEach(row => {
        calculateDaysSinceLastUse(row);
        calculateOrderFrequency(row);
        checkCycleCountDue(row);
    });
}

function calculateDaysSinceLastUse(row) {
    const lastUsedDate = row.getAttribute('data-last-used');
    const daysSinceUseCell = row.querySelector('.days-since-use p');

    if (!daysSinceUseCell) return;

    if (!lastUsedDate || lastUsedDate === '') {
        daysSinceUseCell.textContent = 'Never';
        daysSinceUseCell.classList.add('never-used');
        return;
    }

    const lastUsed = new Date(lastUsedDate);
    const today = new Date();
    const diffTime = Math.abs(today - lastUsed);
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

    daysSinceUseCell.textContent = diffDays;
    daysSinceUseCell.classList.remove('never-used');

    if (diffDays > 180) {
        daysSinceUseCell.classList.add('very-old');
    } else if (diffDays > 90) {
        daysSinceUseCell.classList.add('old');
    }
}

function calculateOrderFrequency(row) {
    const orderHistoryStr = row.getAttribute('data-order-history');
    const orderFrequencyCell = row.querySelector('.order-frequency p');

    if (!orderFrequencyCell) return;

    let orderHistory = [];
    try {
        orderHistory = JSON.parse(orderHistoryStr || '[]');
    } catch (e) {
        console.error('Error parsing order history:', e);
        orderHistory = [];
    }

    const originalData = JSON.parse(row.getAttribute('data-original') || '{}');
    const orderPeriod = originalData.orderFrequencyPeriod || 30;

    const periodStart = new Date();
    periodStart.setDate(periodStart.getDate() - orderPeriod);

    const recentOrders = orderHistory.filter(orderDate => {
        const date = new Date(orderDate);
        return date >= periodStart;
    });

    orderFrequencyCell.textContent = recentOrders.length;

    if (recentOrders.length > 5) {
        orderFrequencyCell.classList.add('high-frequency');
    } else if (recentOrders.length > 2) {
        orderFrequencyCell.classList.add('medium-frequency');
    }
}

function checkCycleCountDue(row) {
    const lastCycleCountDate = row.getAttribute('data-last-cycle-count');
    const lastCycleCountCell = row.querySelector('.last-cycle-count');

    if (!lastCycleCountCell) return;

    const originalData = JSON.parse(row.getAttribute('data-original') || '{}');
    const cycleInterval = originalData.cycleCountInterval || 90;

    if (!lastCycleCountDate || lastCycleCountDate === '') {
        lastCycleCountCell.classList.add('cycle-count-overdue');
        return;
    }

    const lastCycleCount = new Date(lastCycleCountDate);
    const today = new Date();
    const diffTime = Math.abs(today - lastCycleCount);
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays >= cycleInterval) {
        lastCycleCountCell.classList.add('cycle-count-due');
    } else if (diffDays >= cycleInterval * 0.8) {
        lastCycleCountCell.classList.add('cycle-count-warning');
    }
}

function addTrackingActionButtons() {
    const rows = document.querySelectorAll('#mainTable1 tbody tr');

    rows.forEach(row => {
        const actionsCell = row.querySelector('td:last-child');
        if (!actionsCell) return;

        const markUsedBtn = document.createElement('button');
        markUsedBtn.textContent = 'Mark Used';
        markUsedBtn.className = 'mark-used-btn hidden';
        markUsedBtn.onclick = function() { markItemAsUsed(row); };

        const recordOrderBtn = document.createElement('button');
        recordOrderBtn.textContent = 'Record Order';
        recordOrderBtn.className = 'record-order-btn hidden';
        recordOrderBtn.onclick = function() { recordItemOrder(row); };

        actionsCell.appendChild(markUsedBtn);
        actionsCell.appendChild(recordOrderBtn);
    });
}

async function markItemAsUsed(row) {
    const itemId = row.getAttribute('data-item-id');
    const today = new Date().toISOString();

    try {
        const response = await fetch('/entry/mark-used', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ itemId, date: today })
        });

        if (response.ok) {
            row.setAttribute('data-last-used', today);
            calculateDaysSinceLastUse(row);
            alert('Item marked as used');
        } else {
            alert('Failed to mark item as used');
        }
    } catch (error) {
        console.error('Error marking item as used:', error);
        alert('Error marking item as used');
    }
}

async function recordItemOrder(row) {
    const itemId = row.getAttribute('data-item-id');
    const today = new Date().toISOString();

    try {
        const response = await fetch('/entry/record-order', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ itemId, date: today })
        });

        if (response.ok) {
            const orderHistory = JSON.parse(row.getAttribute('data-order-history') || '[]');
            orderHistory.push(today);
            row.setAttribute('data-order-history', JSON.stringify(orderHistory));
            calculateOrderFrequency(row);
            alert('Order recorded');
        } else {
            alert('Failed to record order');
        }
    } catch (error) {
        console.error('Error recording order:', error);
        alert('Error recording order');
    }
}


function observeTableChanges() {
    const tbody = document.querySelector('#mainTable1 tbody');
    if (!tbody) return;

    const observer = new MutationObserver(function(mutations) {
        mutations.forEach(function(mutation) {
            if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                mutation.addedNodes.forEach(node => {
                    if (node.nodeType === 1 && node.tagName === 'TR') {
                        calculateDaysSinceLastUse(node);
                        calculateOrderFrequency(node);
                        checkCycleCountDue(node);

                        const actionsCell = node.querySelector('td:last-child');
                        if (actionsCell && !actionsCell.querySelector('.mark-used-btn')) {
                            const markUsedBtn = document.createElement('button');
                            markUsedBtn.textContent = 'Mark Used';
                            markUsedBtn.className = 'mark-used-btn hidden';
                            markUsedBtn.onclick = function() { markItemAsUsed(node); };

                            const recordOrderBtn = document.createElement('button');
                            recordOrderBtn.textContent = 'Record Order';
                            recordOrderBtn.className = 'record-order-btn hidden';
                            recordOrderBtn.onclick = function() { recordItemOrder(node); };

                            const cycleCountBtn = document.createElement('button');
                            cycleCountBtn.textContent = 'Cycle Count';
                            cycleCountBtn.className = 'cycle-count-btn hidden';
                            cycleCountBtn.onclick = function() { performCycleCount(node); };

                            actionsCell.appendChild(markUsedBtn);
                            actionsCell.appendChild(recordOrderBtn);
                            actionsCell.appendChild(cycleCountBtn);
                        }
                    }
                });
            }
        });
    });

    observer.observe(tbody, { childList: true, subtree: true });
}

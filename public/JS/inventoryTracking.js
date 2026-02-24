document.addEventListener('DOMContentLoaded', function() {
    calculateTrackingFields();
    observeTableChanges();
});

function calculateTrackingFields() {
    const rows = document.querySelectorAll('#mainTable1 tbody tr');

    rows.forEach(row => {
        calculateDaysSinceLastUse(row);
        displayOpenOrders(row);
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

function displayOpenOrders(row) {
    const openOrders = parseInt(row.getAttribute('data-open-orders')) || 0;
    const orderFrequencyCell = row.querySelector('.order-frequency p');

    if (!orderFrequencyCell) return;

    orderFrequencyCell.textContent = openOrders;

    if (openOrders > 0) {
        orderFrequencyCell.classList.add('has-open-orders');
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



function observeTableChanges() {
    const tbody = document.querySelector('#mainTable1 tbody');
    if (!tbody) return;

    const observer = new MutationObserver(function(mutations) {
        mutations.forEach(function(mutation) {
            if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                mutation.addedNodes.forEach(node => {
                    if (node.nodeType === 1 && node.tagName === 'TR') {
                        calculateDaysSinceLastUse(node);
                        displayOpenOrders(node);
                        checkCycleCountDue(node);

                    }
                });
            }
        });
    });

    observer.observe(tbody, { childList: true, subtree: true });
}

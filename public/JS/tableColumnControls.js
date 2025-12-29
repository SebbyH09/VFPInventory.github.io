// Table Column Controls: Resize, Swap, and Visibility functionality
document.addEventListener('DOMContentLoaded', function() {
    initializeColumnControls();
});

function initializeColumnControls() {
    const table = document.querySelector('#mainTable1');
    if (!table) return;

    setupColumnResize();
    setupColumnSwap();
    setupColumnVisibility();
}

// ========== COLUMN VISIBILITY FUNCTIONALITY ==========

const COLUMN_VISIBILITY_KEY = 'inventoryColumnVisibility';

// Default visibility for all columns
const defaultColumnVisibility = {
    '#': true,
    'Item': true,
    'Brand': true,
    'Vendor': true,
    'Catalog #': true,
    'Current Quantity': true,
    'Minimum Quantity': true,
    'Max Quantity': true,
    'Location': true,
    'Type': true,
    'Cost per Unit': true,
    'Days Since Last Use': true,
    'Orders (Last 30 days)': true,
    'Last Cycle Count': true,
    'Cycle Interval (days)': true,
    'Order Period (days)': true,
    'Actions': true
};

function setupColumnVisibility() {
    createColumnVisibilityMenu();
    loadColumnVisibility();
}

function createColumnVisibilityMenu() {
    const searchBarContainer = document.querySelector('.search-bar-container');
    if (!searchBarContainer) return;

    // Create the settings button
    const settingsBtn = document.createElement('button');
    settingsBtn.id = 'columnSettingsBtn';
    settingsBtn.textContent = 'Column Settings';
    settingsBtn.className = 'column-settings-btn';

    // Create the dropdown menu
    const dropdown = document.createElement('div');
    dropdown.id = 'columnVisibilityMenu';
    dropdown.className = 'column-visibility-menu';
    dropdown.style.display = 'none';

    // Add header
    const menuHeader = document.createElement('div');
    menuHeader.className = 'column-menu-header';
    menuHeader.innerHTML = '<strong>Show/Hide Columns</strong>';
    dropdown.appendChild(menuHeader);

    // Get all column headers
    const headers = document.querySelectorAll('#mainTable1 thead th');
    headers.forEach((header, index) => {
        const columnName = header.textContent.trim().replace(/\n/g, ' ');

        // Skip the # column (always visible)
        if (columnName === '#') return;

        const checkboxWrapper = document.createElement('label');
        checkboxWrapper.className = 'column-checkbox-wrapper';

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = true;
        checkbox.dataset.columnIndex = index;
        checkbox.dataset.columnName = columnName;

        checkbox.addEventListener('change', function() {
            toggleColumn(index, this.checked);
            saveColumnVisibility();
        });

        const label = document.createElement('span');
        label.textContent = columnName;

        checkboxWrapper.appendChild(checkbox);
        checkboxWrapper.appendChild(label);
        dropdown.appendChild(checkboxWrapper);
    });

    // Insert button and menu
    searchBarContainer.appendChild(settingsBtn);
    searchBarContainer.appendChild(dropdown);

    // Toggle menu on button click
    settingsBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        const isVisible = dropdown.style.display === 'block';
        dropdown.style.display = isVisible ? 'none' : 'block';
    });

    // Close menu when clicking outside
    document.addEventListener('click', function(e) {
        if (!dropdown.contains(e.target) && e.target !== settingsBtn) {
            dropdown.style.display = 'none';
        }
    });
}

function toggleColumn(columnIndex, visible) {
    const table = document.querySelector('#mainTable1');
    const rows = table.querySelectorAll('tr');

    rows.forEach(row => {
        const cell = row.children[columnIndex];
        if (cell) {
            cell.style.display = visible ? '' : 'none';
        }
    });
}

function saveColumnVisibility() {
    const checkboxes = document.querySelectorAll('#columnVisibilityMenu input[type="checkbox"]');
    const visibility = {};

    checkboxes.forEach(checkbox => {
        visibility[checkbox.dataset.columnName] = checkbox.checked;
    });

    localStorage.setItem(COLUMN_VISIBILITY_KEY, JSON.stringify(visibility));
}

function loadColumnVisibility() {
    const savedVisibility = localStorage.getItem(COLUMN_VISIBILITY_KEY);
    if (!savedVisibility) return;

    const visibility = JSON.parse(savedVisibility);
    const checkboxes = document.querySelectorAll('#columnVisibilityMenu input[type="checkbox"]');

    checkboxes.forEach(checkbox => {
        const columnName = checkbox.dataset.columnName;
        const columnIndex = parseInt(checkbox.dataset.columnIndex);

        if (visibility[columnName] !== undefined) {
            checkbox.checked = visibility[columnName];
            toggleColumn(columnIndex, visibility[columnName]);
        }
    });
}

// ========== COLUMN RESIZE FUNCTIONALITY ==========

let isResizing = false;
let currentColumn = null;
let startX = 0;
let startWidth = 0;

function setupColumnResize() {
    const headers = document.querySelectorAll('#mainTable1 thead th');

    headers.forEach((header, index) => {
        // Skip the first column (#) as it's very small
        if (index === 0) return;

        // Create resize handle
        const resizeHandle = document.createElement('div');
        resizeHandle.className = 'column-resize-handle';
        header.style.position = 'relative';
        header.appendChild(resizeHandle);

        // Add resize event listeners
        resizeHandle.addEventListener('mousedown', initResize);
    });
}

function initResize(e) {
    e.preventDefault();
    e.stopPropagation();

    currentColumn = e.target.parentElement;
    startX = e.pageX;
    startWidth = currentColumn.offsetWidth;
    isResizing = true;

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    document.addEventListener('mousemove', doResize);
    document.addEventListener('mouseup', stopResize);
}

function doResize(e) {
    if (!isResizing) return;

    const width = startWidth + (e.pageX - startX);
    const minWidth = 50; // Minimum column width

    if (width > minWidth) {
        const columnIndex = Array.from(currentColumn.parentElement.children).indexOf(currentColumn);

        // Set width for header
        currentColumn.style.width = width + 'px';

        // Set width for all cells in this column
        const rows = document.querySelectorAll('#mainTable1 tbody tr');
        rows.forEach(row => {
            const cell = row.children[columnIndex];
            if (cell) {
                cell.style.width = width + 'px';
            }
        });
    }
}

function stopResize() {
    isResizing = false;
    currentColumn = null;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';

    document.removeEventListener('mousemove', doResize);
    document.removeEventListener('mouseup', stopResize);
}

// ========== COLUMN SWAP FUNCTIONALITY ==========

let draggedColumn = null;
let draggedColumnIndex = null;

function setupColumnSwap() {
    const headers = document.querySelectorAll('#mainTable1 thead th');

    headers.forEach((header, index) => {
        // Make headers draggable (skip the first # column to keep it fixed)
        if (index > 0) {
            header.draggable = true;
            header.style.cursor = 'move';

            header.addEventListener('dragstart', handleDragStart);
            header.addEventListener('dragover', handleDragOver);
            header.addEventListener('drop', handleDrop);
            header.addEventListener('dragend', handleDragEnd);
            header.addEventListener('dragenter', handleDragEnter);
            header.addEventListener('dragleave', handleDragLeave);
        }
    });
}

function handleDragStart(e) {
    // Prevent drag during resize
    if (isResizing) {
        e.preventDefault();
        return;
    }

    draggedColumn = this;
    draggedColumnIndex = Array.from(this.parentElement.children).indexOf(this);

    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/html', this.innerHTML);

    this.classList.add('dragging');

    // Add visual feedback to all cells in the column
    highlightColumn(draggedColumnIndex, 'add');
}

function handleDragOver(e) {
    if (e.preventDefault) {
        e.preventDefault();
    }

    e.dataTransfer.dropEffect = 'move';
    return false;
}

function handleDragEnter(e) {
    if (this !== draggedColumn) {
        this.classList.add('drag-over');
    }
}

function handleDragLeave(e) {
    this.classList.remove('drag-over');
}

function handleDrop(e) {
    if (e.stopPropagation) {
        e.stopPropagation();
    }

    e.preventDefault();

    const dropColumn = this;
    const dropColumnIndex = Array.from(dropColumn.parentElement.children).indexOf(dropColumn);

    // Don't swap if dropping on the same column or on the # column
    if (draggedColumn !== dropColumn && dropColumnIndex > 0 && draggedColumnIndex > 0) {
        swapColumns(draggedColumnIndex, dropColumnIndex);
    }

    return false;
}

function handleDragEnd(e) {
    this.classList.remove('dragging');
    highlightColumn(draggedColumnIndex, 'remove');

    // Remove drag-over class from all headers
    const headers = document.querySelectorAll('#mainTable1 thead th');
    headers.forEach(header => {
        header.classList.remove('drag-over');
    });

    draggedColumn = null;
    draggedColumnIndex = null;
}

function swapColumns(index1, index2) {
    const table = document.querySelector('#mainTable1');
    const rows = table.querySelectorAll('tr');

    rows.forEach(row => {
        const cells = Array.from(row.children);
        const cell1 = cells[index1];
        const cell2 = cells[index2];

        if (cell1 && cell2) {
            // Swap the cells
            if (index1 < index2) {
                cell2.parentNode.insertBefore(cell1, cell2.nextSibling);
                cell1.parentNode.insertBefore(cell2, cells[index1]);
            } else {
                cell1.parentNode.insertBefore(cell2, cell1.nextSibling);
                cell2.parentNode.insertBefore(cell1, cells[index2]);
            }
        }
    });

    // Re-setup resize and swap after column swap
    setTimeout(() => {
        removeExistingResizeHandles();
        setupColumnResize();
        setupColumnSwap();
    }, 100);
}

function highlightColumn(columnIndex, action) {
    const table = document.querySelector('#mainTable1');
    const rows = table.querySelectorAll('tr');

    rows.forEach(row => {
        const cell = row.children[columnIndex];
        if (cell) {
            if (action === 'add') {
                cell.classList.add('column-highlight');
            } else {
                cell.classList.remove('column-highlight');
            }
        }
    });
}

function removeExistingResizeHandles() {
    const handles = document.querySelectorAll('.column-resize-handle');
    handles.forEach(handle => handle.remove());
}

// Re-initialize when table content changes (for dynamically added rows)
const observer = new MutationObserver(function(mutations) {
    mutations.forEach(function(mutation) {
        if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
            // Only re-setup if new rows were added
            const hasNewRows = Array.from(mutation.addedNodes).some(
                node => node.nodeType === 1 && node.tagName === 'TR'
            );

            if (hasNewRows) {
                // Don't need to re-setup since headers don't change
                // Just ensure resize handles are still present
                const hasResizeHandles = document.querySelectorAll('.column-resize-handle').length > 0;
                if (!hasResizeHandles) {
                    setupColumnResize();
                }
            }
        }
    });
});

const tbody = document.querySelector('#mainTable1 tbody');
if (tbody) {
    observer.observe(tbody, { childList: true, subtree: true });
}

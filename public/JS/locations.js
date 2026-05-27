(function () {
    'use strict';

    // ===== State =====
    let currentLocationId = null;
    let currentLocationData = null; // { _id, name, description, items[] }

    // ===== Helpers =====
    function openOverlay(id) {
        document.getElementById(id).classList.add('open');
    }

    function closeOverlay(id) {
        document.getElementById(id).classList.remove('open');
    }

    function showError(msg) {
        alert(msg);
    }

    async function apiFetch(url, options = {}) {
        const res = await fetch(url, {
            headers: { 'Content-Type': 'application/json', ...options.headers },
            ...options
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.message || 'Request failed');
        return data;
    }

    // ===== Render location card =====
    function buildLocationCard(loc) {
        const unlinkedCount = loc.items.filter(i => !i.inventoryItemId).length;
        const div = document.createElement('div');
        div.className = 'location-card';
        div.dataset.locationId = loc._id;
        div.dataset.locationName = loc.name;
        div.dataset.locationDescription = loc.description || '';
        div.dataset.locationItems = encodeURIComponent(JSON.stringify(loc.items));
        div.innerHTML = `
            <p class="location-card-name">${escHtml(loc.name)}</p>
            <p class="location-card-description">${escHtml(loc.description || '')}</p>
            <div class="location-card-meta">
                <span class="location-card-count">${loc.items.length} item${loc.items.length !== 1 ? 's' : ''}</span>
                ${unlinkedCount > 0 ? `<span class="location-card-unlinked">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                    ${unlinkedCount} not in inventory
                </span>` : ''}
            </div>
            <svg class="location-card-arrow" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
        `;
        div.addEventListener('click', () => openLocationDetail(loc));
        return div;
    }

    function escHtml(str) {
        const d = document.createElement('div');
        d.textContent = str;
        return d.innerHTML;
    }

    // ===== Render items table =====
    function renderItemsTable(items) {
        const tbody = document.getElementById('detailItemsBody');
        if (!items || items.length === 0) {
            tbody.innerHTML = `<tr><td colspan="4" class="loc-items-empty">No items added yet</td></tr>`;
            return;
        }
        tbody.innerHTML = items.map(item => `
            <tr data-item-id="${item._id}">
                <td>${escHtml(item.itemName)}</td>
                <td>${escHtml(item.specificLocation || '—')}</td>
                <td>
                    ${item.inventoryItemId
                        ? `<span class="badge-in-inventory">
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
                            In Inventory
                           </span>`
                        : `<span class="badge-not-in-inventory">
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                            Not Added
                           </span>`
                    }
                </td>
                <td>
                    <button class="btn-icon btn-icon-edit" title="Edit" data-action="edit-item" data-item-id="${item._id}">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                    </button>
                    <button class="btn-icon btn-icon-danger" title="Remove" data-action="remove-item" data-item-id="${item._id}">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                    </button>
                </td>
            </tr>
        `).join('');
    }

    // ===== Open location detail =====
    function openLocationDetail(loc) {
        currentLocationId = loc._id;
        currentLocationData = loc;

        document.getElementById('detailLocationName').textContent = loc.name;
        document.getElementById('detailLocationNameSub').textContent = loc.name;
        document.getElementById('detailLocationDesc').textContent = loc.description || '';

        renderItemsTable(loc.items);
        openOverlay('locationDetailOverlay');
    }

    // ===== Refresh card in grid =====
    function refreshGrid(loc) {
        const grid = document.getElementById('locationsGrid');
        const existing = grid.querySelector(`[data-location-id="${loc._id}"]`);
        const newCard = buildLocationCard(loc);
        if (existing) {
            grid.replaceChild(newCard, existing);
        } else {
            // Remove empty state if present
            const empty = grid.querySelector('.empty-locations');
            if (empty) empty.remove();
            grid.appendChild(newCard);
        }
    }

    function removeCardFromGrid(locationId) {
        const grid = document.getElementById('locationsGrid');
        const card = grid.querySelector(`[data-location-id="${locationId}"]`);
        if (card) card.remove();
        if (!grid.querySelector('.location-card')) {
            grid.innerHTML = `
                <div class="empty-locations">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#c0c0c0" stroke-width="1.5">
                        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
                        <circle cx="12" cy="10" r="3"/>
                    </svg>
                    <h3>No locations yet</h3>
                    <p>Add your first storage location to get started</p>
                </div>`;
        }
    }

    // ===== Add / Edit Location =====
    document.getElementById('addLocationBtn').addEventListener('click', () => {
        document.getElementById('locationFormTitle').textContent = 'Add Location';
        document.getElementById('locationFormId').value = '';
        document.getElementById('locationFormName').value = '';
        document.getElementById('locationFormDescription').value = '';
        openOverlay('locationFormOverlay');
    });

    document.getElementById('locationFormSave').addEventListener('click', async () => {
        const id = document.getElementById('locationFormId').value;
        const name = document.getElementById('locationFormName').value.trim();
        const description = document.getElementById('locationFormDescription').value.trim();

        if (!name) {
            showError('Location name is required.');
            return;
        }

        try {
            let result;
            if (id) {
                result = await apiFetch(`/locations/${id}`, {
                    method: 'PUT',
                    body: JSON.stringify({ name, description })
                });
            } else {
                result = await apiFetch('/locations', {
                    method: 'POST',
                    body: JSON.stringify({ name, description })
                });
            }
            closeOverlay('locationFormOverlay');
            refreshGrid(result.location);

            // If editing current open location, refresh detail header
            if (id && currentLocationId === id) {
                currentLocationData = { ...currentLocationData, name: result.location.name, description: result.location.description };
                document.getElementById('detailLocationName').textContent = result.location.name;
                document.getElementById('detailLocationNameSub').textContent = result.location.name;
                document.getElementById('detailLocationDesc').textContent = result.location.description || '';
            }
        } catch (err) {
            showError(err.message);
        }
    });

    // Edit location (from detail modal)
    document.getElementById('editLocationBtn').addEventListener('click', () => {
        if (!currentLocationData) return;
        document.getElementById('locationFormTitle').textContent = 'Edit Location';
        document.getElementById('locationFormId').value = currentLocationData._id;
        document.getElementById('locationFormName').value = currentLocationData.name;
        document.getElementById('locationFormDescription').value = currentLocationData.description || '';
        openOverlay('locationFormOverlay');
    });

    // Delete location (from detail modal)
    document.getElementById('deleteLocationBtn').addEventListener('click', async () => {
        if (!currentLocationId) return;
        if (!confirm(`Delete location "${currentLocationData.name}"? This cannot be undone.`)) return;

        try {
            await apiFetch(`/locations/${currentLocationId}`, { method: 'DELETE' });
            closeOverlay('locationDetailOverlay');
            removeCardFromGrid(currentLocationId);
            currentLocationId = null;
            currentLocationData = null;
        } catch (err) {
            showError(err.message);
        }
    });

    // ===== Add / Edit Item =====
    document.getElementById('addItemToLocationBtn').addEventListener('click', () => {
        document.getElementById('itemFormTitle').textContent = 'Add Item';
        document.getElementById('itemFormLocationId').value = currentLocationId;
        document.getElementById('itemFormItemId').value = '';
        document.getElementById('itemFormName').value = '';
        document.getElementById('itemFormSpecificLocation').value = '';
        document.getElementById('itemFormInventoryLink').value = '';
        openOverlay('itemFormOverlay');
    });

    document.getElementById('detailItemsBody').addEventListener('click', async (e) => {
        const btn = e.target.closest('[data-action]');
        if (!btn) return;
        const action = btn.dataset.action;
        const itemId = btn.dataset.itemId;

        if (action === 'edit-item') {
            const item = currentLocationData.items.find(i => i._id === itemId);
            if (!item) return;
            document.getElementById('itemFormTitle').textContent = 'Edit Item';
            document.getElementById('itemFormLocationId').value = currentLocationId;
            document.getElementById('itemFormItemId').value = itemId;
            document.getElementById('itemFormName').value = item.itemName;
            document.getElementById('itemFormSpecificLocation').value = item.specificLocation || '';
            document.getElementById('itemFormInventoryLink').value = item.inventoryItemId || '';
            openOverlay('itemFormOverlay');
        }

        if (action === 'remove-item') {
            const item = currentLocationData.items.find(i => i._id === itemId);
            if (!item) return;
            if (!confirm(`Remove "${item.itemName}" from this location?`)) return;
            try {
                const result = await apiFetch(`/locations/${currentLocationId}/items/${itemId}`, { method: 'DELETE' });
                currentLocationData.items = result.location.items;
                renderItemsTable(currentLocationData.items);
                refreshGrid(result.location);
            } catch (err) {
                showError(err.message);
            }
        }
    });

    document.getElementById('itemFormSave').addEventListener('click', async () => {
        const locationId = document.getElementById('itemFormLocationId').value;
        const itemId = document.getElementById('itemFormItemId').value;
        const itemName = document.getElementById('itemFormName').value.trim();
        const specificLocation = document.getElementById('itemFormSpecificLocation').value.trim();
        const inventoryItemId = document.getElementById('itemFormInventoryLink').value;

        if (!itemName) {
            showError('Item name is required.');
            return;
        }

        try {
            let result;
            if (itemId) {
                result = await apiFetch(`/locations/${locationId}/items/${itemId}`, {
                    method: 'PATCH',
                    body: JSON.stringify({ itemName, specificLocation, inventoryItemId })
                });
            } else {
                result = await apiFetch(`/locations/${locationId}/items`, {
                    method: 'POST',
                    body: JSON.stringify({ itemName, specificLocation, inventoryItemId })
                });
            }
            currentLocationData.items = result.location.items;
            renderItemsTable(currentLocationData.items);
            refreshGrid(result.location);
            closeOverlay('itemFormOverlay');
        } catch (err) {
            showError(err.message);
        }
    });

    // ===== Location card clicks (server-rendered cards) =====
    document.getElementById('locationsGrid').addEventListener('click', (e) => {
        const card = e.target.closest('.location-card');
        if (!card) return;
        const loc = {
            _id: card.dataset.locationId,
            name: card.dataset.locationName,
            description: card.dataset.locationDescription,
            items: JSON.parse(decodeURIComponent(card.dataset.locationItems))
        };
        openLocationDetail(loc);
    });

    // ===== Close overlays =====
    document.addEventListener('click', (e) => {
        const closeBtn = e.target.closest('[data-close]');
        if (closeBtn) {
            closeOverlay(closeBtn.dataset.close);
        }
        // Click outside modal
        if (e.target.classList.contains('loc-modal-overlay')) {
            e.target.classList.remove('open');
        }
    });

    // Close on Escape
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            document.querySelectorAll('.loc-modal-overlay.open').forEach(el => el.classList.remove('open'));
        }
    });
}());

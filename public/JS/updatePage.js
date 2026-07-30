document.addEventListener('DOMContentLoaded', function() {
    // ===== Timeframe selector auto-submits =====
    const monthsSelect = document.getElementById('monthsSelect');
    if (monthsSelect) {
        monthsSelect.addEventListener('change', function() {
            document.getElementById('timeframeForm').submit();
        });
    }

    // ===== Multi-value location input helpers =====
    // Defined locations, read from the datalist rendered on the page. Picking
    // an exact name ties the item back to that location on the Locations page.
    function getDefinedLocations() {
        const names = [];
        const datalist = document.getElementById('locationDatalist');
        if (datalist) {
            datalist.querySelectorAll('option').forEach(function(opt) {
                const v = (opt.value || '').trim();
                if (v) names.push(v);
            });
        }
        return names;
    }

    function createLocationInput(containerId, value) {
        const container = document.getElementById(containerId);
        if (!container) return;
        const row = document.createElement('div');
        row.className = 'location-input-row';

        const names = getDefinedLocations();
        const select = document.createElement('select');
        select.className = 'edit-input location-value';

        const placeholder = document.createElement('option');
        placeholder.value = '';
        placeholder.textContent = names.length ? 'Select location' : 'No locations defined';
        select.appendChild(placeholder);

        names.forEach(function(name) {
            const opt = document.createElement('option');
            opt.value = name;
            opt.textContent = name;
            select.appendChild(opt);
        });

        // Keep any pre-existing value that isn't a defined location so legacy
        // free-text entries are never silently dropped on edit.
        const val = (value || '').trim();
        if (val && names.indexOf(val) === -1) {
            const opt = document.createElement('option');
            opt.value = val;
            opt.textContent = val + ' (custom)';
            select.appendChild(opt);
        }
        select.value = val;

        const removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.className = 'remove-location-btn';
        removeBtn.title = 'Remove';
        removeBtn.innerHTML = '&times;';
        removeBtn.addEventListener('click', function() { row.remove(); });
        row.appendChild(select);
        row.appendChild(removeBtn);
        container.appendChild(row);
    }

    function setLocationInputs(containerId, values) {
        const container = document.getElementById(containerId);
        if (!container) return;
        container.innerHTML = '';
        const list = Array.isArray(values)
            ? values.filter(function(v) { return v && String(v).trim(); })
            : [];
        if (list.length === 0) {
            createLocationInput(containerId, '');
        } else {
            list.forEach(function(v) { createLocationInput(containerId, v); });
        }
    }

    function collectLocationInputs(containerId) {
        const container = document.getElementById(containerId);
        if (!container) return [];
        const values = [];
        container.querySelectorAll('.location-value').forEach(function(input) {
            const v = input.value.trim();
            if (v) values.push(v);
        });
        return values;
    }

    // "+ Add location" buttons
    document.addEventListener('click', function(event) {
        const btn = event.target.closest('.add-location-btn');
        if (btn) {
            event.preventDefault();
            createLocationInput(btn.getAttribute('data-loc-target'), '');
        }
    });

    // ===== Summary count refresh =====
    function refreshSummary() {
        const cards = document.querySelectorAll('.update-card');
        const stats = document.querySelectorAll('.summary-stat .summary-number');
        if (stats.length >= 1) stats[0].textContent = cards.length;
        if (stats.length >= 2) {
            stats[1].textContent = Array.from(cards).filter(function(c) {
                return c.querySelector('.badge-missing');
            }).length;
        }
        if (stats.length >= 3) {
            stats[2].textContent = Array.from(cards).filter(function(c) {
                return c.querySelector('.badge-stale');
            }).length;
        }

        // Show empty state if nothing left
        if (cards.length === 0) {
            const list = document.getElementById('updateList');
            if (list && !document.querySelector('.update-empty')) {
                list.remove();
                const container = document.querySelector('.update-container');
                const empty = document.createElement('div');
                empty.className = 'update-empty';
                empty.innerHTML =
                    '<div class="update-empty-icon"><svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="1.5"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg></div>' +
                    '<h3 class="update-empty-title">All caught up</h3>' +
                    '<p class="update-empty-text">No items left needing attention in this timeframe.</p>';
                container.appendChild(empty);
            }
        }
    }

    // ===== Card actions (OK + Update Info) =====
    const updateList = document.getElementById('updateList');
    if (updateList) {
        updateList.addEventListener('click', function(event) {
            const btn = event.target.closest('[data-action]');
            if (!btn) return;
            const card = btn.closest('.update-card');
            if (!card) return;
            const action = btn.getAttribute('data-action');

            if (action === 'ok') {
                acknowledgeItem(card, btn);
            } else if (action === 'edit') {
                openUpdateModal(card);
            }
        });
    }

    function acknowledgeItem(card, btn) {
        const itemId = card.getAttribute('data-item-id');
        btn.disabled = true;
        fetch('/update/' + itemId + '/acknowledge', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        })
        .then(function(res) {
            if (!res.ok) throw new Error('Failed');
            return res.json();
        })
        .then(function() {
            card.classList.add('update-card-removing');
            setTimeout(function() {
                card.remove();
                refreshSummary();
            }, 250);
        })
        .catch(function() {
            btn.disabled = false;
            alert('Failed to mark item as reviewed. Please try again.');
        });
    }

    // ===== Update Info modal =====
    const modal = document.getElementById('updateInfoModal');
    let currentEditId = null;

    function openUpdateModal(card) {
        let data = {};
        try { data = JSON.parse(card.getAttribute('data-item')); } catch (e) {}
        currentEditId = data.id;

        document.getElementById('updateModalItemName').textContent = data.item || '';
        document.getElementById('upBrand').value = data.brand || '';
        document.getElementById('upVendor').value = data.vendor || '';
        document.getElementById('upCatalog').value = data.catalog || '';
        document.getElementById('upType').value = data.type || '';
        document.getElementById('upCost').value = (data.cost && data.cost > 0) ? data.cost : '';
        setLocationInputs('upStoredContainer', data.storedLocations || []);
        setLocationInputs('upStockedContainer', data.stockedInLocations || []);

        modal.style.display = 'block';
        document.body.classList.add('modal-open');
    }

    function closeUpdateModal() {
        modal.style.display = 'none';
        document.body.classList.remove('modal-open');
        currentEditId = null;
    }

    document.getElementById('updateModalClose').addEventListener('click', closeUpdateModal);
    document.getElementById('updateModalCancel').addEventListener('click', closeUpdateModal);
    window.addEventListener('click', function(event) {
        if (event.target === modal) closeUpdateModal();
    });

    document.getElementById('updateModalSave').addEventListener('click', function() {
        if (!currentEditId) return;
        const saveBtn = this;

        const changes = {
            brand: document.getElementById('upBrand').value.trim(),
            vendor: document.getElementById('upVendor').value.trim(),
            catalog: document.getElementById('upCatalog').value.trim(),
            type: document.getElementById('upType').value.trim(),
            cost: parseFloat(document.getElementById('upCost').value) || 0,
            storedLocations: collectLocationInputs('upStoredContainer'),
            stockedInLocations: collectLocationInputs('upStockedContainer')
        };

        saveBtn.disabled = true;
        saveBtn.textContent = 'Saving...';

        fetch('/entry', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                newItems: [],
                updatedItems: [{ id: currentEditId, changes: changes }]
            })
        })
        .then(function(res) {
            if (!res.ok) throw new Error('Failed');
            return res.json();
        })
        .then(function() {
            // Reload to reflect the item's new state against the current filter
            window.location.reload();
        })
        .catch(function() {
            saveBtn.disabled = false;
            saveBtn.textContent = 'Save Changes';
            alert('Failed to save changes. Please try again.');
        });
    });
});

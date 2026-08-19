document.addEventListener('DOMContentLoaded', function() {

    // ===== Toast Helper =====
    function showToast(message, type) {
        var existing = document.querySelector('.settings-toast');
        if (existing) existing.remove();

        var toast = document.createElement('div');
        toast.className = 'settings-toast ' + (type || 'success');
        toast.textContent = message;
        document.body.appendChild(toast);

        requestAnimationFrame(function() {
            toast.classList.add('show');
        });

        setTimeout(function() {
            toast.classList.remove('show');
            setTimeout(function() { toast.remove(); }, 300);
        }, 3000);
    }

    // ===== Category Management =====
    var addCategoryBtn = document.getElementById('addCategoryBtn');
    if (addCategoryBtn) {
        addCategoryBtn.addEventListener('click', function() {
            var name = document.getElementById('newCategoryName').value.trim();
            var value = document.getElementById('newCategoryValue').value.trim();
            if (!name || !value) {
                showToast('Please enter both a display name and value', 'error');
                return;
            }
            addCategoryBtn.disabled = true;
            fetch('/settings/categories', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: name, value: value })
            })
            .then(function(res) { return res.json().then(function(d) { return { ok: res.ok, data: d }; }); })
            .then(function(result) {
                if (!result.ok) throw new Error(result.data.message);
                showToast('Category added');
                document.getElementById('newCategoryName').value = '';
                document.getElementById('newCategoryValue').value = '';
                // Add to list
                var list = document.getElementById('categoryList');
                var div = document.createElement('div');
                div.className = 'category-item';
                div.setAttribute('data-value', value);
                div.innerHTML =
                    '<span class="category-name">' + escapeHtml(name) + '</span>' +
                    '<span class="category-value-tag">' + escapeHtml(value) + '</span>' +
                    '<button class="category-remove-btn" data-value="' + escapeHtml(value) + '" title="Remove">' +
                        '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>' +
                    '</button>';
                list.appendChild(div);
            })
            .catch(function(err) { showToast(err.message || 'Error adding category', 'error'); })
            .finally(function() { addCategoryBtn.disabled = false; });
        });
    }

    // Category removal (event delegation)
    var categoryList = document.getElementById('categoryList');
    if (categoryList) {
        categoryList.addEventListener('click', function(e) {
            var btn = e.target.closest('.category-remove-btn');
            if (!btn) return;
            var value = btn.getAttribute('data-value');
            if (!confirm('Remove category "' + value + '"?')) return;

            fetch('/settings/categories/' + encodeURIComponent(value), { method: 'DELETE' })
            .then(function(res) { return res.json().then(function(d) { return { ok: res.ok, data: d }; }); })
            .then(function(result) {
                if (!result.ok) throw new Error(result.data.message);
                showToast('Category removed');
                var item = btn.closest('.category-item');
                if (item) item.remove();
            })
            .catch(function(err) { showToast(err.message || 'Error removing category', 'error'); });
        });
    }

    // ===== Timeframe Settings =====
    var saveTimeframesBtn = document.getElementById('saveTimeframesBtn');
    if (saveTimeframesBtn) {
        saveTimeframesBtn.addEventListener('click', function() {
            saveTimeframesBtn.disabled = true;
            saveTimeframesBtn.textContent = 'Saving...';

            var data = {
                defaultCycleCountInterval: parseInt(document.getElementById('defaultCycleCountInterval').value) || 90,
                defaultOrderFrequencyPeriod: parseInt(document.getElementById('defaultOrderFrequencyPeriod').value) || 30,
                recommendationLookbackDays: parseInt(document.getElementById('recommendationLookbackDays').value) || 90,
                leadTimeDays: parseInt(document.getElementById('leadTimeDays').value) || 14
            };

            fetch('/settings/timeframes', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            })
            .then(function(res) { return res.json().then(function(d) { return { ok: res.ok, data: d }; }); })
            .then(function(result) {
                if (!result.ok) throw new Error(result.data.message);
                showToast('Timeframe settings saved');
            })
            .catch(function(err) { showToast(err.message || 'Error saving settings', 'error'); })
            .finally(function() {
                saveTimeframesBtn.disabled = false;
                saveTimeframesBtn.textContent = 'Save Timeframe Settings';
            });
        });
    }

    // ===== Default Values =====
    var saveDefaultsBtn = document.getElementById('saveDefaultsBtn');
    if (saveDefaultsBtn) {
        saveDefaultsBtn.addEventListener('click', function() {
            saveDefaultsBtn.disabled = true;
            saveDefaultsBtn.textContent = 'Saving...';

            var data = {
                defaultMinQuantity: parseInt(document.getElementById('defaultMinQuantity').value) || 0,
                defaultMaxQuantity: parseInt(document.getElementById('defaultMaxQuantity').value) || 0,
                lowStockAlertEnabled: document.getElementById('lowStockAlertEnabled').checked,
                quoteExpiryAlertDays: parseInt(document.getElementById('quoteExpiryAlertDays').value) || 0
            };

            fetch('/settings/timeframes', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            })
            .then(function(res) { return res.json().then(function(d) { return { ok: res.ok, data: d }; }); })
            .then(function(result) {
                if (!result.ok) throw new Error(result.data.message);
                showToast('Default values saved');
            })
            .catch(function(err) { showToast(err.message || 'Error saving defaults', 'error'); })
            .finally(function() {
                saveDefaultsBtn.disabled = false;
                saveDefaultsBtn.textContent = 'Save Default Values';
            });
        });
    }

    // ===== User Management =====
    var addUserBtn = document.getElementById('addUserBtn');
    if (addUserBtn) {
        addUserBtn.addEventListener('click', function() {
            var email = document.getElementById('newUserEmail').value.trim();
            var password = document.getElementById('newUserPassword').value;
            if (!email || !password) {
                showToast('Please enter both email and password', 'error');
                return;
            }
            if (password.length < 8) {
                showToast('Password must be at least 8 characters', 'error');
                return;
            }
            addUserBtn.disabled = true;
            addUserBtn.textContent = 'Adding...';

            fetch('/settings/users', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: email, password: password })
            })
            .then(function(res) { return res.json().then(function(d) { return { ok: res.ok, data: d }; }); })
            .then(function(result) {
                if (!result.ok) throw new Error(result.data.message);
                showToast('User created');
                document.getElementById('newUserEmail').value = '';
                document.getElementById('newUserPassword').value = '';
                // Reload to show new user
                window.location.reload();
            })
            .catch(function(err) { showToast(err.message || 'Error creating user', 'error'); })
            .finally(function() {
                addUserBtn.disabled = false;
                addUserBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> Add User';
            });
        });
    }

    // User removal (event delegation)
    var userList = document.getElementById('userList');
    if (userList) {
        userList.addEventListener('click', function(e) {
            var btn = e.target.closest('.user-remove-btn');
            if (!btn) return;
            var id = btn.getAttribute('data-id');
            if (!confirm('Are you sure you want to remove this user?')) return;

            fetch('/settings/users/' + id, { method: 'DELETE' })
            .then(function(res) { return res.json().then(function(d) { return { ok: res.ok, data: d }; }); })
            .then(function(result) {
                if (!result.ok) throw new Error(result.data.message);
                showToast('User removed');
                var item = btn.closest('.user-item');
                if (item) item.remove();
            })
            .catch(function(err) { showToast(err.message || 'Error removing user', 'error'); });
        });
    }

    // ===== Utility =====
    function escapeHtml(str) {
        var div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }
});

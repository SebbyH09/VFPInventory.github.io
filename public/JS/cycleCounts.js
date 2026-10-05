// Cycle Counts page

(function() {
    let activeTab = 'due';

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text == null ? '' : String(text);
        return div.innerHTML;
    }

    function varianceText(v) {
        return v === 0 ? 'Match' : (v > 0 ? '+' : '') + v;
    }

    function varianceClass(v) {
        return 'variance' + (v === 0 ? '' : v > 0 ? ' variance-up' : ' variance-down');
    }

    function matchesTab(row) {
        if (row.classList.contains('cc-row-done')) return activeTab !== 'upcoming';
        if (activeTab === 'due') return row.dataset.due === '1';
        if (activeTab === 'upcoming') return row.dataset.status === 'upcoming';
        return true;
    }

    function applyFilters() {
        const query = document.getElementById('ccSearch').value.trim().toLowerCase();
        const locSelect = document.getElementById('ccLocation');
        const loc = locSelect ? locSelect.value : '';
        let visible = 0;

        document.querySelectorAll('.cc-row').forEach(row => {
            let show = matchesTab(row);
            if (show && query) show = row.dataset.search.includes(query);
            if (show && loc) show = JSON.parse(row.dataset.locations || '[]').includes(loc);
            row.hidden = !show;
            if (show) visible++;
        });

        document.getElementById('ccEmpty').hidden = visible > 0;
    }

    function updateStats() {
        const rows = [...document.querySelectorAll('.cc-row')];
        const due = rows.filter(r => r.dataset.due === '1').length;
        const total = rows.length;
        document.getElementById('statDue').textContent = due;
        document.querySelector('[data-count-for="due"]').textContent = due;
        document.querySelector('[data-count-for="upcoming"]').textContent =
            rows.filter(r => r.dataset.status === 'upcoming').length;
        document.getElementById('statCoverage').textContent =
            (total ? Math.round((total - due) / total * 100) : 100) + '%';
    }

    function addDoneRow(itemName, before, counted) {
        const v = counted - before;
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td data-label="Item">${escapeHtml(itemName)}</td>
            <td data-label="When">${new Date().toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' })}</td>
            <td data-label="By">You</td>
            <td data-label="Before" class="num">${before}</td>
            <td data-label="Counted" class="num">${counted}</td>
            <td data-label="Variance" class="num"><span class="${varianceClass(v)}">${varianceText(v)}</span></td>`;
        document.getElementById('ccDoneBody').prepend(tr);
        document.getElementById('ccDoneEmpty').hidden = true;
    }

    async function saveCount(row, form) {
        const input = form.querySelector('.cc-input');
        const button = form.querySelector('button[type="submit"]');
        const raw = input.value;
        const qty = Number(raw);
        if (raw === '' || !Number.isInteger(qty) || qty < 0) {
            input.focus();
            input.classList.add('cc-input-error');
            return;
        }

        const before = Number(row.dataset.currentQty);
        const itemName = row.querySelector('.cc-item').textContent;
        button.disabled = true;
        button.textContent = 'Saving…';

        try {
            const response = await fetch('/update-cycle-count', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    itemId: row.dataset.itemId,
                    newQuantity: qty,
                    date: new Date().toISOString(),
                    source: 'cycle-counts'
                })
            });

            if (!response.ok) {
                const error = await response.json().catch(() => ({}));
                throw new Error(error.message || 'Unknown error');
            }

            const wasCountedThisWeek = row.dataset.week === '1';
            row.dataset.week = '1';
            row.classList.add('cc-row-done');
            row.dataset.due = '0';
            row.dataset.status = 'ok';
            row.dataset.currentQty = qty;
            row.querySelector('.cc-system').textContent = qty;
            row.querySelector('.cc-last').textContent = 'Today';
            row.querySelector('.cc-status').innerHTML = '<span class="badge badge-good">Counted</span>';
            input.value = '';
            input.placeholder = String(qty);
            form.querySelector('.cc-variance').textContent = '';

            addDoneRow(itemName, before, qty);
            if (!wasCountedThisWeek) {
                const week = document.getElementById('statWeek');
                week.textContent = Number(week.textContent) + 1;
            }
            updateStats();

            // Move focus to the next visible count input to keep counting quickly
            let next = row.nextElementSibling;
            while (next && (next.hidden || next.classList.contains('cc-row-done'))) next = next.nextElementSibling;
            if (next) next.querySelector('.cc-input').focus();
        } catch (error) {
            alert('Failed to save count: ' + error.message);
        } finally {
            button.disabled = false;
            button.textContent = 'Save';
        }
    }

    document.addEventListener('DOMContentLoaded', () => {
        document.querySelectorAll('.cc-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                activeTab = tab.dataset.tab;
                document.querySelectorAll('.cc-tab').forEach(t => {
                    t.classList.toggle('active', t === tab);
                    t.setAttribute('aria-selected', t === tab ? 'true' : 'false');
                });
                applyFilters();
            });
        });

        document.getElementById('ccSearch').addEventListener('input', applyFilters);
        const locSelect = document.getElementById('ccLocation');
        if (locSelect) locSelect.addEventListener('change', applyFilters);

        document.querySelectorAll('.cc-row').forEach(row => {
            const form = row.querySelector('.cc-count-form');
            const input = form.querySelector('.cc-input');
            const variance = form.querySelector('.cc-variance');

            // Live variance preview against the system quantity
            input.addEventListener('input', () => {
                input.classList.remove('cc-input-error');
                if (input.value === '') { variance.textContent = ''; return; }
                const v = Number(input.value) - Number(row.dataset.currentQty);
                variance.textContent = varianceText(v);
                variance.className = 'cc-variance ' + varianceClass(v);
            });

            form.addEventListener('submit', e => {
                e.preventDefault();
                saveCount(row, form);
            });
        });

        applyFilters();
    });
})();

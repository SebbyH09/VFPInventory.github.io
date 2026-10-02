// Shared "choose product variant" modal used by the New Order (shop) page and
// the Order Cart page. Items with alternate products ask which one is being
// ordered before they go into the cart.
//
// Usage:
//   OrderVariantPicker.choose(baseItem)      -> Promise<variant | null>
//   OrderVariantPicker.chooseMany(baseItems) -> Promise<[{ baseItem, variant }]>
//     (stops at the first cancel; items chosen before it are returned)
//
// baseItem: { name, brand, vendor, catalog, alternates: [{ brand, vendor, catalogNumber }] }
// variant:  { label, brand, vendor, catalog, isPrimary }
window.OrderVariantPicker = (function () {
    let modal, list, title, confirmBtn;
    let current = null; // { options, resolve }
    let selectedIdx = 0;

    function escapeHtml(str) {
        if (str === null || str === undefined) return '';
        const div = document.createElement('div');
        div.appendChild(document.createTextNode(String(str)));
        return div.innerHTML;
    }

    function primaryVariant(base) {
        return {
            label: 'Primary',
            brand: base.brand || '',
            vendor: base.vendor || '',
            catalog: base.catalog || '',
            isPrimary: true
        };
    }

    function buildOptions(base) {
        const opts = [primaryVariant(base)];
        (base.alternates || []).forEach((alt, i) => {
            opts.push({
                label: 'Alternate ' + (i + 1),
                brand: alt.brand || '',
                vendor: alt.vendor || '',
                catalog: alt.catalogNumber || '',
                isPrimary: false
            });
        });
        return opts;
    }

    function ensureModal() {
        if (modal) return;
        modal = document.createElement('div');
        modal.id = 'alternateItemsModal';
        modal.className = 'alt-items-modal';
        modal.setAttribute('aria-hidden', 'true');
        modal.setAttribute('role', 'dialog');
        modal.innerHTML =
            '<div class="alt-items-modal-content">' +
                '<div class="alt-items-modal-header">' +
                    '<div class="alt-items-modal-header-text">' +
                        '<h3 class="alt-modal-title">Choose product variant</h3>' +
                        '<p>This item has alternate options. Pick which one you\'re ordering.</p>' +
                    '</div>' +
                    '<button type="button" class="alt-items-modal-close" aria-label="Close">' +
                        '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>' +
                    '</button>' +
                '</div>' +
                '<div class="alt-items-modal-body"><div class="alt-items-list"></div></div>' +
                '<div class="alt-items-modal-footer">' +
                    '<button type="button" class="alt-modal-btn alt-modal-btn-cancel">Cancel</button>' +
                    '<button type="button" class="alt-modal-btn alt-modal-btn-confirm">Use this option</button>' +
                '</div>' +
            '</div>';
        document.body.appendChild(modal);

        list = modal.querySelector('.alt-items-list');
        title = modal.querySelector('.alt-modal-title');
        confirmBtn = modal.querySelector('.alt-modal-btn-confirm');

        confirmBtn.addEventListener('click', function () {
            if (!current) return;
            finish(current.options[selectedIdx] || current.options[0]);
        });
        modal.querySelector('.alt-modal-btn-cancel').addEventListener('click', function () { finish(null); });
        modal.querySelector('.alt-items-modal-close').addEventListener('click', function () { finish(null); });
        modal.addEventListener('click', function (e) {
            if (e.target === modal) finish(null);
        });
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && current) finish(null);
        });
        list.addEventListener('click', function (e) {
            const card = e.target.closest('.alt-option-card');
            if (!card) return;
            selectedIdx = parseInt(card.dataset.idx, 10);
            render();
        });
    }

    function fieldHtml(label, value) {
        return '<div class="alt-option-field">' +
            '<span class="alt-option-field-label">' + escapeHtml(label) + '</span>' +
            '<span class="alt-option-field-value">' + escapeHtml(value || '—') + '</span>' +
        '</div>';
    }

    function render() {
        let html = '';
        current.options.forEach((opt, idx) => {
            const selected = idx === selectedIdx;
            html +=
                '<div class="alt-option-card' + (opt.isPrimary ? ' primary' : '') + (selected ? ' selected' : '') + '" data-idx="' + idx + '">' +
                    '<div class="alt-option-header">' +
                        '<span class="alt-option-label">' + escapeHtml(opt.label) + '</span>' +
                        '<span class="alt-option-indicator"></span>' +
                    '</div>' +
                    '<div class="alt-option-fields">' +
                        fieldHtml('Brand', opt.brand) +
                        fieldHtml('Vendor', opt.vendor) +
                        fieldHtml('Catalog #', opt.catalog) +
                    '</div>' +
                '</div>';
        });
        list.innerHTML = html;
    }

    function finish(variant) {
        if (!current) return;
        const resolve = current.resolve;
        current = null;
        modal.classList.remove('show');
        modal.setAttribute('aria-hidden', 'true');
        resolve(variant);
    }

    // Resolves to the chosen variant, or null if cancelled. Items without
    // alternates resolve to the primary variant immediately.
    function choose(base, currentVariant) {
        const options = buildOptions(base);
        if (options.length === 1) return Promise.resolve(options[0]);
        ensureModal();
        return new Promise(function (resolve) {
            current = { options: options, resolve: resolve };
            selectedIdx = 0;
            if (currentVariant && !currentVariant.isPrimary) {
                const idx = options.findIndex(o => o.label === currentVariant.label);
                if (idx > 0) selectedIdx = idx;
            }
            title.textContent = 'Choose variant for "' + base.name + '"';
            render();
            modal.classList.add('show');
            modal.setAttribute('aria-hidden', 'false');
            confirmBtn.focus();
        });
    }

    async function chooseMany(bases) {
        const results = [];
        for (const base of bases) {
            const variant = await choose(base);
            if (!variant) break;
            results.push({ baseItem: base, variant: variant });
        }
        return results;
    }

    return { choose, chooseMany, primaryVariant };
})();

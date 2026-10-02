// New Order (shop) page: browse inventory as product cards and add items to
// the shared order cart (CartManager, localStorage). The cart itself lives on
// its own page at /orders/cart.
document.addEventListener('DOMContentLoaded', function () {
    if (!window.CartManager) return;

    const grid = document.getElementById('productGrid');
    const cards = grid ? Array.from(grid.querySelectorAll('.product-card')) : [];
    const searchBar = document.getElementById('orderSearchBar');
    const sortSelect = document.getElementById('shopSort');
    const chips = document.querySelectorAll('.shop-chip');
    const resultsCount = document.getElementById('shopResultsCount');
    const emptyState = document.getElementById('shopEmpty');
    const emptyText = document.getElementById('shopEmptyText');
    const cartTotalEl = document.getElementById('shopCartTotal');
    const mobileCartBar = document.getElementById('shopMobileCartBar');
    const mobileCartTotal = document.getElementById('shopMobileCartTotal');

    let activeFilter = 'all';

    // ----- Helpers -----
    function parseAlternates(card) {
        try {
            const arr = JSON.parse(card.dataset.itemAlternates || '[]');
            return Array.isArray(arr) ? arr : [];
        } catch (e) {
            return [];
        }
    }

    function cardToItem(card) {
        return {
            itemId: card.dataset.itemId,
            name: card.dataset.itemName,
            brand: card.dataset.itemBrand || '',
            vendor: card.dataset.itemVendor || '',
            catalog: card.dataset.itemCatalog || '',
            quantity: 1,
            cost: parseFloat(card.dataset.itemCost) || 0,
            currentQty: parseInt(card.dataset.itemQuantity, 10) || 0,
            minQty: parseInt(card.dataset.itemMin, 10) || 0,
            maxQty: parseInt(card.dataset.itemMax, 10) || 0,
            alternates: parseAlternates(card)
        };
    }

    function formatMoney(n) {
        return '$' + (Number(n) || 0).toFixed(2);
    }

    // ----- Card action area (Add button or in-cart stepper) -----
    function renderCardActions(card, cart) {
        const actions = card.querySelector('.product-actions');
        const entry = cart[card.dataset.itemId];
        card.classList.toggle('in-cart', !!entry);

        if (!entry) {
            actions.innerHTML =
                '<button type="button" class="product-add-btn" data-action="add">' +
                    '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>' +
                    'Add to cart' +
                '</button>';
            return;
        }

        const variant = entry.selectedVariant;
        const variantNote = variant && !variant.isPrimary
            ? '<span class="product-variant-note">' + escapeHtml(variant.label) + '</span>'
            : '';
        actions.innerHTML =
            '<div class="product-in-cart">' +
                '<span class="product-in-cart-label">' +
                    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>' +
                    'In cart' + variantNote +
                '</span>' +
                '<div class="qty-stepper">' +
                    '<button type="button" data-action="dec" aria-label="Decrease quantity">−</button>' +
                    '<input type="number" min="1" value="' + entry.quantity + '" data-action="qty" aria-label="Quantity">' +
                    '<button type="button" data-action="inc" aria-label="Increase quantity">+</button>' +
                '</div>' +
            '</div>';
    }

    function refreshCartState() {
        const cart = CartManager.getOrderCart();
        cards.forEach(card => renderCardActions(card, cart));

        let total = 0;
        let count = 0;
        Object.values(cart).forEach(entry => {
            total += (entry.cost || 0) * (entry.quantity || 0);
            count++;
        });
        if (cartTotalEl) cartTotalEl.textContent = formatMoney(total);
        if (mobileCartTotal) mobileCartTotal.textContent = formatMoney(total);
        if (mobileCartBar) mobileCartBar.hidden = count === 0;
        CartManager.updateCartBadges();
        if (activeFilter === 'incart') applyView();
    }

    function bumpCartButton() {
        const btn = document.getElementById('shopCartBtn');
        if (!btn) return;
        btn.classList.remove('bump');
        void btn.offsetWidth; // restart animation
        btn.classList.add('bump');
    }

    // Adds items to the cart, asking for a variant where alternates exist.
    async function addItems(items) {
        const toAdd = [];
        const needChoice = [];
        const cart = CartManager.getOrderCart();
        items.forEach(item => {
            if (cart[item.itemId]) return;
            if (item.alternates.length > 0) needChoice.push(item);
            else toAdd.push({ baseItem: item, variant: null });
        });
        if (needChoice.length > 0) {
            toAdd.push(...await OrderVariantPicker.chooseMany(needChoice));
        }
        toAdd.forEach(({ baseItem, variant }) => {
            CartManager.addToOrderCart(Object.assign({}, baseItem, {
                selectedVariant: variant || OrderVariantPicker.primaryVariant(baseItem)
            }));
        });
        if (toAdd.length > 0) {
            CartManager.showToast(toAdd.length === 1
                ? toAdd[0].baseItem.name + ' added to cart'
                : toAdd.length + ' items added to cart');
            bumpCartButton();
        }
        refreshCartState();
    }

    function setQuantity(itemId, qty) {
        if (qty <= 0) {
            CartManager.removeFromOrderCart(itemId);
        } else {
            CartManager.updateOrderCartItem(itemId, { quantity: qty });
        }
        refreshCartState();
    }

    if (grid) {
        grid.addEventListener('click', function (e) {
            const btn = e.target.closest('[data-action]');
            if (!btn || btn.tagName === 'INPUT') return;
            const card = btn.closest('.product-card');
            const itemId = card.dataset.itemId;
            const entry = CartManager.getOrderCart()[itemId];
            if (btn.dataset.action === 'add') {
                addItems([cardToItem(card)]);
            } else if (btn.dataset.action === 'inc' && entry) {
                setQuantity(itemId, (entry.quantity || 1) + 1);
            } else if (btn.dataset.action === 'dec' && entry) {
                setQuantity(itemId, (entry.quantity || 1) - 1);
            }
        });
        grid.addEventListener('change', function (e) {
            if (e.target.dataset.action !== 'qty') return;
            const itemId = e.target.closest('.product-card').dataset.itemId;
            const val = parseInt(e.target.value, 10);
            if (val > 0) setQuantity(itemId, val);
            else refreshCartState();
        });
    }

    // ----- Restock banner -----
    const addAllRecommendedBtn = document.getElementById('addAllRecommendedBtn');
    if (addAllRecommendedBtn) {
        addAllRecommendedBtn.addEventListener('click', function () {
            addItems(cards.filter(c => c.dataset.low === '1').map(cardToItem));
        });
    }
    const showLowStockBtn = document.getElementById('showLowStockBtn');
    if (showLowStockBtn) {
        showLowStockBtn.addEventListener('click', function () {
            setFilter('low');
            if (grid) grid.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
    }

    // ----- Search, filter, sort -----
    // Ranked fuzzy matcher over name/brand/vendor/catalog, keyed by itemId.
    // Falls back to substring matching if Fuse isn't available.
    let itemMatcher = null;
    function ensureItemMatcher() {
        if (itemMatcher) return itemMatcher;
        if (typeof window.createRankedFuzzyFilter !== 'function') return null;
        itemMatcher = window.createRankedFuzzyFilter(cards.map(card => ({
            key: card.dataset.itemId,
            text: [card.dataset.itemName, card.dataset.itemBrand, card.dataset.itemVendor, card.dataset.itemCatalog]
                .filter(Boolean).join(' ')
        })));
        return itemMatcher;
    }

    const sorters = {
        name: (a, b) => a.dataset.itemName.localeCompare(b.dataset.itemName, undefined, { sensitivity: 'base' }),
        stock: (a, b) => stockRatio(a) - stockRatio(b) || sorters.name(a, b),
        'price-asc': (a, b) => parseFloat(a.dataset.itemCost) - parseFloat(b.dataset.itemCost) || sorters.name(a, b),
        'price-desc': (a, b) => parseFloat(b.dataset.itemCost) - parseFloat(a.dataset.itemCost) || sorters.name(a, b)
    };

    // How well stocked an item is relative to its minimum (lower = more urgent).
    function stockRatio(card) {
        const cur = parseInt(card.dataset.itemQuantity, 10) || 0;
        const min = parseInt(card.dataset.itemMin, 10) || 0;
        return min > 0 ? cur / min : cur + 1000;
    }

    function applyView() {
        if (!grid) return;
        const query = searchBar.value.trim().toLowerCase();
        const cart = CartManager.getOrderCart();
        const matcher = query ? ensureItemMatcher() : null;
        const ranked = matcher ? matcher(query) : null;

        let visible = cards.filter(card => {
            if (activeFilter === 'low' && card.dataset.low !== '1') return false;
            if (activeFilter === 'incart' && !cart[card.dataset.itemId]) return false;
            if (!query) return true;
            if (ranked) return ranked.set.has(card.dataset.itemId);
            return [card.dataset.itemName, card.dataset.itemBrand, card.dataset.itemVendor, card.dataset.itemCatalog]
                .some(v => (v || '').toLowerCase().includes(query));
        });

        if (ranked) {
            const rank = new Map(ranked.order.map((id, i) => [id, i]));
            visible.sort((a, b) => rank.get(a.dataset.itemId) - rank.get(b.dataset.itemId));
        } else {
            visible.sort(sorters[sortSelect.value] || sorters.name);
        }

        const visibleSet = new Set(visible);
        cards.forEach(card => { card.hidden = !visibleSet.has(card); });
        visible.forEach(card => grid.appendChild(card));

        if (cards.length > 0) {
            emptyState.hidden = visible.length > 0;
            if (activeFilter === 'incart' && !query) emptyText.textContent = 'Your cart is empty.';
            else emptyText.textContent = 'No items match your search.';
        }
        resultsCount.textContent = cards.length
            ? 'Showing ' + visible.length + ' of ' + cards.length + ' item' + (cards.length !== 1 ? 's' : '')
            : '';
    }

    function setFilter(filter) {
        activeFilter = filter;
        chips.forEach(chip => chip.classList.toggle('active', chip.dataset.filter === filter));
        applyView();
    }

    chips.forEach(chip => chip.addEventListener('click', () => setFilter(chip.dataset.filter)));
    sortSelect.addEventListener('change', applyView);
    let searchTimer = null;
    searchBar.addEventListener('input', function () {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(applyView, 120);
    });

    // Keep in sync if the cart changes in another tab (e.g. the cart page).
    window.addEventListener('storage', function (e) {
        if (e.key === 'vfp_orderCart') refreshCartState();
    });

    function escapeHtml(str) {
        if (str === null || str === undefined) return '';
        const div = document.createElement('div');
        div.appendChild(document.createTextNode(String(str)));
        return div.innerHTML;
    }

    refreshCartState();
    applyView();
});

// Shared Cart Manager - uses localStorage for persistent carts across pages
window.CartManager = (function() {
    const ORDER_CART_KEY = 'vfp_orderCart';
    const CONSUME_CART_KEY = 'vfp_consumeCart';

    function getCart(key) {
        try {
            const data = localStorage.getItem(key);
            return data ? JSON.parse(data) : {};
        } catch (e) {
            return {};
        }
    }

    function saveCart(key, cart) {
        localStorage.setItem(key, JSON.stringify(cart));
        updateCartBadges();
    }

    // Order Cart
    function addToOrderCart(item) {
        const cart = getCart(ORDER_CART_KEY);
        if (!cart[item.itemId]) {
            cart[item.itemId] = {
                itemId: item.itemId,
                name: item.name,
                brand: item.brand || '',
                catalog: item.catalog || '',
                quantity: item.quantity || 1,
                cost: item.cost || 0,
                currentQty: item.currentQty || 0,
                minQty: item.minQty || 0,
                maxQty: item.maxQty || 0
            };
        }
        saveCart(ORDER_CART_KEY, cart);
        return true;
    }

    function removeFromOrderCart(itemId) {
        const cart = getCart(ORDER_CART_KEY);
        delete cart[itemId];
        saveCart(ORDER_CART_KEY, cart);
    }

    function getOrderCart() {
        return getCart(ORDER_CART_KEY);
    }

    function clearOrderCart() {
        localStorage.removeItem(ORDER_CART_KEY);
        updateCartBadges();
    }

    function getOrderCartCount() {
        return Object.keys(getCart(ORDER_CART_KEY)).length;
    }

    // Consume Cart
    function addToConsumeCart(item) {
        const cart = getCart(CONSUME_CART_KEY);
        if (!cart[item.itemId]) {
            cart[item.itemId] = {
                itemId: item.itemId,
                name: item.name,
                brand: item.brand || '',
                catalog: item.catalog || '',
                consumeQuantity: item.consumeQuantity || 1,
                currentQty: item.currentQty || 0
            };
        }
        saveCart(CONSUME_CART_KEY, cart);
        return true;
    }

    function removeFromConsumeCart(itemId) {
        const cart = getCart(CONSUME_CART_KEY);
        delete cart[itemId];
        saveCart(CONSUME_CART_KEY, cart);
    }

    function getConsumeCart() {
        return getCart(CONSUME_CART_KEY);
    }

    function clearConsumeCart() {
        localStorage.removeItem(CONSUME_CART_KEY);
        updateCartBadges();
    }

    function getConsumeCartCount() {
        return Object.keys(getCart(CONSUME_CART_KEY)).length;
    }

    // Update badge counts in the floating cart widget
    function updateCartBadges() {
        const orderBadge = document.getElementById('orderCartBadge');
        const consumeBadge = document.getElementById('consumeCartBadge');
        const orderCount = getOrderCartCount();
        const consumeCount = getConsumeCartCount();

        if (orderBadge) {
            orderBadge.textContent = orderCount;
            orderBadge.style.display = orderCount > 0 ? 'flex' : 'none';
        }
        if (consumeBadge) {
            consumeBadge.textContent = consumeCount;
            consumeBadge.style.display = consumeCount > 0 ? 'flex' : 'none';
        }

        // Show/hide the floating widget
        const widget = document.getElementById('floatingCartWidget');
        if (widget) {
            widget.style.display = (orderCount > 0 || consumeCount > 0) ? 'flex' : 'none';
        }
    }

    // Show a brief toast notification
    function showToast(message) {
        let toast = document.getElementById('cartToast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'cartToast';
            toast.style.cssText = 'position:fixed;bottom:80px;right:20px;background:#333;color:#fff;padding:10px 20px;border-radius:6px;font-size:14px;z-index:10001;opacity:0;transition:opacity 0.3s;pointer-events:none;';
            document.body.appendChild(toast);
        }
        toast.textContent = message;
        toast.style.opacity = '1';
        setTimeout(() => { toast.style.opacity = '0'; }, 2000);
    }

    // Initialize badges on page load
    document.addEventListener('DOMContentLoaded', updateCartBadges);

    return {
        addToOrderCart,
        removeFromOrderCart,
        getOrderCart,
        clearOrderCart,
        getOrderCartCount,
        addToConsumeCart,
        removeFromConsumeCart,
        getConsumeCart,
        clearConsumeCart,
        getConsumeCartCount,
        updateCartBadges,
        showToast
    };
})();

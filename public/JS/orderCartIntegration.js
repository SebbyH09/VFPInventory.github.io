// Integration: loads items from the shared order cart into the new order page
document.addEventListener('DOMContentLoaded', function() {
    if (!window.CartManager) return;

    const orderCart = CartManager.getOrderCart();
    const itemIds = Object.keys(orderCart);
    if (itemIds.length === 0) return;

    // Wait a tick for newOrder.js to initialize
    setTimeout(function() {
        if (!window._orderCart || !window._renderOrderCart) return;

        const cart = window._orderCart;
        let addedCount = 0;

        itemIds.forEach(function(itemId) {
            const cartItem = orderCart[itemId];
            if (cart.has(itemId)) return;

            // Find the row in the inventory table to get fresh data
            const row = document.querySelector('#inventoryTable tr[data-item-id="' + itemId + '"]');
            const currentQty = row
                ? parseInt(row.getAttribute('data-item-quantity')) || cartItem.currentQty
                : cartItem.currentQty;
            const cost = row
                ? parseFloat(row.getAttribute('data-item-cost')) || cartItem.cost
                : cartItem.cost;

            cart.set(itemId, {
                itemId: itemId,
                name: cartItem.name,
                brand: cartItem.brand || '',
                quantity: cartItem.quantity || 1,
                cost: cost || 0,
                currentQty: currentQty || 0
            });
            addedCount++;
        });

        if (addedCount > 0) {
            window._renderOrderCart();
            // Clear the order cart after loading into the page
            CartManager.clearOrderCart();

            // Switch to cart tab on mobile
            const cartTab = document.querySelector('.mobile-tab[data-tab="cart"]');
            if (cartTab && window.innerWidth <= 768) {
                cartTab.click();
            }
        }
    }, 100);
});

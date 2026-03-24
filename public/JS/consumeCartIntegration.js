// Integration: loads items from the shared consume cart into the consume page
document.addEventListener('DOMContentLoaded', function() {
    if (!window.CartManager) return;

    const consumeCart = CartManager.getConsumeCart();
    const itemIds = Object.keys(consumeCart);
    if (itemIds.length === 0) return;

    // Wait a tick for consume.js to initialize
    setTimeout(function() {
        if (typeof selectedItems === 'undefined') return;

        let addedCount = 0;
        itemIds.forEach(function(itemId) {
            const cartItem = consumeCart[itemId];
            if (selectedItems.has(itemId)) return;

            // Find the row in the inventory table to get fresh currentQuantity
            const row = document.querySelector('#inventoryTable tr[data-item-id="' + itemId + '"]');
            const currentQty = row
                ? parseInt(row.getAttribute('data-item-quantity')) || cartItem.currentQty
                : cartItem.currentQty;

            if (currentQty <= 0) return;

            selectedItems.set(itemId, {
                id: itemId,
                name: cartItem.name,
                brand: cartItem.brand || '',
                currentQuantity: currentQty,
                consumeQuantity: Math.min(cartItem.consumeQuantity || 1, currentQty)
            });
            addedCount++;
        });

        if (addedCount > 0) {
            renderSelectedItems();
            // Clear the consume cart after loading
            CartManager.clearConsumeCart();

            // Switch to selected items tab on mobile
            const selectedTab = document.querySelector('.mobile-tab[data-tab="selected"]');
            if (selectedTab && window.innerWidth <= 768) {
                selectedTab.click();
            }
        }
    }, 100);
});

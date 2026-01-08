document.addEventListener('DOMContentLoaded', function() {
  // Attach event listeners to dropdown buttons
  const orderDropdownBtn = document.getElementById('order-dropdown-btn');
  const inventoryDropdownBtn = document.getElementById('inventory-dropdown-btn');

  if (orderDropdownBtn) {
    orderDropdownBtn.addEventListener('click', toggleDropdown);
  }

  if (inventoryDropdownBtn) {
    inventoryDropdownBtn.addEventListener('click', toggleInventoryDropdown);
  }
});

function toggleDropdown() {
  const content = document.getElementById("dropdown-content");
  content.style.display = (content.style.display === "block") ? "none" : "block";
}

function toggleInventoryDropdown() {
  const content = document.getElementById("inventory-dropdown-content");
  content.style.display = (content.style.display === "block") ? "none" : "block";
}

// Optional: close dropdown when clicking outside
window.onclick = function(event) {
  if (!event.target.matches('.dropbtn')) {
    const dropdowns = document.getElementsByClassName("dropdown-content");
    for (let i = 0; i < dropdowns.length; i++) {
      dropdowns[i].style.display = "none";
    }
  }
};
document.addEventListener('DOMContentLoaded', function() {
  const orderDropdownBtn = document.getElementById('order-dropdown-btn');
  const inventoryDropdownBtn = document.getElementById('inventory-dropdown-btn');
  const hamburgerBtn = document.getElementById('hamburger-btn');
  const navMenu = document.getElementById('nav-menu');

  if (orderDropdownBtn) {
    orderDropdownBtn.addEventListener('click', toggleDropdown);
  }

  if (inventoryDropdownBtn) {
    inventoryDropdownBtn.addEventListener('click', toggleInventoryDropdown);
  }

  // Hamburger menu toggle
  if (hamburgerBtn && navMenu) {
    hamburgerBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      hamburgerBtn.classList.toggle('active');
      navMenu.classList.toggle('open');
    });
  }

  // Close mobile menu when a nav link is clicked
  if (navMenu) {
    navMenu.querySelectorAll('a').forEach(function(link) {
      link.addEventListener('click', function() {
        if (window.innerWidth <= 768) {
          navMenu.classList.remove('open');
          if (hamburgerBtn) hamburgerBtn.classList.remove('active');
        }
      });
    });
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

// Close dropdowns and mobile menu when clicking outside
window.onclick = function(event) {
  if (!event.target.matches('.dropbtn')) {
    const dropdowns = document.getElementsByClassName("dropdown-content");
    for (let i = 0; i < dropdowns.length; i++) {
      dropdowns[i].style.display = "none";
    }
  }

  const navMenu = document.getElementById('nav-menu');
  const hamburgerBtn = document.getElementById('hamburger-btn');
  if (navMenu && hamburgerBtn) {
    if (!navMenu.contains(event.target) && !hamburgerBtn.contains(event.target)) {
      navMenu.classList.remove('open');
      hamburgerBtn.classList.remove('active');
    }
  }
};

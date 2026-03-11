document.addEventListener('DOMContentLoaded', function() {
    // Sidebar mobile toggle
    var hamburgerBtn = document.getElementById('hamburger-btn');
    var sidebar = document.getElementById('sidebar');
    var overlay = document.getElementById('sidebar-overlay');

    if (hamburgerBtn) {
        hamburgerBtn.addEventListener('click', function() {
            sidebar.classList.toggle('open');
            overlay.classList.toggle('active');
            hamburgerBtn.classList.toggle('active');
        });
    }

    if (overlay) {
        overlay.addEventListener('click', function() {
            sidebar.classList.remove('open');
            overlay.classList.remove('active');
            hamburgerBtn.classList.remove('active');
        });
    }

    // Close sidebar when a nav link is clicked on mobile
    document.querySelectorAll('.sidebar-link').forEach(function(link) {
        link.addEventListener('click', function() {
            if (window.innerWidth <= 1024) {
                sidebar.classList.remove('open');
                overlay.classList.remove('active');
                hamburgerBtn.classList.remove('active');
            }
        });
    });

    // Orders dropdown toggle
    document.querySelectorAll('.sidebar-dropdown-toggle').forEach(function(btn) {
        btn.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            var dropdown = this.closest('.sidebar-dropdown');
            dropdown.classList.toggle('open');
        });
    });

    // Highlight active sidebar link based on current path
    var currentPath = window.location.pathname;
    document.querySelectorAll('.sidebar-link').forEach(function(link) {
        link.classList.remove('active');
        if (link.getAttribute('href') === currentPath) {
            link.classList.add('active');
        }
    });

    // Auto-open orders dropdown if an orders sublink is active
    if (currentPath.startsWith('/orders')) {
        document.querySelectorAll('.sidebar-dropdown').forEach(function(dropdown) {
            var hasActiveChild = dropdown.querySelector('.sidebar-link.active');
            if (hasActiveChild) {
                dropdown.classList.add('open');
            }
        });
    }
});

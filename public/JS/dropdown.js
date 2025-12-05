function toggleDropdown() {
    const content = document.getElementById("dropdown-content");
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
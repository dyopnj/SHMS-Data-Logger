// ============================================
// GLOBAL FUNCTIONS
// ============================================

// Logout
function logout() {
    if (confirm('Yakin ingin keluar?')) {
        window.location.href = 'index.html';
    }
}

// Highlight sidebar sesuai halaman aktif
document.addEventListener('DOMContentLoaded', function() {
    const currentPage = window.location.pathname.split('/').pop();
    document.querySelectorAll('.sidebar nav a').forEach(link => {
        const href = link.getAttribute('href');
        if (href === currentPage) {
            link.classList.add('bg-secondary-container', 'text-on-secondary-container');
            link.classList.remove('text-on-surface-variant');
        }
    });
});

// Jika ada tombol logout di header/sidebar, pasang event
document.querySelectorAll('.btn-logout, .logout-btn').forEach(btn => {
    btn.addEventListener('click', logout);
});
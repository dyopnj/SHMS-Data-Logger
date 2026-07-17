// ============================================
// SHARED — sidebar, logout, WebSocket helper
// ============================================

// Highlight sidebar sesuai halaman aktif
document.addEventListener('DOMContentLoaded', function () {
    const page = window.location.pathname.split('/').pop() || 'index.html';
    document.querySelectorAll('aside nav a, .sidebar nav a').forEach(link => {
        const href = link.getAttribute('href');
        if (href === page) {
            link.classList.add('bg-secondary-container', 'text-on-secondary-container');
            link.classList.remove('text-on-surface-variant');
        }
    });
});

// WebSocket helper — returns { ws, onData(cb) }
function connectWS(onData) {
    const ws = new WebSocket(`ws://${location.host}`);
    ws.onmessage = e => {
        try {
            const msg = JSON.parse(e.data);
            if (msg.type === 'data') onData(msg.payload);
        } catch (_) { }
    };
    ws.onclose = () => {
        document.querySelectorAll('.status-led').forEach(el => {
            el.className = 'status-led offline';
        });
    };
    return ws;
}

// Fetch helper
async function api(path) {
    const r = await fetch(path);
    return r.json();
}
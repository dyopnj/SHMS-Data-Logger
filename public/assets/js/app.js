// ============================================
// SHARED — theme toggle, node status, helpers
// ============================================

const SUN_ICON = '<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="5" stroke="currentColor" stroke-width="1.8"/><path d="M12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
const MOON_ICON = '<svg viewBox="0 0 24 24" fill="none"><path d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>';

// Terapkan tema ke <html> + ikon tombol
function applyTheme(t) {
    const dark = t === 'dark';
    document.documentElement.classList.toggle('dark', dark);
    const btn = document.getElementById('themeToggle');
    if (btn) btn.innerHTML = dark ? MOON_ICON : SUN_ICON;
}

function toggleTheme() {
    const t = document.documentElement.classList.contains('dark') ? 'light' : 'dark';
    localStorage.setItem('theme', t);
    applyTheme(t);
    window.dispatchEvent(new CustomEvent('themechange'));
}

// Sync node status dari MQTT connection
async function syncNodeStatus() {
    const el = document.getElementById('nodeStatus');
    if (!el) return;
    try {
        const st = await api('/api/status/mqtt');
        el.textContent = st.connected ? 'NODE STATUS: ACTIVE' : 'NODE STATUS: OFFLINE';
    } catch (_) { }
}

document.addEventListener('DOMContentLoaded', function () {
    applyTheme(localStorage.getItem('theme') || 'dark');
    document.getElementById('themeToggle')?.addEventListener('click', toggleTheme);
    syncNodeStatus();
    setInterval(syncNodeStatus, 10000);
});

// WebSocket helper — reconnect otomatis biar tab pulih setelah backend restart
function connectWS(onData) {
    let ws;
    const open = () => {
        ws = new WebSocket(`ws://${location.host}`);
        ws.onmessage = e => {
            try {
                const msg = JSON.parse(e.data);
                if (msg.type === 'data') onData(msg.payload);
            } catch (_) { }
        };
        ws.onclose = () => {
            document.querySelectorAll('.status-led').forEach(el => el.classList.add('offline'));
            setTimeout(open, 3000);
        };
    };
    open();
    return ws;
}

// Fetch helper
async function api(path) {
    const r = await fetch(path);
    return r.json();
}

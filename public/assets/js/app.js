// ============================================
// SHARED — header, sidebar, WebSocket helper
// ============================================

// Render header (judul + status + theme toggle + profile)
function renderHeader() {
    const el = document.getElementById('header');
    if (!el) return;
    const theme = localStorage.getItem('theme') || 'dark';
    el.innerHTML = `
<header class="sticky top-0 z-30 flex shrink-0 justify-between items-center w-full px-margin-desktop h-16 bg-background border-b border-outline-variant">
  <span class="font-headline-md font-bold text-primary">SHMS - SIMON BATAPA 2026</span>
  <div class="flex items-center gap-3">
    <span class="status-led online"></span>
    <span class="font-label-mono text-label-mono text-secondary">LIVE</span>
    <button id="themeToggle" class="w-9 h-9 flex items-center justify-center rounded-full bg-surface-container-high hover:bg-surface-variant border border-outline-variant transition-colors" title="Toggle theme">
      <span class="material-symbols-outlined text-[20px] text-on-surface-variant">${theme === 'dark' ? 'dark_mode' : 'light_mode'}</span>
    </button>
    <a href="profile.html" class="w-9 h-9 flex items-center justify-center rounded-full bg-surface-container-high hover:bg-surface-variant border border-outline-variant transition-colors" title="Profile">
      <span class="material-symbols-outlined text-[20px] text-on-surface-variant">person</span>
    </a>
  </div>
</header>`;
    document.getElementById('themeToggle')?.addEventListener('click', toggleTheme);
}

// Toggle dark/light mode
function toggleTheme() {
    const html = document.documentElement;
    const isDark = html.classList.toggle('dark');
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
    const icon = document.querySelector('#themeToggle .material-symbols-outlined');
    if (icon) icon.textContent = isDark ? 'dark_mode' : 'light_mode';
    window.dispatchEvent(new CustomEvent('themechange'));
}

// Render sidebar (nav menu + logout)
function renderSidebar() {
    const el = document.getElementById('sidebar');
    if (!el) return;
    el.innerHTML = `
<aside class="sidebar fixed left-0 top-0 h-full flex flex-col p-4 z-40 bg-surface-container-low border-r border-outline-variant w-sidebar-width">
<div class="mb-6 px-2 flex items-center gap-3">
  <img src="assets/js/logo.png" alt="SHMS" class="w-10 h-10 rounded-lg">
  <div>
    <h1 class="font-headline-md font-bold text-primary">Bridge Monitor</h1>
    <p id="nodeStatus" class="text-secondary font-label-mono uppercase tracking-widest text-[10px]">NODE STATUS: ACTIVE</p>
  </div>
</div>
<nav class="space-y-2 flex-1">
  <a href="home.html" class="flex items-center gap-3 px-4 py-3 text-on-surface-variant hover:bg-surface-variant rounded-lg"><span class="material-symbols-outlined">dashboard</span><span class="nav-text font-body-md">Home</span></a>
  <a href="analysis.html" class="flex items-center gap-3 px-4 py-3 text-on-surface-variant hover:bg-surface-variant rounded-lg"><span class="material-symbols-outlined">show_chart</span><span class="nav-text font-body-md">Analysis</span></a>
  <a href="logs.html" class="flex items-center gap-3 px-4 py-3 text-on-surface-variant hover:bg-surface-variant rounded-lg"><span class="material-symbols-outlined">database</span><span class="nav-text font-body-md">Logs</span></a>
  <a href="settings.html" class="flex items-center gap-3 px-4 py-3 text-on-surface-variant hover:bg-surface-variant rounded-lg"><span class="material-symbols-outlined">settings</span><span class="nav-text font-body-md">Settings</span></a>
</nav>
<div class="mt-auto flex flex-col gap-2 pt-4 border-t border-outline-variant">
  <a href="logs.html" class="flex items-center justify-center gap-2 bg-primary text-on-primary font-bold py-2 rounded-lg hover:opacity-90 active:scale-95 transition-all text-sm">
    <span class="material-symbols-outlined text-[18px]">download</span> Export Report
  </a>
  <a href="index.html" class="flex items-center gap-3 px-4 py-2 text-on-surface-variant hover:bg-surface-variant rounded-lg transition-all text-sm">
    <span class="material-symbols-outlined">logout</span><span class="nav-text font-body-md">Logout</span>
  </a>
</div>
</aside>`;
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

// Highlight sidebar sesuai halaman aktif
document.addEventListener('DOMContentLoaded', function () {
    renderSidebar();
    renderHeader();
    syncNodeStatus();
    setInterval(syncNodeStatus, 10000);
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
// ============================================
// LOGS — Export Configuration & History
// ============================================

document.addEventListener('DOMContentLoaded', function () {
    const now = new Date();
    const past = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    document.getElementById('exportStart').value = past.toISOString().slice(0, 19);
    document.getElementById('exportEnd').value = now.toISOString().slice(0, 19);

    document.getElementById('btnExport').addEventListener('click', handleExport);
    loadHistory();
});

async function handleExport() {
    const btn = document.getElementById('btnExport');
    btn.disabled = true;
    btn.innerHTML = '<span class="material-symbols-outlined">sync</span> Exporting...';

    const node_id = document.getElementById('exportNode').value;
    const start_time = document.getElementById('exportStart').value;
    const end_time = document.getElementById('exportEnd').value;

    if (!start_time || !end_time) {
        alert('Pilih start time dan end time!');
        btn.disabled = false;
        btn.innerHTML = '<span class="material-symbols-outlined">download</span> Export to CSV';
        return;
    }

    try {
        const res = await fetch('/api/export', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                node_id,
                start_time: new Date(start_time).toISOString(),
                end_time: new Date(end_time).toISOString(),
            }),
        });
        const data = await res.json();
        btn.innerHTML = `<span class="material-symbols-outlined">check</span> OK ${data.rows} baris`;
        loadHistory();
    } catch (err) {
        btn.innerHTML = '<span class="material-symbols-outlined">close</span> Gagal';
    }
    setTimeout(() => {
        btn.disabled = false;
        btn.innerHTML = '<span class="material-symbols-outlined">download</span> Export to CSV';
    }, 2000);
}

async function loadHistory() {
    try {
        const data = await api('/api/exports');
        const tbody = document.getElementById('exportHistoryBody');
        if (!data.length) {
            tbody.innerHTML = '<tr class="hover:bg-surface-variant/50 border-b border-outline-variant/30"><td class="p-3 text-on-surface-variant" colspan="4">Belum ada data export</td></tr>';
            return;
        }
        tbody.innerHTML = data.map(e => {
            const start = new Date(e.start_time).toLocaleString('id-ID');
            const end = new Date(e.end_time).toLocaleString('id-ID');
            const created = new Date(e.created_at + 'Z').toLocaleString('id-ID');
            return `<tr class="hover:bg-surface-variant/50 border-b border-outline-variant/30">
                <td class="p-3">${created}</td>
                <td class="p-3">${e.node_id}</td>
                <td class="p-3">${start} - ${end}</td>
                <td class="p-3"><a href="/exports/${e.filename}" class="text-primary hover:underline flex items-center gap-1"><span class="material-symbols-outlined text-sm">description</span>${e.filename}</a></td>
            </tr>`;
        }).join('');
    } catch (_) { }
}
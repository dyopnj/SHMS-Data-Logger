// ============================================
// LOGS — Export Configuration & History
// ============================================

const EXPORT_SVG = '<svg viewBox="0 0 24 24" fill="none"><path d="M12 3v12" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M7 10l5 5 5-5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M4 20h16" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';

document.addEventListener('DOMContentLoaded', function () {
    const now = new Date();
    const past = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    // datetime-local butuh waktu LOKAL (bukan UTC) supaya default range benar.
    const toLocalInput = d => {
        const p = n => String(n).padStart(2, '0');
        return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
    };
    document.getElementById('exportStart').value = toLocalInput(past);
    document.getElementById('exportEnd').value = toLocalInput(now);

    document.getElementById('btnExport').addEventListener('click', handleExport);
    loadHistory();
});

async function handleExport() {
    const btn = document.getElementById('btnExport');
    btn.disabled = true;
    btn.innerHTML = `${EXPORT_SVG} Exporting...`;

    const node_id = document.getElementById('exportNode').value;
    const start_time = document.getElementById('exportStart').value;
    const end_time = document.getElementById('exportEnd').value;

    if (!start_time || !end_time) {
        alert('Pilih start time dan end time!');
        btn.disabled = false;
        btn.innerHTML = `${EXPORT_SVG} Export to CSV`;
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
        btn.innerHTML = `${EXPORT_SVG} OK ${data.rows} baris`;
        loadHistory();
    } catch (err) {
        btn.innerHTML = `${EXPORT_SVG} Gagal`;
    }
    setTimeout(() => {
        btn.disabled = false;
        btn.innerHTML = `${EXPORT_SVG} Export to CSV`;
    }, 2000);
}

async function loadHistory() {
    try {
        const data = await api('/api/exports');
        const tbody = document.getElementById('exportHistoryBody');
        if (!data.length) {
            tbody.innerHTML = '<tr><td class="table-empty" colspan="4">Belum ada data export</td></tr>';
            return;
        }
        tbody.innerHTML = data.map(e => {
            const start = new Date(e.start_time).toLocaleString('id-ID');
            const end = new Date(e.end_time).toLocaleString('id-ID');
            const created = new Date(e.created_at.replace(' ', 'T') + 'Z').toLocaleString('id-ID');
            return `<tr>
                <td>${created}</td>
                <td>${e.node_id}</td>
                <td>${start} - ${end}</td>
                <td><a href="/exports/${e.filename}">${e.filename}</a></td>
            </tr>`;
        }).join('');
    } catch (_) { }
}

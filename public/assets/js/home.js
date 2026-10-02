// ============================================
// HOME PAGE - LIVE DATA (RMS + Freq + Tilt + Raw)
// ============================================

const NODE_IDS = ['node_01', 'node_02'];
const seen = { node_01: false, node_02: false };
// Payload terakhir per node + mode tampil (raw / calibrated)
const latest = { node_01: null, node_02: null };
const view = { accel: 'raw', gyro: 'raw' };

// Pelacak timing FR-02 (Delay & Actual Rate)
const nodeTiming = {
    node_01: { lastArrivalMs: 0, delays: [] },
    node_02: { lastArrivalMs: 0, delays: [] },
};

function updateTimingMetrics(nodeId, sampleCount, nominalHz) {
    const nowMs = performance.now();
    const st = nodeTiming[nodeId] || (nodeTiming[nodeId] = { lastArrivalMs: 0, delays: [] });
    const n = nodeId === 'node_01' ? 'n1' : 'n2';

    if (st.lastArrivalMs > 0) {
        const deltaMs = nowMs - st.lastArrivalMs;
        const targetMs = 1000;
        const delayMs = Math.abs(deltaMs - targetMs);

        st.delays.push(delayMs);
        if (st.delays.length > 30) st.delays.shift();

        // Hitung p95 & median delay
        const sorted = [...st.delays].sort((a, b) => a - b);
        const p95Idx = Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1);
        const p95 = sorted[p95Idx];
        const med = sorted[Math.floor(sorted.length * 0.5)];

        // Actual Rate (Hz)
        const count = sampleCount || 200;
        const actualRate = deltaMs > 200 && deltaMs < 5000 ? (count / (deltaMs / 1000)) : (nominalHz || 200);

        // Update UI spesifik per node
        const delayEl = document.getElementById(`delay-${n}`);
        const rateEl = document.getElementById(`rate-${n}`);
        const statBox = document.getElementById(`stat-timing-${n}`);

        if (delayEl) {
            delayEl.textContent = `${delayMs.toFixed(0)}ms`;
            if (delayMs <= 50) {
                delayEl.style.color = 'var(--green)';
            } else if (delayMs <= 150) {
                delayEl.style.color = 'var(--orange)';
            } else {
                delayEl.style.color = 'var(--red)';
            }
        }

        if (rateEl) {
            rateEl.textContent = `${actualRate.toFixed(1)}Hz`;
        }

        if (statBox) {
            statBox.title = `${nodeId.toUpperCase()}: Delay paket ${delayMs.toFixed(1)}ms | p95: ${p95.toFixed(1)}ms | Med: ${med.toFixed(1)}ms | Actual Rate: ${actualRate.toFixed(2)}Hz`;
        }
    }
    st.lastArrivalMs = nowMs;
}

function setEl(id, v, digits, suffix) {
    const el = document.getElementById(id);
    if (!el) return;
    if (v == null || isNaN(v)) { el.textContent = '--'; return; }
    el.textContent = Number(v).toFixed(digits) + (suffix || '');
}

function applyPayload(p) {
    const idx = NODE_IDS.indexOf(p && p.node_id);
    if (idx === -1) return;
    const n = idx + 1;
    const a = p.accelerometer, g = p.gyroscope;
    latest[p.node_id] = p;

    // RMS
    setEl(`rms-n${n}`, p.vibration && p.vibration.rms, 3);
    // Tilt (delta dari baseline — 0 setelah recalibrate)
    setEl(`tilt-n${n}-roll`, p.tilt && p.tilt.roll_delta, 1, '\u00B0');
    setEl(`tilt-n${n}-pitch`, p.tilt && p.tilt.pitch_delta, 1, '\u00B0');

    // Raw accel/gyro
    setEl(`acc-n${n}-x`, a && a.x, 3);
    setEl(`acc-n${n}-y`, a && a.y, 3);
    setEl(`acc-n${n}-z`, a && a.z, 3);
    setEl(`gyro-n${n}-x`, g && g.x, 2);
    setEl(`gyro-n${n}-y`, g && g.y, 2);
    setEl(`gyro-n${n}-z`, g && g.z, 2);

    // Render ulang kartu sesuai mode tampil (raw/calibrated)
    renderAxes('accel', 'acc');
    renderAxes('gyro', 'gyro');

    // Node status: ONLINE + SAMP / RATE ACTUAL + DELAY
    if (!seen[p.node_id]) {
        seen[p.node_id] = true;
        const badge = document.getElementById(`badge-n${n}`);
        if (badge) { badge.textContent = 'ONLINE'; badge.className = 'badge'; badge.style.background = 'var(--green-soft)'; badge.style.color = 'var(--green)'; }
    }
    updateTimingMetrics(p.node_id, p.sample_count, p.sampling_rate_hz);
}

// mode: 'accel' | 'gyro' → sumber data raw vs calibrated
function axisSource(mode) {
    if (view[mode] === 'raw') return { tag: 'RAW', data: mode === 'accel' ? 'accelerometer' : 'gyroscope' };
    return {
        tag: 'CAL',
        data: mode === 'accel' ? 'accelerometer_calibrated' : 'gyroscope_calibrated'
    };
}

function renderAxes(mode, idPrefix) {
    const { tag, data } = axisSource(mode);
    const tagEl = document.getElementById(`tag-${mode}`);
    if (tagEl) tagEl.textContent = tag;
    for (const id of NODE_IDS) {
        const p = latest[id];
        const src = p && p[data];
        const n = NODE_IDS.indexOf(id) + 1;
        setEl(`${idPrefix}-n${n}-x`, src && src.x, mode === 'accel' ? 3 : 2);
        setEl(`${idPrefix}-n${n}-y`, src && src.y, mode === 'accel' ? 3 : 2);
        setEl(`${idPrefix}-n${n}-z`, src && src.z, mode === 'accel' ? 3 : 2);
    }
}

function toggleAxes(mode) {
    view[mode] = view[mode] === 'raw' ? 'cal' : 'raw';
    renderAxes(mode, mode === 'accel' ? 'acc' : 'gyro');
}

async function fetchLatest() {
    for (const id of NODE_IDS) {
        try {
            const rows = await api(`/api/readings/${id}?limit=1`);
            if (Array.isArray(rows) && rows.length) applyPayload(rows[0]);
            const fft = await api(`/api/fft/${id}?limit=1`);
            if (Array.isArray(fft) && fft.length) {
                const map = { node_01: 1, node_02: 2 };
                setEl(`freq-n${map[id]}`, fft[0].dominant_freq, 1);
            }
        } catch (_) { /* backend belum jalan / belum ada data */ }
    }
}

// Kalibrasi accel semua node
async function recalibrateAll() {
    const btn = document.getElementById('btnRecalibrate');
    if (!btn) return;
    const orig = btn.innerHTML;
    btn.querySelector('.mini-val').textContent = '...';
    try {
        const res = await Promise.all(NODE_IDS.flatMap(id =>
            ['recalibrate', 'calibrate_accel'].map(action =>
                fetch(`/api/node/${id}/action`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action }),
                }).catch(() => null)
            )
        ));
        const ok = res.some(r => r && r.ok);
        btn.querySelector('.mini-val').textContent = ok ? 'OK' : 'Gagal';
    } catch (_) {
        btn.querySelector('.mini-val').textContent = 'Gagal';
    }
    setTimeout(() => { btn.innerHTML = orig; }, 1500);
}

// Total sampel time-series tersimpan (FR-01)
async function refreshQuality() {
    try {
        const results = await Promise.all(NODE_IDS.map(id => api(`/api/quality/${id}`)));
        const total = results.reduce((sum, q) => sum + (q?.total_samples || 0), 0);
        const dup = results.reduce((sum, q) => sum + (q?.duplicates || 0), 0);
        const gap = results.reduce((sum, q) => sum + (q?.gaps || 0), 0);
        setEl('samples-total', total, 0);
        const stat = document.getElementById('stat-samples');
        if (stat) stat.title = `Duplikat: ${dup}, Gap: ${gap}`;
    } catch (_) { /* backend belum jalan */ }
}

// Reset tampilan: data lama tetap di DB, yang tampil hanya data baru setelah ini
async function resetDataView() {
    if (!confirm('Reset tampilan data?\nData lama tetap tersimpan di database.\nYang tampil hanya data baru mulai sekarang.')) return;
    try {
        const r = await fetch('/api/reset', { method: 'POST' });
        const j = await r.json();
        if (!j.ok) throw new Error('reset gagal');
        // Muat ulang → nilai '--', badge OFFLINE, terisi lagi dari data baru via WS
        location.reload();
    } catch (_) {
        alert('Reset gagal — cek koneksi backend.');
    }
}

// ============================================
// TEST SESSION (START / STOP + STOPWATCH)
// ============================================
let activeSession = null;
let sessionTimerInterval = null;

function formatDuration(seconds) {
    const pad = n => String(n).padStart(2, '0');
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

function updateSessionUI(session) {
    activeSession = session;
    const btn = document.getElementById('btnSession');
    const title = document.getElementById('sessionTitle');
    const sub = document.getElementById('sessionSub');
    if (!btn || !title || !sub) return;

    if (session && session.status === 'active') {
        btn.className = 'session-btn session-btn-stop';
        title.textContent = 'STOP';
        const startMs = new Date(session.start_time).getTime();
        const tick = () => {
            const elapsedSec = Math.max(0, Math.floor((Date.now() - startMs) / 1000));
            sub.textContent = formatDuration(elapsedSec);
        };
        tick();
        if (sessionTimerInterval) clearInterval(sessionTimerInterval);
        sessionTimerInterval = setInterval(tick, 1000);
    } else {
        if (sessionTimerInterval) clearInterval(sessionTimerInterval);
        sessionTimerInterval = null;
        btn.className = 'session-btn session-btn-start';
        title.textContent = 'START';
        sub.textContent = 'SESSION';
    }
}

async function checkActiveSession() {
    try {
        const res = await api('/api/session/active');
        updateSessionUI(res?.session || null);
    } catch (_) {}
}

async function toggleSession() {
    const btn = document.getElementById('btnSession');
    if (!btn) return;
    btn.disabled = true;

    if (!activeSession) {
        try {
            const res = await fetch('/api/session/start', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({}),
            });
            const data = await res.json();
            if (data.ok && data.session) {
                updateSessionUI(data.session);
            } else {
                alert('Gagal memulai sesi.');
            }
        } catch (_) {
            alert('Gagal menghubungi server.');
        } finally {
            btn.disabled = false;
        }
    } else {
        try {
            const res = await fetch('/api/session/stop', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
            });
            const data = await res.json();
            if (data.ok) {
                updateSessionUI(null);
                const fileList = (data.exports || []).map(e => `${e.filename} (${e.rows} baris)`).join('\n');
                alert(`Sesi selesai!\nData berhasil otomatis disimpan ke folder exports:\n${fileList}`);
            } else {
                alert(data.error || 'Gagal menghentikan sesi.');
            }
        } catch (_) {
            alert('Gagal menghentikan sesi / menyimpan file.');
        } finally {
            btn.disabled = false;
        }
    }
}

document.addEventListener('DOMContentLoaded', function () {
    fetchLatest();
    refreshQuality();
    setInterval(refreshQuality, 5000);
    checkActiveSession();
    connectWS(applyPayload);
    document.getElementById('resetData')?.addEventListener('click', resetDataView);
    document.getElementById('btnRecalibrate')?.addEventListener('click', recalibrateAll);
    document.getElementById('btnSession')?.addEventListener('click', toggleSession);
    document.getElementById('btn-accel')?.addEventListener('click', () => toggleAxes('accel'));
    document.getElementById('btn-gyro')?.addEventListener('click', () => toggleAxes('gyro'));
});

// ============================================
// HOME PAGE - LIVE DATA (RMS + Tilt + Freq)
// ============================================

const NODE_IDS = ['node_01', 'node_02'];

function setVal(el, v, digits, suffix) {
    if (!el) return;
    if (v == null || isNaN(v)) { el.textContent = '--'; return; }
    el.textContent = Number(v).toFixed(digits) + (suffix || '');
}

// Elemen nilai per node di card Tilt (index urutan DOM, tanpa ubah HTML)
function tiltEls() {
    const blocks = document.querySelectorAll('.p-6.space-y-8 > div');
    return NODE_IDS.map((_, i) => {
        const rows = blocks[i] ? blocks[i].querySelectorAll('.space-y-4 > div') : [];
        return {
            roll: rows[0] ? rows[0].children[1] : null,
            rollD: rows[0] ? rows[0].children[2] : null,
            pitch: rows[1] ? rows[1].children[1] : null,
            pitchD: rows[1] ? rows[1].children[2] : null,
        };
    });
}

function applyPayload(p) {
    const idx = NODE_IDS.indexOf(p && p.node_id);
    if (idx === -1) return;
    const vals = document.querySelectorAll('.value-rms'); // [RMS N1, RMS N2, Freq N1, Freq N2]
    const tilt = tiltEls()[idx];

    setVal(vals[idx], p.vibration && p.vibration.rms, 3);
    setVal(tilt.roll, p.tilt && p.tilt.roll, 1, '\u00B0');
    setVal(tilt.pitch, p.tilt && p.tilt.pitch, 1, '\u00B0');
    setVal(tilt.rollD, p.tilt && p.tilt.roll_delta, 2, '\u00B0');
    setVal(tilt.pitchD, p.tilt && p.tilt.pitch_delta, 2, '\u00B0');
}

async function fetchLatest() {
    for (const id of NODE_IDS) {
        try {
            const rows = await api(`/api/readings/${id}?limit=1`);
            if (Array.isArray(rows) && rows.length) applyPayload(rows[0]);
            const fft = await api(`/api/fft/${id}?limit=1`);
            if (Array.isArray(fft) && fft.length) {
                const vals = document.querySelectorAll('.value-rms');
                setVal(vals[NODE_IDS.indexOf(id) + 2], fft[0].dominant_freq, 1);
            }
        } catch (_) { /* backend belum jalan / belum ada data */ }
    }
}

document.addEventListener('DOMContentLoaded', function () {
    fetchLatest();
    connectWS(applyPayload);
});
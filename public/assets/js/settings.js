// ============================================
// SETTINGS — config node (sampling/gain/interval)
// + action (recalibrate/restart/request_status)
// ============================================

const NODE_IDS = ['node_01', 'node_02'];

const SAVE_SVG = '<svg viewBox="0 0 24 24" fill="none"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M17 21v-8H7v8M7 3v5h8" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>';
const SYNC_SVG = '<svg viewBox="0 0 24 24" fill="none"><path d="M3 12a9 9 0 1 1 3 6.7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M3 16v-4h4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';

document.addEventListener('DOMContentLoaded', async function () {
    await loadConfig();
    await loadThresholds();
    await loadMqttStatus();
    detectIp();
    setInterval(loadMqttStatus, 5000);

    document.getElementById('btn-save-all').addEventListener('click', saveAll);
    document.getElementById('btn-save-threshold').addEventListener('click', saveThresholds);
    document.getElementById('btn-reset')?.addEventListener('click', resetDefault);

    // Gain selector (set active state saja, nilai diambil saat save)
    for (let i = 0; i < NODE_IDS.length; i++) {
        document.querySelectorAll(`#gain${i} .gain-btn`).forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll(`#gain${i} .gain-btn`).forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
            });
        });
    }

    // Zeroing / Recalibrate per node
    document.getElementById('btn-recal-0').addEventListener('click', () => runAction(0, 'recalibrate'));
    document.getElementById('btn-recal-1').addEventListener('click', () => runAction(1, 'recalibrate'));

    // Request status & restart (semua node)
    document.getElementById('btn-request-status').addEventListener('click', requestStatus);
    document.getElementById('btn-restart').addEventListener('click', () => runActionAll('restart'));
});

// Request status -> kirim command, tunggu balasan, tampil toast bottom-right
async function requestStatus() {
    await runActionAll('request_status');

    // Polling sampai balasan status masuk (atau timeout ~4 detik)
    const statuses = [];
    for (let attempt = 0; attempt < 8; attempt++) {
        const results = await Promise.all(NODE_IDS.map(async id => {
            const st = await api(`/api/node/${id}/status`).catch(() => null);
            return (st && st.status !== 'no_data') ? st : null;
        }));
        results.forEach((st, i) => { if (st) statuses[i] = st; });
        updateWifiCard(statuses);
        if (statuses.filter(Boolean).length === NODE_IDS.length) break;
        await new Promise(r => setTimeout(r, 500));
    }
    showStatusToast(statuses);
}

function updateWifiCard(statuses) {
    statuses.forEach((st, i) => {
        if (!st) return;
        const title = document.getElementById(`wifiNode${i}`);
        if (!title) return;
        const ssid = st.wifi_ssid || '--';
        const rssi = (st.wifi_rssi != null) ? `${st.wifi_rssi} dBm` : '--';
        const ip = st.wifi_ip || '--';
        title.textContent = `${st.node_id} — ${ssid} (${rssi}) · IP ${ip}`;
    });
}

function fmtUptime(s) {
    if (s == null || isNaN(s)) return '--';
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    return `${h}h ${m}m ${sec}s`;
}

function showStatusToast(statuses) {
    const nodes = statuses.filter(Boolean);
    const rows = nodes.length
        ? nodes.map(st => `
            <div class="toast-node">
              <div class="toast-node-title">${st.node_id}</div>
              <table class="toast-table">
                <tr><td>Uptime</td><td>${fmtUptime(st.uptime_s)}</td></tr>
                <tr><td>WiFi RSSI</td><td class="${st.wifi_rssi < -75 ? 'toast-bad' : 'toast-ok'}">${st.wifi_rssi} dBm</td></tr>
                <tr><td>SD Card</td><td class="${st.sd_ok ? 'toast-ok' : 'toast-bad'}">${st.sd_ok ? 'OK' : 'FAIL'}</td></tr>
                <tr><td>MQTT</td><td class="${st.mqtt_ok ? 'toast-ok' : 'toast-bad'}">${st.mqtt_ok ? 'OK' : 'FAIL'}</td></tr>
                <tr><td>Drop Rate</td><td>${st.drop_rate_pct}%</td></tr>
                <tr><td>Free Heap</td><td>${(st.free_heap / 1024).toFixed(0)} KB</td></tr>
              </table>
            </div>`).join('')
        : '<div class="toast-node">Tidak ada balasan status (node offline?)</div>';

    const el = document.createElement('div');
    el.className = 'toast';
    el.innerHTML = `
      <div class="toast-title">
        <svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.8"/><path d="M12 7v5l3 3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
        Node Status
        <button class="toast-close" title="Tutup">✕</button>
      </div>
      ${rows}`;
    document.body.appendChild(el);
    el.querySelector('.toast-close').onclick = () => el.remove();
    setTimeout(() => el.remove(), 8000);
}

function activeGain(i) {
    const active = document.querySelector(`#gain${i} .gain-btn.active`);
    return active ? parseInt(active.dataset.gain) : 1;
}

function renderFieldBadge(id, status, appliedVal, suffix = '') {
    const el = document.getElementById(id);
    if (!el) return;
    if (!status || status === 'applied') {
        el.className = 'field-cfg-badge applied';
        el.textContent = appliedVal != null ? `✓ ${appliedVal}${suffix}` : '✓ Applied';
        el.title = 'Konfigurasi telah diterapkan oleh node';
    } else if (status === 'pending') {
        el.className = 'field-cfg-badge pending';
        el.textContent = '⌛ Pending';
        el.title = 'Menunggu konfirmasi node...';
    } else if (status === 'rejected') {
        el.className = 'field-cfg-badge rejected';
        el.textContent = '✗ Rejected';
        el.title = 'Konfigurasi ditolak oleh node';
    }
}

async function loadConfig() {
    const cfg = await api('/api/config');
    document.getElementById('mqttBroker').value = cfg.mqtt_broker;

    for (let i = 0; i < NODE_IDS.length; i++) {
        const ncfg = await api(`/api/node/${NODE_IDS[i]}/config`);
        const rate = document.getElementById(`samplingRate${i}`);
        const raw = document.getElementById(`rawWindowInterval${i}`);
        if (rate && ncfg.sampling_rate) rate.value = String(ncfg.sampling_rate);
        if (raw && ncfg.raw_window_interval) raw.value = String(ncfg.raw_window_interval);
        if (ncfg.sensitivity_gain) {
            document.querySelectorAll(`#gain${i} .gain-btn`).forEach(b =>
                b.classList.toggle('active', parseInt(b.dataset.gain) === ncfg.sensitivity_gain));
        }

        // Tampilkan feedback status konfirmasi per field (FR-04)
        renderFieldBadge(`statusRate${i}`, ncfg.status_sampling_rate, ncfg.applied_sampling_rate, 'Hz');
        renderFieldBadge(`statusGain${i}`, ncfg.status_sensitivity_gain, ncfg.applied_sensitivity_gain, 'x');
        renderFieldBadge(`statusRaw${i}`, ncfg.status_raw_window_interval, ncfg.applied_raw_window_interval, 'ms');

        // Status kartu node
        const syncEl = document.getElementById(`cfgSync${i}`);
        if (syncEl) {
            const hasPending = [ncfg.status_sampling_rate, ncfg.status_raw_window_interval, ncfg.status_sensitivity_gain].includes('pending');
            const hasRejected = [ncfg.status_sampling_rate, ncfg.status_raw_window_interval, ncfg.status_sensitivity_gain].includes('rejected');
            if (hasRejected) {
                syncEl.textContent = '✗ Rejected';
                syncEl.style.background = 'var(--red-soft)';
                syncEl.style.color = 'var(--red)';
            } else if (hasPending) {
                syncEl.textContent = '⌛ Syncing...';
                syncEl.style.background = 'var(--orange-soft)';
                syncEl.style.color = 'var(--orange)';
            } else {
                syncEl.textContent = '✓ Applied';
                syncEl.style.background = 'var(--green-soft)';
                syncEl.style.color = 'var(--green)';
            }
        }
    }
}

async function loadThresholds() {
    const vib = await api('/api/threshold/vibration');
    const tilt = await api('/api/threshold/tilt');
    document.getElementById('th-vibration').value = vib.value;
    document.getElementById('th-tilt').value = tilt.value;
}

async function loadMqttStatus() {
    try {
        const st = await api('/api/status/mqtt');
        const led = document.getElementById('mqttLed');
        const txt = document.getElementById('mqttStatus');
        if (st.connected) {
            led.className = 'status-led online';
            txt.textContent = 'CONNECTED';
            txt.className = 'status-text online';
        } else {
            led.className = 'status-led offline';
            txt.textContent = 'DISCONNECTED';
            txt.className = 'status-text offline';
        }
    } catch (_) { }
}

function detectIp() {
    const ipEl = document.getElementById('serverIp');
    if (!ipEl) return;
    fetch('/api/config')
        .then(() => { ipEl.value = window.location.hostname; })
        .catch(() => { ipEl.value = window.location.hostname; });
}

// Simpan semua param per node (simpan ke DB + publish ke firmware)
async function saveAll() {
    const btn = document.getElementById('btn-save-all');
    btn.disabled = true;
    btn.innerHTML = `${SYNC_SVG} Menyimpan...`;

    try {
        for (let i = 0; i < NODE_IDS.length; i++) {
            await fetch(`/api/node/${NODE_IDS[i]}/config`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sampling_rate: parseInt(document.getElementById(`samplingRate${i}`).value),
                    raw_window_interval: parseInt(document.getElementById(`rawWindowInterval${i}`).value),
                    sensitivity_gain: activeGain(i),
                }),
            });
        }
        btn.innerHTML = `${SYNC_SVG} Disimpan`;
        await loadConfig();

        // Polling konfirmasi status dari firmware node (FR-04)
        let pollCount = 0;
        const pollTimer = setInterval(async () => {
            await loadConfig();
            pollCount++;
            if (pollCount >= 5) clearInterval(pollTimer);
        }, 1000);

        setTimeout(() => {
            btn.innerHTML = `${SAVE_SVG} Save Changes`;
            btn.disabled = false;
        }, 2000);
    } catch (err) {
        btn.innerHTML = `${SYNC_SVG} Gagal`;
        btn.disabled = false;
    }
}

async function saveThresholds() {
    const vib = document.getElementById('th-vibration').value;
    const tilt = document.getElementById('th-tilt').value;
    await Promise.all([
        fetch('/api/threshold/vibration', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ value: parseFloat(vib) }) }),
        fetch('/api/threshold/tilt', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ value: parseFloat(tilt) }) }),
    ]);
    const btn = document.getElementById('btn-save-threshold');
    const orig = btn.innerHTML;
    btn.innerHTML = 'Tersimpan ✓';
    setTimeout(() => btn.innerHTML = orig, 1500);
}

// Kirim action ke 1 node
async function runAction(i, action) {
    const btn = document.getElementById(`btn-recal-${i}`);
    const orig = btn.innerHTML;
    try {
        await fetch(`/api/node/${NODE_IDS[i]}/action`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action }),
        });
        btn.innerHTML = '✓ Dikirim';
    } catch (_) {
        btn.innerHTML = 'Gagal';
    }
    setTimeout(() => btn.innerHTML = orig, 1500);
}

// Kirim action ke semua node
async function runActionAll(action) {
    await Promise.all(NODE_IDS.map(id =>
        fetch(`/api/node/${id}/action`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action }),
        }).catch(() => null)
    ));
}

function resetDefault() {
    for (let i = 0; i < NODE_IDS.length; i++) {
        document.getElementById(`samplingRate${i}`).value = '200';
        document.getElementById(`rawWindowInterval${i}`).value = '15000';
        document.querySelectorAll(`#gain${i} .gain-btn`).forEach(b =>
            b.classList.toggle('active', parseInt(b.dataset.gain) === 1));
    }
}

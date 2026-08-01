// ============================================
// SETTINGS — node config, thresholds, status
// ============================================

const NODE_IDS = ['node_01', 'node_02'];

document.addEventListener('DOMContentLoaded', async function () {
    await loadConfig();
    await loadThresholds();
    await loadMqttStatus();
    detectIp();
    setInterval(loadMqttStatus, 5000);

    document.getElementById('btn-save-all').addEventListener('click', saveAll);
    document.getElementById('btn-save-threshold').addEventListener('click', saveThresholds);
});

async function loadConfig() {
    const cfg = await api('/api/config');
    document.getElementById('mqttBroker').value = cfg.mqtt_broker;

    for (let i = 0; i < NODE_IDS.length; i++) {
        const ncfg = await api(`/api/node/${NODE_IDS[i]}/config`);
        const sel = document.getElementById(`samplingRate${i}`);
        if (sel && ncfg.sampling_rate) sel.value = String(ncfg.sampling_rate);
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
            txt.className = 'font-label-mono text-label-mono text-secondary';
        } else {
            led.className = 'status-led offline';
            txt.textContent = 'DISCONNECTED';
            txt.className = 'font-label-mono text-label-mono text-error';
        }
    } catch (_) { }
}

function detectIp() {
    // Coba dari API RTK (ice) dulu, fallback ke hostname
    const ipEl = document.getElementById('serverIp');
    fetch('/api/config')
        .then(r => r.json())
        .then(() => {
            // fallback: ambil dari window.location
            ipEl.value = window.location.hostname;
        })
        .catch(() => {
            ipEl.value = window.location.hostname;
        });
}

async function saveAll() {
    const btn = document.getElementById('btn-save-all');
    btn.disabled = true;
    btn.innerHTML = '<span class="material-symbols-outlined text-[20px]">sync</span><span>Menyimpan...</span>';

    try {
        for (let i = 0; i < NODE_IDS.length; i++) {
            const rate = parseInt(document.getElementById(`samplingRate${i}`).value);
            await fetch(`/api/node/${NODE_IDS[i]}/config`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sampling_rate: rate }),
            });
        }
        btn.innerHTML = '<span class="material-symbols-outlined text-[20px]">check</span><span>Disimpan</span>';
        setTimeout(() => {
            btn.innerHTML = '<span class="material-symbols-outlined text-[20px]">save</span><span>Save Changes</span>';
            btn.disabled = false;
        }, 2000);
    } catch (err) {
        btn.innerHTML = '<span class="material-symbols-outlined text-[20px]">close</span><span>Gagal</span>';
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

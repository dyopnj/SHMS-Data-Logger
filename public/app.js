const ws = new WebSocket(`ws://${location.host}`);
let charts = { rms: null, pitch: null };
let dataBuffer = { node_01: [], node_02: [] };
const MAX_POINTS = 100;

ws.onmessage = (e) => {
  const msg = JSON.parse(e.data);
  if (msg.type === 'data') updateDashboard(msg.payload);
};

ws.onclose = () => {
  document.getElementById('status-indicator').className = 'status-dot red';
  document.getElementById('status-text').textContent = 'Disconnected';
};

async function init() {
  // Load thresholds
  for (const p of ['vibration', 'tilt']) {
    const r = await fetch(`/api/threshold/${p}`);
    const d = await r.json();
    document.getElementById(`th-${p}`).value = d.value;
  }
  // Load initial data per node
  for (const node of ['node_01', 'node_02']) {
    const r = await fetch(`/api/readings/${node}?limit=100`);
    dataBuffer[node] = (await r.json()).reverse();
  }
  // Load alerts
  renderAlerts();
  initCharts();
  renderNodeCards();
}

function updateDashboard(data) {
  const { node_id } = data;
  if (!dataBuffer[node_id]) dataBuffer[node_id] = [];
  dataBuffer[node_id].push(data);
  if (dataBuffer[node_id].length > MAX_POINTS) dataBuffer[node_id].shift();
  updateNodeCard(data);
  updateCharts();
}

function renderNodeCards() {
  const container = document.getElementById('node-cards');
  container.innerHTML = '';
  for (const node of ['node_01', 'node_02']) {
    const last = dataBuffer[node]?.[dataBuffer[node].length - 1];
    container.innerHTML += `
      <div class="card" id="card-${node}">
        <h2>${node}</h2>
        <div class="val" id="${node}-rms">${last ? last.vibration.rms.toFixed(3) : '--'}</div>
        <div>RMS Getaran</div>
        <div>Tilt: <span id="${node}-tilt">${last ? last.tilt.pitch_delta.toFixed(2) : '--'}</span>°</div>
        <div>Roll: <span id="${node}-roll">${last ? last.tilt.roll_delta.toFixed(2) : '--'}</span>°</div>
        <span class="alert-badge alert-ok" id="${node}-alert-vib">Getaran OK</span>
        <span class="alert-badge alert-ok" id="${node}-alert-tilt">Tilt OK</span>
      </div>`;
  }
}

function updateNodeCard(data) {
  const { node_id, vibration, tilt } = data;
  const rmsEl = document.getElementById(`${node_id}-rms`);
  if (rmsEl) rmsEl.textContent = vibration.rms.toFixed(3);
  const tEl = document.getElementById(`${node_id}-tilt`);
  if (tEl) tEl.textContent = tilt.pitch_delta.toFixed(2);
  const rEl = document.getElementById(`${node_id}-roll`);
  if (rEl) rEl.textContent = tilt.roll_delta.toFixed(2);
}

function initCharts() {
  const ctxRms = document.getElementById('chart-rms').getContext('2d');
  charts.rms = new Chart(ctxRms, {
    type: 'line',
    data: { labels: [], datasets: [
      { label: 'Node 01', data: [], borderColor: '#58a6ff', tension: .3 },
      { label: 'Node 02', data: [], borderColor: '#3fb950', tension: .3 },
    ]},
    options: { responsive: true, animation: false, scales: { y: { beginAtZero: true } } },
  });
  const ctxPitch = document.getElementById('chart-pitch').getContext('2d');
  charts.pitch = new Chart(ctxPitch, {
    type: 'line',
    data: { labels: [], datasets: [
      { label: 'Pitch 01', data: [], borderColor: '#d2a8ff', tension: .3 },
      { label: 'Pitch 02', data: [], borderColor: '#ffa657', tension: .3 },
    ]},
    options: { responsive: true, animation: false, scales: { y: { beginAtZero: true } } },
  });
}

function updateCharts() {
  const labels = dataBuffer.node_01.map((_, i) => i);
  charts.rms.data.labels = labels;
  charts.rms.data.datasets[0].data = dataBuffer.node_01.map(d => d.vibration.rms);
  charts.rms.data.datasets[1].data = dataBuffer.node_02.map(d => d.vibration.rms);
  charts.rms.update();

  charts.pitch.data.labels = labels;
  charts.pitch.data.datasets[0].data = dataBuffer.node_01.map(d => d.tilt.pitch_delta);
  charts.pitch.data.datasets[1].data = dataBuffer.node_02.map(d => d.tilt.pitch_delta);
  charts.pitch.update();
}

async function updateThreshold(param) {
  const val = parseFloat(document.getElementById(`th-${param}`).value);
  await fetch(`/api/threshold/${param}`, { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify({value: val}) });
}

async function renderAlerts() {
  try {
    const r = await fetch('/api/alerts');
    const alerts = await r.json();
    const el = document.getElementById('alert-list');
    el.innerHTML = alerts.slice(0, 50).map(a =>
      `<div>[${a.timestamp}] <b>${a.node_id}</b> — ${a.type}: ${a.value} (threshold: ${a.threshold})</div>`
    ).join('');
  } catch {}
}

function exportAlerts() {
  fetch('/api/alerts').then(r => r.json()).then(data => {
    const csv = 'timestamp,node_id,type,value,threshold\n' +
      data.map(a => `${a.timestamp},${a.node_id},${a.type},${a.value},${a.threshold}`).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'alerts.csv'; a.click();
    URL.revokeObjectURL(url);
  });
}

init();

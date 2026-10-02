// ============================================
// ANALYSIS PAGE - PLOTLY CHARTS (REAL DATA)
// ============================================

function cssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#1B2B4B';
}

document.addEventListener('DOMContentLoaded', async function () {
    const MAX_POINTS = 100;
    const WINDOW_MS = 60 * 1000; // jendela x-axis bergulir 60 detik
    const NODE_IDS = ['node_01', 'node_02'];
    const TRACE_INDEX = { node_01: 0, node_02: 1 };
    const metricConfigs = [
        {
            plotId: 'plot-accel-x',
            statKey: 'accel-x',
            yLabel: 'RMS Vibration',
            getValue: (reading) => reading.rms
        },
        {
            plotId: 'plot-accel-y',
            statKey: 'accel-y',
            yLabel: 'Pitch (deg)',
            getValue: (reading) => reading.pitch
        },
        {
            plotId: 'plot-accel-z',
            statKey: 'accel-z',
            yLabel: 'Roll (deg)',
            getValue: (reading) => reading.roll
        }
    ];

    const COLOR_N1 = () => cssVar('--orange');
    const COLOR_N2 = () => cssVar('--navy');

    const peaks = {};
    const seriesData = {};
    metricConfigs.forEach((metric) => {
        peaks[metric.statKey] = { n1: 0, n2: 0 };
        seriesData[metric.statKey] = {
            node_01: [],
            node_02: []
        };
    });

    const toNumber = (value) => {
        const n = Number(value);
        return Number.isFinite(n) ? n : null;
    };

    const median = (values) => {
        if (!values.length) return 0;
        const sorted = [...values].sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        if (sorted.length % 2 === 0) {
            return (sorted[mid - 1] + sorted[mid]) / 2;
        }
        return sorted[mid];
    };

    // Firmware bisa kirim timestamp time-only "HH:MM:SS.mmm" (tanpa tanggal).
    // new Date("00:22:32") = Invalid Date, jadi prepend tanggal hari ini.
    const parseTs = (s) => {
        const d = new Date(s);
        if (!isNaN(d)) return d;
        const m = String(s).match(/^(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?/);
        if (!m) return null;
        const now = new Date();
        return new Date(now.getFullYear(), now.getMonth(), now.getDate(),
            +m[1], +m[2], +m[3], +String(m[4] || '0').padEnd(3, '0'));
    };

    const getLayout = (yLabel) => ({
        paper_bgcolor: 'rgba(0,0,0,0)',
        plot_bgcolor: 'rgba(0,0,0,0)',
        margin: { t: 30, r: 20, b: 60, l: 70 },
        showlegend: false,
        xaxis: {
            gridcolor: cssVar('--border'),
            tickfont: { color: cssVar('--navy-soft'), family: 'Inter', size: 9 },
            linecolor: cssVar('--border'),
            autorange: true,
            type: 'date',
            title: {
                text: 'Time',
                font: { size: 11, color: cssVar('--navy-soft'), family: 'Inter', weight: 600 },
                standoff: 20
            },
            tickformatstops: [
                { dtickrange: [null, 1000], value: '%H:%M:%S.%L' },
                { dtickrange: [1000, 60000], value: '%H:%M:%S' },
                { dtickrange: [60000, 3600000], value: '%H:%M' },
                { dtickrange: [3600000, 86400000], value: '%H:%M\n%b %e' },
                { dtickrange: [86400000, 604800000], value: '%e %b' },
                { dtickrange: [604800000, 'M1'], value: '%e %b' },
                { dtickrange: ['M1', 'M12'], value: '%b %Y' },
                { dtickrange: ['M12', null], value: '%Y' }
            ]
        },
        yaxis: {
            gridcolor: cssVar('--border'),
            tickfont: { color: cssVar('--navy-soft'), family: 'Inter', size: 9 },
            linecolor: cssVar('--border'),
            zerolinecolor: cssVar('--border'),
            title: {
                text: yLabel,
                font: { size: 11, color: cssVar('--navy-soft'), family: 'Inter', weight: 600 },
                standoff: 15
            }
        },
        hovermode: 'x unified',
        hoverlabel: {
            bgcolor: cssVar('--card-alt'),
            bordercolor: cssVar('--border'),
            font: { color: cssVar('--navy'), size: 10 }
        }
    });

    const getFddLayout = () => ({
        paper_bgcolor: 'rgba(0,0,0,0)',
        plot_bgcolor: 'rgba(0,0,0,0)',
        margin: { t: 30, r: 20, b: 60, l: 70 },
        showlegend: false,
        xaxis: {
            gridcolor: cssVar('--border'),
            tickfont: { color: cssVar('--navy-soft'), family: 'Inter', size: 9 },
            linecolor: cssVar('--border'),
            autorange: true,
            title: {
                text: 'Frequency (Hz)',
                font: { size: 11, color: cssVar('--navy-soft'), family: 'Inter', weight: 600 },
                standoff: 20
            }
        },
        yaxis: {
            gridcolor: cssVar('--border'),
            tickfont: { color: cssVar('--navy-soft'), family: 'Inter', size: 9 },
            linecolor: cssVar('--border'),
            zerolinecolor: cssVar('--border'),
            autorange: true,
            title: {
                text: 'Singular Value (λ₁)',
                font: { size: 11, color: cssVar('--navy-soft'), family: 'Inter', weight: 600 },
                standoff: 15
            }
        },
        hovermode: 'closest',
        hoverlabel: {
            bgcolor: cssVar('--card-alt'),
            bordercolor: cssVar('--border'),
            font: { color: cssVar('--navy'), size: 10 }
        }
    });

    const chartConfig = { responsive: true, displayModeBar: false };

    function updateStats(statKey) {
        const node1 = seriesData[statKey].node_01;
        const node2 = seriesData[statKey].node_02;
        const merged = [...node1, ...node2];
        const mean = merged.length ? merged.reduce((sum, v) => sum + v, 0) / merged.length : 0;
        const med = median(merged);

        const meanEl = document.getElementById(`stat-${statKey}-mean`);
        const medianEl = document.getElementById(`stat-${statKey}-median`);
        const peak1El = document.getElementById(`stat-${statKey}-peak-n1`);
        const peak2El = document.getElementById(`stat-${statKey}-peak-n2`);

        if (meanEl) meanEl.innerText = mean.toFixed(2);
        if (medianEl) medianEl.innerText = med.toFixed(2);
        if (peak1El) peak1El.innerText = peaks[statKey].n1.toFixed(2);
        if (peak2El) peak2El.innerText = peaks[statKey].n2.toFixed(2);
    }

    function pushReadingToSeries(metric, nodeId, value) {
        const bucket = seriesData[metric.statKey][nodeId];
        bucket.push(value);
        if (bucket.length > MAX_POINTS) {
            bucket.shift();
        }
    }

    function updatePeak(metric, nodeId, value) {
        const peakKey = nodeId === 'node_01' ? 'n1' : 'n2';
        const absValue = Math.abs(value);
        if (absValue > peaks[metric.statKey][peakKey]) {
            peaks[metric.statKey][peakKey] = absValue;
        }
    }

    async function loadInitialHistory() {
        const requests = NODE_IDS.map((nodeId) => api(`/api/readings/${nodeId}?limit=${MAX_POINTS}`));
        const [node1Rows, node2Rows] = await Promise.all(requests);
        return {
            node_01: Array.isArray(node1Rows) ? [...node1Rows].reverse() : [],
            node_02: Array.isArray(node2Rows) ? [...node2Rows].reverse() : []
        };
    }

    function initCharts(history) {
        metricConfigs.forEach((metric) => {
            const node1Rows = history.node_01;
            const node2Rows = history.node_02;

            const node1Points = node1Rows
                .map((row) => ({ x: parseTs(row.timestamp), y: toNumber(metric.getValue(row)) }))
                .filter((point) => point.x !== null && point.y !== null);
            const node2Points = node2Rows
                .map((row) => ({ x: parseTs(row.timestamp), y: toNumber(metric.getValue(row)) }))
                .filter((point) => point.x !== null && point.y !== null);

            seriesData[metric.statKey].node_01 = node1Points.map((point) => point.y).slice(-MAX_POINTS);
            seriesData[metric.statKey].node_02 = node2Points.map((point) => point.y).slice(-MAX_POINTS);
            peaks[metric.statKey].n1 = node1Points.reduce((max, p) => Math.max(max, Math.abs(p.y)), 0);
            peaks[metric.statKey].n2 = node2Points.reduce((max, p) => Math.max(max, Math.abs(p.y)), 0);

            Plotly.newPlot(metric.plotId, [
                {
                    x: node1Points.map((point) => point.x),
                    y: node1Points.map((point) => point.y),
                    name: 'Node 01',
                    type: 'scatter',
                    mode: 'lines',
                    line: { color: COLOR_N1(), width: 2, shape: 'spline' }
                },
                {
                    x: node2Points.map((point) => point.x),
                    y: node2Points.map((point) => point.y),
                    name: 'Node 02',
                    type: 'scatter',
                    mode: 'lines',
                    line: { color: COLOR_N2(), width: 2, shape: 'spline' }
                }
            ], getLayout(metric.yLabel), chartConfig);

            // RTC device tidak bisa dipercaya (loncat/jam mundur) → anchor jendela ke jam klien.
            scrollWindow(metric.plotId, new Date());

            updateStats(metric.statKey);
        });
    }

    function scrollWindow(plotId, t) {
        const end = t instanceof Date ? t : new Date(t);
        Plotly.relayout(plotId, { 'xaxis.range': [new Date(end - WINDOW_MS), end] });
    }

    function handleLivePayload(payload) {
        const nodeId = payload && payload.node_id;
        if (!TRACE_INDEX.hasOwnProperty(nodeId)) {
            return;
        }
        const traceIndex = TRACE_INDEX[nodeId];
        // RTC device bisa salah/drift → pakai waktu kedatangan klien biar grafik selalu scroll "sekarang".
        const timestamp = new Date();
        // Payload live MQTT nested (vibration.rms, tilt.pitch/roll), sedangkan
        // getValue mengekspektasikan bentuk flat row DB → ratakan dulu.
        const reading = {
            rms: payload.vibration && payload.vibration.rms,
            pitch: payload.tilt && payload.tilt.pitch,
            roll: payload.tilt && payload.tilt.roll,
        };

        metricConfigs.forEach((metric) => {
            const value = toNumber(metric.getValue(reading));
            if (value === null) {
                return;
            }

            Plotly.extendTraces(metric.plotId, {
                y: [[value]],
                x: [[timestamp]]
            }, [traceIndex], MAX_POINTS);

            pushReadingToSeries(metric, nodeId, value);
            updatePeak(metric, nodeId, value);
            updateStats(metric.statKey);
            scrollWindow(metric.plotId, timestamp);
        });
    }

    try {
        const history = await loadInitialHistory();
        initCharts(history);
    } catch (error) {
        console.error('[Analysis] Failed to load initial data', error);
        metricConfigs.forEach((metric) => {
            Plotly.newPlot(metric.plotId, [
                { x: [], y: [], name: 'Node 01', type: 'scatter', mode: 'lines', line: { color: COLOR_N1(), width: 2 } },
                { x: [], y: [], name: 'Node 02', type: 'scatter', mode: 'lines', line: { color: COLOR_N2(), width: 2 } }
            ], getLayout(metric.yLabel), chartConfig);
            updateStats(metric.statKey);
        });
    }

    window.addEventListener('themechange', () => {
        metricConfigs.forEach((metric) => Plotly.relayout(metric.plotId, getLayout(metric.yLabel)));
        const plotFdd = document.getElementById('plot-fdd');
        if (plotFdd && fddPlotInitialized) {
            Plotly.relayout('plot-fdd', getFddLayout());
        }
    });

    let fddPlotInitialized = false;

    async function renderFdd() {
        const plotEl = document.getElementById('plot-fdd');
        const pairEl = document.getElementById('fdd-pair');
        const domEl = document.getElementById('fdd-dom-freq');
        const peaksEl = document.getElementById('fdd-peaks-summary');
        const winRateEl = document.getElementById('fdd-window-rate');
        if (!plotEl) return;

        let rows = [];
        try { rows = await api('/api/fdd?limit=1'); } catch (_) { }
        rows = Array.isArray(rows) ? rows : [];
        const r = rows[0];

        if (!r) {
            if (!fddPlotInitialized) {
                Plotly.newPlot('plot-fdd', [{
                    x: [0, 20, 40, 60, 80, 100],
                    y: [0, 0, 0, 0, 0, 0],
                    type: 'scatter',
                    mode: 'lines',
                    line: { color: cssVar('--border'), dash: 'dash', width: 1.5 },
                    hoverinfo: 'none'
                }], getFddLayout(), chartConfig);
                fddPlotInitialized = true;
            }
            if (domEl) domEl.textContent = '-- Hz';
            if (pairEl) pairEl.textContent = '--';
            if (peaksEl) peaksEl.textContent = '--';
            if (winRateEl) winRateEl.textContent = '--';
            return;
        }

        if (domEl) domEl.textContent = `${Number(r.dominant_freq || 0).toFixed(2)} Hz`;
        if (pairEl) pairEl.textContent = `${r.node_id_a} / ${r.node_id_b}`;
        if (winRateEl) winRateEl.textContent = `${r.window_size || 256} / ${r.sampling_rate || 200}Hz`;

        let peaks = [];
        try { peaks = JSON.parse(r.peaks_json || '[]'); } catch (_) { }
        peaks = Array.isArray(peaks) ? peaks : [];

        if (peaksEl) {
            peaksEl.textContent = peaks.length
                ? peaks.map(p => `${Number(p.freq).toFixed(1)}Hz`).join(', ')
                : 'Tidak ada peak';
        }

        let spectrum = null;
        try { if (r.spectrum_json) spectrum = JSON.parse(r.spectrum_json); } catch (_) { }

        let freqs = spectrum?.freqs;
        let eigenvalues = spectrum?.eigenvalues;

        // Fallback jika spectrum_json belum tersimpan: plot garis dari titik-titik puncak
        if (!Array.isArray(freqs) || !Array.isArray(eigenvalues) || freqs.length === 0) {
            freqs = [0, Number(r.dominant_freq || 0), (r.sampling_rate || 200) / 2];
            eigenvalues = [0, peaks[0]?.eigenvalue || 1, 0];
        }

        const traces = [
            {
                x: freqs,
                y: eigenvalues,
                name: '1st Singular Value (λ₁)',
                type: 'scatter',
                mode: 'lines',
                line: { color: COLOR_N1(), width: 2, shape: 'spline' },
                hovertemplate: '%{x:.2f} Hz: %{y:.4f}<extra></extra>'
            }
        ];

        if (peaks.length > 0) {
            traces.push({
                x: peaks.map(p => p.freq),
                y: peaks.map(p => p.eigenvalue),
                name: 'Modal Peak',
                type: 'scatter',
                mode: 'markers+text',
                marker: { color: '#E5674A', size: 9, symbol: 'diamond' },
                text: peaks.map(p => `${Number(p.freq).toFixed(1)}Hz`),
                textposition: 'top center',
                textfont: { family: 'Inter', size: 9.5, color: cssVar('--navy'), weight: 700 },
                hovertemplate: 'Peak: %{x:.2f} Hz (%{y:.4f})<extra></extra>'
            });
        }

        Plotly.react('plot-fdd', traces, getFddLayout(), chartConfig);
        fddPlotInitialized = true;
    }

    renderFdd();
    setInterval(renderFdd, 10000);

    connectWS(handleLivePayload);

    document.getElementById('btn-reset-all')?.addEventListener('click', () => {
        metricConfigs.forEach((metric) => {
            Plotly.relayout(metric.plotId, {
                'xaxis.autorange': true,
                'yaxis.autorange': true
            });
        });
        const plotFdd = document.getElementById('plot-fdd');
        if (plotFdd && fddPlotInitialized) {
            Plotly.relayout('plot-fdd', {
                'xaxis.autorange': true,
                'yaxis.autorange': true
            });
        }
    });
});

// ============================================
// ANALYSIS PAGE - PLOTLY CHARTS (REAL DATA)
// ============================================

function cssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#1b2122';
}

document.addEventListener('DOMContentLoaded', async function () {
    const MAX_POINTS = 100;
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
        },
        {
            plotId: 'plot-gyro-x',
            statKey: 'gyro-x',
            yLabel: 'Magnetic X',
            getValue: (reading) => reading.mag_x
        }
    ];

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

    const getLayout = (yLabel) => ({
        paper_bgcolor: 'rgba(0,0,0,0)',
        plot_bgcolor: 'rgba(0,0,0,0)',
        margin: { t: 30, r: 20, b: 60, l: 70 },
        showlegend: false,
        xaxis: {
            gridcolor: cssVar('--color-surface-container'),
            tickfont: { color: cssVar('--color-outline'), family: 'JetBrains Mono', size: 9 },
            linecolor: cssVar('--color-outline-variant'),
            autorange: true,
            type: 'date',
            title: {
                text: 'Time',
                font: { size: 11, color: cssVar('--color-outline'), family: 'Inter', weight: 600 },
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
            gridcolor: cssVar('--color-surface-container'),
            tickfont: { color: cssVar('--color-outline'), family: 'JetBrains Mono', size: 9 },
            linecolor: cssVar('--color-outline-variant'),
            zerolinecolor: cssVar('--color-outline-variant'),
            title: {
                text: yLabel,
                font: { size: 11, color: cssVar('--color-outline'), family: 'Inter', weight: 600 },
                standoff: 15
            }
        },
        hovermode: 'x unified',
        hoverlabel: {
            bgcolor: cssVar('--color-surface-container-low'),
            bordercolor: cssVar('--color-outline-variant'),
            font: { color: cssVar('--color-on-surface'), size: 10 }
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
                .map((row) => ({ x: new Date(row.timestamp), y: toNumber(metric.getValue(row)) }))
                .filter((point) => point.y !== null);
            const node2Points = node2Rows
                .map((row) => ({ x: new Date(row.timestamp), y: toNumber(metric.getValue(row)) }))
                .filter((point) => point.y !== null);

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
                    line: { color: '#4cd7f6', width: 2, shape: 'spline' }
                },
                {
                    x: node2Points.map((point) => point.x),
                    y: node2Points.map((point) => point.y),
                    name: 'Node 02',
                    type: 'scatter',
                    mode: 'lines',
                    line: { color: '#ffb95f', width: 2, shape: 'spline' }
                }
            ], getLayout(metric.yLabel), chartConfig);

            updateStats(metric.statKey);
        });
    }

    function handleLivePayload(payload) {
        const nodeId = payload && payload.node_id;
        if (!TRACE_INDEX.hasOwnProperty(nodeId)) {
            return;
        }
        const traceIndex = TRACE_INDEX[nodeId];
        const timestamp = new Date(payload.timestamp || new Date().toISOString());

        metricConfigs.forEach((metric) => {
            const value = toNumber(metric.getValue(payload));
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
        });
    }

    try {
        const history = await loadInitialHistory();
        initCharts(history);
    } catch (error) {
        console.error('[Analysis] Failed to load initial data', error);
        metricConfigs.forEach((metric) => {
            Plotly.newPlot(metric.plotId, [
                { x: [], y: [], name: 'Node 01', type: 'scatter', mode: 'lines', line: { color: '#4cd7f6', width: 2 } },
                { x: [], y: [], name: 'Node 02', type: 'scatter', mode: 'lines', line: { color: '#ffb95f', width: 2 } }
            ], getLayout(metric.yLabel), chartConfig);
            updateStats(metric.statKey);
        });
    }

    window.addEventListener('themechange', () => {
        metricConfigs.forEach((metric) => Plotly.relayout(metric.plotId, getLayout(metric.yLabel)));
    });

    connectWS(handleLivePayload);

    document.getElementById('btn-reset-all')?.addEventListener('click', () => {
        metricConfigs.forEach((metric) => {
            Plotly.relayout(metric.plotId, {
                'xaxis.autorange': true,
                'yaxis.autorange': true
            });
        });
    });
});
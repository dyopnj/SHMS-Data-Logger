// ============================================
// ANALYSIS PAGE - PLOTLY CHARTS
// ============================================

document.addEventListener('DOMContentLoaded', function() {
    const plotIds = ['plot-accel-x', 'plot-accel-y', 'plot-accel-z', 'plot-gyro-x'];
    const variables = ['accel-x', 'accel-y', 'accel-z', 'gyro-x'];
    const yLabels = ['Acceleration (m/s²)', 'Acceleration (m/s²)', 'Acceleration (m/s²)', 'Velocity (rad/s)'];
    
    const peaks = {
        'accel-x': { n1: 0, n2: 0 },
        'accel-y': { n1: 0, n2: 0 },
        'accel-z': { n1: 0, n2: 0 },
        'gyro-x': { n1: 0, n2: 0 }
    };

    function generateInitialData(points, index) {
        const now = new Date();
        const x = [];
        const n1 = [];
        const n2 = [];

        for (let i = 0; i < points; i++) {
            const date = new Date(now.getTime() - (points - i) * 2000);
            x.push(date);
            const base = index < 3 ? 0.3 : 15;
            n1.push(base * Math.sin(i / (12 + index)) + (Math.random() - 0.5) * (base/3));
            n2.push(base * Math.cos(i / (15 - index)) + (Math.random() - 0.5) * (base/2.5));
        }
        return { x, n1, n2 };
    }

    const getLayout = (yLabel) => ({
        paper_bgcolor: 'rgba(0,0,0,0)',
        plot_bgcolor: 'rgba(0,0,0,0)',
        margin: { t: 30, r: 20, b: 60, l: 70 },
        showlegend: false,
        xaxis: {
            gridcolor: '#1b2122',
            tickfont: { color: '#869397', family: 'JetBrains Mono', size: 9 },
            linecolor: '#3d494c',
            autorange: true,
            type: 'date',
            title: { 
                text: 'Time', 
                font: { size: 11, color: '#869397', family: 'Inter', weight: 600 }, 
                standoff: 20 
            },
            tickformatstops: [
                { dtickrange: [null, 1000], value: '%H:%M:%S.%L' },
                { dtickrange: [1000, 60000], value: '%H:%M:%S' },
                { dtickrange: [60000, 3600000], value: '%H:%M' },
                { dtickrange: [3600000, 86400000], value: '%H:%M\n%b %e' },
                { dtickrange: [86400000, 604800000], value: '%e %b' },
                { dtickrange: [604800000, "M1"], value: '%e %b' },
                { dtickrange: ["M1", "M12"], value: '%b %Y' },
                { dtickrange: ["M12", null], value: '%Y' }
            ]
        },
        yaxis: {
            gridcolor: '#1b2122',
            tickfont: { color: '#869397', family: 'JetBrains Mono', size: 9 },
            linecolor: '#3d494c',
            zerolinecolor: '#3d494c',
            title: { 
                text: yLabel, 
                font: { size: 11, color: '#869397', family: 'Inter', weight: 600 }, 
                standoff: 15 
            }
        },
        hovermode: 'x unified',
        hoverlabel: { bgcolor: '#171d1e', bordercolor: '#3d494c', font: { color: '#dee3e6', size: 10 } }
    });

    const config = { responsive: true, displayModeBar: false };

    // Inisialisasi semua grafik
    plotIds.forEach((id, index) => {
        const initial = generateInitialData(60, index);
        const data = [
            {
                x: initial.x,
                y: initial.n1,
                name: 'Node 01',
                type: 'scatter',
                mode: 'lines',
                line: { color: '#4cd7f6', width: 2, shape: 'spline' },
            },
            {
                x: initial.x,
                y: initial.n2,
                name: 'Node 02',
                type: 'scatter',
                mode: 'lines',
                line: { color: '#ffb95f', width: 2, shape: 'spline' },
            }
        ];
        Plotly.newPlot(id, data, getLayout(yLabels[index]), config);
    });

    // Real-time Update setiap 2 detik
    setInterval(() => {
        const time = new Date();
        plotIds.forEach((id, index) => {
            const varKey = variables[index];
            const base = index < 3 ? 0.3 : 15;
            
            const newVal1 = base * Math.sin(time.getTime() / 2500) + (Math.random() - 0.5) * (base/4);
            const newVal2 = base * Math.cos(time.getTime() / 3000) + (Math.random() - 0.5) * (base/3);
            
            Plotly.extendTraces(id, {
                y: [[newVal1], [newVal2]],
                x: [[time], [time]]
            }, [0, 1]);

            // Update Peaks
            if(Math.abs(newVal1) > peaks[varKey].n1) peaks[varKey].n1 = Math.abs(newVal1);
            if(Math.abs(newVal2) > peaks[varKey].n2) peaks[varKey].n2 = Math.abs(newVal2);

            // Update Stats Display
            const meanEl = document.getElementById(`stat-${varKey}-mean`);
            const medianEl = document.getElementById(`stat-${varKey}-median`);
            const peak1El = document.getElementById(`stat-${varKey}-peak-n1`);
            const peak2El = document.getElementById(`stat-${varKey}-peak-n2`);

            if(meanEl) meanEl.innerText = ((newVal1 + newVal2)/2).toFixed(2);
            if(medianEl) medianEl.innerText = (Math.max(newVal1, newVal2)/1.2).toFixed(2);
            if(peak1El) peak1El.innerText = peaks[varKey].n1.toFixed(2);
            if(peak2El) peak2El.innerText = peaks[varKey].n2.toFixed(2);

            // Sliding window only if not zoomed manually
            const el = document.getElementById(id);
            if (el.layout.xaxis.autorange && el.data[0].x.length > 100) {
                Plotly.relayout(id, {
                    'xaxis.range': [
                        el.data[0].x[el.data[0].x.length - 100],
                        el.data[0].x[el.data[0].x.length - 1]
                    ]
                });
            }
        });
    }, 2000);

    // Reset all layouts
    document.getElementById('btn-reset-all').addEventListener('click', () => {
        plotIds.forEach((id) => {
            Plotly.relayout(id, {
                'xaxis.autorange': true,
                'yaxis.autorange': true
            });
        });
    });
});
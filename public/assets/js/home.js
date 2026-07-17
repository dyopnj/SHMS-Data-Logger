// ============================================
// HOME PAGE - REAL-TIME JITTER EFFECT
// ============================================

document.addEventListener('DOMContentLoaded', function() {
    // Efek jitter pada angka-angka sensor
    const valueElements = document.querySelectorAll('.font-bold.text-body-lg');
    setInterval(() => {
        valueElements.forEach(el => {
            const val = parseFloat(el.textContent);
            if (!isNaN(val)) {
                const jitter = (Math.random() - 0.5) * 0.005;
                el.textContent = (val + jitter).toFixed(3);
            }
        });
    }, 800);

    // Sidebar active state (sudah di-handle oleh app.js, tapi kita biarkan)
});
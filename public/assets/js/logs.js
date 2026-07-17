// ============================================
// LOGS PAGE - UI EFFECTS
// ============================================

document.addEventListener('DOMContentLoaded', function() {
    console.log("SHMS Data Logger UI Initialized");
    
    // Simulasi efek kedip pada status
    setInterval(() => {
        const samplingText = document.querySelector('.text-secondary.font-bold');
        if(samplingText) {
            samplingText.style.opacity = samplingText.style.opacity === '0.7' ? '1' : '0.7';
        }
    }, 1000);
});
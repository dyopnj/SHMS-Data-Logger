// Radix-2 FFT — cukup untuk dominant frequency detection
export function fft(samples: number[], sampleRate: number): { freq: number; magnitude: number }[] {
  const n = samples.length;
  const power = Math.log2(n);
  if (!Number.isInteger(power)) throw new Error('Panjang harus power of 2');

  // Bit-reversal permutation
  const indices = new Array<number>(n);
  for (let i = 0; i < n; i++) indices[i] = i;
  for (let i = 0; i < n; i++) {
    const j = parseInt(i.toString(2).padStart(power.toString(2).length, '0').split('').reverse().join(''), 2);
    if (j > i) { [indices[i], indices[j]] = [indices[j], indices[i]]; }
  }

  const re = indices.map(i => samples[i]);
  const im = new Float64Array(n);

  for (let len = 2; len <= n; len *= 2) {
    const halfLen = len / 2;
    const angle = -2 * Math.PI / len;
    for (let i = 0; i < n; i += len) {
      for (let j = 0; j < halfLen; j++) {
        const wRe = Math.cos(angle * j);
        const wIm = Math.sin(angle * j);
        const tRe = re[i + j + halfLen] * wRe - im[i + j + halfLen] * wIm;
        const tIm = re[i + j + halfLen] * wIm + im[i + j + halfLen] * wRe;
        re[i + j + halfLen] = re[i + j] - tRe;
        im[i + j + halfLen] = im[i + j] - tIm;
        re[i + j] = re[i + j] + tRe;
        im[i + j] = im[i + j] + tIm;
      }
    }
  }

  // Magnitude spectrum (hanya half positif)
  const results: { freq: number; magnitude: number }[] = [];
  for (let i = 0; i < n / 2; i++) {
    const magnitude = Math.sqrt(re[i] ** 2 + im[i] ** 2) / n;
    const freq = (i * sampleRate) / n;
    results.push({ freq, magnitude });
  }
  return results;
}

export function dominantFrequency(samples: number[], sampleRate: number): number {
  const spectrum = fft(samples, sampleRate);
  // Skip DC (freq 0), cari peak
  let maxMag = 0, dominantFreq = 0;
  for (let i = 1; i < spectrum.length; i++) {
    if (spectrum[i].magnitude > maxMag) {
      maxMag = spectrum[i].magnitude;
      dominantFreq = spectrum[i].freq;
    }
  }
  return Math.round(dominantFreq * 100) / 100;
}

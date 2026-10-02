// Radix-2 FFT — dominant frequency detection + complex spectrum untuk FDD.

export interface ComplexBin {
  freq: number;
  re: number;
  im: number;
}

export interface MagnitudeBin {
  freq: number;
  magnitude: number;
}

// Hann window (simetris) untuk mengurangi spectral leakage sebelum FFT.
// w[i] = 0.5 * (1 - cos(2*pi*i / (N-1)))
export function applyHannWindow(samples: number[]): number[] {
  const n = samples.length;
  if (n < 2) return samples.slice();
  const out = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    const w = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (n - 1)));
    out[i] = samples[i] * w;
  }
  return out;
}

function isPowerOfTwo(n: number): boolean {
  return Number.isInteger(Math.log2(n));
}

// FFT kompleks radix-2 (bit-reversal + butterfly). Input diasumsikan real,
// dikalikan Hann window terlebih dahulu. Return separuh spektrum positif
// dalam bentuk { freq, re, im } (amplitudo DFT tanpa normalisasi /N).
export function fftComplex(samples: number[], sampleRate: number): ComplexBin[] {
  const n = samples.length;
  if (!isPowerOfTwo(n)) throw new Error('Panjang harus power of 2');

  const windowed = applyHannWindow(samples);
  const power = Math.log2(n);

  const indices = new Array<number>(n);
  for (let i = 0; i < n; i++) indices[i] = i;
  for (let i = 0; i < n; i++) {
    const j = parseInt(i.toString(2).padStart(power, '0').split('').reverse().join(''), 2);
    if (j > i) { [indices[i], indices[j]] = [indices[j], indices[i]]; }
  }

  const re = indices.map(i => windowed[i]);
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

  const results: ComplexBin[] = [];
  for (let i = 0; i < n / 2; i++) {
    results.push({ freq: (i * sampleRate) / n, re: re[i], im: im[i] });
  }
  return results;
}

// Spektrum magnitudo (half positif), memakai Hann window. Kompatibel dengan
// pemanggil lama (fft_results / dominantFrequency).
export function fft(samples: number[], sampleRate: number): MagnitudeBin[] {
  const n = samples.length;
  if (!isPowerOfTwo(n)) throw new Error('Panjang harus power of 2');
  const spectrum = fftComplex(samples, sampleRate);
  return spectrum.map(bin => ({
    freq: bin.freq,
    magnitude: Math.sqrt(bin.re ** 2 + bin.im ** 2) / n,
  }));
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

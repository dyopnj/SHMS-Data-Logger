// FDD (Frequency Domain Decomposition) — CPSD dua kanal + eigenvalue 2x2.
// Implementasi mandiri (tanpa library SVD): untuk matriks Hermitian 2x2,
// eigenvalue bisa dihitung closed-form dari trace dan determinant.

import { fftComplex, type ComplexBin } from './fft';

export interface EigenBin {
  freq: number;
  lambdaMax: number;
  lambdaMin: number;
  sxx: number;
  syy: number;
}

export interface Peak {
  freq: number;
  eigenvalue: number;
}

export interface FddResult {
  freqs: number[];
  eigenvalues: number[]; // kurva eigenvalue terbesar per bin
  peaks: Peak[];
}

// Cross-spectrum satu window antara kanal A (X) dan kanal B (Y):
//   Sxx = X * conj(X), Syy = Y * conj(Y), Sxy = X * conj(Y)
// Diasumsikan specA dan specB punya grid frekuensi yang sama (panjang &
// sampleRate sama). Komponen frekuensi diambil dari specA.
export function crossSpectrum(
  specA: ComplexBin[],
  specB: ComplexBin[],
): { freq: number; sxx: number; syy: number; sxyRe: number; sxyIm: number }[] {
  if (specA.length !== specB.length) {
    throw new Error('Panjang spektrum A dan B harus sama');
  }
  return specA.map((a, i) => {
    const b = specB[i];
    const sxx = a.re * a.re + a.im * a.im;
    const syy = b.re * b.re + b.im * b.im;
    // X * conj(Y)
    const sxyRe = a.re * b.re + a.im * b.im;
    const sxyIm = a.im * b.re - a.re * b.im;
    return { freq: a.freq, sxx, syy, sxyRe, sxyIm };
  });
}

// Eigenvalue matriks Hermitian 2x2 [Sxx Sxy; conj(Sxy) Syy] via closed-form:
//   lambda = (trace +- sqrt(trace^2 - 4*det)) / 2
//   trace = Sxx + Syy (real), det = Sxx*Syy - |Sxy|^2 (real)
function eigenvalues2x2(
  sxx: number,
  syy: number,
  sxyRe: number,
  sxyIm: number,
): { lambdaMax: number; lambdaMin: number } {
  const trace = sxx + syy;
  const absSxySq = sxyRe * sxyRe + sxyIm * sxyIm;
  const det = sxx * syy - absSxySq;
  const disc = trace * trace - 4 * det;
  const sqrtDisc = Math.sqrt(disc > 0 ? disc : 0);
  return {
    lambdaMax: (trace + sqrtDisc) / 2,
    lambdaMin: (trace - sqrtDisc) / 2,
  };
}

// Ambil puncak lokal (maksimum lokal) dari kurva eigenvalue, skip DC (bin 0),
// filter dengan ambang relatif terhadap nilai maksimum, urutkan menurun.
export function findPeaks(
  freqs: number[],
  values: number[],
  numPeaks: number,
  relativeThreshold = 0.2,
): Peak[] {
  const n = values.length;
  const candidates: Peak[] = [];
  for (let i = 1; i < n - 1; i++) {
    const v = values[i];
    if (v <= 0) continue;
    if (v >= values[i - 1] && v >= values[i + 1]) {
      candidates.push({ freq: freqs[i], eigenvalue: v });
    }
  }
  if (candidates.length === 0) return [];
  const maxVal = Math.max(...candidates.map(c => c.eigenvalue));
  const threshold = maxVal * relativeThreshold;
  return candidates
    .filter(c => c.eigenvalue >= threshold)
    .sort((a, b) => b.eigenvalue - a.eigenvalue)
    .slice(0, numPeaks);
}

// Jalur utama FDD untuk dua kanal (mis. Z-axis node_01 vs node_02):
//   samplesA, samplesB -> FFT kompleks -> CPSD -> eigenvalue 2x2 -> peak.
export function runFdd(
  samplesA: number[],
  samplesB: number[],
  sampleRate: number,
  numPeaks = 3,
): FddResult {
  if (samplesA.length !== samplesB.length) {
    throw new Error('Panjang window A dan B harus sama');
  }
  const specA = fftComplex(samplesA, sampleRate);
  const specB = fftComplex(samplesB, sampleRate);

  const cs = crossSpectrum(specA, specB);
  const freqs: number[] = [];
  const eigenvalues: number[] = [];
  for (const c of cs) {
    const { lambdaMax } = eigenvalues2x2(c.sxx, c.syy, c.sxyRe, c.sxyIm);
    freqs.push(c.freq);
    eigenvalues.push(lambdaMax);
  }

  const peaks = findPeaks(freqs, eigenvalues, numPeaks);
  return { freqs, eigenvalues, peaks };
}

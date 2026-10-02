// Validasi & flatten batch time-series (FR-01/02). Fungsi murni, tanpa I/O.

import type { RawBatch, RawBatchRow } from './types';

export interface Sample {
  seq: number;
  t_us: number;
  ax: number;
  ay: number;
  az: number;
}

const isFiniteNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function allFinite(arr: unknown): arr is number[] {
  return Array.isArray(arr) && arr.every(isFiniteNumber);
}

// Kembalikan string alasan bila payload tidak valid, null bila valid.
export function validateBatch(b: RawBatch): string | null {
  if (!b || typeof b !== 'object') return 'payload bukan objek';
  if (typeof b.node_id !== 'string' || !b.node_id) return 'node_id tidak valid';
  if (!isFiniteNumber(b.boot_id) || !isFiniteNumber(b.packet_seq)) return 'boot_id/packet_seq tidak valid';
  if (!isFiniteNumber(b.sample_count) || b.sample_count < 1) return 'sample_count tidak valid';
  if (!allFinite(b.ax) || !allFinite(b.ay) || !allFinite(b.az)) return 'ax/ay/az bukan array numerik';
  if (b.ax.length !== b.sample_count || b.ay.length !== b.sample_count || b.az.length !== b.sample_count) {
    return `panjang sumbu (${b.ax.length}/${b.ay.length}/${b.az.length}) != sample_count (${b.sample_count})`;
  }
  if (!isFiniteNumber(b.t0_us)) return 't0_us tidak valid';
  return null;
}

// Waktu tiap sampel (µs). dt_us array → kumulatif; number → konstan; kosong → nominal 1e6/rate.
export function perSampleTimes(t0_us: number, dt_us: number | number[] | undefined, count: number, rate: number): number[] {
  const out: number[] = new Array(count);
  let t = t0_us;
  if (Array.isArray(dt_us)) {
    for (let i = 0; i < count; i++) {
      out[i] = t;
      t += dt_us[i] ?? 0;
    }
  } else {
    const dt = typeof dt_us === 'number' && dt_us > 0 ? dt_us : Math.round(1e6 / (rate || 1));
    for (let i = 0; i < count; i++) { out[i] = t0_us + i * dt; }
  }
  return out;
}

// Flatten satu batch (baris DB) menjadi array sampel dengan seq + t_us.
export function flattenRawBatch(row: RawBatchRow): Sample[] {
  const ax = JSON.parse(row.ax) as number[];
  const ay = JSON.parse(row.ay) as number[];
  const az = JSON.parse(row.az) as number[];
  const times = perSampleTimes(row.t0_us, row.dt_us ?? undefined, row.sample_count, row.sampling_rate_hz);
  const startSeq = row.first_sample_seq ?? 0;
  return ax.map((_, i) => ({
    seq: startSeq + i,
    t_us: times[i],
    ax: ax[i],
    ay: ay[i],
    az: az[i],
  }));
}

export interface SampleWithTiming {
  seq: number;
  t_us: number;
  dt_us: number;
  jitter_us: number;
  ax: number;
  ay: number;
  az: number;
}

export interface JitterCalculationResult {
  sample_count: number;
  nominal_rate_hz: number;
  actual_rate_hz: number;
  nominal_interval_us: number;
  median_error_us: number;
  p95_error_us: number;
  p99_error_us: number;
  max_error_us: number;
  min_error_us: number;
  status: 'passed' | 'warning' | 'failed';
}

export function calculateTimingStats(samples: { t_us: number }[], nominalRateHz = 200): JitterCalculationResult {
  const count = samples.length;
  const t_nominal_us = Math.round(1e6 / (nominalRateHz || 200));

  if (count < 2) {
    return {
      sample_count: count,
      nominal_rate_hz: nominalRateHz,
      actual_rate_hz: nominalRateHz,
      nominal_interval_us: t_nominal_us,
      median_error_us: 0,
      p95_error_us: 0,
      p99_error_us: 0,
      max_error_us: 0,
      min_error_us: 0,
      status: 'passed'
    };
  }

  const errors: number[] = new Array(count - 1);
  for (let i = 1; i < count; i++) {
    const dt = samples[i].t_us - samples[i - 1].t_us;
    errors[i - 1] = Math.abs(dt - t_nominal_us);
  }

  errors.sort((a, b) => a - b);
  const n = errors.length;

  const median_error_us = errors[Math.floor(n * 0.5)];
  const p95Idx = Math.min(n - 1, Math.ceil(n * 0.95) - 1);
  const p95_error_us = errors[p95Idx];
  const p99Idx = Math.min(n - 1, Math.ceil(n * 0.99) - 1);
  const p99_error_us = errors[p99Idx];
  const max_error_us = errors[n - 1];
  const min_error_us = errors[0];

  const duration_sec = (samples[count - 1].t_us - samples[0].t_us) / 1e6;
  const actual_rate_hz = duration_sec > 0 ? (count - 1) / duration_sec : nominalRateHz;

  let status: 'passed' | 'warning' | 'failed' = 'passed';
  if (p95_error_us > 1000) {
    status = 'failed';
  } else if (p95_error_us > 500) {
    status = 'warning';
  }

  return {
    sample_count: count,
    nominal_rate_hz: nominalRateHz,
    actual_rate_hz: Number(actual_rate_hz.toFixed(2)),
    nominal_interval_us: t_nominal_us,
    median_error_us,
    p95_error_us,
    p99_error_us,
    max_error_us,
    min_error_us,
    status
  };
}

export function flattenRawBatchWithTiming(row: RawBatchRow): SampleWithTiming[] {
  const ax = JSON.parse(row.ax) as number[];
  const ay = JSON.parse(row.ay) as number[];
  const az = JSON.parse(row.az) as number[];
  const times = perSampleTimes(row.t0_us, row.dt_us ?? undefined, row.sample_count, row.sampling_rate_hz);
  const startSeq = row.first_sample_seq ?? 0;
  const t_nominal_us = Math.round(1e6 / (row.sampling_rate_hz || 200));

  return ax.map((_, i) => {
    const t = times[i];
    const dt = i > 0 ? t - times[i - 1] : t_nominal_us;
    const jitter = dt - t_nominal_us;
    return {
      seq: startSeq + i,
      t_us: t,
      dt_us: dt,
      jitter_us: jitter,
      ax: ax[i],
      ay: ay[i],
      az: az[i],
    };
  });
}

import { describe, expect, it } from 'vitest';
import { ZIEL_FPS_P95, bewerte, formatReport, istAltgeraet, metricsUrl, parseArgs } from './perf-live.mjs';

const bucket = (overrides = {}) => ({
  deviceClass: 'low',
  quality: 'webgl-kompat',
  tier: 'low',
  samples: 20,
  fpsP50: 60,
  fpsP95: 58,
  fpsWorst: 51,
  frameHangsMedian: 0,
  lowFpsRatio: 0,
  dprMedian: 1,
  megapixelsMedian: 2.07,
  ...overrides
});

const client = (overrides = {}) => ({
  enabled: true,
  windowSeconds: 900,
  samples: 20,
  acceptedTotal: 20,
  invertedTotal: 0,
  tierCoercedTotal: 0,
  rejectedTotal: 0,
  rejected: {},
  buckets: [bucket()],
  ...overrides
});

describe('perf-live arguments', () => {
  it('defaults to a local instance', () => {
    expect(parseArgs([]).url).toBe('http://localhost:2567');
    expect(parseArgs([]).json).toBe(false);
  });

  it('accepts both spellings and rejects nonsense', () => {
    expect(parseArgs(['--min-samples', '9']).minSamples).toBe(9);
    expect(parseArgs(['--min-samples=3']).minSamples).toBe(3);
    expect(() => parseArgs(['--min-samples', 'viele'])).toThrow();
    expect(() => parseArgs(['--was-denn'])).toThrow();
  });

  it('appends the metrics path only when it is missing', () => {
    expect(metricsUrl('https://example.com')).toBe('https://example.com/metrics?format=json');
    expect(metricsUrl('https://example.com/')).toBe('https://example.com/metrics?format=json');
    expect(metricsUrl('https://example.com/metrics')).toBe('https://example.com/metrics?format=json');
  });
});

describe('reference device', () => {
  it('counts both a weak device and the software render path', () => {
    expect(istAltgeraet(bucket({ deviceClass: 'low', quality: 'webgl' }))).toBe(true);
    // webgl-kompat ist per Definition der alte PC, auch auf starker Hardware.
    expect(istAltgeraet(bucket({ deviceClass: 'high', quality: 'webgl-kompat' }))).toBe(true);
    expect(istAltgeraet(bucket({ deviceClass: 'high', quality: 'webgl' }))).toBe(false);
  });
});

describe('verdict', () => {
  it('passes only when both halves of the yardstick hold', () => {
    expect(bewerte(bucket()).erfuellt).toBe(true);
    expect(bewerte(bucket({ fpsP95: ZIEL_FPS_P95 })).erfuellt).toBe(true);
  });

  it('fails on slow frames and names the number', () => {
    const result = bewerte(bucket({ fpsP95: 41 }));
    expect(result.erfuellt).toBe(false);
    expect(result.urteil).toContain('41');
  });

  it('fails on hangs even when the frame rate is fine', () => {
    const result = bewerte(bucket({ fpsP95: 60, frameHangsMedian: 2 }));
    expect(result.erfuellt).toBe(false);
    expect(result.urteil).toContain('Haenger');
  });

  it('treats a thin sample as unanswered, not as passed', () => {
    // Der gefaehrlichste Fall: zu wenig Daten darf nie wie ein Bestehen aussehen.
    const result = bewerte(bucket({ samples: 2 }), 5);
    expect(result.erfuellt).toBeNull();
    expect(result.urteil).toBe('zu wenig Daten');
  });
});

describe('report', () => {
  it('says UNBEANTWORTET when nothing arrived at all', () => {
    const text = formatReport(client({ buckets: [], samples: 0 }));
    expect(text).toContain('KEINE BERICHTE IM FENSTER');
    expect(text).toContain('UNBEANTWORTET');
    expect(text).not.toContain('ERFUELLT');
  });

  it('points at rejections when there were any', () => {
    const text = formatReport(client({ buckets: [], samples: 0, rejectedTotal: 12 }));
    expect(text).toContain('VERWORFEN');
  });

  it('points at chat 03 when nothing was rejected either', () => {
    const text = formatReport(client({ buckets: [], samples: 0 }));
    expect(text).toContain('Chat 03');
  });

  it('reports a pass on the reference device', () => {
    const text = formatReport(client());
    expect(text).toContain('Messlatte ERFUELLT');
  });

  it('reports a miss and shows the failing bucket', () => {
    const text = formatReport(client({ buckets: [bucket({ fpsP95: 30 })] }));
    expect(text).toContain('VERFEHLT');
    expect(text).toContain('30');
  });

  it('does not claim a pass when only strong devices reported', () => {
    const text = formatReport(client({ buckets: [bucket({ deviceClass: 'high', quality: 'webgl' })] }));
    expect(text).toContain('Kein Bericht von einem Referenz-Altgeraet');
    expect(text).toContain('UNBEANTWORTET');
  });

  it('does not claim a pass when the only reference bucket is too thin', () => {
    const text = formatReport(client({ buckets: [bucket({ samples: 1 })] }), { minSamples: 5 });
    expect(text).toContain('UNBEANTWORTET');
  });

  it('says so when telemetry is switched off', () => {
    expect(formatReport({ enabled: false })).toContain('abgeschaltet');
  });

  it('surfaces coerced tiers and inverted percentiles', () => {
    const text = formatReport(client({ invertedTotal: 3, tierCoercedTotal: 7 }));
    expect(text).toContain('vertauschten Perzentilen');
    expect(text).toContain('unbekannter Qualitaetsstufe');
  });
});

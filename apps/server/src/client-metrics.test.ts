import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  CLIENT_DEVICE_CLASSES,
  CLIENT_RENDER_PATHS,
  clientMetricsHandler,
  clientMetricsSchema,
  clientMetricsSummary,
  clientMetricsText,
  recordClientMetrics,
  resetClientMetrics,
  type ClientMetricsReport
} from './client-metrics';

const report = (overrides: Partial<ClientMetricsReport> = {}): ClientMetricsReport => ({
  fpsP50: 60,
  fpsP95: 45,
  frameHangs: 2,
  dpr: 2,
  viewportW: 1920,
  viewportH: 1080,
  deviceClass: 'high',
  quality: 'webgl',
  ...overrides
});

const respond = () => {
  const state: { status: number; body: unknown; ended: boolean } = { status: 200, body: null, ended: false };
  const response = {
    status(code: number) { state.status = code; return response; },
    json(body: unknown) { state.body = body; return response; },
    end() { state.ended = true; return response; }
  };
  return { response, state };
};

const post = (body: unknown) => {
  const call = respond();
  clientMetricsHandler()({ body } as never, call.response as never);
  return call.state;
};

const lineFor = (text: string, name: string): string[] =>
  text.split('\n').filter((line) => line.startsWith(`${name}{`) || line === `${name}` || line.startsWith(`${name} `));

beforeEach(() => resetClientMetrics());

afterEach(() => {
  resetClientMetrics();
  delete process.env.TELEMETRY_ENABLED;
});

describe('report validation', () => {
  it('accepts a plausible browser report', () => {
    expect(clientMetricsSchema.safeParse(report()).success).toBe(true);
    expect(post(report()).status).toBe(204);
    expect(clientMetricsSummary().acceptedTotal).toBe(1);
  });

  it('refuses anything that cannot come from a real browser', () => {
    const broken: Partial<ClientMetricsReport>[] = [
      { fpsP50: 0 },
      { fpsP50: 5_000 },
      { frameHangs: -1 },
      { frameHangs: 1.5 },
      { dpr: 0 },
      { dpr: 99 },
      { viewportW: 10 },
      { viewportH: 0 },
      { deviceClass: 'gaming-rig' as never },
      { quality: 'vulkan' as never }
    ];
    for (const patch of broken) {
      expect(post(report(patch)).status).toBe(400);
    }
    // Zusätzliche Felder sind ebenfalls raus – der Body ist strikt.
    expect(post({ ...report(), userId: 'abc' }).status).toBe(400);
    expect(post(undefined).status).toBe(400);
    expect(post('nope').status).toBe(400);

    expect(clientMetricsSummary().acceptedTotal).toBe(0);
    expect(clientMetricsSummary().rejected['schema']).toBe(13);
  });

  it('says nothing about why a report was refused', () => {
    // Ein offener Endpunkt soll kein Schema-Orakel sein.
    expect(post(report({ dpr: 99 })).body).toEqual({ error: 'Ungültiger Bericht.' });
  });

  it('answers 404 while telemetry is switched off', () => {
    process.env.TELEMETRY_ENABLED = 'false';
    expect(post(report()).status).toBe(404);
    expect(clientMetricsSummary().acceptedTotal).toBe(0);
  });
});

describe('aggregation', () => {
  it('reports medians per device class and render path', () => {
    for (const fps of [30, 60, 90]) {
      recordClientMetrics(report({ fpsP50: fps, fpsP95: fps - 10, deviceClass: 'high', quality: 'webgl' }));
    }
    recordClientMetrics(report({ fpsP50: 22, fpsP95: 14, deviceClass: 'low', quality: 'webgl-kompat' }));

    const summary = clientMetricsSummary();
    const high = summary.buckets.find((bucket) => bucket.deviceClass === 'high');
    const low = summary.buckets.find((bucket) => bucket.deviceClass === 'low');

    expect(high?.samples).toBe(3);
    expect(high?.fpsP50).toBe(60);
    expect(high?.fpsP95).toBe(50);
    expect(low?.quality).toBe('webgl-kompat');
    expect(low?.fpsP95).toBe(14);
    expect(summary.samples).toBe(4);
  });

  it('counts the share of reports that stutter', () => {
    for (const slow of [10, 20, 25, 45, 60]) {
      recordClientMetrics(report({ fpsP50: 60, fpsP95: slow }));
    }
    // Drei von fünf liegen unter 30 fps am Rand.
    expect(clientMetricsSummary().buckets[0]?.lowFpsRatio).toBe(0.6);
    expect(clientMetricsSummary().buckets[0]?.fpsWorst).toBe(10);
  });

  it('treats the smaller value as the tail, whichever way the client counts', () => {
    // Ein Client, der p95 als „schnellstes Fünftel" liest, liefert es größer.
    recordClientMetrics(report({ fpsP50: 40, fpsP95: 75 }));
    const bucket = clientMetricsSummary().buckets[0];
    expect(bucket?.fpsP50).toBe(75);
    expect(bucket?.fpsP95).toBe(40);
    // Sichtbar bleibt es trotzdem.
    expect(clientMetricsSummary().invertedTotal).toBe(1);
  });

  it('forgets reports that fall out of the window', () => {
    const now = 1_000_000_000;
    recordClientMetrics(report(), now);
    expect(clientMetricsSummary(now).samples).toBe(1);

    // 15 Minuten später ist die Stichprobe raus, der Gesamtzähler bleibt.
    const later = clientMetricsSummary(now + 15 * 60_000 + 1);
    expect(later.samples).toBe(0);
    expect(later.buckets).toHaveLength(0);
    expect(later.acceptedTotal).toBe(1);
  });

  it('keeps the label space small no matter what arrives', () => {
    for (const deviceClass of CLIENT_DEVICE_CLASSES) {
      for (const quality of CLIENT_RENDER_PATHS) {
        recordClientMetrics(report({ deviceClass, quality }));
      }
    }
    // Vier Geräteklassen mal vier Renderpfade – mehr kann es nie werden.
    expect(clientMetricsSummary().buckets).toHaveLength(16);
  });

  it('survives far more reports than the buffer holds', () => {
    const now = 1_000_000_000;
    for (let index = 0; index < 5_000; index += 1) {
      recordClientMetrics(report({ fpsP50: 60, fpsP95: 50 }), now + index);
    }
    const summary = clientMetricsSummary(now + 5_000);
    expect(summary.acceptedTotal).toBe(5_000);
    // Der Ringpuffer deckelt die Stichprobe, ohne dass etwas kaputtgeht.
    expect(summary.samples).toBeLessThanOrEqual(4_000);
    expect(summary.buckets[0]?.fpsP50).toBe(60);
  });
});

describe('prometheus export', () => {
  it('exposes the fps series per bucket', () => {
    recordClientMetrics(report({ deviceClass: 'low', quality: 'webgl-kompat', fpsP50: 28, fpsP95: 18 }));
    const text = clientMetricsText();

    expect(text).toContain('# TYPE maze_client_fps_p50 gauge');
    expect(lineFor(text, 'maze_client_fps_p50'))
      .toEqual(['maze_client_fps_p50{deviceClass="low",quality="webgl-kompat"} 28']);
    expect(lineFor(text, 'maze_client_fps_p95'))
      .toEqual(['maze_client_fps_p95{deviceClass="low",quality="webgl-kompat"} 18']);
    expect(text).toContain('maze_client_low_fps_ratio{deviceClass="low",quality="webgl-kompat"} 1');
    expect(text).toContain('maze_client_reports_total{deviceClass="low",quality="webgl-kompat"} 1');
    expect(text.endsWith('\n')).toBe(true);
  });

  it('exports frame hangs both as a median and as a running total', () => {
    recordClientMetrics(report({ frameHangs: 4 }));
    recordClientMetrics(report({ frameHangs: 10 }));
    const text = clientMetricsText();

    expect(text).toContain('maze_client_frame_hangs{deviceClass="high",quality="webgl"} 4');
    expect(text).toContain('maze_client_frame_hangs_total{deviceClass="high",quality="webgl"} 14');
  });

  it('stays valid while nothing has been reported yet', () => {
    const text = clientMetricsText();
    expect(text).toContain('maze_client_window_samples 0');
    expect(text).not.toContain('maze_client_fps_p50{');
    expect(text.endsWith('\n')).toBe(true);
  });

  it('makes refused reports visible instead of hiding them', () => {
    post(report({ quality: 'vulkan' as never }));
    expect(clientMetricsText()).toContain('maze_client_reports_rejected_total{reason="schema"} 1');
  });
});

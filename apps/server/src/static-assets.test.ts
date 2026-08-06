import { describe, expect, it, vi } from 'vitest';
import { akzeptiert, inhaltstyp, servePrecompressed, waehleVariante } from './static-assets';

const vorhanden = (...pfade: string[]) => (p: string) => pfade.includes(p);

describe('accept-encoding', () => {
  it('recognises the encodings a browser actually sends', () => {
    expect(akzeptiert('gzip, deflate, br, zstd', 'br')).toBe(true);
    expect(akzeptiert('gzip, deflate', 'gzip')).toBe(true);
    expect(akzeptiert('gzip, deflate', 'br')).toBe(false);
    expect(akzeptiert(undefined, 'gzip')).toBe(false);
  });

  it('honours an explicit refusal', () => {
    // "q=0" heißt ausdrücklich: schick mir das nicht.
    expect(akzeptiert('gzip;q=0', 'gzip')).toBe(false);
    expect(akzeptiert('gzip;q=0.5, br', 'gzip')).toBe(true);
  });

  it('does not confuse one encoding with another', () => {
    // "br" darf nicht in "brotli-irgendwas" oder "gzip" hineingelesen werden.
    expect(akzeptiert('gzip', 'br')).toBe(false);
    expect(akzeptiert('brr', 'br')).toBe(false);
  });
});

describe('variant choice', () => {
  it('prefers brotli over gzip when both are there', () => {
    const wahl = waehleVariante('/dist/app.js', 'gzip, br', vorhanden('/dist/app.js.br', '/dist/app.js.gz'));
    expect(wahl).toEqual({ kodierung: 'br', pfad: '/dist/app.js.br' });
  });

  it('falls back to gzip when brotli is missing', () => {
    const wahl = waehleVariante('/dist/app.js', 'gzip, br', vorhanden('/dist/app.js.gz'));
    expect(wahl?.kodierung).toBe('gzip');
  });

  it('sends nothing compressed when the client did not ask', () => {
    expect(waehleVariante('/dist/app.js', undefined, vorhanden('/dist/app.js.br'))).toBeNull();
    expect(waehleVariante('/dist/app.js', 'identity', vorhanden('/dist/app.js.br'))).toBeNull();
  });

  it('sends nothing when the precompressed file is absent', () => {
    // Ein vergessener Build-Schritt macht die Seite langsamer, nie kaputt.
    expect(waehleVariante('/dist/app.js', 'gzip, br', () => false)).toBeNull();
  });
});

describe('content type', () => {
  it('keeps the type of the original file, not of the archive', () => {
    expect(inhaltstyp('/dist/app.js')).toContain('javascript');
    expect(inhaltstyp('/dist/style.css')).toContain('css');
    expect(inhaltstyp('/dist/index.html')).toContain('html');
  });

  it('has no opinion about binaries', () => {
    expect(inhaltstyp('/dist/logo.png')).toBeUndefined();
    expect(inhaltstyp('/dist/font.woff2')).toBeUndefined();
  });
});

describe('middleware', () => {
  const lauf = (pfad: string, headers: Record<string, string>, exists: (p: string) => boolean, method = 'GET') => {
    const next = vi.fn();
    const response = {
      headers: {} as Record<string, string>,
      gesendet: null as string | null,
      setHeader(name: string, value: string) { this.headers[name.toLowerCase()] = value; },
      sendFile(p: string) { this.gesendet = p; },
      headersSent: false
    };
    servePrecompressed('/dist', exists)(
      { method, path: pfad, headers } as never,
      response as never,
      next as never
    );
    return { next, response };
  };

  it('serves the brotli file with the original content type', () => {
    const { response, next } = lauf('/assets/app.js', { 'accept-encoding': 'gzip, br' }, vorhanden('/dist/assets/app.js.br'));
    expect(response.gesendet).toBe('/dist/assets/app.js.br');
    expect(response.headers['content-encoding']).toBe('br');
    expect(response.headers['content-type']).toContain('javascript');
    expect(next).not.toHaveBeenCalled();
  });

  it('always sets Vary, even when nothing compressed goes out', () => {
    // Ohne Vary liefert ein Proxy die komprimierte Antwort an einen Client aus,
    // der sie nicht lesen kann.
    const { response, next } = lauf('/assets/app.js', {}, () => false);
    expect(response.headers.vary).toBe('Accept-Encoding');
    expect(next).toHaveBeenCalled();
  });

  it('passes binaries straight through', () => {
    const { next, response } = lauf('/assets/logo.png', { 'accept-encoding': 'br' }, () => true);
    expect(next).toHaveBeenCalled();
    expect(response.gesendet).toBeNull();
  });

  it('refuses to walk out of the client directory', () => {
    const { next, response } = lauf('/../../etc/passwd.js', { 'accept-encoding': 'br' }, () => true);
    expect(next).toHaveBeenCalled();
    expect(response.gesendet).toBeNull();
  });

  it('leaves anything that is not a GET or HEAD alone', () => {
    const { next } = lauf('/assets/app.js', { 'accept-encoding': 'br' }, () => true, 'POST');
    expect(next).toHaveBeenCalled();
  });
});

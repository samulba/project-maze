/**
 * Lokaler Rekord eines Gasts (Befund 48).
 *
 * Vorher nahm ein Gast aus einer Sitzung nichts mit: kein Schlüssel im
 * localStorage trug Score, Level oder Läufe, und ZUM STARTSCREEN lädt die
 * Seite neu. Wer 25 Minuten gespielt hatte, fand morgen eine Seite vor, die
 * von seinem ersten Besuch nicht zu unterscheiden war – es gab buchstäblich
 * nichts, was er fortsetzen oder schlagen konnte.
 *
 * Dieses Modul führt den Bestand: Bestscore, bestes Level, meiste Kills
 * eines Lebens, längster Lauf, Zahl der Läufe. Geschrieben beim Tod,
 * gelesen vom Startscreen („Dein Rekord: …") und vom Death-Screen
 * („Neuer Bestwert!" / „Dein Bestwert: …" – Befund 53, erste Zeile).
 * Kein Konto, keine Migration; mit Konto bleibt der Server die Autorität
 * für alles, was er kennt.
 */

const KEY = 'mazers-run';

export interface LocalRunRecord {
  bestScore: number;
  bestLevel: number;
  mostKills: number;
  longestRunSeconds: number;
  runs: number;
  lastVisit: string;
}

export interface FinishedRun {
  score: number;
  level: number;
  kills: number;
  seconds: number;
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

const defaultStorage = (): StorageLike | null => {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

const zahl = (wert: unknown): number => (typeof wert === 'number' && Number.isFinite(wert) && wert >= 0 ? wert : 0);

export function readRunRecord(storage: StorageLike | null = defaultStorage()): LocalRunRecord | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const roh = parsed as Partial<LocalRunRecord>;
    const record: LocalRunRecord = {
      bestScore: zahl(roh.bestScore),
      bestLevel: Math.max(1, zahl(roh.bestLevel)),
      mostKills: zahl(roh.mostKills),
      longestRunSeconds: zahl(roh.longestRunSeconds),
      runs: zahl(roh.runs),
      lastVisit: typeof roh.lastVisit === 'string' ? roh.lastVisit : ''
    };
    // Ein Bestand ohne einen einzigen Lauf ist keiner.
    return record.runs > 0 ? record : null;
  } catch {
    return null;
  }
}

/** Reine Merge-Logik – testbar ohne Storage. */
export function mergeRun(
  previous: LocalRunRecord | null,
  run: FinishedRun,
  now: string
): { record: LocalRunRecord; neuerBestScore: boolean } {
  const neuerBestScore = previous !== null && run.score > previous.bestScore;
  return {
    record: {
      bestScore: Math.max(previous?.bestScore ?? 0, Math.round(zahl(run.score))),
      bestLevel: Math.max(previous?.bestLevel ?? 1, Math.round(zahl(run.level))),
      mostKills: Math.max(previous?.mostKills ?? 0, Math.round(zahl(run.kills))),
      longestRunSeconds: Math.max(previous?.longestRunSeconds ?? 0, Math.round(zahl(run.seconds))),
      runs: (previous?.runs ?? 0) + 1,
      lastVisit: now
    },
    neuerBestScore
  };
}

export function rememberRun(
  run: FinishedRun,
  now: string = new Date().toISOString(),
  storage: StorageLike | null = defaultStorage()
): { record: LocalRunRecord; neuerBestScore: boolean } {
  const previous = readRunRecord(storage);
  const ergebnis = mergeRun(previous, run, now);
  try {
    storage?.setItem(KEY, JSON.stringify(ergebnis.record));
  } catch {
    /* Ohne Storage bleibt es beim flüchtigen Lauf – wie vorher. */
  }
  return ergebnis;
}

/** Die Zeile auf dem Startscreen; null, solange es nichts zu erzählen gibt. */
export function recordLine(record: LocalRunRecord | null): string | null {
  if (!record) return null;
  const laeufe = record.runs === 1 ? '1 Lauf' : `${record.runs} Läufe`;
  return `Dein Rekord: ${record.bestScore.toLocaleString('de-DE')} · Level ${record.bestLevel} · ${laeufe}`;
}

/** Die Zeile auf dem Death-Screen; ab dem zweiten Lauf ein echter Vergleich. */
export function deathRecordLine(
  ergebnis: { record: LocalRunRecord; neuerBestScore: boolean },
  score: number
): string | null {
  if (ergebnis.record.runs <= 1) return null;
  if (ergebnis.neuerBestScore) return `Neuer Bestwert: ${Math.round(score).toLocaleString('de-DE')} Punkte`;
  return `Dein Bestwert: ${ergebnis.record.bestScore.toLocaleString('de-DE')} · Level ${ergebnis.record.bestLevel}`;
}

/**
 * Wiederkehr – „Fremde kommen wieder".
 *
 * Das ist die letzte Zeile in `docs/GOAL.md` und die einzige, die kein Test
 * beantworten kann: Ob MAZERS gut ist, entscheidet nicht `npm run check`,
 * sondern ob jemand ein zweites Mal kommt. Das Zieldokument benennt dafür
 * ausdrücklich dieses Portal als Messgerät – gemessen hat es bisher nur, wie
 * viele **neu** waren.
 *
 * Gerechnet wird ausschließlich aus `devices` (`device_id`, `first_seen`,
 * `last_seen`, `sessions`). Das reicht, kostet keine Migration und steht damit
 * in dem Moment zur Verfügung, in dem der Server neu startet.
 *
 * ## Die zwei Fallen, um die sich hier alles dreht
 *
 * **1. Wer heute zum ersten Mal da war, kann noch nicht wiedergekommen sein.**
 * Nähme man ihn in den Nenner, sänke die Quote mit jedem neuen Spieler – eine
 * erfolgreiche Werbeaktion sähe aus wie ein Einbruch. Deshalb zählt jede Stufe
 * nur **reife** Geräte: solche, die überhaupt schon N Tage alt sind. Wer zu
 * jung ist, fehlt in Zähler **und** Nenner.
 *
 * **2. Gerechnet wird in Kalendertagen, nicht in 24-Stunden-Blöcken.** Wer
 * abends um 20 Uhr anfängt und am nächsten Abend um 19 Uhr wiederkommt, war
 * 23 Stunden weg – nach Stundenrechnung „nicht wiedergekommen", nach
 * menschlichem Verständnis sehr wohl. Der Rest des Portals rechnet ebenfalls
 * in UTC-Tagen (`admin_daily`, `sinceIso`); alles andere wäre eine zweite
 * Zeitrechnung im selben Bildschirm.
 */

/** Ein Gerät, reduziert auf das, was die Wiederkehr braucht. */
export interface KohortenGeraet {
  deviceId: string;
  firstSeen: string;
  lastSeen: string;
  sessions: number;
}

/** „Von den Geräten, die alt genug sind: Wie viele waren nach N Tagen noch da?" */
export interface Reifestufe {
  tage: number;
  /** Geräte, die die Frage überhaupt beantworten können (Alter ≥ `tage`). */
  reif: number;
  /** Davon: kamen an einem Tag zurück, der ≥ `tage` nach dem ersten liegt. */
  geblieben: number;
  /** `null`, solange kein Gerät reif ist – nicht `0`, das wäre eine Aussage. */
  quote: number | null;
}

/** Alle Geräte einer Woche des ersten Besuchs. */
export interface Kohorte {
  /** Montag dieser Woche, UTC, als ISO-Datum. */
  start: string;
  neu: number;
  /** Davon: an einem späteren Kalendertag noch einmal da. */
  wieder: number;
  quote: number | null;
  /** Alter des jüngsten Geräts dieser Kohorte, in Tagen. */
  juengstesAlter: number;
}

export interface Wiederkehr {
  /** Geräte mit erstem Besuch im Zeitfenster. */
  betrachtet: number;
  /** Davon zu jung, um überhaupt wiedergekommen sein zu können. */
  frisch: number;
  /** Reif für die Tagesfrage (Alter ≥ 1) und nie an einem anderen Tag zurück. */
  einmal: number;
  /** Reif und an einem späteren Tag zurück. */
  wieder: number;
  /** Wiederkehrquote am Tag 1 – die Kennzahl der Zeile aus `docs/GOAL.md`. */
  quote: number | null;
  stufen: Reifestufe[];
  kohorten: Kohorte[];
  /**
   * Die Abfrage hat ihr Zeilenlimit erreicht; die jüngsten Geräte des Fensters
   * fehlen. Steht im Portal als Fußnote – eine gedeckelte Zahl, die sich für
   * vollständig ausgibt, ist schlimmer als gar keine.
   */
  abgeschnitten: boolean;
}

/** Die Stufen, nach denen gefragt wird. Weiter als das Fenster reicht, wird nicht gefragt. */
export const REIFESTUFEN = [1, 3, 7, 14, 30] as const;

const TAG_MS = 86_400_000;

/**
 * Tagesnummer seit der Epoche, UTC. Der Vergleich zweier Tagesnummern ist die
 * Frage „an einem späteren Tag?" – unabhängig von der Uhrzeit.
 */
export function tagesnummer(iso: string): number | null {
  const zeit = Date.parse(iso);
  if (!Number.isFinite(zeit)) return null;
  return Math.floor(zeit / TAG_MS);
}

const anteil = (teil: number, ganz: number): number | null =>
  (ganz > 0 ? Math.round((teil / ganz) * 1000) / 10 : null);

/** Montag der Woche, in der `tag` liegt – als Tagesnummer. */
export function wochenStart(tag: number): number {
  // Tag 0 der Epoche (1.1.1970) war ein Donnerstag; bis zum Montag davor sind
  // es drei Tage zurück. Daher der Versatz von 3 und nicht von 4 – mit 4 landet
  // jeder Montag auf dem Sonntag davor, und die Kohortenwoche ist um einen Tag
  // verschoben.
  return tag - ((tag + 3) % 7);
}

const alsDatum = (tag: number): string => new Date(tag * TAG_MS).toISOString().slice(0, 10);

/**
 * Rechnet Gerätezeilen in die Wiederkehr um.
 *
 * `now` ist ein Parameter und kein `Date.now()` im Rumpf: Eine Kennzahl, deren
 * Ergebnis von der Uhr abhängt, muss sich mit einer festen Uhr prüfen lassen.
 */
export function wiederkehr(
  geraete: readonly KohortenGeraet[],
  now = Date.now(),
  fensterTage = 30,
  abgeschnitten = false
): Wiederkehr {
  const heute = Math.floor(now / TAG_MS);

  interface Gereift { alter: number; abstand: number; woche: number }
  const gereift: Gereift[] = [];
  for (const geraet of geraete) {
    const erst = tagesnummer(geraet.firstSeen);
    const letzt = tagesnummer(geraet.lastSeen);
    // Unlesbare Zeitstempel fallen heraus statt hinein – dieselbe Regel wie in
    // `zeilenAb`: lieber eine Zeile zu wenig als eine Quote, die Müll addiert.
    if (erst === null || letzt === null) continue;
    gereift.push({
      alter: heute - erst,
      // Nie negativ: `last_seen` vor `first_seen` gibt es nur als Datenfehler,
      // und ein negativer Abstand würde als „nicht wiedergekommen" gelesen –
      // was zufällig richtig wäre, aber aus dem falschen Grund.
      abstand: Math.max(0, letzt - erst),
      woche: wochenStart(erst)
    });
  }

  const betrachtet = gereift.length;
  const frisch = gereift.filter((g) => g.alter < 1).length;

  const stufen: Reifestufe[] = REIFESTUFEN
    .filter((tage) => tage <= fensterTage)
    .map((tage) => {
      const reif = gereift.filter((g) => g.alter >= tage);
      const geblieben = reif.filter((g) => g.abstand >= tage).length;
      return { tage, reif: reif.length, geblieben, quote: anteil(geblieben, reif.length) };
    });

  const tag1 = stufen.find((stufe) => stufe.tage === 1);
  const wieder = tag1?.geblieben ?? 0;

  const nachWoche = new Map<number, Gereift[]>();
  for (const g of gereift) {
    const liste = nachWoche.get(g.woche);
    if (liste) liste.push(g); else nachWoche.set(g.woche, [g]);
  }
  const kohorten: Kohorte[] = [...nachWoche.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([woche, mitglieder]) => {
      // Nur reife Mitglieder bilden die Quote – dieselbe Regel wie bei den
      // Stufen, sonst drückt die laufende Woche ihre eigene Kohorte nach unten.
      const reif = mitglieder.filter((g) => g.alter >= 1);
      const wiederholer = reif.filter((g) => g.abstand >= 1).length;
      return {
        start: alsDatum(woche),
        neu: mitglieder.length,
        wieder: wiederholer,
        quote: anteil(wiederholer, reif.length),
        juengstesAlter: Math.min(...mitglieder.map((g) => g.alter))
      };
    });

  return {
    betrachtet,
    frisch,
    einmal: (tag1?.reif ?? 0) - wieder,
    wieder,
    quote: tag1?.quote ?? null,
    stufen,
    kohorten,
    abgeschnitten
  };
}

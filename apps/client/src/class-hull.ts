import { PLAYER_CLASS_IDS, type PlayerClass } from '@project-maze/shared';

/**
 * Die Rumpfgeometrie der 29 Klassen – **eine Quelle für Spiel und Vorschau**.
 *
 * Vorher stand sie als `switch` privat in `renderer.ts`, und die Wahlkarten
 * zeichneten jeden Rumpf als Kreis. Die Vorschau hat damit gelogen: Ein
 * Fortress ist ein Kasten, auf der Karte war er eine Scheibe. Wer nach dem Bild
 * gewählt hat, hat etwas anderes bekommen.
 *
 * Deshalb liegt die Geometrie hier als **Daten**, nicht als Zeichenbefehle. Wer
 * sie darstellt, entscheidet der Aufrufer: `renderer.ts` schiebt sie in zwei
 * Pixi-`Graphics`, `class-preview.ts` macht SVG daraus. Beide bekommen exakt
 * dieselbe Liste, und damit kann die Vorschau nicht mehr hübscher lügen als das
 * Original.
 *
 * Zwei Ebenen, weil sie verschiedene Fragen beantworten:
 * - **`koerper`** ist der *Umriss*. Was hier steht, entscheidet, ob man zwei
 *   Klassen im Gefecht auseinanderhält.
 * - **`detail`** ist die Zeichnung *innen*. Sie hilft beim Hinsehen, aber sie
 *   rettet keine Silhouette, die schon als Fleck mehrdeutig ist.
 */

export type HullEbene = 'koerper' | 'detail';

/**
 * Farbe wird nicht als Zahl abgelegt, sondern als Rolle.
 *
 * `klasse` ist die Farbe, die der Tank ohnehin trägt – im Spiel Eigen- oder
 * Gegnerfarbe, auf der Karte `currentColor`. `licht` ist das Weiß der
 * Aufhellungen. Ein fester Zahlenwert hier würde die Themes aushebeln und die
 * Gegnerfarbe auf der Wahlkarte landen lassen.
 */
export type HullTon = 'klasse' | 'licht';

export interface HullFarbe { ton: HullTon; alpha?: number }
export interface HullStrich extends HullFarbe { breite: number }

interface HullBasis {
  ebene: HullEbene;
  fuellung?: HullFarbe;
  strich?: HullStrich;
}

/** Die reine Form, ohne Anstrich – das, was die Silhouette ausmacht. */
export type HullGeometrie =
  | { form: 'kreis'; x: number; y: number; r: number }
  | { form: 'vieleck'; ecken: number; r: number; drehung: number }
  | { form: 'zug'; punkte: readonly number[] }
  | { form: 'rechteck'; x: number; y: number; breite: number; hoehe: number; ecke: number }
  | { form: 'strecke'; x1: number; y1: number; x2: number; y2: number }
  /** Ein Ring aus kleinen Kreisen – im Renderer war das `drawNodes`. */
  | { form: 'kranz'; anzahl: number; r: number; knoten: number };

export type HullForm = HullGeometrie & HullBasis;

/** Eckpunkte eines regelmäßigen Vielecks, Reihenfolge wie im Renderer. */
export function vieleckPunkte(ecken: number, radius: number, drehung = 0): number[] {
  const punkte: number[] = [];
  for (let index = 0; index < ecken; index += 1) {
    const winkel = drehung + (index * Math.PI * 2) / ecken;
    punkte.push(Math.cos(winkel) * radius, Math.sin(winkel) * radius);
  }
  return punkte;
}

/** Der weiße Umriss, den jeder Körper trägt. */
const UMRISS: HullStrich = { ton: 'licht', alpha: 0.38, breite: 3 };
/** Die dünne Hilfslinie im Inneren. */
const FEIN: HullStrich = { ton: 'licht', alpha: 0.22, breite: 2 };

/** Körper in Klassenfarbe mit weißem Umriss – der Normalfall. */
const koerper = (form: HullGeometrie): HullForm => ({ ...form, ebene: 'koerper', fuellung: { ton: 'klasse' }, strich: UMRISS });

/** Aufhellung im Inneren; `alpha` steuert, wie deutlich sie ist. */
const licht = (alpha: number, form: HullGeometrie): HullForm => ({ ...form, ebene: 'detail', fuellung: { ton: 'licht', alpha } });

/** Linie im Inneren. */
const linie = (strich: HullStrich, form: HullGeometrie): HullForm => ({ ...form, ebene: 'detail', strich });

/** Der Knotenkranz aus `drawNodes`: weiße Punkte mit farbigem Rand. */
const kranz = (anzahl: number, r: number, knoten: number): HullForm => ({
  form: 'kranz', ebene: 'detail', anzahl, r, knoten,
  fuellung: { ton: 'licht', alpha: 0.34 },
  strich: { ton: 'klasse', alpha: 0.6, breite: 1 }
});

/**
 * Der heutige Stand, 1:1 aus `renderer.ts` übernommen.
 *
 * Bewusst unverändert übertragen, auch dort, wo die Form schwach ist: Diese
 * Tabelle ist der Ausgangspunkt für den Umbau der Silhouetten und zugleich der
 * Beleg, wie es vorher aussah. Geändert wird sie erst nach Sams Freigabe – und
 * dann sichtbar in einem eigenen Schritt, nicht nebenbei beim Umzug.
 */
const KLASSISCH: Record<PlayerClass, readonly HullForm[]> = {
  core: [
    koerper({ form: 'kreis', x: 0, y: 0, r: 22 }),
    linie({ ton: 'licht', alpha: 0.24, breite: 2 }, { form: 'kreis', x: 0, y: 0, r: 6 })
  ],
  rapid: [
    koerper({ form: 'kreis', x: 0, y: 0, r: 21 }),
    { form: 'zug', ebene: 'detail', punkte: [-18, -8, -27, 0, -18, 8], fuellung: { ton: 'klasse', alpha: 0.78 } },
    licht(0.18, { form: 'kreis', x: 0, y: 0, r: 5 })
  ],
  twin: [
    koerper({ form: 'kreis', x: 0, y: 0, r: 22 }),
    licht(0.2, { form: 'kreis', x: -16, y: -12, r: 4 }),
    licht(0.2, { form: 'kreis', x: -16, y: 12, r: 4 })
  ],
  repeater: [
    koerper({ form: 'vieleck', ecken: 6, r: 22, drehung: Math.PI / 6 }),
    linie({ ton: 'licht', alpha: 0.28, breite: 2 }, { form: 'kreis', x: 0, y: 0, r: 8 }),
    licht(0.18, { form: 'rechteck', x: -19, y: -3, breite: 8, hoehe: 6, ecke: 0 })
  ],
  storm: [
    koerper({ form: 'kreis', x: 0, y: 0, r: 23 }),
    linie(FEIN, { form: 'kreis', x: 0, y: 0, r: 17 }),
    kranz(4, 17, 3)
  ],
  gatling: [
    koerper({ form: 'vieleck', ecken: 6, r: 23, drehung: Math.PI / 6 }),
    linie({ ton: 'licht', alpha: 0.3, breite: 3 }, { form: 'kreis', x: 0, y: 0, r: 10 }),
    kranz(6, 17, 2.6)
  ],
  sniper: [
    koerper({ form: 'kreis', x: 0, y: 0, r: 21 }),
    licht(0.17, { form: 'zug', punkte: [-17, -9, -27, 0, -17, 9] }),
    licht(0.16, { form: 'rechteck', x: 5, y: -4, breite: 14, hoehe: 8, ecke: 0 })
  ],
  railgun: [
    koerper({ form: 'vieleck', ecken: 6, r: 21, drehung: Math.PI / 6 }),
    licht(0.18, { form: 'rechteck', x: -13, y: -4, breite: 29, hoehe: 8, ecke: 0 }),
    licht(0.3, { form: 'kreis', x: -9, y: 0, r: 4 })
  ],
  hunter: [
    koerper({ form: 'kreis', x: 0, y: 0, r: 21 }),
    licht(0.18, { form: 'zug', punkte: [-11, -19, 4, -13, -4, -6] }),
    licht(0.18, { form: 'zug', punkte: [-11, 19, 4, 13, -4, 6] })
  ],
  lancer: [
    koerper({ form: 'vieleck', ecken: 4, r: 23, drehung: Math.PI / 4 }),
    licht(0.22, { form: 'rechteck', x: -12, y: -3, breite: 29, hoehe: 6, ecke: 0 }),
    licht(0.32, { form: 'kreis', x: -10, y: 0, r: 4 })
  ],
  phantom: [
    koerper({ form: 'vieleck', ecken: 6, r: 21, drehung: 0 }),
    linie({ ton: 'klasse', alpha: 0.42, breite: 2 }, { form: 'kreis', x: 0, y: 0, r: 25 }),
    licht(0.16, { form: 'zug', punkte: [-16, -9, -25, 0, -16, 9] })
  ],
  drone: [
    koerper({ form: 'kreis', x: 0, y: 0, r: 22 }),
    licht(0.28, { form: 'vieleck', ecken: 3, r: 10, drehung: 0 }),
    linie(FEIN, { form: 'kreis', x: 0, y: 0, r: 16 })
  ],
  warden: [
    koerper({ form: 'kreis', x: 0, y: 0, r: 22 }),
    linie({ ton: 'licht', alpha: 0.26, breite: 2 }, { form: 'kreis', x: 0, y: 0, r: 17 }),
    kranz(6, 18, 3)
  ],
  factory: [
    koerper({ form: 'rechteck', x: -21, y: -21, breite: 42, hoehe: 42, ecke: 8 }),
    linie({ ton: 'licht', alpha: 0.3, breite: 2 }, { form: 'rechteck', x: -9, y: -9, breite: 18, hoehe: 18, ecke: 4 }),
    licht(0.18, { form: 'rechteck', x: -20, y: -4, breite: 8, hoehe: 8, ecke: 0 })
  ],
  overseer: [
    koerper({ form: 'kreis', x: 0, y: 0, r: 23 }),
    linie({ ton: 'licht', alpha: 0.3, breite: 2 }, { form: 'kreis', x: 0, y: 0, r: 18 }),
    kranz(8, 19, 2.7)
  ],
  carrier: [
    koerper({ form: 'vieleck', ecken: 6, r: 25, drehung: Math.PI / 6 }),
    {
      form: 'kreis', ebene: 'detail', x: 0, y: 0, r: 11,
      fuellung: { ton: 'licht', alpha: 0.14 }, strich: { ton: 'licht', alpha: 0.28, breite: 2 }
    },
    kranz(6, 20, 3.4)
  ],
  rammer: [
    koerper({ form: 'vieleck', ecken: 8, r: 23, drehung: Math.PI / 8 }),
    licht(0.24, { form: 'rechteck', x: 14, y: -13, breite: 9, hoehe: 26, ecke: 3 })
  ],
  crusher: [
    koerper({ form: 'vieleck', ecken: 8, r: 24, drehung: Math.PI / 8 }),
    licht(0.25, { form: 'rechteck', x: 12, y: -16, breite: 11, hoehe: 32, ecke: 3 }),
    licht(0.16, { form: 'rechteck', x: -18, y: -3, breite: 10, hoehe: 6, ecke: 0 })
  ],
  bulwark: [
    koerper({ form: 'rechteck', x: -23, y: -21, breite: 46, hoehe: 42, ecke: 8 }),
    licht(0.26, { form: 'rechteck', x: 13, y: -17, breite: 11, hoehe: 34, ecke: 4 }),
    linie(FEIN, { form: 'kreis', x: -8, y: 0, r: 7 })
  ],
  juggernaut: [
    koerper({ form: 'vieleck', ecken: 8, r: 26, drehung: Math.PI / 8 }),
    linie({ ton: 'licht', alpha: 0.24, breite: 2 }, { form: 'vieleck', ecken: 8, r: 19, drehung: Math.PI / 8 }),
    licht(0.28, { form: 'rechteck', x: 14, y: -17, breite: 11, hoehe: 34, ecke: 3 })
  ],
  fortress: [
    koerper({ form: 'rechteck', x: -26, y: -23, breite: 52, hoehe: 46, ecke: 7 }),
    linie({ ton: 'licht', alpha: 0.24, breite: 2 }, { form: 'rechteck', x: -21, y: -18, breite: 42, hoehe: 36, ecke: 6 }),
    licht(0.3, { form: 'rechteck', x: 14, y: -19, breite: 13, hoehe: 38, ecke: 3 }),
    licht(0.16, { form: 'kreis', x: -8, y: 0, r: 6 })
  ],
  flanker: [
    koerper({ form: 'kreis', x: 0, y: 0, r: 21 }),
    licht(0.2, { form: 'zug', punkte: [14, -7, 22, 0, 14, 7] }),
    licht(0.2, { form: 'zug', punkte: [-14, -7, -22, 0, -14, 7] })
  ],
  octo: [
    koerper({ form: 'vieleck', ecken: 8, r: 23, drehung: Math.PI / 8 }),
    linie({ ton: 'licht', alpha: 0.3, breite: 2 }, { form: 'kreis', x: 0, y: 0, r: 9 }),
    kranz(8, 16, 2.4)
  ],
  arbalest: [
    koerper({ form: 'vieleck', ecken: 6, r: 21, drehung: Math.PI / 6 }),
    licht(0.2, { form: 'rechteck', x: -14, y: -8, breite: 26, hoehe: 4, ecke: 0 }),
    licht(0.2, { form: 'rechteck', x: -14, y: 4, breite: 26, hoehe: 4, ecke: 0 })
  ],
  deadeye: [
    koerper({ form: 'vieleck', ecken: 6, r: 21, drehung: 0 }),
    linie({ ton: 'licht', alpha: 0.32, breite: 2 }, { form: 'kreis', x: 0, y: 0, r: 10 }),
    linie({ ton: 'licht', alpha: 0.26, breite: 2 }, { form: 'strecke', x1: -14, y1: 0, x2: 14, y2: 0 }),
    linie({ ton: 'licht', alpha: 0.26, breite: 2 }, { form: 'strecke', x1: 0, y1: -14, x2: 0, y2: 14 })
  ],
  guardian: [
    koerper({ form: 'kreis', x: 0, y: 0, r: 22 }),
    linie({ ton: 'licht', alpha: 0.34, breite: 4 }, { form: 'kreis', x: 0, y: 0, r: 15 }),
    kranz(5, 17, 3.2)
  ],
  hive: [
    koerper({ form: 'vieleck', ecken: 6, r: 23, drehung: Math.PI / 6 }),
    kranz(6, 13, 3),
    licht(0.3, { form: 'kreis', x: 0, y: 0, r: 4 }),
    kranz(10, 19, 1.8)
  ],
  blitz: [
    koerper({ form: 'zug', punkte: [24, 0, -14, -17, -7, 0, -14, 17] }),
    licht(0.22, { form: 'zug', punkte: [10, 0, -8, -8, -4, 0, -8, 8] })
  ],
  comet: [
    koerper({ form: 'kreis', x: 4, y: 0, r: 19 }),
    {
      form: 'zug', ebene: 'koerper', punkte: [-2, -16, -26, 0, -2, 16],
      fuellung: { ton: 'klasse', alpha: 0.85 }, strich: { ton: 'licht', alpha: 0.2, breite: 2 }
    },
    licht(0.24, { form: 'kreis', x: 8, y: 0, r: 7 }),
    licht(0.14, { form: 'zug', punkte: [-6, -8, -18, 0, -6, 8] })
  ]
};

/**
 * Welche Formsprache gilt.
 *
 * `klassisch` ist der Stand, den Sam heute sieht. `silhouette` ist der Umbau
 * aus `class-silhouette.ts`, der noch auf seine Freigabe wartet – deshalb ist
 * er **aus**, und deshalb schaltet ihn nur `?silhouetten=1` ein. Regel 3 aus
 * der Übergabe: Was riskant ist, liegt hinter einem Schalter, und der steht
 * auf aus.
 */
export type HullStil = 'klassisch' | 'silhouette';
let stil: HullStil = 'klassisch';

export function setHullStil(neu: HullStil): void { stil = neu; }
export function hullStil(): HullStil { return stil; }

/** Wird zur Laufzeit gesetzt, damit `class-hull` nichts von `class-silhouette` wissen muss. */
let silhouetteQuelle: ((playerClass: PlayerClass) => readonly HullForm[]) | null = null;
export function registriereSilhouetten(quelle: (playerClass: PlayerClass) => readonly HullForm[]): void {
  silhouetteQuelle = quelle;
}

/**
 * Die Formen einer Klasse, von außen nach innen zu zeichnen.
 *
 * Die Reihenfolge in der Liste ist die Zeichenreihenfolge; wer sie umsortiert,
 * ändert das Bild.
 */
export function hullForms(playerClass: PlayerClass): readonly HullForm[] {
  if (stil === 'silhouette' && silhouetteQuelle) return silhouetteQuelle(playerClass);
  return KLASSISCH[playerClass];
}

/**
 * Nur der Umriss – die Formen, die entscheiden, ob man zwei Klassen im Gefecht
 * auseinanderhält. Der Blindtest arbeitet auf dieser Menge.
 */
export function umrissFormen(playerClass: PlayerClass): readonly HullForm[] {
  return hullForms(playerClass).filter((form) => form.ebene === 'koerper');
}

/**
 * Ein vergleichbarer Fingerabdruck des Umrisses.
 *
 * Zwei Klassen mit derselben Kennung sind ohne Farbe und ohne Namen nicht zu
 * unterscheiden – genau das ist Sams Befund („noch immer die gleichen
 * langweiligen Tanks"), und genau das macht der Test messbar statt strittig.
 * Gerundet wird auf ganze Einheiten: Ein Kreis mit r=21 und einer mit r=21,4
 * sind in Spielgröße dasselbe Bild.
 */
export function umrissKennung(playerClass: PlayerClass): string {
  return umrissFormen(playerClass)
    .map((form) => {
      switch (form.form) {
        case 'kreis': return `k${Math.round(form.x)},${Math.round(form.y)},${Math.round(form.r)}`;
        case 'vieleck': return `v${form.ecken},${Math.round(form.r)},${form.drehung.toFixed(2)}`;
        case 'rechteck': return `r${Math.round(form.x)},${Math.round(form.y)},${Math.round(form.breite)},${Math.round(form.hoehe)}`;
        case 'zug': return `z${form.punkte.map((wert) => Math.round(wert)).join('.')}`;
        case 'strecke': return `s${Math.round(form.x1)},${Math.round(form.y1)},${Math.round(form.x2)},${Math.round(form.y2)}`;
        case 'kranz': return `n${form.anzahl},${Math.round(form.r)}`;
      }
    })
    .join('|');
}

/**
 * Alle Klassenpaare, die denselben Umriss tragen.
 *
 * Ergebnis ist die Befundliste des Blindtests: leer heißt bestanden. Sie steht
 * hier und nicht nur im Test, weil der Prüfstand und der Statusbericht dieselbe
 * Zahl nennen sollen.
 */
export function umrissDubletten(): [PlayerClass, PlayerClass][] {
  const paare: [PlayerClass, PlayerClass][] = [];
  for (let a = 0; a < PLAYER_CLASS_IDS.length; a += 1) {
    for (let b = a + 1; b < PLAYER_CLASS_IDS.length; b += 1) {
      const ersteKlasse = PLAYER_CLASS_IDS[a];
      const zweiteKlasse = PLAYER_CLASS_IDS[b];
      if (!ersteKlasse || !zweiteKlasse) continue;
      if (umrissKennung(ersteKlasse) === umrissKennung(zweiteKlasse)) paare.push([ersteKlasse, zweiteKlasse]);
    }
  }
  return paare;
}

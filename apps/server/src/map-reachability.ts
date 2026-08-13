import type { Vector2 } from '@project-maze/shared';

/**
 * Erreichbarkeitsprobe für die Karte (Stufe 3 des Reworks, Bericht 26).
 *
 * Sams Befund vom 13.08.: „dickere Wände, mehr Wände". Beides ist leicht gebaut
 * und beides kann die Karte still zerreißen – eine Ecke, die niemand mehr
 * betreten kann, fällt im Spiel erst auf, wenn ein Spieler dort spawnt und
 * feststeckt, oder wenn die Formen in einer unerreichbaren Kammer verrotten.
 *
 * Deshalb steht dieses Werkzeug **vor** dem Generator-Umbau: Es flutet die
 * begehbare Fläche und zählt, in wie viele voneinander getrennte Gebiete sie
 * zerfällt. Heute (9000 × 6000, Raster 20 px) ist es genau eines – aber
 * gemessen hat das bisher niemand.
 *
 * ## Warum mit Aufschlag geprüft wird
 *
 * Das Raster prüft Punkte, gelaufen wird aber auf Strecken: Zwei benachbarte
 * Zellmitten gelten als verbunden, wenn an beiden Platz ist – über die Strecke
 * dazwischen sagt das streng genommen nichts.
 *
 * Der Aufrufer prüft deshalb mit `probenRadius(playerRadius, raster)`, also
 * einem halben Rasterschritt Aufschlag. Der wichtigere Grund ist aber nicht die
 * Rechenschärfe, sondern das Spielgefühl: Ein Spalt von exakt Panzerbreite ist
 * geometrisch ein Weg und praktisch keiner – man bleibt an jeder Ecke hängen.
 * Die Probe soll melden, was sich als Weg *spielt*, nicht was rechnerisch
 * gerade noch hindurchpasst. Sie irrt damit bewusst zur sicheren Seite: im
 * Zweifel eine Kammer zu viel statt einer zu wenig.
 *
 * Verbunden wird nur über die vier Seitennachbarn. Diagonal wäre falsch: Zwei
 * über Eck liegende freie Zellen können durch eine geschlossene Wandecke
 * getrennt sein, durch die niemand kommt.
 */

/** Kantenlänge einer Rasterzelle in Weltpixeln, wenn nichts anderes gesagt wird. */
export const RASTER = 20;

/**
 * Der Radius, mit dem geprüft werden muss, damit „verbunden" auch „befahrbar"
 * heißt: der halbe Rasterschritt als Sicherheitsaufschlag auf den Panzerradius.
 * Siehe die Rasterfalle oben.
 */
export const probenRadius = (spielerRadius: number, raster = RASTER): number => spielerRadius + raster / 2;

export interface Gebiet {
  /** Zahl der Rasterzellen in diesem Gebiet. */
  zellen: number;
  /** Anteil an der gesamten begehbaren Fläche. */
  anteil: number;
  /** Ein Punkt darin, in Weltkoordinaten – damit eine Fehlermeldung sagen kann, WO die Kammer liegt. */
  probe: Vector2;
}

export interface Erreichbarkeit {
  raster: number;
  spalten: number;
  zeilen: number;
  /** Begehbare Rasterzellen insgesamt. */
  begehbar: number;
  /** Alle zusammenhängenden Gebiete, absteigend nach Größe. */
  gebiete: Gebiet[];
  /** Anteil der begehbaren Fläche, der im größten Gebiet liegt. 1 = alles hängt zusammen. */
  anteilGroesstes: number;
  /**
   * Gebietsnummer je Zelle (Index in `gebiete`), −1 für blockiert.
   * Zeilenweise, `spalte + zeile * spalten`.
   */
  zuordnung: Int32Array;
}

export interface Probenauftrag {
  breite: number;
  hoehe: number;
  raster?: number;
  /** Ist an dieser Stelle Platz für den Panzer? */
  frei: (punkt: Vector2) => boolean;
}

/**
 * Flutet die begehbare Fläche und zerlegt sie in zusammenhängende Gebiete.
 *
 * Bewusst ohne Rekursion: Bei 450 × 300 Zellen und einem einzigen Gebiet würde
 * ein rekursiver Flood-Fill den Stack sprengen.
 */
export function pruefeErreichbarkeit({ breite, hoehe, raster = RASTER, frei }: Probenauftrag): Erreichbarkeit {
  const spalten = Math.max(1, Math.floor(breite / raster));
  const zeilen = Math.max(1, Math.floor(hoehe / raster));
  const anzahl = spalten * zeilen;
  const mitte = (spalte: number, zeile: number): Vector2 => ({ x: (spalte + 0.5) * raster, y: (zeile + 0.5) * raster });

  const offen = new Uint8Array(anzahl);
  let begehbar = 0;
  for (let zeile = 0; zeile < zeilen; zeile += 1) {
    for (let spalte = 0; spalte < spalten; spalte += 1) {
      if (!frei(mitte(spalte, zeile))) continue;
      offen[spalte + zeile * spalten] = 1;
      begehbar += 1;
    }
  }

  const roh = new Int32Array(anzahl).fill(-1);
  const groessen: number[] = [];
  const proben: Vector2[] = [];
  const stapel = new Int32Array(anzahl);
  for (let start = 0; start < anzahl; start += 1) {
    if (offen[start] !== 1 || roh[start] !== -1) continue;
    const nummer = groessen.length;
    let spitze = 0;
    stapel[spitze++] = start;
    roh[start] = nummer;
    let zellen = 0;
    while (spitze > 0) {
      const zelle = stapel[--spitze]!;
      zellen += 1;
      const spalte = zelle % spalten;
      const zeile = (zelle - spalte) / spalten;
      // Nur Seitennachbarn – über Eck ist keine Verbindung.
      if (spalte > 0) {
        const links = zelle - 1;
        if (offen[links] === 1 && roh[links] === -1) { roh[links] = nummer; stapel[spitze++] = links; }
      }
      if (spalte + 1 < spalten) {
        const rechts = zelle + 1;
        if (offen[rechts] === 1 && roh[rechts] === -1) { roh[rechts] = nummer; stapel[spitze++] = rechts; }
      }
      if (zeile > 0) {
        const oben = zelle - spalten;
        if (offen[oben] === 1 && roh[oben] === -1) { roh[oben] = nummer; stapel[spitze++] = oben; }
      }
      if (zeile + 1 < zeilen) {
        const unten = zelle + spalten;
        if (offen[unten] === 1 && roh[unten] === -1) { roh[unten] = nummer; stapel[spitze++] = unten; }
      }
    }
    groessen.push(zellen);
    proben.push(mitte(start % spalten, (start - (start % spalten)) / spalten));
  }

  // Absteigend sortieren und die Zellzuordnung mitziehen, damit `gebiete[0]`
  // verlässlich das große Gebiet ist und nicht das zufällig zuerst gefundene.
  const reihenfolge = groessen.map((_, index) => index).sort((a, b) => groessen[b]! - groessen[a]!);
  const neueNummer = new Int32Array(groessen.length);
  reihenfolge.forEach((alt, neu) => { neueNummer[alt] = neu; });
  const zuordnung = new Int32Array(anzahl);
  for (let zelle = 0; zelle < anzahl; zelle += 1) {
    const alt = roh[zelle]!;
    zuordnung[zelle] = alt === -1 ? -1 : neueNummer[alt]!;
  }

  const gebiete: Gebiet[] = reihenfolge.map((alt) => ({
    zellen: groessen[alt]!,
    anteil: begehbar === 0 ? 0 : groessen[alt]! / begehbar,
    probe: proben[alt]!
  }));

  return {
    raster,
    spalten,
    zeilen,
    begehbar,
    gebiete,
    anteilGroesstes: gebiete[0]?.anteil ?? 0,
    zuordnung
  };
}

/** Gebietsnummer an einer Weltposition, −1 wenn dort kein Platz ist oder sie außerhalb liegt. */
export function gebietAn(ergebnis: Erreichbarkeit, punkt: Vector2): number {
  const spalte = Math.floor(punkt.x / ergebnis.raster);
  const zeile = Math.floor(punkt.y / ergebnis.raster);
  if (spalte < 0 || zeile < 0 || spalte >= ergebnis.spalten || zeile >= ergebnis.zeilen) return -1;
  return ergebnis.zuordnung[spalte + zeile * ergebnis.spalten]!;
}

/**
 * Alle Weltpunkte der Zellmitten eines Gebiets. Für Prüfungen, die zwei
 * Gitter unterschiedlicher Feinheit gegeneinander halten – etwa: Berührt der
 * Bereich, in dem eine Form liegt, überhaupt irgendwo Panzerboden?
 */
export function* zellenVon(ergebnis: Erreichbarkeit, gebiet: number): Generator<Vector2> {
  for (let zeile = 0; zeile < ergebnis.zeilen; zeile += 1) {
    for (let spalte = 0; spalte < ergebnis.spalten; spalte += 1) {
      if (ergebnis.zuordnung[spalte + zeile * ergebnis.spalten] !== gebiet) continue;
      yield { x: (spalte + 0.5) * ergebnis.raster, y: (zeile + 0.5) * ergebnis.raster };
    }
  }
}

/**
 * Eine Zeile für Fehlermeldungen und Messskripte. Nennt die abgeschnittenen
 * Kammern samt Fundort – „2 Gebiete" allein hilft niemandem beim Suchen.
 */
export function berichte(ergebnis: Erreichbarkeit): string {
  const kopf = `${ergebnis.gebiete.length} Gebiet(e), ${ergebnis.begehbar} begehbare Zellen à ${ergebnis.raster} px`
    + `, groesstes ${(ergebnis.anteilGroesstes * 100).toFixed(2)} %`;
  const abgeschnitten = ergebnis.gebiete.slice(1);
  if (abgeschnitten.length === 0) return kopf;
  const kammern = abgeschnitten
    .slice(0, 6)
    .map((gebiet) => `${gebiet.zellen} Zellen bei (${Math.round(gebiet.probe.x)}, ${Math.round(gebiet.probe.y)})`)
    .join('; ');
  const rest = abgeschnitten.length > 6 ? ` … und ${abgeschnitten.length - 6} weitere` : '';
  return `${kopf} – abgeschnitten: ${kammern}${rest}`;
}

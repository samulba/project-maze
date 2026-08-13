import { GAME, type MapInfo, type ShapeKind, type ShapeSnapshot, type Vector2, type Wall, ARENA_MODES, type ArenaMode } from '@project-maze/shared';
import { clamp, normalize } from './physics.js';

interface ShapeConfig { radius: number; health: number; reward: number; bodyDamage: number; drift: number; }
export const SHAPE_CONFIG: Record<ShapeKind, ShapeConfig> = {
  square: { radius: 13, health: 16, reward: 18, bodyDamage: 4, drift: 12 },
  triangle: { radius: 18, health: 40, reward: 45, bodyDamage: 8, drift: 16 },
  pentagon: { radius: 25, health: 100, reward: 120, bodyDamage: 14, drift: 10 }
};
function seededRandom(seed: number): () => number { let state = seed >>> 0; return () => { state = (state * 1664525 + 1013904223) >>> 0; return state / 0x100000000; }; }
const wall = (id: string, x: number, y: number, width: number, height: number): Wall => ({ id, x, y, width, height });
/**
 * Kantenlänge einer Labyrinth-Zelle. Das ist die Design-Einheit der Karte.
 *
 * Sams Befund vom 13.08.: „die Map ist noch zu wenig Maze […] dickere Wände,
 * mehr Wände". Die Messung gab ihm recht: **90,3 % der Karte waren begehbar**
 * und **46,4 % aller Blicke reichten weiter als eine halbe Bildbreite** – das
 * ist ein Feld mit Pfosten, kein Labyrinth. Der alte Generator streute Balken
 * in Bahnen; wo sie zufällig zusammentrafen, entstand Deckung, sonst nicht.
 *
 * Jetzt liegen die Wände auf einem Raster und bilden echte Gänge.
 *
 * ## Warum 480
 *
 * Das ist die gemessene und nicht die geratene Zahl. Der erste Versuch stand
 * bei 800, und `messung-karten-raster.mjs` hat ihn widerlegt: **Die Bahn
 * bestimmt das Labyrinthgefühl fast allein, die Wanddicke kaum.** Bei Bahn 800
 * blieben in jeder Variante 39–55 % der Blicke länger als eine halbe
 * Bildbreite – also nicht besser als die alte Karte, teils schlechter, weil
 * die Zelle einfach zu groß ist, um Gänge zu bilden.
 *
 * Gemessen über alle Kandidaten (Auszug, Anteil weiter Blicke):
 *
 * ```
 * bahn 800  →  39–55 %      alte Karte: 46,4 %
 * bahn 600  →  21–39 %
 * bahn 480  →  15–28 %
 * bahn 400  →   8–20 %
 * ```
 *
 * 480 ist der Punkt, an dem die Karte deutlich zum Labyrinth wird, ohne eng zu
 * werden: Der Gang ist `BAHN − WANDDICKE` = 320 px, also gut sieben
 * Panzerbreiten, und im 1600 px breiten Fenster liegen fünf Gänge
 * nebeneinander. Bei Bahn 400 wären es 280 px – spielbar, aber die Karte
 * verliert mit 54 % begehbarer Fläche ihre Weite, und die Wandzahl steigt auf
 * 259, was jeden `nearbyWalls`-Durchlauf verteuert.
 *
 * 480 ist ein Vielfaches des feinen Bodenrasters (80 px), aber nicht des
 * betonten (400 px) – die Wandachsen liegen also auf Bodenlinien, nur nicht
 * auf den kräftigen. Das ist der Preis dafür, dass die Bahn nach der Messung
 * gewählt wurde und nicht nach dem Hintergrundbild.
 *
 * Die Karte (9000 × 6000) geht in keinem dieser Maße glatt auf. Der Rest
 * bleibt bewusst an der rechten und unteren Kante liegen (Zelle 18 ist 840
 * statt 480 breit, Zeile 12 ist 720 statt 480 hoch): ein etwas weiterer Umlauf
 * am Rand. Die Alternative – ein verschobenes Raster – passte nirgends mehr
 * zum Boden.
 */
export const BAHN = 480;

/**
 * Wanddicke. Vorher stand hier dreimal das Literal 54 – zehn Pixel mehr als ein
 * Panzer dick ist (Durchmesser 44), also eine Wand, hinter der man kaum steht.
 * Sams Wort dazu war „dickere Wände".
 *
 * 160 px ist knapp vier Panzerbreiten und liest sich als Mauer, nicht als
 * Strich. Die Messung sagt, dass die Dicke fürs Labyrinthgefühl wenig tut
 * (bei Bahn 480 kostet 80 → 200 nur 2 Punkte weite Blicke), fürs Bild aber
 * viel: Sie ist der Unterschied zwischen einer Linie und etwas, hinter dem man
 * steht. Deshalb dick, aber nicht so dick, dass der Gang leidet.
 */
export const WANDDICKE = 160;

/**
 * Anteil der nach dem Spannbaum noch geschlossenen Grenzen, der zusätzlich
 * geöffnet wird.
 *
 * Ein reines Labyrinth (nur Spannbaum) hat zwischen zwei Punkten genau einen
 * Weg – für ein Rätsel richtig, für einen Arena-Shooter tödlich: lauter
 * Sackgassen, kein Umgehen, kein Entkommen. Das Verflechten macht daraus ein
 * Netz mit Schleifen.
 *
 * **Sie ist aber das falsche Werkzeug gegen Sackgassen**, und das ist gemessen.
 * Vor Schritt 4b sah der Tausch so aus:
 *
 * ```
 * verfl 0,00  →  27 Sackgassen (12,5 %), 15,0 % weite Blicke
 * verfl 0,20  →  14 Sackgassen ( 6,5 %), 20,7 %
 * verfl 0,45  →   5 Sackgassen ( 2,3 %), 36,5 %
 * ```
 *
 * Um auf Sams „maximal 5 bis 7" zu kommen, hätte die Verflechtung auf 0,45
 * gemusst – und damit das halbe Labyrinth gekostet. Der Grund: Sie öffnet
 * Wände gleichmäßig überall, auch dort, wo gar keine Sackgasse war.
 *
 * Deshalb löst Schritt 4b die Sackgassen **gezielt** auf, und die Verflechtung
 * macht nur noch das, wofür sie gut ist: Schleifen. Seitdem stehen bei jeder
 * Einstellung exakt sechs Sackgassen, und 0,14 liefert 19,5 % weite Blicke bei
 * 21,3 % Deckung – also beides besser als vorher.
 */
const VERFLECHTUNG = 0.14;

/**
 * So viele Sackgassen dürfen stehen bleiben – Sams „maximal 5 bis 7 ist ok,
 * der Rest ist zu viel". Der Rest wird gezielt aufgelöst (Schritt 4b), statt
 * die Verflechtung hochzudrehen: Die öffnet Wände auch dort, wo gar keine
 * Sackgasse war, und kostet dafür das halbe Labyrinth.
 */
const SACKGASSEN_ZIEL = 6;

/** Die drei Maße, die das Labyrinth bestimmen – zusammen, weil sie zusammenhängen. */
export interface Labyrinthmass {
  /** Kantenlänge einer Zelle. */
  bahn: number;
  /** Wanddicke. */
  dicke: number;
  /** Anteil der nach dem Spannbaum geschlossenen Grenzen, der zusätzlich geöffnet wird. */
  verflechtung: number;
}
export const LABYRINTH: Labyrinthmass = { bahn: BAHN, dicke: WANDDICKE, verflechtung: VERFLECHTUNG };

/** Kantenlänge eines Hauptplatzes in Zellen. */
const PLATZ_ZELLEN = 2;
/** Ein Tor je Himmelsrichtung – ein Platz ist eine Kreuzung, keine Festung und keine Falle. */
const PLATZ_TORE_JE_SEITE = 1;

export interface Hauptplatz {
  id: string;
  name: string;
  /** Linke obere Zelle. */
  spalte: number;
  zeile: number;
  /** Die offene Fläche in Weltkoordinaten – ohne die Randmauern. */
  bereich: { x: number; y: number; width: number; height: number };
  mitte: Vector2;
}

export interface Labyrinth {
  waende: Wall[];
  plaetze: Hauptplatz[];
  spalten: number;
  zeilen: number;
}

/**
 * Erzeugt das Labyrinth. Die Maße sind Parameter, damit sie sich vermessen
 * lassen, statt geraten zu werden: `scripts/messungen/messung-karte.mjs`
 * fährt damit ein Raster aus Kandidaten durch und zeigt Deckung, begehbaren
 * Anteil und Sichtweiten nebeneinander. So sind die drei Zahlen in
 * `LABYRINTH` ausgewählt worden.
 */
export function erzeugeLabyrinth(mass: Labyrinthmass = LABYRINTH): Labyrinth {
  const { bahn, dicke, verflechtung } = mass;
  const spalten = Math.max(2, Math.floor(GAME.worldWidth / bahn));
  const zeilen = Math.max(2, Math.floor(GAME.worldHeight / bahn));
  // Die letzte Zelle nimmt den Rest der Karte auf (siehe BAHN).
  const kanteX = (spalte: number): number => (spalte >= spalten ? GAME.worldWidth : spalte * bahn);
  const kanteY = (zeile: number): number => (zeile >= zeilen ? GAME.worldHeight : zeile * bahn);

  const platzZeile = Math.max(0, Math.min(zeilen - PLATZ_ZELLEN, Math.round((zeilen - PLATZ_ZELLEN) / 2)));
  const platzSpalteLinks = Math.max(0, Math.round(spalten * 0.18));
  const platzSpalteRechts = Math.max(platzSpalteLinks + PLATZ_ZELLEN, spalten - PLATZ_ZELLEN - platzSpalteLinks);
  const machePlatz = (id: string, name: string, spalte: number, zeile: number): Hauptplatz => {
    const x = kanteX(spalte) + dicke / 2;
    const y = kanteY(zeile) + dicke / 2;
    const width = kanteX(spalte + PLATZ_ZELLEN) - kanteX(spalte) - dicke;
    const height = kanteY(zeile + PLATZ_ZELLEN) - kanteY(zeile) - dicke;
    return { id, name, spalte, zeile, bereich: { x, y, width, height }, mitte: { x: x + width / 2, y: y + height / 2 } };
  };
  const plaetze: Hauptplatz[] = [
    machePlatz('west', 'Westplatz', platzSpalteLinks, platzZeile),
    machePlatz('ost', 'Ostplatz', platzSpalteRechts, platzZeile)
  ];

  const random = seededRandom(0x4d415a45);
  // Grenzen zwischen benachbarten Zellen; `true` heißt zu.
  const senkrecht = new Array<boolean>((spalten - 1) * zeilen).fill(true);
  const waagerecht = new Array<boolean>(spalten * (zeilen - 1)).fill(true);
  const sIdx = (spalte: number, zeile: number): number => spalte + zeile * (spalten - 1);
  const wIdx = (spalte: number, zeile: number): number => spalte + zeile * spalten;

  // 1. Spannbaum per randomisierter Tiefensuche. Danach ist jede Zelle von
  //    jeder erreichbar – das ist die Erreichbarkeitsgarantie an der Wurzel,
  //    nicht erst in der Prüfung.
  const besucht = new Array<boolean>(spalten * zeilen).fill(false);
  const stapel: number[] = [0];
  besucht[0] = true;
  while (stapel.length > 0) {
    const zelle = stapel[stapel.length - 1]!;
    const spalte = zelle % spalten;
    const zeile = (zelle - spalte) / spalten;
    const kandidaten: Array<{ nachbar: number; oeffne: () => void }> = [];
    if (spalte > 0 && !besucht[zelle - 1]) kandidaten.push({ nachbar: zelle - 1, oeffne: () => { senkrecht[sIdx(spalte - 1, zeile)] = false; } });
    if (spalte + 1 < spalten && !besucht[zelle + 1]) kandidaten.push({ nachbar: zelle + 1, oeffne: () => { senkrecht[sIdx(spalte, zeile)] = false; } });
    if (zeile > 0 && !besucht[zelle - spalten]) kandidaten.push({ nachbar: zelle - spalten, oeffne: () => { waagerecht[wIdx(spalte, zeile - 1)] = false; } });
    if (zeile + 1 < zeilen && !besucht[zelle + spalten]) kandidaten.push({ nachbar: zelle + spalten, oeffne: () => { waagerecht[wIdx(spalte, zeile)] = false; } });
    if (kandidaten.length === 0) { stapel.pop(); continue; }
    const gewaehlt = kandidaten[Math.floor(random() * kandidaten.length)]!;
    gewaehlt.oeffne();
    besucht[gewaehlt.nachbar] = true;
    stapel.push(gewaehlt.nachbar);
  }

  // 2. Verflechten – Schleifen statt Sackgassen.
  for (let index = 0; index < senkrecht.length; index += 1) if (senkrecht[index] && random() < verflechtung) senkrecht[index] = false;
  for (let index = 0; index < waagerecht.length; index += 1) if (waagerecht[index] && random() < verflechtung) waagerecht[index] = false;

  // 3. Hauptplätze aussparen: innen alles auf, am Rand je Seite ein Tor.
  const festeGrenzen = new Set<string>();
  for (const platz of plaetze) {
    for (let zeile = platz.zeile; zeile < platz.zeile + PLATZ_ZELLEN; zeile += 1)
      for (let spalte = platz.spalte; spalte + 1 < platz.spalte + PLATZ_ZELLEN; spalte += 1) senkrecht[sIdx(spalte, zeile)] = false;
    for (let spalte = platz.spalte; spalte < platz.spalte + PLATZ_ZELLEN; spalte += 1)
      for (let zeile = platz.zeile; zeile + 1 < platz.zeile + PLATZ_ZELLEN; zeile += 1) waagerecht[wIdx(spalte, zeile)] = false;

    const seiten: Array<Array<{ art: 'v' | 'h'; index: number }>> = [[], [], [], []];
    for (let zeile = platz.zeile; zeile < platz.zeile + PLATZ_ZELLEN; zeile += 1) {
      if (platz.spalte > 0) seiten[0]!.push({ art: 'v', index: sIdx(platz.spalte - 1, zeile) });
      if (platz.spalte + PLATZ_ZELLEN < spalten) seiten[1]!.push({ art: 'v', index: sIdx(platz.spalte + PLATZ_ZELLEN - 1, zeile) });
    }
    for (let spalte = platz.spalte; spalte < platz.spalte + PLATZ_ZELLEN; spalte += 1) {
      if (platz.zeile > 0) seiten[2]!.push({ art: 'h', index: wIdx(spalte, platz.zeile - 1) });
      if (platz.zeile + PLATZ_ZELLEN < zeilen) seiten[3]!.push({ art: 'h', index: wIdx(spalte, platz.zeile + PLATZ_ZELLEN - 1) });
    }
    for (const seite of seiten) {
      if (seite.length === 0) continue;
      // Erst alles zu – der Platz bekommt eine erkennbare Form –, dann je Seite
      // die vorgesehene Zahl an Toren öffnen.
      for (const grenze of seite) (grenze.art === 'v' ? senkrecht : waagerecht)[grenze.index] = true;
      const uebrig = [...seite];
      for (let tor = 0; tor < PLATZ_TORE_JE_SEITE && uebrig.length > 0; tor += 1) {
        const gewaehlt = uebrig.splice(Math.floor(random() * uebrig.length), 1)[0]!;
        (gewaehlt.art === 'v' ? senkrecht : waagerecht)[gewaehlt.index] = false;
      }
      for (const grenze of uebrig) festeGrenzen.add(`${grenze.art}${grenze.index}`);
    }
  }

  // 4. Zusammenhang reparieren. Schritt 3 schließt Grenzen wieder, und die
  //    können die einzige Verbindung einer Zelle gewesen sein. Union-Find über
  //    die Zellen, dann so lange Grenzen öffnen, bis alles ein Gebiet ist –
  //    Erreichbarkeit ist damit eine Eigenschaft des Generators, nicht eine
  //    Hoffnung, die der Test nachträglich prüft.
  const vater = new Array<number>(spalten * zeilen).fill(0).map((_, index) => index);
  const finde = (zelle: number): number => { let wurzel = zelle; while (vater[wurzel] !== wurzel) wurzel = vater[wurzel]!; while (vater[zelle] !== wurzel) { const naechste = vater[zelle]!; vater[zelle] = wurzel; zelle = naechste; } return wurzel; };
  const vereine = (a: number, b: number): boolean => { const wa = finde(a); const wb = finde(b); if (wa === wb) return false; vater[wa] = wb; return true; };
  const alleGrenzen: Array<{ art: 'v' | 'h'; index: number; a: number; b: number }> = [];
  for (let zeile = 0; zeile < zeilen; zeile += 1)
    for (let spalte = 0; spalte + 1 < spalten; spalte += 1)
      alleGrenzen.push({ art: 'v', index: sIdx(spalte, zeile), a: spalte + zeile * spalten, b: spalte + 1 + zeile * spalten });
  for (let zeile = 0; zeile + 1 < zeilen; zeile += 1)
    for (let spalte = 0; spalte < spalten; spalte += 1)
      alleGrenzen.push({ art: 'h', index: wIdx(spalte, zeile), a: spalte + zeile * spalten, b: spalte + (zeile + 1) * spalten });
  for (const grenze of alleGrenzen) if (!(grenze.art === 'v' ? senkrecht : waagerecht)[grenze.index]) vereine(grenze.a, grenze.b);
  for (const grenze of alleGrenzen) {
    if (!(grenze.art === 'v' ? senkrecht : waagerecht)[grenze.index]) continue;
    if (!vereine(grenze.a, grenze.b)) continue;
    (grenze.art === 'v' ? senkrecht : waagerecht)[grenze.index] = false;
    festeGrenzen.delete(`${grenze.art}${grenze.index}`);
  }

  // 4b. Sackgassen gezielt auflösen.
  //
  //     Sam, 13.08.: „man muss nur darauf achten, dass es nicht ZU VIELE
  //     Sackgassen gibt – so maximal 5 bis 7 ist ok, der Rest ist zu viel."
  //     Gemessen waren es 14.
  //
  //     Der naheliegende Weg wäre, die Verflechtung hochzudrehen. Gemessen ist
  //     das der teure Weg: 0,45 lässt fünf Sackgassen übrig, kostet aber das
  //     halbe Labyrinth (36,5 % weite Blicke statt 20,7 %), weil sie überall
  //     Wände öffnet – auch dort, wo gar keine Sackgasse war.
  //
  //     Hier wird stattdessen genau die Zelle aufgemacht, die das Problem ist.
  //     Das Öffnen einer Grenze kann keine neue Sackgasse erzeugen (es nimmt
  //     keiner Zelle einen Nachbarn), die Zahl fällt also monoton.
  const nachbarn = (zelle: number): Array<{ art: 'v' | 'h'; index: number }> => {
    const spalte = zelle % spalten;
    const zeile = (zelle - spalte) / spalten;
    const liste: Array<{ art: 'v' | 'h'; index: number }> = [];
    if (spalte > 0) liste.push({ art: 'v', index: sIdx(spalte - 1, zeile) });
    if (spalte + 1 < spalten) liste.push({ art: 'v', index: sIdx(spalte, zeile) });
    if (zeile > 0) liste.push({ art: 'h', index: wIdx(spalte, zeile - 1) });
    if (zeile + 1 < zeilen) liste.push({ art: 'h', index: wIdx(spalte, zeile) });
    return liste;
  };
  const offeneNachbarn = (zelle: number): number =>
    nachbarn(zelle).filter((g) => !(g.art === 'v' ? senkrecht : waagerecht)[g.index]).length;
  const sackgassen = (): number[] => {
    const treffer: number[] = [];
    for (let zelle = 0; zelle < spalten * zeilen; zelle += 1) if (offeneNachbarn(zelle) <= 1) treffer.push(zelle);
    return treffer;
  };
  let offen = sackgassen();
  while (offen.length > SACKGASSEN_ZIEL) {
    const zelle = offen[Math.floor(random() * offen.length)]!;
    const zu = nachbarn(zelle).filter((g) => (g.art === 'v' ? senkrecht : waagerecht)[g.index]);
    if (zu.length === 0) break;
    const gewaehlt = zu[Math.floor(random() * zu.length)]!;
    (gewaehlt.art === 'v' ? senkrecht : waagerecht)[gewaehlt.index] = false;
    festeGrenzen.delete(`${gewaehlt.art}${gewaehlt.index}`);
    offen = sackgassen();
  }

  // 4c. Randring öffnen – die äußerste Zellreihe/-spalte wird zur Schleife.
  //
  //     Sam, 13.08.: „an den RÄNDERN komplett darf keine MAUER sein das man
  //     die ränder einmal durchrennen kann gefühlt." Ohne diesen Schritt
  //     reicht so manches Wandsegment der äußersten Reihe bis an die
  //     Weltkante (`kanteY(0)=0` bzw. `kanteY(zeilen)=worldHeight` in Schritt
  //     6 unten) – ein Zacken, der von der Kante nach innen ragt und den Lauf
  //     am Rand zwingt, ins Labyrinth auszuweichen statt am Rand zu bleiben.
  //
  //     Die Verbindungen ZWISCHEN benachbarten Randzellen (oben, unten, links,
  //     rechts) werden hier hart geöffnet, unabhängig davon, was Spannbaum,
  //     Verflechtung oder Sackgassen-Auflösung vorher entschieden haben – nach
  //     innen bleibt das Labyrinth unverändert, nur der Rand selbst wird zur
  //     freien Runde. Ecken sind automatisch mit dabei: Jede Eckzelle steht in
  //     genau einer Zeilen- UND einer Spaltenschleife.
  for (let spalte = 0; spalte + 1 < spalten; spalte += 1) {
    senkrecht[sIdx(spalte, 0)] = false;
    festeGrenzen.delete(`v${sIdx(spalte, 0)}`);
    senkrecht[sIdx(spalte, zeilen - 1)] = false;
    festeGrenzen.delete(`v${sIdx(spalte, zeilen - 1)}`);
  }
  for (let zeile = 0; zeile + 1 < zeilen; zeile += 1) {
    waagerecht[wIdx(0, zeile)] = false;
    festeGrenzen.delete(`h${wIdx(0, zeile)}`);
    waagerecht[wIdx(spalten - 1, zeile)] = false;
    festeGrenzen.delete(`h${wIdx(spalten - 1, zeile)}`);
  }

  // 5. Grenzen zu Rechtecken – **überschneidungsfrei**.
  //
  //    Sam, 13.08.: „die Blöcke sollten sich nicht überschneiden, sondern
  //    immer clean aneinanderreihen." Vorher lief ein senkrechtes Segment über
  //    die volle Zellhöhe, während das waagerechte mittig auf derselben Linie
  //    lag – an jeder Kreuzung überlappten sie in einem 160 × 80 px großen
  //    Feld. Der Renderer zeichnet je Wand Schatten, Füllung, Kontur und
  //    Glanzkante; übereinanderliegende Rechtecke ergeben dort Nahtlinien,
  //    doppelte Schatten und Konturen quer durch die Fläche.
  //
  //    Jetzt gibt es zwei Bauteile: **Pfosten** auf den Kreuzungen und
  //    **Segmente** dazwischen, die an den Pfosten enden. Nichts überlappt.
  //
  //    Ein Pfosten entsteht nur, wo mindestens zwei Grenzen zusammentreffen.
  //    Bei genau einer endet das Segment einen halben Pfosten früher – das ist
  //    eine zurückgesetzte Wandspitze, kein Loch. Bei zweien wäre das Weglassen
  //    dagegen eine Lücke: durch die 160 px große Ecke käme ein Panzer
  //    diagonal hindurch, und das Labyrinth hätte eine Abkürzung, die niemand
  //    gebaut hat.
  const walls: Wall[] = [];
  let id = 0;
  const zu = (art: 'v' | 'h', index: number): boolean => (art === 'v' ? senkrecht : waagerecht)[index] === true;
  /** Steht an dieser Kreuzung ein Pfosten? */
  const pfostenDa = (sx: number, zy: number): boolean => {
    let anzahl = 0;
    if (zy > 0 && zu('v', sIdx(sx - 1, zy - 1))) anzahl += 1;
    if (zy < zeilen && zu('v', sIdx(sx - 1, zy))) anzahl += 1;
    if (sx > 0 && zu('h', wIdx(sx - 1, zy - 1))) anzahl += 1;
    if (sx < spalten && zu('h', wIdx(sx, zy - 1))) anzahl += 1;
    return anzahl >= 2;
  };

  for (let zeile = 0; zeile < zeilen; zeile += 1) {
    for (let spalte = 0; spalte + 1 < spalten; spalte += 1) {
      if (!senkrecht[sIdx(spalte, zeile)]) continue;
      const fest = festeGrenzen.has(`v${sIdx(spalte, zeile)}`);
      // Am Kartenrand gibt es keine Kreuzung – dort läuft das Segment bis an
      // die Weltkante, sonst bliebe dort eine Lücke.
      const oben = zeile === 0 ? 0 : kanteY(zeile) + (pfostenDa(spalte + 1, zeile) ? dicke / 2 : 0);
      const unten = zeile === zeilen - 1 ? GAME.worldHeight : kanteY(zeile + 1) - (pfostenDa(spalte + 1, zeile + 1) ? dicke / 2 : 0);
      walls.push(wall(`${fest ? 'l' : 'v'}${id++}`, kanteX(spalte + 1) - dicke / 2, oben, dicke, unten - oben));
    }
  }
  for (let zeile = 0; zeile + 1 < zeilen; zeile += 1) {
    for (let spalte = 0; spalte < spalten; spalte += 1) {
      if (!waagerecht[wIdx(spalte, zeile)]) continue;
      const fest = festeGrenzen.has(`h${wIdx(spalte, zeile)}`);
      const links = spalte === 0 ? 0 : kanteX(spalte) + (pfostenDa(spalte, zeile + 1) ? dicke / 2 : 0);
      const rechts = spalte === spalten - 1 ? GAME.worldWidth : kanteX(spalte + 1) - (pfostenDa(spalte + 1, zeile + 1) ? dicke / 2 : 0);
      walls.push(wall(`${fest ? 'l' : 'h'}${id++}`, links, kanteY(zeile + 1) - dicke / 2, rechts - links, dicke));
    }
  }
  // Die Pfosten. Eigenes Präfix `p`, damit das Fracture-Event sie nicht
  // aufbrechen kann (`FRACTURABLE_WALL_IDS` nimmt nur `v` und `h`): Ein
  // fehlender Pfosten wäre genau die diagonale Abkürzung von oben.
  for (let zy = 1; zy < zeilen; zy += 1) {
    for (let sx = 1; sx < spalten; sx += 1) {
      if (!pfostenDa(sx, zy)) continue;
      walls.push(wall(`p${id++}`, kanteX(sx) - dicke / 2, kanteY(zy) - dicke / 2, dicke, dicke));
    }
  }
  return { waende: walls, plaetze, spalten, zeilen };
}

const labyrinth = erzeugeLabyrinth();
export const WALLS: Wall[] = labyrinth.waende;
/**
 * Sams „zwei Mainspots": zwei benannte, offene Plätze auf halber Höhe, links
 * und rechts. Der Generator spart sie aus, jeder hat vier Tore, und ein Drittel
 * aller Formen erscheint dort – das ist der Grund, überhaupt hinzugehen.
 */
export const HAUPTPLAETZE: readonly Hauptplatz[] = labyrinth.plaetze;

/**
 * Antwort für `GET /map` (Sam: die Minimap soll die ganze Karte zeigen, nicht
 * nur den aktuellen Ausschnitt). `WALLS`/`HAUPTPLAETZE` sind für die Laufzeit
 * des Prozesses fest – eine reine Funktion statt einer weiteren Konstante,
 * damit sie sich ohne Express-Objekte testen lässt.
 */
export function mapInfo(): MapInfo {
  // `activeWalls`, nicht `WALLS`: In FFA gibt es keine Wände (siehe
  // `refreshActiveWalls`) – die Minimap soll dieselbe leere Karte zeigen wie
  // jeder andere Wandzugriff auch, nicht die ungenutzte Rohgeneration.
  return { walls: activeWalls, plazas: [...HAUPTPLAETZE], worldWidth: GAME.worldWidth, worldHeight: GAME.worldHeight };
}

/**
 * Vom Fracture-Event temporär deaktivierte Wandsegmente. Eine deaktivierte Wand
 * blockiert weder Bewegung noch Projektile noch Sichtlinien und wird nicht mehr
 * an Clients übertragen – sie existiert für die Simulation schlicht nicht.
 *
 * Der Zustand ist wie `WALLS` prozessweit: Ein Serverprozess betreibt genau eine
 * Arena. Tests setzen ihn über `resetDisabledWalls()` zurück.
 */
const disabledWallIds = new Set<string>();
/** Nur generierte Segmente dürfen aufbrechen; die festen `l*`-Wände nie. */
export const FRACTURABLE_WALL_IDS: readonly string[] = WALLS
  .filter((candidate) => candidate.id.startsWith('v') || candidate.id.startsWith('h'))
  .map((candidate) => candidate.id);
const fracturable = new Set(FRACTURABLE_WALL_IDS);
const wallsById = new Map(WALLS.map((candidate) => [candidate.id, candidate] as const));
/**
 * Der Modus dieser Arena. Prozessweit wie `WALLS` – ein Serverprozess betreibt
 * genau eine Arena (siehe `ARENA_MODES` in shared).
 */
let arenaMode: ArenaMode = 'maze';

/** Zwischenspeicher, damit der Normalfall ohne Fracture keine zusätzliche Prüfung kostet. */
let activeWalls: Wall[] = WALLS;
const refreshActiveWalls = (): void => {
  // FFA hat keine Waende. Die Liste bleibt erzeugt – nur sieht sie niemand:
  // Kollision, Sichtlinie und Snapshot lesen ausschliesslich `activeWalls`.
  if (!ARENA_MODES[arenaMode].walls) { activeWalls = []; return; }
  activeWalls = disabledWallIds.size === 0 ? WALLS : WALLS.filter((candidate) => !disabledWallIds.has(candidate.id));
};

/**
 * Stellt den Modus der Arena ein. Wird beim Start genau einmal gerufen; die
 * Tests nutzen sie, um beide Modi zu pruefen.
 *
 * `WALLS` selbst bleibt unangetastet – es ist die *erzeugte* Karte, nicht die
 * *wirksame*. Diese Trennung gab es schon fuer das Fracture-Event, das einzelne
 * Segmente oeffnet; FFA ist derselbe Mechanismus mit allen Segmenten.
 */
export function setArenaMode(mode: ArenaMode): void {
  arenaMode = mode;
  refreshActiveWalls();
}

export const currentArenaMode = (): ArenaMode => arenaMode;

export const wallById = (id: string): Wall | undefined => wallsById.get(id);
export const isWallDisabled = (id: string): boolean => disabledWallIds.has(id);
/** Gibt zurück, ob der Zustand übernommen wurde – feste Wände lassen sich nicht deaktivieren. */
export function setWallDisabled(id: string, disabled: boolean): boolean {
  if (disabled && !fracturable.has(id)) return false;
  if (disabled) disabledWallIds.add(id);
  else disabledWallIds.delete(id);
  refreshActiveWalls();
  return true;
}
export function resetDisabledWalls(): void {
  disabledWallIds.clear();
  refreshActiveWalls();
}

const SPAWNS: Vector2[] = [{ x: 240, y: 240 }, { x: GAME.worldWidth - 240, y: 240 }, { x: 240, y: GAME.worldHeight - 240 }, { x: GAME.worldWidth - 240, y: GAME.worldHeight - 240 }, { x: GAME.worldWidth / 2, y: 250 }, { x: GAME.worldWidth / 2, y: GAME.worldHeight - 250 }, { x: 250, y: GAME.worldHeight / 2 }, { x: GAME.worldWidth - 250, y: GAME.worldHeight / 2 }, { x: GAME.worldWidth * 0.25, y: GAME.worldHeight * 0.5 }, { x: GAME.worldWidth * 0.75, y: GAME.worldHeight * 0.5 }];
export function circleHitsWall(position: Vector2, radius: number, candidate: Wall): boolean { const nearestX = clamp(position.x, candidate.x, candidate.x + candidate.width); const nearestY = clamp(position.y, candidate.y, candidate.y + candidate.height); const dx = position.x - nearestX; const dy = position.y - nearestY; return dx * dx + dy * dy < radius * radius; }
export function isInsideWorld(position: Vector2, radius: number): boolean { return position.x >= radius && position.y >= radius && position.x <= GAME.worldWidth - radius && position.y <= GAME.worldHeight - radius; }
export function nearbyWalls(position: Vector2, radius: number): Wall[] { return activeWalls.filter((candidate) => candidate.x <= position.x + radius && candidate.x + candidate.width >= position.x - radius && candidate.y <= position.y + radius && candidate.y + candidate.height >= position.y - radius); }
export function isFree(position: Vector2, radius: number): boolean { return isInsideWorld(position, radius) && !nearbyWalls(position, radius + 12).some((candidate) => circleHitsWall(position, radius, candidate)); }
export function moveCircle(position: Vector2, velocity: Vector2, dt: number, radius: number): { position: Vector2; velocity: Vector2; collided: boolean } {
  const distance = Math.hypot(velocity.x, velocity.y) * dt; const steps = Math.max(1, Math.ceil(distance / Math.max(8, radius * 0.55))); const stepDt = dt / steps; const next = { ...position }; const resolvedVelocity = { ...velocity }; let collided = false;
  for (let step = 0; step < steps; step += 1) {
    const xCandidate = { x: next.x + resolvedVelocity.x * stepDt, y: next.y }; if (isFree(xCandidate, radius)) next.x = xCandidate.x; else { resolvedVelocity.x = 0; collided = true; }
    const yCandidate = { x: next.x, y: next.y + resolvedVelocity.y * stepDt }; if (isFree(yCandidate, radius)) next.y = yCandidate.y; else { resolvedVelocity.y = 0; collided = true; }
  }
  return { position: next, velocity: resolvedVelocity, collided };
}
export function randomSpawn(random = Math.random): Vector2 {
  const start = Math.floor(random() * SPAWNS.length);
  for (let offset = 0; offset < SPAWNS.length; offset += 1) { const base = SPAWNS[(start + offset) % SPAWNS.length] ?? SPAWNS[0] ?? { x: 240, y: 240 }; for (let attempt = 0; attempt < 24; attempt += 1) { const candidate = { x: base.x + (random() - 0.5) * 340, y: base.y + (random() - 0.5) * 340 }; if (isFree(candidate, 42)) return candidate; } }
  for (let attempt = 0; attempt < 120; attempt += 1) { const candidate = { x: 120 + random() * (GAME.worldWidth - 240), y: 120 + random() * (GAME.worldHeight - 240) }; if (isFree(candidate, 42)) return candidate; }
  return { x: 240, y: 240 };
}
function randomShapeKind(random: () => number): ShapeKind { const roll = random(); if (roll < 0.06) return 'pentagon'; if (roll < 0.3) return 'triangle'; return 'square'; }
/**
 * Anteil der Formen, die auf einem Hauptplatz erscheinen.
 *
 * Ohne das wäre ein Hauptplatz nur ein Loch im Labyrinth. Ein Drittel der
 * Formen auf 8 % der Fläche macht ihn zu dem Ort, an dem man sich trifft, weil
 * man dort etwas holen kann – und damit zu dem umkämpften Platz, den Sam mit
 * „zwei Mainspots" gemeint hat.
 */
const PLATZ_FORMEN_ANTEIL = 0.33;
export function createShape(id: string, random = Math.random): ShapeSnapshot {
  const kind = randomShapeKind(random); const config = SHAPE_CONFIG[kind];
  // Ohne Wände gibt es keine Plätze, nur eine Fläche – dann bleibt es beim Streuen.
  const platz = ARENA_MODES[arenaMode].walls && random() < PLATZ_FORMEN_ANTEIL
    ? HAUPTPLAETZE[Math.floor(random() * HAUPTPLAETZE.length)]
    : undefined;
  for (let attempt = 0; attempt < 160; attempt += 1) {
    const position = platz
      ? { x: platz.bereich.x + random() * platz.bereich.width, y: platz.bereich.y + random() * platz.bereich.height }
      : { x: 100 + random() * (GAME.worldWidth - 200), y: 100 + random() * (GAME.worldHeight - 200) };
    if (!isFree(position, config.radius + 12)) continue; const angle = random() * Math.PI * 2; const speed = config.drift * (0.45 + random() * 0.55); return { id, kind, position, velocity: { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed }, radius: config.radius, rotation: random() * Math.PI * 2, health: config.health, maxHealth: config.health };
  }
  return { id, kind, position: randomSpawn(random), velocity: { x: 0, y: 0 }, radius: config.radius, rotation: 0, health: config.health, maxHealth: config.health };
}
export function stepShape(shape: ShapeSnapshot, dt: number): void { shape.rotation += (shape.kind === 'triangle' ? -0.55 : shape.kind === 'pentagon' ? 0.22 : 0.38) * dt; const result = moveCircle(shape.position, shape.velocity, dt, shape.radius); shape.position = result.position; if (result.collided) { const direction = normalize({ x: -shape.velocity.x + (Math.random() - 0.5) * 18, y: -shape.velocity.y + (Math.random() - 0.5) * 18 }); const speed = Math.max(6, Math.hypot(shape.velocity.x, shape.velocity.y)); shape.velocity = { x: direction.x * speed, y: direction.y * speed }; } }
export function segmentIntersectsWall(start: Vector2, end: Vector2, candidate: Wall): boolean { const dx = end.x - start.x; const dy = end.y - start.y; let tMin = 0; let tMax = 1; const checks: Array<[number, number]> = [[-dx, start.x - candidate.x], [dx, candidate.x + candidate.width - start.x], [-dy, start.y - candidate.y], [dy, candidate.y + candidate.height - start.y]]; for (const [p, q] of checks) { if (Math.abs(p) < 0.00001) { if (q < 0) return false; continue; } const ratio = q / p; if (p < 0) tMin = Math.max(tMin, ratio); else tMax = Math.min(tMax, ratio); if (tMin > tMax) return false; } return true; }
/**
 * Kreuzt die Strecke eines der genannten Wandsegmente? Anders als
 * `hasLineOfSight` zählen hier auch deaktivierte Segmente – nur so lässt sich
 * feststellen, ob ein Schuss durch eine von Fracture geöffnete Bresche ging.
 */
export function segmentCrossesWalls(start: Vector2, end: Vector2, ids: Iterable<string>): boolean {
  for (const id of ids) {
    const candidate = wallsById.get(id);
    if (candidate && segmentIntersectsWall(start, end, candidate)) return true;
  }
  return false;
}
export function hasLineOfSight(start: Vector2, end: Vector2): boolean { const center = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 }; const radius = Math.hypot(end.x - start.x, end.y - start.y) / 2 + 20; return !nearbyWalls(center, radius).some((candidate) => segmentIntersectsWall(start, end, candidate)); }
export function wallsInView(position: Vector2): Wall[] { const halfWidth = GAME.visibleWorldWidth * 0.62; const halfHeight = GAME.visibleWorldHeight * 0.72; return activeWalls.filter((candidate) => candidate.x <= position.x + halfWidth && candidate.x + candidate.width >= position.x - halfWidth && candidate.y <= position.y + halfHeight && candidate.y + candidate.height >= position.y - halfHeight); }

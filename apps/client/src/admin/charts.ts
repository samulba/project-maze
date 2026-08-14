import { escape } from './html';
import { kompakt, komma, tag, zahl } from './format';
import type { ClassUsage, DailyRow } from './types';

/**
 * Die Diagramme des Portals – handgeschriebenes SVG, keine Bibliothek.
 *
 * Die Begründung von früher gilt weiter: Eine Diagrammbibliothek wäre größer
 * als das ganze Portal. Neu ist der Anspruch an das, was hier entsteht. Die
 * alte Fassung war ein Balkenfeld ohne Achse: Man sah, welcher Tag der höchste
 * war, aber nicht, ob „höchster Tag" zwölf oder zweihundert Spieler heißt, und
 * für jede Zahl musste man den trägen Browser-Tooltip abwarten.
 *
 * Deshalb hier: eine bezifferte Y-Achse mit Rasterlinien, ein Trefferbereich
 * über die volle Höhe je Tag (nicht nur über dem Balken – bei drei Spielern ist
 * der acht Pixel hoch) und alle Werte als `data-*` am Tag, damit `main.ts`
 * daraus einen eigenen Tooltip bauen kann, der sofort steht.
 */

/**
 * Rundet eine Obergrenze auf einen Wert, den man vorlesen kann.
 *
 * Ohne das steht an der Achse „137" statt „150", und drei Rasterlinien tragen
 * die Beschriftungen 45,7 / 91,3 / 137. Eine Achse, die man nachrechnen muss,
 * hat ihren Zweck verfehlt.
 */
export function nettesMaximum(wert: number): number {
  if (wert <= 4) return Math.max(1, Math.ceil(wert));
  const stufe = 10 ** Math.floor(Math.log10(wert));
  for (const faktor of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8]) {
    if (wert <= stufe * faktor) return stufe * faktor;
  }
  return stufe * 10;
}

/**
 * Verlauf als gestapelte Balken: wiederkehrende Spieler unten, neue oben.
 *
 * Gestapelt und nicht nebeneinander, weil die Frage „wie viele waren da" und
 * die Frage „wie viele davon waren neu" dieselbe Säule teilen – nebeneinander
 * müsste man zwei Höhen addieren, um die erste zu beantworten.
 *
 * Anders als früher sitzt „neu" wirklich **oben**: In der alten Fassung waren
 * beide Rechtecke an der Grundlinie verankert, das kleinere lag also vor dem
 * größeren. Das ergab dasselbe Bild, aber ein anderes Modell – und an der Naht
 * zwischen beiden Segmenten fehlte der Kontrast.
 */
export function verlauf(rows: readonly DailyRow[]): string {
  if (rows.length === 0) {
    return leer('Noch keine Tage mit Besuchen.', 'Sobald jemand spielt, wächst hier eine Kurve.');
  }

  const breite = 1000;
  const hoehe = 260;
  const oben = 16;
  const unten = 30;
  const links = 46;
  const rechts = 6;
  const feldHoehe = hoehe - oben - unten;
  const feldBreite = breite - links - rechts;

  const hoechst = Math.max(1, ...rows.map((row) => row.players));
  const skala = nettesMaximum(hoechst);
  const spalte = feldBreite / rows.length;
  const balken = Math.max(2, Math.min(34, spalte * 0.56));
  const basis = hoehe - unten;
  const y = (wert: number): number => basis - (wert / skala) * feldHoehe;

  // Vier Rasterlinien reichen: Sie beantworten „ungefähr wie hoch", und mehr
  // will man aus einem Überblicksdiagramm gar nicht ablesen.
  const stufen = 4;
  const raster = Array.from({ length: stufen + 1 }, (_, index) => {
    const wert = (skala / stufen) * index;
    const linie = y(wert);
    return `<line x1="${links}" y1="${linie.toFixed(1)}" x2="${breite - rechts}" y2="${linie.toFixed(1)}" class="${index === 0 ? 'achse' : 'raster'}"/>
      <text x="${links - 10}" y="${(linie + 4).toFixed(1)}" text-anchor="end" class="achsen-marke">${escape(kompakt(wert))}</text>`;
  }).join('');

  const saeulen = rows.map((row, index) => {
    const mitte = links + spalte * (index + 0.5);
    const x = mitte - balken / 2;
    const neu = Math.min(row.newPlayers, row.players);
    const alt = Math.max(0, row.players - neu);
    const yAlt = y(alt);
    const yGesamt = y(row.players);
    const hAlt = Math.max(alt > 0 ? 2 : 0, basis - yAlt);
    const hNeu = Math.max(neu > 0 ? 2 : 0, yAlt - yGesamt);
    // Der Trefferbereich geht über die volle Höhe: Ein Tag mit drei Spielern
    // ist sonst ein acht Pixel hohes Ziel, und man jagt es mit der Maus.
    return `<g class="saeule" data-index="${index}" data-tag="${escape(tag(row.day))}" data-spieler="${row.players}" data-neu="${row.newPlayers}" data-besuche="${row.sessions}" data-runden="${row.runs}" data-mitte="${(mitte / breite).toFixed(4)}">
      <title>${escape(tag(row.day))} · ${row.players} Spieler, davon ${row.newPlayers} neu · ${row.sessions} Besuche</title>
      <rect x="${(mitte - spalte / 2).toFixed(1)}" y="${oben}" width="${spalte.toFixed(1)}" height="${feldHoehe.toFixed(1)}" class="treffer"/>
      <rect x="${x.toFixed(1)}" y="${yAlt.toFixed(1)}" width="${balken.toFixed(1)}" height="${hAlt.toFixed(1)}" rx="${Math.min(3, balken / 2).toFixed(1)}" class="balken-alt"/>
      <rect x="${x.toFixed(1)}" y="${yGesamt.toFixed(1)}" width="${balken.toFixed(1)}" height="${hNeu.toFixed(1)}" rx="${Math.min(3, balken / 2).toFixed(1)}" class="balken-neu"/>
    </g>`;
  }).join('');

  // Höchstens acht Beschriftungen, sonst überlappen sie sich bei 90 Tagen.
  const schritt = Math.max(1, Math.ceil(rows.length / 8));
  const beschriftet: number[] = [];
  for (let index = 0; index < rows.length; index += schritt) beschriftet.push(index);
  // Der letzte Tag ist der wichtigste – aber nur, wenn er nicht auf seinem
  // Vorgänger klebt. Bei 30 Tagen und Schritt 4 landete er sonst direkt neben
  // Tag 28, und aus „7.8." und „8.8." wurde ein „7.88.8.".
  const letzter = rows.length - 1;
  if (letzter - (beschriftet[beschriftet.length - 1] ?? 0) >= Math.ceil(schritt / 2)) beschriftet.push(letzter);

  const marken = beschriftet.map((index) => {
    // An den Rändern nach innen ausrichten, sonst schneidet die viewBox das
    // erste und das letzte Datum an.
    const anker = index === 0 ? 'start' : index === letzter ? 'end' : 'middle';
    const x = index === 0 ? links : index === letzter ? breite - rechts : links + spalte * (index + 0.5);
    return `<text x="${x.toFixed(1)}" y="${hoehe - 9}" text-anchor="${anker}" class="marke">${escape(tag(rows[index]!.day))}</text>`;
  }).join('');

  const spitze = rows.reduce((beste, row) => (row.players > beste.players ? row : beste), rows[0]!);

  return `<figure class="verlauf">
    <figcaption class="verlauf-kopf">
      <span class="legende"><i class="punkt alt"></i> wiederkehrend</span>
      <span class="legende"><i class="punkt neu"></i> neu</span>
      <span class="verlauf-spitze">Bester Tag <b>${escape(tag(spitze.day))}</b> mit ${zahl(spitze.players)} Spielern</span>
    </figcaption>
    <div class="verlauf-flaeche">
      <svg viewBox="0 0 ${breite} ${hoehe}" role="img" aria-label="Spieler je Tag, wiederkehrend und neu">
        <defs>
          <linearGradient id="farbe-alt" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="var(--akzent)" stop-opacity=".85"/>
            <stop offset="100%" stop-color="var(--akzent)" stop-opacity=".38"/>
          </linearGradient>
          <linearGradient id="farbe-neu" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="var(--akzent-2)" stop-opacity="1"/>
            <stop offset="100%" stop-color="var(--akzent-2)" stop-opacity=".75"/>
          </linearGradient>
        </defs>
        ${raster}${saeulen}${marken}
      </svg>
      <div class="verlauf-tipp" hidden></div>
    </div>
  </figure>`;
}

/**
 * Winzige Kurve in einer Kachel – kein Diagramm, sondern ein Adjektiv.
 *
 * Eine Kachel sagt „1.240 Besuche". Ob das die Spitze einer Welle oder das Ende
 * eines Absturzes ist, sagt erst die Form daneben, und zwar ohne dass man den
 * Blick auf das große Diagramm verschieben muss.
 */
export function funke(werte: readonly number[], art: 'gut' | 'neutral' = 'neutral'): string {
  const punkte = werte.filter((wert) => Number.isFinite(wert));
  if (punkte.length < 3) return '';
  const breite = 120;
  const hoehe = 32;
  const hoechst = Math.max(...punkte);
  const tiefst = Math.min(...punkte);
  const spanne = hoechst - tiefst || 1;
  const schritt = breite / (punkte.length - 1);
  const koordinaten = punkte.map((wert, index) => {
    const x = index * schritt;
    // 3 px Luft oben und unten, sonst wird die Linie an den Extremwerten
    // vom eigenen Strichende abgeschnitten.
    const y = hoehe - 3 - ((wert - tiefst) / spanne) * (hoehe - 6);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const linie = `M${koordinaten.join(' L')}`;
  const flaeche = `${linie} L${breite},${hoehe} L0,${hoehe} Z`;
  return `<svg class="funke ${art}" viewBox="0 0 ${breite} ${hoehe}" preserveAspectRatio="none" aria-hidden="true">
    <path d="${flaeche}" class="funke-flaeche"/>
    <path d="${linie}" class="funke-linie"/>
  </svg>`;
}

/**
 * Klassenverteilung als Ring.
 *
 * Die Tabelle darunter beantwortet „wie viel genau"; der Ring beantwortet
 * „wovon dominiert" – die Frage, mit der man auf die Seite kommt. Ab Rang sieben
 * wird zusammengefasst: Zwanzig Segmente sind ein Farbrad, kein Diagramm.
 */
export function ring(classes: readonly ClassUsage[]): string {
  const gesamt = classes.reduce((summe, eintrag) => summe + eintrag.runs, 0);
  if (gesamt === 0) return '';

  const sortiert = [...classes].sort((a, b) => b.runs - a.runs);
  const vorne = sortiert.slice(0, 6);
  const restRuns = sortiert.slice(6).reduce((summe, eintrag) => summe + eintrag.runs, 0);
  const stuecke = restRuns > 0
    ? [...vorne, { label: `${sortiert.length - 6} weitere`, branch: 'rest', runs: restRuns } as ClassUsage]
    : vorne;

  const radius = 54;
  const umfang = 2 * Math.PI * radius;
  const lueckeGrad = stuecke.length > 1 ? 2.4 : 0;
  let versatz = 0;
  const boegen = stuecke.map((eintrag) => {
    const anteil = eintrag.runs / gesamt;
    const laenge = Math.max(0, umfang * anteil - (umfang * lueckeGrad) / 360);
    const bogen = `<circle class="ring-stueck branch-${escape(eintrag.branch)}" cx="70" cy="70" r="${radius}"
      stroke-dasharray="${laenge.toFixed(2)} ${(umfang - laenge).toFixed(2)}"
      stroke-dashoffset="${(-umfang * versatz).toFixed(2)}"><title>${escape(eintrag.label)}: ${zahl(eintrag.runs)} Runden (${komma(anteil * 100)} %)</title></circle>`;
    versatz += anteil;
    return bogen;
  }).join('');

  const legende = stuecke.map((eintrag) => `<li>
    <i class="familie branch-${escape(eintrag.branch)}"></i>
    <span>${escape(eintrag.label)}</span>
    <b>${komma((eintrag.runs / gesamt) * 100)} %</b>
  </li>`).join('');

  return `<div class="ring-block">
    <div class="ring-figur">
      <svg viewBox="0 0 140 140" role="img" aria-label="Anteil der Klassen an allen Runden">
        <g transform="rotate(-90 70 70)">${boegen}</g>
      </svg>
      <div class="ring-mitte">
        <strong>${escape(kompakt(gesamt))}</strong>
        <span>Runden</span>
      </div>
    </div>
    <ul class="ring-legende">${legende}</ul>
  </div>`;
}

/** Leerer Zustand mit Grund – nie eine weiße Fläche ohne Erklärung. */
export function leer(titel: string, hinweis?: string): string {
  return `<div class="leer">
    <strong>${escape(titel)}</strong>
    ${hinweis ? `<span>${escape(hinweis)}</span>` : ''}
  </div>`;
}

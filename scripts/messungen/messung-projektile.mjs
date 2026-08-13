/**
 * Kandidaten für die Projektilwerte nebeneinander vermessen.
 *
 * Sam, 13.08. abends: „das sag ich dir so oft aber da ändert sich nie was – die
 * BULLETS fliegen zu WEIT direkt von Anfang an, also die ‚normalen', zu schnell,
 * zu viel und zu klein, bzw. wenn man mehr levelt müssen die etwas größer
 * werden wie in Diep.io."
 *
 * Er hat recht, und das ist hier nachzulesen: Der Deckel aus Stufe 2 hat die
 * normalen Klassen **nie** berührt. Gemessen werden deshalb vier Größen, je
 * eine gegen einen seiner Punkte:
 *
 * 1. **Reichweite in halben Bildbreiten** („zu weit"). Über 1,0 heißt: Der
 *    Schütze trifft jemanden, der ihn nicht sehen kann.
 * 2. **Ausweichzeit** auf 400 px („zu schnell") – und die Einholzeit gegen
 *    einen fliehenden Spieler, damit die Kugel nicht zur Schnecke wird.
 * 3. **Kugeln gleichzeitig in der Luft** („zu viel") = Feuerrate × Flugzeit.
 * 4. **Radius gegen den Panzerradius** („zu klein"), auf Stufe 1 und 60.
 *
 *   npm run build && node scripts/messungen/messung-projektile.mjs
 */
import { CLASS_DEFINITIONS, PLAYER_CLASS_IDS, GAME, EMPTY_UPGRADES } from '../../packages/shared/dist/index.js';
import {
  PROJEKTIL, fastestPlayerSpeed, projectileRadiusFor, projectileSpeedFor, projectileLifeFor
} from '../../apps/server/dist/projectile-speed.js';

const HALB = GAME.visibleWorldWidth / 2;
const PANZER = GAME.playerRadius;
const schuetzen = PLAYER_CLASS_IDS.filter((id) => CLASS_DEFINITIONS[id].projectileSpeed > 0);

/** Alle vier Kennzahlen für eine Klasse auf einer Stufe. */
function kennzahlen(id, level, mass) {
  const base = CLASS_DEFINITIONS[id];
  const tempo = projectileSpeedFor(base, level, 0, mass);
  const leben = projectileLifeFor(base, tempo, mass);
  const reichweite = tempo * leben;
  return {
    tempo,
    reichweite,
    inHalbbildern: reichweite / HALB,
    ausweich400: 400 / tempo,
    // Wie lange braucht die Kugel, um einen Spieler einzuholen, der mit
    // 80 % Höchsttempo wegläuft? Über der Lebenszeit heisst: gar nicht.
    einholt: tempo > fastestPlayerSpeed * 0.8,
    inDerLuft: leben / base.reload,
    radius: projectileRadiusFor(base, level, mass),
    imPanzer: projectileRadiusFor(base, level, mass) / PANZER
  };
}

function vermesse(mass) {
  const eins = schuetzen.map((id) => kennzahlen(id, 1, mass));
  const sechzig = schuetzen.map((id) => kennzahlen(id, 60, mass));
  const mittel = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
  return {
    weitL1: mittel(eins.map((k) => k.inHalbbildern)),
    ueberBild: eins.filter((k) => k.inHalbbildern > 1).length,
    ausweich: mittel(eins.map((k) => k.ausweich400)),
    holtNichtEin: eins.filter((k) => !k.einholt).length,
    luft: mittel(eins.map((k) => k.inDerLuft)),
    radL1: mittel(eins.map((k) => k.imPanzer)),
    radL60: mittel(sechzig.map((k) => k.imPanzer)),
    // Verschiedene Tempi = bleiben die Klassen unterscheidbar?
    tempi: new Set(eins.map((k) => Math.round(k.tempo))).size
  };
}

const ALT = { ...PROJEKTIL, reichweiteSkala: 1, reichweiteDeckel: 1e9, radiusSkala: 1, radiusProLevel: 0, daempfer: 0.7, boden: 1.25, abschlag: 1 };

console.log(`Sichtfenster ${GAME.visibleWorldWidth} x ${GAME.visibleWorldHeight} (halbe Breite ${HALB} px), Panzerradius ${PANZER}, schnellster Spieler ${Math.round(fastestPlayerSpeed)} px/s`);
console.log(`${schuetzen.length} schiessende Klassen\n`);

console.log('=== Kandidaten (Mittelwerte ueber alle schiessenden Klassen, Level 1) ===');
console.log(
  'Variante'.padEnd(34), 'Reichw'.padStart(7), 'ueberBild'.padStart(10), 'Ausweich'.padStart(9),
  'holtNicht'.padStart(10), 'inLuft'.padStart(7), 'RadL1'.padStart(7), 'RadL60'.padStart(7), 'Tempi'.padStart(6)
);
const zeige = (name, mass) => {
  const m = vermesse(mass);
  console.log(
    name.padEnd(34),
    `${m.weitL1.toFixed(2)}x`.padStart(7),
    `${m.ueberBild}/${schuetzen.length}`.padStart(10),
    `${m.ausweich.toFixed(2)}s`.padStart(9),
    `${m.holtNichtEin}`.padStart(10),
    m.luft.toFixed(1).padStart(7),
    `${(m.radL1 * 100).toFixed(0)}%`.padStart(7),
    `${(m.radL60 * 100).toFixed(0)}%`.padStart(7),
    String(m.tempi).padStart(6)
  );
};
zeige('ALT (Stand vor diesem Paket)', ALT);
for (const skala of [0.4, 0.5, 0.6, 0.7]) {
  for (const deckel of [700, 800, 1000]) {
    zeige(`Skala ${skala} / Deckel ${deckel}`, { ...PROJEKTIL, reichweiteSkala: skala, reichweiteDeckel: deckel });
  }
}
console.log('\n--- Tempo: Abschlag und Boden (Reichweite fest auf der Wahl 0,50 / 800) ---');
for (const abschlag of [1, 0.9, 0.85, 0.8, 0.72]) {
  for (const boden of [1.25, 1.1]) {
    zeige(`Abschlag ${abschlag} / Boden ${boden}`, { ...PROJEKTIL, abschlag, boden });
  }
}

console.log('\n=== Gewaehlte Werte, Klasse fuer Klasse ===');
console.log('Klasse'.padEnd(12), 'Lv'.padStart(3), 'Tempo'.padStart(7), 'Reichw'.padStart(7), 'xHalbbild'.padStart(10), 'auf400px'.padStart(9), 'inLuft'.padStart(7), 'Radius'.padStart(7), 'vsPanzer'.padStart(9));
for (const id of ['core', 'twin', 'rapid', 'gatling', 'sniper', 'lancer', 'fortress']) {
  for (const lvl of [1, 60]) {
    const k = kennzahlen(id, lvl, PROJEKTIL);
    console.log(
      id.padEnd(12), String(lvl).padStart(3), String(Math.round(k.tempo)).padStart(7),
      String(Math.round(k.reichweite)).padStart(7), k.inHalbbildern.toFixed(2).padStart(10),
      `${k.ausweich400.toFixed(2)}s`.padStart(9), k.inDerLuft.toFixed(1).padStart(7),
      k.radius.toFixed(1).padStart(7), `${(k.imPanzer * 100).toFixed(0)}%`.padStart(9)
    );
  }
}
const ueber = schuetzen.filter((id) => kennzahlen(id, 1, PROJEKTIL).inHalbbildern > 1);
console.log(`\nKlassen, die weiter schiessen als der Getroffene sieht: ${ueber.length} von ${schuetzen.length}` + (ueber.length ? ` (${ueber.join(', ')})` : ''));
const langsam = schuetzen.filter((id) => !kennzahlen(id, 1, PROJEKTIL).einholt);
console.log(`Klassen, deren Kugel einen Fliehenden nicht mehr einholt: ${langsam.length}` + (langsam.length ? ` (${langsam.join(', ')})` : ''));

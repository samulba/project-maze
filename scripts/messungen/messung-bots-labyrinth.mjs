/**
 * Halten die Bots das neue Labyrinth aus? (Stufe 3, Gegenprobe)
 *
 * Der Umbau der Karte hat eine offene Flanke, die im Stufenplan (Bericht 26)
 * ausdrücklich als Risiko steht: **Es gibt keine Bot-Wegfindung.** Ein Bot
 * fährt geradeaus auf sein Ziel zu (`game.ts`, `updateBot`), und er nimmt sich
 * nur Ziele, die er SIEHT (`hasLineOfSight`). Beides war auf einer Karte mit
 * 4,5 % Deckung kaum spürbar. Bei 21,8 % Deckung kann es zwei Dinge auslösen:
 *
 * 1. **Blindheit** – kein Ziel in Sicht, der Bot fällt in seinen Kreisel.
 * 2. **Festfahren** – Ziel in Sicht, aber eine Wand dazwischen; `moveCircle`
 *    schiebt ihn an der Wand entlang, und in einer Ecke steht er.
 *
 * Gemessen wird deshalb gegen die einzige verfügbare offene Karte: FFA hat
 * keine Wände. Wenn Bots im Labyrinth ähnlich weit fahren und ähnlich oft ein
 * Ziel haben wie in FFA, ist die Wegfindung kein Notfall. Wenn nicht, steht sie
 * als Nächstes an.
 *
 *   npm run build && node scripts/messungen/messung-bots-labyrinth.mjs
 */
import { buildGame, median } from './stack.mjs';

const DT = 1 / 40;
const SEKUNDEN = 90;
const BOTS = 16;
/** Unter diesem Weg je Sekunde gilt ein Bot in diesem Tick als stehend. */
const STEHT_UNTER = 12;

function messe(mode) {
  const game = buildGame({ botCount: BOTS, mode, director: false });
  const interna = game;

  let now = 100_000;
  game.step(DT, now);

  const spur = new Map();      // id -> { weg, ticks, stehtTicks, mitZiel, start, tode }
  const ticks = Math.round(SEKUNDEN / DT);
  for (let tick = 0; tick < ticks; tick += 1) {
    const vorher = new Map();
    for (const [id, p] of interna.players) if (p.bot && !p.dead) vorher.set(id, { ...p.position });
    game.step(DT, (now += 25));
    for (const [id, p] of interna.players) {
      if (!p.bot) continue;
      let eintrag = spur.get(id);
      if (!eintrag) { eintrag = { weg: 0, ticks: 0, stehtTicks: 0, mitZiel: 0, punkte: 0 }; spur.set(id, eintrag); }
      if (p.dead) continue;
      const alt = vorher.get(id);
      if (alt) {
        const schritt = Math.hypot(p.position.x - alt.x, p.position.y - alt.y);
        eintrag.weg += schritt;
        eintrag.ticks += 1;
        if (schritt / DT < STEHT_UNTER) eintrag.stehtTicks += 1;
      }
      if (p.bot.targetId || p.bot.targetShapeId) eintrag.mitZiel += 1;
      eintrag.punkte = p.score ?? 0;
    }
  }

  const eintraege = [...spur.values()].filter((e) => e.ticks > 100);
  return {
    tempo: median(eintraege.map((e) => e.weg / (e.ticks * DT))),
    steht: 100 * median(eintraege.map((e) => e.stehtTicks / e.ticks)),
    mitZiel: 100 * median(eintraege.map((e) => e.mitZiel / e.ticks)),
    punkte: median(eintraege.map((e) => e.punkte)),
    bots: eintraege.length
  };
}

console.log(`${BOTS} Bots, ${SEKUNDEN} s je Lauf. FFA hat keine Waende und ist damit die offene Vergleichskarte.\n`);
console.log('Karte'.padEnd(8), 'Bots'.padStart(5), 'Tempo px/s'.padStart(11), 'steht %'.padStart(8), 'mit Ziel %'.padStart(11), 'Punkte'.padStart(8));
const werte = {};
for (const mode of ['ffa', 'maze']) {
  const m = messe(mode);
  werte[mode] = m;
  console.log(
    mode.padEnd(8), String(m.bots).padStart(5), m.tempo.toFixed(1).padStart(11),
    m.steht.toFixed(1).padStart(8), m.mitZiel.toFixed(1).padStart(11), String(Math.round(m.punkte)).padStart(8)
  );
}

const v = (a, b) => (b === 0 ? 'n/a' : `${(100 * a / b).toFixed(0)} %`);
console.log(`\nLabyrinth gegenueber offener Karte: Tempo ${v(werte.maze.tempo, werte.ffa.tempo)}, `
  + `Ziel-Anteil ${v(werte.maze.mitZiel, werte.ffa.mitZiel)}, Punkte ${v(werte.maze.punkte, werte.ffa.punkte)}`);
console.log(`Stehende Ticks: FFA ${werte.ffa.steht.toFixed(1)} %, Labyrinth ${werte.maze.steht.toFixed(1)} %`);

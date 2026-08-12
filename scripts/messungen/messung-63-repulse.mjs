/**
 * Messrunde Befund 63: Was bewirkt der Repulse wirklich – in beiden
 * Stellungen von REPULSE_TRAVEL_ENABLED?
 *
 * Aufbau nach der Methodik aus Bericht 19: Ziel auf 100 px, einmal stehend,
 * einmal auf den Stoßer zulaufend. Gemessen wird die Lage des Ziels nach
 * 200 ms, 500 ms und 1 s: Verschiebung entlang der Stoßachse (positiv = vom
 * Stoßer weg) und der Abstand zum Stoßer gegenüber den 100 px vom Start.
 * Dazu ein Kontrolllauf ohne Repulse (wie weit läuft das Ziel zu Fuß?).
 *
 * Kein Schalter wird umgelegt – beide Stellungen werden als getrennte
 * Spielinstanzen gebaut, exakt wie index.ts sie baut (tuneLoadoutSystem über
 * tuneCombatScaling, Dash-Travel an wie in Produktion).
 */
import { MazeGame } from '../../apps/server/dist/game.js';
import { tuneCombatScaling } from '../../apps/server/dist/combat-tuning.js';
import { activateModule, equipLoadout, tuneLoadoutSystem } from '../../apps/server/dist/loadout-system.js';

const DT = 0.025;               // 25-ms-Ticks wie der Server
const START = 100_000;          // feste Uhr, keine Echtzeit
const STOSSER = { x: 2800, y: 2200 };  // nachweislich freies Feld (Aegis-Testpunkt)
const ABSTAND = 100;

/** Ein Lauf: eine Schalterstellung, ein Zielverhalten. */
function lauf({ travel, verhalten, repulse = true }) {
  const game = tuneLoadoutSystem(tuneCombatScaling(new MazeGame(0)), true, travel);
  const internals = game;
  internals.shapes.clear();

  const stosserId = game.addPlayer('Stosser');
  const zielId = game.addPlayer('Ziel');
  const stosser = internals.players.get(stosserId);
  const ziel = internals.players.get(zielId);

  // Modul wechseln, solange der Spawnschutz steht (equipLoadout verlangt das),
  // dann die Wechselsperre (750 ms) verstreichen lassen.
  if (repulse && !equipLoadout(game, stosserId, 'repulse', 'standard', START)) {
    throw new Error('equipLoadout fehlgeschlagen');
  }

  for (const spieler of [stosser, ziel]) {
    spieler.invulnerable = false;
    spieler.invulnerableUntil = 0;
    spieler.velocity = { x: 0, y: 0 };
    spieler.move = { x: 0, y: 0 };
    spieler.aim = { x: 100, y: 0 };
  }
  stosser.position = { ...STOSSER };
  ziel.position = { x: STOSSER.x + ABSTAND, y: STOSSER.y };

  const zuend = START + 900; // sicher nach der Wechselsperre
  if (repulse && !activateModule(game, stosserId, zuend)) {
    throw new Error('activateModule fehlgeschlagen');
  }

  // Zielverhalten: stehen oder mit voller Eingabe auf den Stoßer zu.
  if (verhalten === 'laufend') ziel.move = { x: -1, y: 0 };

  const startX = ziel.position.x;
  const proben = {};
  const messpunkte = [200, 500, 1000];
  let maxVerschiebung = 0;
  for (let tick = 1; tick <= Math.round(1 / DT); tick += 1) {
    const now = zuend + tick * DT * 1000;
    game.step(DT, now);
    const verschiebung = ziel.position.x - startX;
    maxVerschiebung = Math.max(maxVerschiebung, verschiebung);
    const ms = Math.round(tick * DT * 1000);
    if (messpunkte.includes(ms)) {
      proben[ms] = {
        verschiebung: Math.round(verschiebung * 10) / 10,
        abstand: Math.round(Math.hypot(ziel.position.x - stosser.position.x, ziel.position.y - stosser.position.y) * 10) / 10
      };
    }
  }
  return { proben, maxVerschiebung: Math.round(maxVerschiebung * 10) / 10 };
}

const faelle = [];
for (const travel of [false, true]) {
  for (const verhalten of ['stehend', 'laufend']) {
    faelle.push({ schalter: travel ? 'travel AN' : 'travel AUS (Produktion)', verhalten, ...lauf({ travel, verhalten }) });
  }
}
// Kontrolle: Wie weit kommt ein laufendes Ziel ganz ohne Repulse?
const kontrolle = lauf({ travel: false, verhalten: 'laufend', repulse: false });

console.log(JSON.stringify({ faelle, kontrolleOhneRepulse: kontrolle }, null, 1));

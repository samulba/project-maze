/**
 * Fairness gegen niedrigstufige Ziele (BAL2) – Sam, 13.08.: „auch fairer
 * gegen 'kleinere' Tanks das die vlt ihn nicht schnell killen also high lvl
 * nicht schnell töten aber dafür schneller abhauen können".
 *
 * Ausgangsmessung, die den Handlungsbedarf belegt (Vortex L60, ausgewogener
 * Punkteeinsatz, gegen einen frischen L1 Core):
 *
 *   Stat        L1 Core   L60 Vortex   Faktor
 *   Leben          110         224      1,9x
 *   Tempo          270         364      1,3x
 *   DPS           53,3       273,4      2,8x
 *
 * Die Zeit bis zum Tod fällt dadurch von 4,2 s (L1 gegen L60) auf 0,4 s (L60
 * gegen L1) – Faktor 10 in der Asymmetrie. Das ist „fühlt sich unbesiegbar
 * an" in einer Zahl.
 *
 * Dieses Skript misst denselben Fall MIT der neuen Regel (class-mechanics.ts,
 * `LEVEL_FAIRNESS`): echte Salven aus der Produktions-Kette gegen ein
 * unbewegliches Ziel, gezählt bis zum Tod, plus die Flucht-Geschwindigkeit
 * unmittelbar nach einem Treffer.
 *
 *   npm run build && node scripts/messungen/messung-bal2-fairness.mjs
 */
import { buildGame, botTierFor } from './stack.mjs';
import { applyDebugBuild } from '../../apps/server/dist/debug-lab.js';
import { tunedStatsFor } from '../../apps/server/dist/combat-tuning.js';

const DT = 1 / 40;

function neuesSpiel() {
  return buildGame({ botCount: 0, mode: 'ffa', director: false });
}

function konfiguriere(game, playerClass, level, preset) {
  const id = game.addPlayer(`${playerClass}-${level}`);
  applyDebugBuild(game, id, { playerClass, level, preset });
  const spieler = game.players.get(id);
  spieler.invulnerable = false;
  spieler.invulnerableUntil = 0;
  return { id, spieler };
}

// ------------------------------------------------------------------ 1
console.log('=== 1. Rohstats (ohne Fairness-Schicht, direkt aus den Formeln) ===');
{
  const game = neuesSpiel();
  const { spieler: gross } = konfiguriere(game, 'vortex', 60, 'balanced');
  const { spieler: klein } = konfiguriere(game, 'core', 1, 'blank');
  const statsGross = tunedStatsFor(gross);
  const statsKlein = tunedStatsFor(klein);
  const dpsGross = (statsGross.damage / statsGross.reload) * statsGross.barrelCount;
  const dpsKlein = (statsKlein.damage / statsKlein.reload) * statsKlein.barrelCount;
  console.log(`L60 Vortex (balanced): ${Math.round(statsGross.maxHealth)} HP, ${Math.round(statsGross.moveSpeed)} Tempo, ${dpsGross.toFixed(1)} DPS`);
  console.log(`L1 Core:               ${Math.round(statsKlein.maxHealth)} HP, ${Math.round(statsKlein.moveSpeed)} Tempo, ${dpsKlein.toFixed(1)} DPS`);
  const ttkGrossToetetKlein = statsKlein.maxHealth / dpsGross;
  const ttkKleinToetetGross = statsGross.maxHealth / dpsKlein;
  console.log(`TTK L60 tötet L1:  ${ttkGrossToetetKlein.toFixed(2)} s`);
  console.log(`TTK L1 tötet L60:  ${ttkKleinToetetGross.toFixed(2)} s`);
  console.log(`Asymmetrie: ${(ttkKleinToetetGross / ttkGrossToetetKlein).toFixed(1)}x\n`);
}

// ------------------------------------------------------------------ 2
console.log('=== 2. Echte Salven MIT Fairness-Schicht (Produktions-Kette) ===');
{
  const game = neuesSpiel();
  const { id: grossId, spieler: gross } = konfiguriere(game, 'vortex', 60, 'balanced');
  const { id: kleinId, spieler: klein } = konfiguriere(game, 'core', 1, 'blank');
  gross.position = { x: 3000, y: 2000 };
  klein.position = { x: 3120, y: 2000 };
  klein.move = { x: 0, y: 0 };
  gross.move = { x: 0, y: 0 };

  let now = 100_000;
  let ticks = 0;
  const MAX_TICKS = Math.round(15 / DT);
  while (!klein.dead && ticks < MAX_TICKS) {
    gross.aim = { x: klein.position.x - gross.position.x, y: klein.position.y - gross.position.y };
    gross.primary = true;
    klein.primary = false;
    game.step(DT, (now += 25));
    ticks += 1;
  }
  const sekunden = ticks * DT;
  console.log(`L60 Vortex (balanced) gegen unbewegliches L1 Core: ${klein.dead ? 'tot nach' : 'ÜBERLEBT über'} ${sekunden.toFixed(2)} s (${ticks} Ticks)`);
}

// ------------------------------------------------------------------ 3
console.log('\n=== 3. Umgekehrt: L1 gegen unbewegliches L60 (keine Sonderregel für den Kleinen) ===');
{
  const game = neuesSpiel();
  const { spieler: gross } = konfiguriere(game, 'vortex', 60, 'balanced');
  const { spieler: klein } = konfiguriere(game, 'core', 1, 'blank');
  gross.position = { x: 3000, y: 2000 };
  klein.position = { x: 3120, y: 2000 };
  gross.move = { x: 0, y: 0 };

  let now = 100_000;
  let ticks = 0;
  const MAX_TICKS = Math.round(30 / DT);
  while (!gross.dead && ticks < MAX_TICKS) {
    klein.aim = { x: gross.position.x - klein.position.x, y: gross.position.y - klein.position.y };
    klein.primary = true;
    gross.primary = false;
    game.step(DT, (now += 25));
    ticks += 1;
  }
  const sekunden = ticks * DT;
  console.log(`L1 Core gegen unbewegliches L60 Vortex: ${gross.dead ? 'tot nach' : 'ÜBERLEBT über'} ${sekunden.toFixed(2)} s (${ticks} Ticks)`);
}

// ------------------------------------------------------------------ 4
console.log('\n=== 4. Flucht-Tempo: getroffen gegen ungetroffen, beide auf Vollgas ===');
{
  // Beide fahren unter identischen Bedingungen los (Beschleunigungsrampe
  // gleich) – nur einer bekommt den Treffer vom L60. Genug Ticks, um die
  // Rampe hinter sich zu lassen (core: ~0,3 s bis Reisetempo).
  const game = neuesSpiel();
  const { id: grossId } = konfiguriere(game, 'vortex', 60, 'balanced');
  const { spieler: getroffen } = konfiguriere(game, 'core', 1, 'blank');
  const { spieler: ungetroffen } = konfiguriere(game, 'core', 1, 'blank');
  getroffen.velocity = { x: 0, y: 0 };
  ungetroffen.velocity = { x: 0, y: 0 };
  getroffen.move = { x: -1, y: 0 };
  ungetroffen.move = { x: -1, y: 0 };

  let now = 100_000;
  game.damagePlayer(getroffen, 10, grossId, now);
  const RAMPE_TICKS = 20;
  for (let tick = 0; tick < RAMPE_TICKS; tick += 1) {
    now += 25;
    game.step(DT, now);
  }
  const statsKlein = tunedStatsFor(getroffen);
  const tempoGetroffen = Math.hypot(getroffen.velocity.x, getroffen.velocity.y);
  const tempoUngetroffen = Math.hypot(ungetroffen.velocity.x, ungetroffen.velocity.y);
  console.log(`Reisetempo ohne Bonus:        ${Math.round(tempoUngetroffen)} px/s (Klassentempo ${Math.round(statsKlein.moveSpeed)})`);
  console.log(`Reisetempo mit Flucht-Bonus:  ${Math.round(tempoGetroffen)} px/s (+${((tempoGetroffen / tempoUngetroffen - 1) * 100).toFixed(0)} %, ${(2500 / 1000).toFixed(1)} s lang)`);
}

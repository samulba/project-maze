// Gegenprobe Befund 72: Wie laege der maxHealth-Slot OHNE die beiden
// Familien-Slots (FAMILY_UPGRADES_ENABLED=false bzw. keine offene Familie)?
// Minimale Kette: hardenSimulation + tuneCombatScaling + tuneFamilyUpgrades([]).
import { MazeGame } from '../../apps/server/dist/game.js';
import { hardenSimulation } from '../../apps/server/dist/simulation-hardening.js';
import { tuneCombatScaling } from '../../apps/server/dist/combat-tuning.js';
import { tuneFamilyUpgrades } from '../../apps/server/dist/family-upgrades.js';
import { GAME, EMPTY_UPGRADES } from '../../packages/shared/dist/index.js';

const game = tuneFamilyUpgrades(tuneCombatScaling(hardenSimulation(new MazeGame(18))), []);
const players = [...game.players.values()].filter((p) => p.bot);
for (const style of ['farmer', 'hunter', 'kiter', 'brawler', 'controller']) {
  const p = players.find((q) => q.bot.style === style);
  p.dead = false;
  p.playerClass = p.bot.classPath[p.bot.classPath.length - 1];
  p.upgrades = EMPTY_UPGRADES();
  const sequence = [];
  for (let k = 0; k < 120; k += 1) {
    const before = { ...p.upgrades };
    p.availablePoints = 1;
    game.spendBotPoints(p);
    const changed = Object.keys(p.upgrades).find((u) => p.upgrades[u] !== before[u]);
    if (!changed) break;
    sequence.push(changed);
  }
  const firstHp = sequence.indexOf('maxHealth');
  const needed = firstHp < 0 ? Infinity : firstHp + 1;
  console.log(`${style}: maxHealth-Punkt Nr. ${needed} -> Level ${needed + 1} (maxLevel ${GAME.maxLevel}) -> ${needed + 1 > GAME.maxLevel ? 'UNERREICHBAR' : 'erreichbar'}`);
}

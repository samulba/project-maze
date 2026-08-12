// Befund 74, Zusatz: Methoden-Check. Gleiche Zellen wie messung-74-treffer,
// aber der Mensch wird je Tick auf die Kreisbahn TELEPORTIERT (velocity = 0)
// statt per move-Eingabe zu fahren. Der Bot-Vorhalt rechnet mit
// enemy.velocity - bei Teleport ist die 0, der Vorhalt faellt komplett aus.
// Prueft, ob so die niedrigen, eng beieinanderliegenden Quoten des Befunds
// entstehen (dann waere die Befund-Messung ein Artefakt der Zielfuehrung).
import { buildGame, botState, botTierFor, median } from './stack.mjs';

const DT = 0.025, TICK = 25, DUR_MS = 120_000;
const P = { x: 4500, y: 3000 };
const TIER_SETUP = { veteran: { spawn: 1, keep: 0 }, rookie: { spawn: 2, keep: 1 }, elite: { spawn: 4, keep: 3 } };
const SPEED = 282; // twin-Bodentempo, wie im Fahr-Szenario
const ZERO_UPGRADES = () => ({ maxHealth: 0, regen: 0, moveSpeed: 0, reload: 0, damage: 0, projectileSpeed: 0, penetration: 0, bodyDamage: 0, projectileRange: 0, signatureRate: 0, signaturePower: 0 });

function pinLoadout(p) {
  p.playerClass = 'twin'; p.level = 20; p.upgrades = ZERO_UPGRADES();
  p.passiveModifier = 'standard'; p.invulnerable = false; p.invulnerableUntil = 0;
}

function runCell(tier, radius, v2) {
  const game = buildGame({ botCount: 0, mode: 'ffa', director: false, v2 });
  const internals = game;
  const { spawn, keep } = TIER_SETUP[tier];
  const ids = [];
  for (let i = 0; i < spawn; i += 1) ids.push(internals.createPlayer(`B${i}`, true, botState(1)));
  let now = 1_000_000;
  game.step(DT, now); now += TICK;
  const botId = ids[keep];
  for (const id of ids) if (id !== botId) game.removePlayer(id);
  if (botTierFor(game, botId) !== tier) throw new Error('Tier-Setup fehlgeschlagen');
  const humanId = game.addPlayer('Mensch');
  const bot = internals.players.get(botId);
  const human = internals.players.get(humanId);
  bot.position = { ...P };

  let hits = 0, fake = false;
  const origDamage = internals.damagePlayer.bind(internals);
  internals.damagePlayer = (target, damage, attackerId, at) => {
    if (!fake && target.id === humanId && attackerId === botId && !target.dead && !target.invulnerable) hits += 1;
    origDamage(target, damage, attackerId, at);
  };
  let nextFakeHit = now + 3000;
  let projectiles = 0;
  const seen = new Set();
  let phi = 0;

  for (let t = 0; t < DUR_MS / TICK; t += 1) {
    phi += (SPEED / radius) * DT;
    human.position = { x: P.x + Math.cos(phi) * radius, y: P.y + Math.sin(phi) * radius };
    human.velocity = { x: 0, y: 0 };
    human.move = { x: 0, y: 0 };
    pinLoadout(human); pinLoadout(bot);
    game.step(DT, now); now += TICK;
    bot.position = { ...P }; bot.velocity = { x: 0, y: 0 };
    bot.health = bot.maxHealth; human.health = human.maxHealth; human.dead = false;
    if (now >= nextFakeHit) { fake = true; internals.damagePlayer(human, 0.0001, botId, now); fake = false; nextFakeHit = now + 3000; }
    for (const [id, proj] of internals.projectiles) {
      if (proj.ownerId === botId && !seen.has(id)) { seen.add(id); projectiles += 1; }
    }
    if (internals.shapes.size > 0) internals.shapes.clear();
  }
  return { tier, radius, v2, projektile: projectiles, treffer: hits, trefferquote: +(hits / Math.max(1, projectiles) * 100).toFixed(1) };
}

for (const v2 of [false, true]) {
  for (const radius of [200, 420]) {
    for (const tier of ['rookie', 'veteran', 'elite']) console.log(JSON.stringify(runCell(tier, radius, v2)));
  }
}

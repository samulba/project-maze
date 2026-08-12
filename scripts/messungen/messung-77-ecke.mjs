// Befund 77: Einseitige Deckung im Maze. Hunter-Bot + ortsfeste Mensch-Attrappe:
//   Phase A: freie Sicht, 320 px Abstand -> Zeit bis Zielaufnahme / erster Schuss
//   Phase B: Mensch 120 px um die Ecke (Sichtlinie bricht) -> Zeit bis Zielverlust
//   Phase C: 60 s weiterlaufen -> findet der Bot den Menschen wieder? Enddistanz?
//   Kontrolle: ohne Sichtlinie von Anfang an, 40 s -> Enddistanz.
// Feste Uhr (25 ms), geseedeter Math.random (mulberry32), 10 Seeds.
//
// Schichtung wie index.ts, mit den Env-Defaults, MINUS drei Schichten (dokumentiert):
//   tuneArenaDirector AUS (würde die kontrollierte 1-Bot-Arena auf 18 auffüllen),
//   tuneArenaSystems/tuneArenaEvents AUS (Bounty/Events = Störquellen; bountyTargetIdFor
//   liefert ohne die Schicht null, der Zielwahl-Pfad in bot-brain läuft identisch).
import { setArenaMode, hasLineOfSight, isFree } from '../../apps/server/dist/world.js';
setArenaMode('maze');

const D = '../../apps/server/dist';
const { MazeGame, botState } = await import(`${D}/game.js`);
const { hardenSimulation } = await import(`${D}/simulation-hardening.js`);
const { tuneProjectileSpeed } = await import(`${D}/projectile-speed.js`);
const { tuneCombatScaling } = await import(`${D}/combat-tuning.js`);
const { tuneHitDirection } = await import(`${D}/hit-direction.js`);
const { tuneFamilyUpgrades } = await import(`${D}/family-upgrades.js`);
const { DEFAULT_CHARGE, tunePrecisionSignature } = await import(`${D}/signature-precision.js`);
const { DEFAULT_MOMENTUM, tuneRapidSignature, tuneRapidBots } = await import(`${D}/signature-rapid.js`);
const { DEFAULT_WUCHT, tuneImpactSignature } = await import(`${D}/signature-impact.js`);
const { DEFAULT_HEAT, tuneTempestSignature } = await import(`${D}/signature-tempest.js`);
const { DEFAULT_STEALTH, tuneSpecterSignature } = await import(`${D}/signature-specter.js`);
const { DEFAULT_SCHILD, tuneAegisSignature } = await import(`${D}/signature-aegis.js`);
const { DEFAULT_STELLUNG, tuneSiegeSignature } = await import(`${D}/signature-siege.js`);
const { tuneDrones } = await import(`${D}/drone-tuning.js`);
const { DEFAULT_BUDGET, tuneControlSignature } = await import(`${D}/signature-control.js`);
const { tuneClassMechanics } = await import(`${D}/class-mechanics.js`);
const { tunePerks } = await import(`${D}/perks.js`);
const { DEFAULT_BOT_PACING, tuneBotBrain } = await import(`${D}/bot-brain.js`);
const { tuneProgression } = await import(`${D}/progression-tuning.js`);
const { tuneLoadoutSystem } = await import(`${D}/loadout-system.js`);

// ---- Koordinatensuche auf der echten Maze-Karte ----
// Bot-Anker laut Befund: (1640, 600). Suche P1 (320 px, Sicht frei) und
// P2 = P1 + 120 px (Sicht gebrochen), bevorzugt dist(Bot,P2) nahe 414.
const BOT_POS = { x: 1640, y: 600 };
const R = 30;
function findSpots() {
  if (!isFree(BOT_POS, R)) throw new Error('Bot-Anker nicht frei');
  let best = null;
  for (let a = 0; a < 360; a += 3) {
    const p1 = { x: BOT_POS.x + 320 * Math.cos(a * Math.PI / 180), y: BOT_POS.y + 320 * Math.sin(a * Math.PI / 180) };
    if (!isFree(p1, R) || !hasLineOfSight(BOT_POS, p1)) continue;
    for (let b = 0; b < 360; b += 5) {
      const p2 = { x: p1.x + 120 * Math.cos(b * Math.PI / 180), y: p1.y + 120 * Math.sin(b * Math.PI / 180) };
      if (!isFree(p2, R) || hasLineOfSight(BOT_POS, p2)) continue;
      const d2 = Math.hypot(p2.x - BOT_POS.x, p2.y - BOT_POS.y);
      const score = Math.abs(d2 - 414);
      if (!best || score < best.score) best = { p1, p2, d2, score };
    }
  }
  if (!best) throw new Error('keine Ecke gefunden');
  return best;
}
const spots = findSpots();
console.log(`Bot (${BOT_POS.x}, ${BOT_POS.y}); Mensch sichtbar P1 (${spots.p1.x.toFixed(0)}, ${spots.p1.y.toFixed(0)}), ` +
  `versteckt P2 (${spots.p2.x.toFixed(0)}, ${spots.p2.y.toFixed(0)}), dist(Bot,P2)=${spots.d2.toFixed(0)} px, ` +
  `LOS P1=${hasLineOfSight(BOT_POS, spots.p1)}, LOS P2=${hasLineOfSight(BOT_POS, spots.p2)}`);

// ---- Seeded RNG ----
const mulberry32 = (seed) => () => {
  seed |= 0; seed = seed + 0x6D2B79F5 | 0;
  let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
  t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
  return ((t ^ t >>> 14) >>> 0) / 4294967296;
};

function buildGame() {
  let game = hardenSimulation(new MazeGame(0));
  game = tuneProjectileSpeed(game, true);
  game = tuneCombatScaling(game);
  game = tuneHitDirection(game);
  game = tuneFamilyUpgrades(game, ['rapid','impact','precision','control','specter','tempest','siege','aegis']);
  game = tunePrecisionSignature(game, true, DEFAULT_CHARGE, true);
  game = tuneRapidSignature(game, true, DEFAULT_MOMENTUM, true);
  game = tuneImpactSignature(game, true, DEFAULT_WUCHT, true);
  game = tuneTempestSignature(game, true, DEFAULT_HEAT, true);
  game = tuneSpecterSignature(game, true, DEFAULT_STEALTH, true);
  game = tuneAegisSignature(game, true, DEFAULT_SCHILD, true);
  game = tuneSiegeSignature(game, true, DEFAULT_STELLUNG, true);
  game = tuneDrones(game);
  game = tuneControlSignature(game, true, DEFAULT_BUDGET, true);
  game = tuneClassMechanics(game);
  game = tunePerks(game, true);
  game = tuneBotBrain(game, DEFAULT_BOT_PACING);
  game = tuneRapidBots(game, true);
  game = tuneProgression(game);
  game = tuneLoadoutSystem(game, true, false);
  return game;
}

function setup(game, humanPos, now) {
  // Hunter-Bot: botState(1) -> Stil 'hunter' (BOT_STYLES[1]); brainFor vergibt
  // Tier über den internen Zähler (erster Bot -> Index 1 -> 'veteran').
  const botId = game.createPlayer('Jaeger', true, botState(1));
  const humanId = game.addPlayer('Mensch');
  const bot = game.players.get(botId);
  const human = game.players.get(humanId);
  bot.position = { ...BOT_POS };
  human.position = { ...humanPos };
  for (const p of [bot, human]) { p.velocity = { x: 0, y: 0 }; p.invulnerable = false; p.invulnerableUntil = 0; }
  // Beide Level 20: Mensch über dem Anfängerschutz (Level < 8 wird nicht gejagt),
  // kein Level-Malus in der Zielbewertung.
  bot.level = 20; human.level = 20;
  human.move = { x: 0, y: 0 }; human.primary = false; human.aim = { x: 0, y: 1 };
  return { botId, humanId, bot, human };
}

const DT = 0.025;
const results = [];
for (let seed = 1; seed <= 10; seed++) {
  const origRandom = Math.random;
  Math.random = mulberry32(seed * 7919);
  try {
    let now = Date.now();
    const game = buildGame();
    const { botId, humanId, bot, human } = setup(game, spots.p1, now);
    const r = { seed };

    // Phase A: freie Sicht -> Zielaufnahme + erster Schuss
    let tAcquire = null, tShot = null;
    for (let i = 1; i <= 400 && (tAcquire === null || tShot === null); i++) {
      game.step(DT, now); now += 25;
      human.position = { ...spots.p1 }; human.velocity = { x: 0, y: 0 }; // Attrappe bleibt stehen
      if (tAcquire === null && bot.bot.targetId === humanId) tAcquire = i * 25;
      if (tShot === null && [...game.projectiles.values()].some((p) => p.ownerId === botId)) tShot = i * 25;
    }
    r.acquireMs = tAcquire; r.firstShotMs = tShot;
    if (tAcquire === null) { results.push(r); continue; }

    // 2 s halten, dann Phase B: Mensch 120 px um die Ecke
    for (let i = 0; i < 80; i++) { game.step(DT, now); now += 25; human.position = { ...spots.p1 }; human.velocity = { x: 0, y: 0 }; }
    r.heldBeforeStep = bot.bot.targetId === humanId;
    human.position = { ...spots.p2 }; human.velocity = { x: 0, y: 0 };
    let tDrop = null, newTarget = null;
    for (let i = 1; i <= 400 && tDrop === null; i++) {
      game.step(DT, now); now += 25;
      human.position = { ...spots.p2 }; human.velocity = { x: 0, y: 0 };
      if (bot.bot.targetId !== humanId) { tDrop = i * 25; newTarget = bot.bot.targetId ? 'anderer Spieler' : (bot.bot.targetShapeId ? 'Form' : 'nichts'); }
    }
    r.dropMs = tDrop; r.newTarget = newTarget;

    // Phase C: 60 s frei laufen, Mensch bleibt bei P2
    let reacquired = false, minDist = Infinity;
    for (let i = 1; i <= 2400; i++) {
      game.step(DT, now); now += 25;
      human.position = { ...spots.p2 }; human.velocity = { x: 0, y: 0 }; human.primary = false;
      if (human.dead) { human.dead = false; human.health = human.maxHealth; } // Attrappe unsterblich halten
      if (bot.bot.targetId === humanId) reacquired = true;
      if (!bot.dead) minDist = Math.min(minDist, Math.hypot(bot.position.x - human.position.x, bot.position.y - human.position.y));
    }
    r.reacquired = reacquired; r.minDist = Math.round(minDist);
    r.endDist = Math.round(Math.hypot(bot.position.x - human.position.x, bot.position.y - human.position.y));
    results.push(r);
  } finally {
    Math.random = origRandom;
  }
}

console.log('\nPhase A-C (Mensch erst sichtbar bei P1, dann 120 px um die Ecke nach P2):');
for (const r of results) console.log(JSON.stringify(r));
const num = (k) => results.map((r) => r[k]).filter((v) => typeof v === 'number').sort((a, b) => a - b);
const med = (a) => a.length ? a[Math.floor(a.length / 2)] : NaN;
console.log(`\nZielaufnahme ms: median=${med(num('acquireMs'))} min=${num('acquireMs')[0]} max=${num('acquireMs').at(-1)}`);
console.log(`Erster Schuss ms: median=${med(num('firstShotMs'))}`);
console.log(`Zielverlust ms: median=${med(num('dropMs'))} min=${num('dropMs')[0]} max=${num('dropMs').at(-1)}`);
console.log(`Wiedergefunden: ${results.filter((r) => r.reacquired).length} von ${results.length}`);
console.log(`Enddistanz nach 60 s: median=${med(num('endDist'))} min=${num('endDist')[0]} max=${num('endDist').at(-1)}`);
console.log(`Minimaldistanz in Phase C: median=${med(num('minDist'))} min=${num('minDist')[0]}`);

// Kontrolle: ohne Sichtlinie von Anfang an, 40 s
const ctrl = [];
for (let seed = 1; seed <= 10; seed++) {
  const origRandom = Math.random;
  Math.random = mulberry32(seed * 104729);
  try {
    let now = Date.now();
    const game = buildGame();
    const { humanId, bot, human } = setup(game, spots.p2, now);
    let acquired = false;
    for (let i = 1; i <= 1600; i++) {
      game.step(DT, now); now += 25;
      human.position = { ...spots.p2 }; human.velocity = { x: 0, y: 0 }; human.primary = false;
      if (human.dead) { human.dead = false; human.health = human.maxHealth; }
      if (bot.bot.targetId === humanId) acquired = true;
    }
    ctrl.push({ seed, acquired, endDist: Math.round(Math.hypot(bot.position.x - human.position.x, bot.position.y - human.position.y)) });
  } finally {
    Math.random = origRandom;
  }
}
console.log('\nKontrolle (nie Sichtlinie, 40 s):');
for (const r of ctrl) console.log(JSON.stringify(r));
const ce = ctrl.map((r) => r.endDist).sort((a, b) => a - b);
console.log(`Enddistanz: median=${med(ce)} min=${ce[0]} max=${ce.at(-1)}; je aufgenommen: ${ctrl.filter((r) => r.acquired).length} von ${ctrl.length}`);

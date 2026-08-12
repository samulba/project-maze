// Befund 74: Trefferquoten rookie/veteran/elite gegen ein kreisendes Ziel.
//
// Methode (dokumentiert, weil ein ortsfester Bot im echten System nicht
// vorgesehen ist):
//  - Bot wird je Tick nach game.step auf einen Fixpunkt zurueckgesetzt
//    (position := P, velocity := 0). Seine Zielrechnung laeuft unveraendert.
//  - Der Mensch faehrt per move-Eingabe (echte Physik) einen Kreis um P:
//    move = Tangente + kleine Radialkorrektur. Konstantes Tempo = volles
//    Klassentempo (twin, 282 px/s), wie "eine Taste halten" im Befund.
//  - Beide je Tick auf twin / Level 20 / Upgrades 0 / Standard-Frame gehalten,
//    wie im Befund ("beide twin/Level 20"). In Produktion truege ein
//    Hunter-Bot den Stabilizer-Frame (+10 % Kugeltempo) - hier Standard,
//    damit die Zahlen mit dem Befund vergleichbar sind.
//  - Tier-Auswahl ueber den brainFor-Zaehler: veteran = 1. Gehirn,
//    rookie = 2., elite = 4.; ueberzaehlige Bots werden nach einem Tick
//    entfernt. Kontrolle per botTierFor.
//  - Stil hunter (styleAggression 1.0), damit der Aggressionswurf (Befund 71)
//    die Messung nicht unterbricht. Gegen den 8-s-Jagd-Timeout wird alle 3 s
//    ein markierter Mini-Treffer (1e-4 Schaden) Bot->Mensch durch die volle
//    Kette geschickt - er stellt lastHitAt neu und wird nicht mitgezaehlt.
//  - Schaden bleibt an; der Mensch wird nach jedem Tick geheilt.
//  - Formen werden entfernt (freie Flugbahn; sonst fangen 562 driftende
//    Formen auf 880 px einen Teil der Kugeln ab).
//  - Treffer = echtes damagePlayer-Ereignis Bot->Mensch (aeusserste Schicht
//    abgehoert). Zusaetzlich je Projektil der minimale Vorbeiflugabstand zum
//    Menschen (Punkt-Segment je Tick, Segment = Projektilweg des Ticks).
//  - Je Zelle 120 s Simulationszeit, feste Uhr, dt 25 ms.
//  - Distanzen 200/420/880 px (880 statt 900: die Feuer-Reichweite der
//    twin-Klasse ist exakt 900, bei 900 drueckt der Bot nie ab).
//  - Jede Zelle einmal mit PROJECTILE_SPEED_V2 an (Produktions-Default) und
//    einmal aus (Stand, den die Formel des Befunds beschreibt).
import { buildGame, botState, botTierFor, median } from './stack.mjs';
import { TIER_PROFILES } from '../../apps/server/dist/bot-brain.js';
import { compensatedLeadFactor } from '../../apps/server/dist/projectile-speed.js';
import { tunedStatsFor } from '../../apps/server/dist/combat-tuning.js';

const DT = 0.025, TICK = 25, DUR_MS = 120_000;
const P = { x: 4500, y: 3000 };
const TIER_SETUP = { veteran: { spawn: 1, keep: 0 }, rookie: { spawn: 2, keep: 1 }, elite: { spawn: 4, keep: 3 } };

const ZERO_UPGRADES = () => ({ maxHealth: 0, regen: 0, moveSpeed: 0, reload: 0, damage: 0, projectileSpeed: 0, penetration: 0, bodyDamage: 0, projectileRange: 0, signatureRate: 0, signaturePower: 0 });

function pinLoadout(p) {
  p.playerClass = 'twin';
  p.level = 20;
  p.upgrades = ZERO_UPGRADES();
  p.passiveModifier = 'standard';
  p.invulnerable = false;
  p.invulnerableUntil = 0;
}

function runCell(tier, radius, v2) {
  const game = buildGame({ botCount: 0, mode: 'ffa', director: false, v2 });
  const internals = game;
  const { spawn, keep } = TIER_SETUP[tier];
  const ids = [];
  for (let i = 0; i < spawn; i += 1) ids.push(internals.createPlayer(`B${i}`, true, botState(1))); // Stil hunter
  let now = 1_000_000;
  game.step(DT, now); now += TICK; // Gehirne anlegen (Reihenfolge = Einfuegereihenfolge)
  const botId = ids[keep];
  for (const id of ids) if (id !== botId) game.removePlayer(id);
  if (botTierFor(game, botId) !== tier) throw new Error(`Tier-Setup fehlgeschlagen: ${botTierFor(game, botId)}`);

  const humanId = game.addPlayer('Mensch');
  const bot = internals.players.get(botId);
  const human = internals.players.get(humanId);
  human.position = { x: P.x + radius, y: P.y };
  bot.position = { ...P };

  // Treffer abhoeren (aeusserste Schicht) + markierte Wartungs-Treffer.
  let hits = 0, fake = false;
  const origDamage = internals.damagePlayer.bind(internals);
  internals.damagePlayer = (target, damage, attackerId, at) => {
    if (!fake && target.id === humanId && attackerId === botId && !target.dead && !target.invulnerable) hits += 1;
    origDamage(target, damage, attackerId, at);
  };
  let nextFakeHit = now + 3000;

  // Projektil-Verfolgung
  const tracked = new Map(); // id -> { min, last }
  const missDistances = [];
  const projSpeeds = [];
  let projectiles = 0;

  const segMinDist = (a, b, p) => {
    const abx = b.x - a.x, aby = b.y - a.y;
    const len2 = abx * abx + aby * aby;
    let t = len2 > 0 ? ((p.x - a.x) * abx + (p.y - a.y) * aby) / len2 : 0;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(a.x + abx * t - p.x, a.y + aby * t - p.y);
  };

  const radii = [];
  for (let t = 0; t < DUR_MS / TICK; t += 1) {
    // Mensch: Kreisfahrt um P
    const rx = human.position.x - P.x, ry = human.position.y - P.y;
    const r = Math.hypot(rx, ry) || 1;
    const radial = { x: rx / r, y: ry / r };
    const tangent = { x: -radial.y, y: radial.x };
    const corr = Math.max(-0.6, Math.min(0.6, (radius - r) * 0.01));
    const mx = tangent.x + radial.x * corr, my = tangent.y + radial.y * corr;
    const ml = Math.hypot(mx, my) || 1;
    human.move = { x: mx / ml, y: my / ml };
    human.primary = false;
    pinLoadout(human);
    pinLoadout(bot);

    game.step(DT, now);
    now += TICK;

    // Bot festhalten, Mensch heilen
    bot.position = { ...P };
    bot.velocity = { x: 0, y: 0 };
    bot.dead = false;
    bot.health = bot.maxHealth;
    human.health = human.maxHealth;
    human.dead = false;

    // Jagd-Timeout neutralisieren (markiert, zaehlt nicht)
    if (now >= nextFakeHit) {
      fake = true;
      internals.damagePlayer(human, 0.0001, botId, now);
      fake = false;
      nextFakeHit = now + 3000;
    }

    // Projektile verfolgen
    for (const [id, proj] of internals.projectiles) {
      if (proj.ownerId !== botId) continue;
      const entry = tracked.get(id);
      if (!entry) {
        projectiles += 1;
        if (projSpeeds.length < 500) projSpeeds.push(Math.hypot(proj.velocity.x, proj.velocity.y));
        tracked.set(id, { min: Math.hypot(proj.position.x - human.position.x, proj.position.y - human.position.y), last: { ...proj.position } });
      } else {
        const d = segMinDist(entry.last, proj.position, human.position);
        if (d < entry.min) entry.min = d;
        entry.last = { ...proj.position };
      }
    }
    for (const [id, entry] of [...tracked]) {
      if (!internals.projectiles.has(id)) { missDistances.push(entry.min); tracked.delete(id); }
    }
    if (t % 8 === 0) radii.push(r);
    if (internals.shapes.size > 0) internals.shapes.clear();
  }

  // Echtes Kugeltempo aus den Projektilen selbst (die Loadout-Schicht setzt
  // player.passiveModifier nach jedem Step auf den ausgeruesteten Frame
  // zurueck, loadout-system.ts:467 - tunedStatsFor NACH dem Lauf saehe daher
  // den Stabilizer-Frame, waehrend die Kugeln mit Standard-Frame abgefeuert
  // wurden, weil der Pin vor jedem Step greift).
  bot.passiveModifier = 'standard';
  const stats = tunedStatsFor(bot);
  const realSpeed = median(projSpeeds);
  const travel = radius / realSpeed;
  const profile = TIER_PROFILES[tier];
  return {
    tier, radius, v2,
    projektile: projectiles,
    treffer: hits,
    trefferquote: +(hits / Math.max(1, projectiles) * 100).toFixed(1),
    medianVorbeiflugPx: +median(missDistances).toFixed(0),
    projTempo: +stats.projectileSpeed.toFixed(0),
    projTempoIst: +realSpeed.toFixed(0),
    flugzeitS: +travel.toFixed(2),
    leadNominal: profile.leadFactor,
    leadEffektiv: +(v2 ? compensatedLeadFactor(profile.leadFactor, travel) : profile.leadFactor).toFixed(2),
    kreisRadiusIst: +median(radii).toFixed(0)
  };
}

for (const v2 of [true, false]) {
  for (const radius of [200, 420, 880]) {
    for (const tier of ['rookie', 'veteran', 'elite']) {
      console.log(JSON.stringify(runCell(tier, radius, v2)));
    }
  }
}

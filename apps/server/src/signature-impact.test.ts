import { describe, expect, it } from 'vitest';
import { CLASS_DEFINITIONS, GAME, PLAYER_CLASS_IDS, type PlayerClass } from '@project-maze/shared';
import { ROOKIE_PROTECTION_LEVEL } from './bot-brain';
import { tuneCombatScaling, tunedStatsFor } from './combat-tuning';
import { tuneFamilyUpgrades } from './family-upgrades';
import { MazeGame } from './game';
import { SIGNATURE_MAX } from './signature';
import {
  DEFAULT_WUCHT,
  WUCHT_MAX_TTK_GAIN,
  isImpactClass,
  tuneImpactSignature,
  wuchtContactDamage,
  wuchtFor
} from './signature-impact';
import { momentumFor, tuneRapidSignature } from './signature-rapid';
import { messfeld } from './messfeld';
import { isFree } from './world';

const DT = 0.025;
// Auf der Karte gesucht statt hingeschrieben (siehe messfeld.ts).
const OPEN_GROUND = messfeld(200);
/** So weit weg, dass keine Signature-Schicht vom einen zum anderen reicht. */
const FAR_AWAY = messfeld(60, 60, { fernVon: OPEN_GROUND, mindestabstand: 2000 });
const IMPACT_CLASSES = PLAYER_CLASS_IDS.filter((id) => CLASS_DEFINITIONS[id].branch === 'impact');

interface Internals {
  players: Map<string, any>;
  shapes: Map<string, any>;
  resolvePlayerCollisions(now: number): void;
}

/**
 * `signaturePower` (KL4) schaltet die Familien-Skalierung mit ein: Der Aufschlag
 * kommt dann aus Sockel + Punkten statt aus dem Festwert. `undefined` heißt
 * „ohne Familien-Upgrades" – der Stand vor KL4.
 */
const setup = (
  attackerClass: PlayerClass,
  victimClass: PlayerClass,
  level: number,
  enabled = true,
  signaturePower?: number
) => {
  const familyUpgrades = signaturePower !== undefined;
  const game = tuneImpactSignature(
    tuneFamilyUpgrades(tuneCombatScaling(new MazeGame(0)), familyUpgrades ? ['impact'] : []),
    enabled,
    DEFAULT_WUCHT,
    familyUpgrades
  );
  const internals = game as unknown as Internals;
  // Shapes spawnen zufällig – die Läufe „ohne" und „mit" Wucht sind zwei
  // verschiedene Welten. Eine Shape am Messpunkt würde dem Opfer zusätzlichen
  // Körperschaden geben und die Zeit-bis-Tod-Messung vom Zufall abhängig
  // machen (Teamplan-Regel 8).
  internals.shapes.clear();
  const attackerId = game.addPlayer('Ramme');
  const victimId = game.addPlayer('Opfer');
  const attacker = internals.players.get(attackerId);
  const victim = internals.players.get(victimId);
  for (const [player, playerClass] of [[attacker, attackerClass], [victim, victimClass]] as const) {
    player.playerClass = playerClass;
    player.level = level;
    player.invulnerable = false;
    player.invulnerableUntil = 0;
    player.maxHealth = tunedStatsFor(player).maxHealth;
    player.health = player.maxHealth;
  }
  if (signaturePower !== undefined) attacker.upgrades.signaturePower = signaturePower;
  attacker.position = { ...OPEN_GROUND };
  victim.position = { ...FAR_AWAY };
  return { game, internals, attackerId, victimId, attacker, victim };
};

/**
 * Anlauf holen: Laufband auf freiem Feld, Opfer außer Reichweite.
 *
 * Das Opfer wird dabei jeden Tick geheilt. Es parkt zehn Sekunden lang in der
 * Arena, und Formen machen Körperschaden – ein angeschlagenes Opfer würde die
 * Zeit bis zum Tod verfälschen und den Deckel-Test scheinbar reißen lassen.
 */
const charge = (game: MazeGame, attacker: any, victim: any, ticks = 400): number => {
  let now = 100_000;
  for (let i = 0; i < ticks; i += 1) {
    now += DT * 1000;
    attacker.move = { x: 1, y: 0 };
    attacker.aim = { x: 200, y: 0 };
    victim.move = { x: 0, y: 0 };
    victim.position = { ...FAR_AWAY };
    game.step(DT, now);
    attacker.position = { ...OPEN_GROUND };
    victim.health = victim.maxHealth;
    victim.dead = false;
  }
  return now;
};

/** Dauerkontakt bis zum Tod des Opfers; gibt die Sekunden zurück. */
const ramUntilDead = (game: MazeGame, attacker: any, victim: any, start: number): number => {
  let now = start;
  let ticks = 0;
  while (!victim.dead && ticks < 40 * 20) {
    now += DT * 1000;
    ticks += 1;
    attacker.move = { x: 1, y: 0 };
    attacker.aim = { x: 200, y: 0 };
    victim.move = { x: 0, y: 0 };
    attacker.position = { ...OPEN_GROUND };
    victim.position = { x: OPEN_GROUND.x + 10, y: OPEN_GROUND.y };
    game.step(DT, now);
  }
  return ticks * DT;
};

/** Dünnster Tank derselben Freischaltstufe – der härteste Fall für den Deckel. */
const thinnestPeer = (playerClass: PlayerClass): PlayerClass => {
  const level = CLASS_DEFINITIONS[playerClass].unlockLevel;
  return PLAYER_CLASS_IDS
    .filter((id) => CLASS_DEFINITIONS[id].unlockLevel === level)
    .sort((a, b) => CLASS_DEFINITIONS[a].maxHealth - CLASS_DEFINITIONS[b].maxHealth)[0]!;
};

describe('impact signature – wucht', () => {
  it('setzt Testannahmen: freies Feld und eine reine Impact-Familie', () => {
    expect(isFree(OPEN_GROUND, 40)).toBe(true);
    expect(isImpactClass('juggernaut')).toBe(true);
    expect(isImpactClass('comet')).toBe(true);
    expect(isImpactClass('storm')).toBe(false);
    expect(isImpactClass('core')).toBe(false);
    expect(IMPACT_CLASSES.length).toBeGreaterThanOrEqual(7);
  });

  it('lädt allein durch Fahren – ohne Feuertaste, anders als Momentum', () => {
    const { game, attacker, victim, attackerId } = setup('juggernaut', 'lancer', 38);
    let now = 100_000;
    for (let i = 0; i < 40; i += 1) {
      now += DT * 1000;
      attacker.move = { x: 1, y: 0 };
      attacker.primary = false;          // ausdrücklich nicht feuern
      victim.position = { ...FAR_AWAY };
      game.step(DT, now);
      attacker.position = { ...OPEN_GROUND };
    }
    expect(wuchtFor(game, attackerId)).toBeGreaterThan(DEFAULT_WUCHT.buildPerSecond * 0.7);

    charge(game, attacker, victim);
    expect(wuchtFor(game, attackerId)).toBe(SIGNATURE_MAX);
    expect(attacker.signature).toBe(SIGNATURE_MAX);
  });

  it('baut im Stand wieder ab', () => {
    const { game, attacker, victim, attackerId } = setup('juggernaut', 'lancer', 38);
    let now = charge(game, attacker, victim);
    expect(wuchtFor(game, attackerId)).toBe(SIGNATURE_MAX);

    for (let i = 0; i < 40; i += 1) {
      now += DT * 1000;
      attacker.move = { x: 0, y: 0 };
      attacker.velocity = { x: 0, y: 0 };
      victim.position = { ...FAR_AWAY };
      game.step(DT, now);
      attacker.position = { ...OPEN_GROUND };
      attacker.velocity = { x: 0, y: 0 };
    }
    expect(SIGNATURE_MAX - wuchtFor(game, attackerId)).toBeCloseTo(DEFAULT_WUCHT.decayPerSecond, 0);
  });

  it('erhöht den Körperschaden genau um den berechneten Faktor', () => {
    const { game, internals, attacker, victim } = setup('rammer', 'sniper', 10);
    const base = CLASS_DEFINITIONS.rammer.bodyDamage * 0.08;
    const now = charge(game, attacker, victim);

    attacker.position = { ...OPEN_GROUND };
    victim.position = { x: OPEN_GROUND.x + 10, y: OPEN_GROUND.y };
    const before = victim.health;
    internals.resolvePlayerCollisions(now + 25);
    const dealt = before - victim.health;

    expect(dealt).toBeCloseTo(wuchtContactDamage(base, SIGNATURE_MAX, victim.maxHealth, victim.level), 6);
    expect(dealt).toBeGreaterThan(base);
  });

  it('deckelt einen Kontakttick auf den Anteil am Maximalleben', () => {
    // Juggernaut gegen einen dünnen Lancer: Hier greift der Anteilsdeckel,
    // nicht der Aufschlag – 8 % von 86 sind weniger als das 2,5-Fache.
    const base = CLASS_DEFINITIONS.juggernaut.bodyDamage * 0.08;
    const victimHealth = 86;
    const capped = wuchtContactDamage(base, SIGNATURE_MAX, victimHealth, 38);
    expect(capped).toBeCloseTo(victimHealth * DEFAULT_WUCHT.maxContactShare, 6);
    expect(capped / base).toBeLessThan(1 + DEFAULT_WUCHT.maxBodyDamageBonus);

    // Und er senkt nie unter den Grundschaden – sonst wäre die Signature
    // gegen dicke Gegner ein Malus.
    expect(wuchtContactDamage(base, 0, 10, 38)).toBe(base);
    expect(wuchtContactDamage(base, SIGNATURE_MAX, 10, 38)).toBeGreaterThanOrEqual(base);
  });

  it('verkürzt die Zeit bis zum Tod nie um mehr als das erlaubte Viertel', () => {
    for (const attackerClass of IMPACT_CLASSES) {
      const level = CLASS_DEFINITIONS[attackerClass].unlockLevel;
      const victimClass = thinnestPeer(attackerClass);

      const plain = setup(attackerClass, victimClass, level, false);
      const baseSeconds = ramUntilDead(plain.game, plain.attacker, plain.victim, 100_000);

      const loaded = setup(attackerClass, victimClass, level, true);
      const start = charge(loaded.game, loaded.attacker, loaded.victim);
      expect(wuchtFor(loaded.game, loaded.attackerId)).toBe(SIGNATURE_MAX);
      const fullSeconds = ramUntilDead(loaded.game, loaded.attacker, loaded.victim, start);

      expect(plain.victim.dead).toBe(true);
      expect(loaded.victim.dead).toBe(true);
      const gain = 1 - fullSeconds / baseSeconds;
      expect(gain, `${attackerClass} vs ${victimClass}`).toBeLessThanOrEqual(WUCHT_MAX_TTK_GAIN);
    }
  });

  it('hält das Viertel auf jeder Stufe von signaturePower', () => {
    // Der wichtigste Test des KL4-Pakets: Der One-Shot-Deckel muss
    // upgrade-fest sein. `maxContactShare` ist absolut und wird von keinem
    // Upgrade angefasst – bewiesen ist das aber erst hier, über alle acht
    // Stufen und jede Impact-Klasse.
    for (const attackerClass of IMPACT_CLASSES) {
      const level = CLASS_DEFINITIONS[attackerClass].unlockLevel;
      const victimClass = thinnestPeer(attackerClass);
      const plain = setup(attackerClass, victimClass, level, false);
      const baseSeconds = ramUntilDead(plain.game, plain.attacker, plain.victim, 100_000);
      expect(plain.victim.dead).toBe(true);

      for (let power = 0; power <= GAME.maxUpgradeLevel; power += 1) {
        const loaded = setup(attackerClass, victimClass, level, true, power);
        const start = charge(loaded.game, loaded.attacker, loaded.victim);
        expect(wuchtFor(loaded.game, loaded.attackerId)).toBe(SIGNATURE_MAX);
        const fullSeconds = ramUntilDead(loaded.game, loaded.attacker, loaded.victim, start);
        expect(loaded.victim.dead).toBe(true);
        const gain = 1 - fullSeconds / baseSeconds;
        expect(gain, `${attackerClass} vs ${victimClass} @ signaturePower ${power}`)
          .toBeLessThanOrEqual(WUCHT_MAX_TTK_GAIN);
      }
    }
  });

  it('wirkt gegen Anfängergeschützte gar nicht', () => {
    const base = CLASS_DEFINITIONS.rammer.bodyDamage * 0.08;
    expect(wuchtContactDamage(base, SIGNATURE_MAX, 200, ROOKIE_PROTECTION_LEVEL - 1)).toBe(base);
    expect(wuchtContactDamage(base, SIGNATURE_MAX, 200, ROOKIE_PROTECTION_LEVEL)).toBeGreaterThan(base);

    // Und zwar auch im Spiel, nicht nur in der Formel.
    const { game, internals, attacker, victim } = setup('rammer', 'sniper', 10);
    victim.level = ROOKIE_PROTECTION_LEVEL - 1;
    const now = charge(game, attacker, victim);
    attacker.position = { ...OPEN_GROUND };
    victim.position = { x: OPEN_GROUND.x + 10, y: OPEN_GROUND.y };
    const before = victim.health;
    internals.resolvePlayerCollisions(now + 25);
    expect(before - victim.health).toBeCloseTo(base, 6);
  });

  it('verbraucht die Ladung beim Aufprall – einmal je Tick, auch bei zwei Opfern', () => {
    const { game, internals, attacker, victim, attackerId } = setup('crusher', 'railgun', 24);
    const now = charge(game, attacker, victim);
    expect(wuchtFor(game, attackerId)).toBe(SIGNATURE_MAX);

    // Zweites Opfer direkt daneben: Der Verbrauch darf sich nicht verdoppeln.
    const secondId = game.addPlayer('Opfer 2');
    const second = internals.players.get(secondId);
    second.playerClass = 'railgun';
    second.level = 24;
    second.invulnerable = false;
    second.invulnerableUntil = 0;
    second.maxHealth = tunedStatsFor(second).maxHealth;
    second.health = second.maxHealth;

    attacker.position = { ...OPEN_GROUND };
    victim.position = { x: OPEN_GROUND.x + 10, y: OPEN_GROUND.y };
    second.position = { x: OPEN_GROUND.x - 10, y: OPEN_GROUND.y };
    attacker.move = { x: 1, y: 0 };
    game.step(DT, now + 25);

    const spent = SIGNATURE_MAX - wuchtFor(game, attackerId);
    // Genau ein Tick Verbrauch. Der Aufbau derselben Fahrt fällt weg, weil der
    // Zähler schon am Deckel stand – doppelter Verbrauch wären 30.
    expect(spent).toBeCloseTo(DEFAULT_WUCHT.contactDrainPerSecond * DT, 4);
    // Beide Opfer haben etwas abbekommen – der Deckel gilt trotzdem nur einmal.
    expect(victim.health).toBeLessThan(victim.maxHealth);
    expect(second.health).toBeLessThan(second.maxHealth);
  });

  it('verstärkt nur Körperkontakt, keinen Projektil- oder Formschaden', () => {
    const { game, internals, attacker, victim, attackerId } = setup('juggernaut', 'lancer', 38);
    charge(game, attacker, victim);
    expect(wuchtFor(game, attackerId)).toBe(SIGNATURE_MAX);

    // Schaden außerhalb von `resolvePlayerCollisions` – also alles, was nicht
    // Rammen ist – bleibt exakt so, wie er hereingereicht wurde.
    const before = victim.health;
    (internals as unknown as {
      damagePlayer(target: any, damage: number, attackerId: string | null, now: number): void;
    // Bewusst klein gewählt: 2 liegt unter dem Anteilsdeckel (8 % von 86 sind
    // 6,88), ein durchschlagender Aufschlag wäre hier also sichtbar.
    }).damagePlayer(victim, 2, attackerId, 100_000);
    expect(before - victim.health).toBeCloseTo(2, 6);
    // Und die Ladung wurde dafür auch nicht angerührt.
    expect(wuchtFor(game, attackerId)).toBe(SIGNATURE_MAX);
  });

  it('verbraucht nur im Kontakt – danach lädt der Anlauf wieder auf', () => {
    const { game, attacker, victim, attackerId } = setup('crusher', 'railgun', 24);
    let now = charge(game, attacker, victim);

    // Ein Tick Kontakt …
    attacker.position = { ...OPEN_GROUND };
    victim.position = { x: OPEN_GROUND.x + 10, y: OPEN_GROUND.y };
    attacker.move = { x: 1, y: 0 };
    now += DT * 1000;
    game.step(DT, now);
    const afterContact = wuchtFor(game, attackerId);
    expect(afterContact).toBeLessThan(SIGNATURE_MAX);

    // … danach fährt er allein weiter. Ohne Kontakt darf nichts mehr abgezogen
    // werden, sonst wäre ein einziger Treffer ein dauerhafter Malus.
    for (let i = 0; i < 20; i += 1) {
      now += DT * 1000;
      attacker.move = { x: 1, y: 0 };
      victim.position = { ...FAR_AWAY };
      game.step(DT, now);
      attacker.position = { ...OPEN_GROUND };
    }
    const rebuilt = wuchtFor(game, attackerId);
    expect(rebuilt - afterContact).toBeCloseTo(DEFAULT_WUCHT.buildPerSecond * 20 * DT, 4);
  });

  it('lässt Klassen außerhalb der Impact-Familie unberührt', () => {
    const { game, internals, attacker, victim, attackerId } = setup('deadeye', 'lancer', 38);
    const base = CLASS_DEFINITIONS.deadeye.bodyDamage * 0.08;
    const now = charge(game, attacker, victim);
    expect(attacker.signature).toBeUndefined();
    expect(wuchtFor(game, attackerId)).toBe(0);

    attacker.position = { ...OPEN_GROUND };
    victim.position = { x: OPEN_GROUND.x + 10, y: OPEN_GROUND.y };
    const before = victim.health;
    internals.resolvePlayerCollisions(now + 25);
    expect(before - victim.health).toBeCloseTo(base, 6);
  });

  it('räumt das Feld bei Tod und Familienwechsel', () => {
    const { game, attacker, victim, attackerId } = setup('juggernaut', 'lancer', 38);
    let now = charge(game, attacker, victim);
    expect(attacker.signature).toBe(SIGNATURE_MAX);

    attacker.dead = true;
    now += DT * 1000;
    game.step(DT, now);
    expect(attacker.signature).toBe(0);
    expect(wuchtFor(game, attackerId)).toBe(0);

    // Der Auto-Respawn hat die Klasse auf das Respawn-Level heruntergestuft;
    // für den zweiten Teil des Tests wieder ein echter Juggernaut.
    attacker.dead = false;
    attacker.playerClass = 'juggernaut';
    attacker.level = 38;
    charge(game, attacker, victim, 40);
    expect(wuchtFor(game, attackerId)).toBeGreaterThan(0);
    attacker.playerClass = 'core';
    now += DT * 1000;
    game.step(DT, now);
    expect(attacker.signature).toBeUndefined();
    expect(wuchtFor(game, attackerId)).toBe(0);
  });

  it('kommt der Rapid-Signature nicht ins Gehege', () => {
    // Beide Schichten teilen sich den Unterbau – sie dürfen sich das Feld des
    // jeweils anderen weder überschreiben noch löschen.
    const game = tuneImpactSignature(tuneRapidSignature(tuneCombatScaling(new MazeGame(0)), true), true);
    const internals = game as unknown as Internals;
    const rammerId = game.addPlayer('Ramme');
    const stormId = game.addPlayer('Sturm');
    const rammer = internals.players.get(rammerId);
    const storm = internals.players.get(stormId);
    for (const [player, playerClass, position] of [
      [rammer, 'juggernaut', OPEN_GROUND],
      [storm, 'storm', FAR_AWAY]
    ] as const) {
      player.playerClass = playerClass;
      player.level = 38;
      player.invulnerable = false;
      player.invulnerableUntil = 0;
      player.position = { ...position };
      player.maxHealth = tunedStatsFor(player).maxHealth;
      player.health = player.maxHealth;
    }

    let now = 100_000;
    for (let i = 0; i < 400; i += 1) {
      now += DT * 1000;
      for (const player of [rammer, storm]) {
        player.move = { x: 1, y: 0 };
        player.aim = { x: 200, y: 0 };
        player.primary = true;
      }
      game.step(DT, now);
      rammer.position = { ...OPEN_GROUND };
      storm.position = { ...FAR_AWAY };
    }

    expect(wuchtFor(game, rammerId)).toBe(SIGNATURE_MAX);
    expect(momentumFor(game, stormId)).toBe(SIGNATURE_MAX);
    expect(rammer.signature).toBe(SIGNATURE_MAX);
    expect(storm.signature).toBe(SIGNATURE_MAX);
    // Und keine der beiden Schichten trägt für den jeweils anderen etwas ein.
    expect(momentumFor(game, rammerId)).toBe(0);
    expect(wuchtFor(game, stormId)).toBe(0);
  });

  it('verhält sich ohne Flag exakt wie vorher', () => {
    const { game, internals, attacker, victim, attackerId } = setup('juggernaut', 'lancer', 38, false);
    const base = CLASS_DEFINITIONS.juggernaut.bodyDamage * 0.08;
    const now = charge(game, attacker, victim);

    expect(attacker.signature).toBeUndefined();
    expect(wuchtFor(game, attackerId)).toBe(0);
    expect(game.snapshot(attackerId).players[0]?.signature).toBeUndefined();

    attacker.position = { ...OPEN_GROUND };
    victim.position = { x: OPEN_GROUND.x + 10, y: OPEN_GROUND.y };
    const before = victim.health;
    internals.resolvePlayerCollisions(now + 25);
    expect(before - victim.health).toBeCloseTo(base, 6);
  });

  it('trägt den gerundeten Wert in den Snapshot', () => {
    const { game, attacker, victim, attackerId } = setup('comet', 'lancer', 38);
    charge(game, attacker, victim, 60);

    const entry = game.snapshot(attackerId).players.find((candidate) => candidate.id === attackerId);
    expect(entry?.signature).toBe(Math.round(wuchtFor(game, attackerId)));
    expect(Number.isInteger(entry?.signature)).toBe(true);
    expect(entry!.signature).toBeGreaterThan(0);
    expect(entry!.signature).toBeLessThan(SIGNATURE_MAX);
  });
});

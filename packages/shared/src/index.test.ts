import { describe, expect, it } from 'vitest';
import {
  CLASS_DEFINITIONS,
  PLAYER_CLASS_IDS,
  PROJECTILE_UPGRADE_IDS,
  UPGRADE_IDS,
  upgradeAppliesTo,
  availableClassChoices,
  classAvailableAtLevel,
  respawnClassFrom,
  respawnLevelFrom,
  sanitizePlayerName,
  upgradePointsAtLevel
} from './index';

describe('progression and input rules', () => {
  it('keeps half the level on death', () => {
    expect(respawnLevelFrom(40)).toBe(20);
    expect(respawnLevelFrom(25)).toBe(12);
    expect(respawnLevelFrom(3)).toBe(1);
  });

  it('unlocks all intended direct children at the tier levels', () => {
    // Klassen 4.0: erste Wahl auf 5 zwischen SECHS Familien, dann 15/28/42.
    expect(availableClassChoices('core', 4)).toEqual([]);
    expect(availableClassChoices('core', 5)).toEqual(['rapid', 'sniper', 'drone', 'rammer', 'specter', 'tempest', 'siege', 'aegis']);
    expect(availableClassChoices('rapid', 15)).toEqual(['twin', 'repeater', 'flanker', 'vanguard']);
    expect(availableClassChoices('sniper', 15)).toEqual(['railgun', 'hunter', 'arbalest', 'ballista']);
    expect(availableClassChoices('drone', 15)).toEqual(['warden', 'factory', 'guardian', 'sentinel']);
    expect(availableClassChoices('rammer', 15)).toEqual(['crusher', 'bulwark', 'blitz', 'rampart']);
    expect(availableClassChoices('specter', 15)).toEqual(['wraith', 'shade']);
    expect(availableClassChoices('tempest', 15)).toEqual(['scorch', 'surge']);
    expect(availableClassChoices('twin', 28)).toEqual(['storm']);
    expect(availableClassChoices('repeater', 28)).toEqual(['gatling']);
    expect(availableClassChoices('flanker', 28)).toEqual(['octo']);
    expect(availableClassChoices('railgun', 28)).toEqual(['lancer']);
    expect(availableClassChoices('hunter', 28)).toEqual(['phantom']);
    expect(availableClassChoices('arbalest', 28)).toEqual(['deadeye']);
    expect(availableClassChoices('warden', 28)).toEqual(['overseer']);
    expect(availableClassChoices('factory', 28)).toEqual(['carrier']);
    expect(availableClassChoices('guardian', 28)).toEqual(['hive']);
    expect(availableClassChoices('crusher', 28)).toEqual(['juggernaut']);
    expect(availableClassChoices('bulwark', 28)).toEqual(['fortress']);
    expect(availableClassChoices('blitz', 28)).toEqual(['comet']);
    expect(availableClassChoices('wraith', 28)).toEqual(['mirage']);
    expect(availableClassChoices('shade', 28)).toEqual(['revenant']);
    expect(availableClassChoices('scorch', 28)).toEqual(['inferno']);
    expect(availableClassChoices('surge', 28)).toEqual(['overload']);
    expect(availableClassChoices('siege', 15)).toEqual(['bombard', 'mortar']);
    expect(availableClassChoices('aegis', 15)).toEqual(['bulwarker', 'reflector']);
    expect(availableClassChoices('vanguard', 28)).toEqual(['hailstorm']);
    expect(availableClassChoices('ballista', 28)).toEqual(['siegebreaker']);
    expect(availableClassChoices('sentinel', 28)).toEqual(['aviary']);
    expect(availableClassChoices('rampart', 28)).toEqual(['behemoth']);
  });

  it('offers the family apex from every class of the family at level 42', () => {
    // Der Apex haengt an der Familie, nicht an einem Pfad: Wer bei Gatling
    // steht, verpasst Vortex nicht, nur weil er vor drei Entscheidungen anders
    // abgebogen ist.
    expect(availableClassChoices('gatling', 42)).toContain('vortex');
    expect(availableClassChoices('octo', 42)).toContain('vortex');
    expect(availableClassChoices('lancer', 42)).toContain('eclipse');
    expect(availableClassChoices('hive', 42)).toContain('sovereign');
    expect(availableClassChoices('comet', 42)).toContain('leviathan');
    expect(availableClassChoices('mirage', 42)).toContain('eidolon');
    expect(availableClassChoices('overload', 42)).toContain('cataclysm');
    // Vor Stufe 42 taucht kein Apex auf, und fremde Familien nie.
    expect(availableClassChoices('gatling', 41)).not.toContain('vortex');
    expect(availableClassChoices('gatling', 42)).not.toContain('eclipse');
    // Ein Apex bietet sich nicht selbst an.
    expect(availableClassChoices('vortex', 60)).not.toContain('vortex');
  });

  it('contains exactly 65 unique class definitions', () => {
    expect(PLAYER_CLASS_IDS).toHaveLength(65);
    expect(new Set(PLAYER_CLASS_IDS).size).toBe(65);
    expect(Object.keys(CLASS_DEFINITIONS)).toHaveLength(65);
  });

  it('keeps the class tree structurally valid', () => {
    for (const id of PLAYER_CLASS_IDS) {
      const definition = CLASS_DEFINITIONS[id];
      expect(definition.id).toBe(id);
      if (id === 'core') {
        expect(definition.parent).toBeNull();
        expect(definition.unlockLevel).toBe(1);
        continue;
      }
      expect(definition.parent).not.toBeNull();
      expect(PLAYER_CLASS_IDS).toContain(definition.parent);
      const parent = CLASS_DEFINITIONS[definition.parent!];
      expect(definition.unlockLevel).toBeGreaterThan(parent.unlockLevel);
      expect([5, 15, 28, 42]).toContain(definition.unlockLevel);
      if (parent.id !== 'core') expect(definition.branch).toBe(parent.branch);
      if (definition.barrelAngles) expect(definition.barrelAngles).toHaveLength(definition.barrelCount);
      expect(definition.droneCount === 0 || definition.barrelCount === 0).toBe(true);
    }
    const finalsPerBranch = new Map<string, number>();
    for (const id of PLAYER_CLASS_IDS) {
      const definition = CLASS_DEFINITIONS[id];
      if (definition.unlockLevel !== 28) continue;
      finalsPerBranch.set(definition.branch, (finalsPerBranch.get(definition.branch) ?? 0) + 1);
    }
    for (const branch of ['rapid', 'precision', 'control', 'impact']) {
      expect(finalsPerBranch.get(branch) ?? 0).toBeGreaterThanOrEqual(3);
    }
    // Die neuen Familien sind kleiner (2 Wege je Stufe), aber vollstaendig.
    for (const branch of ['specter', 'tempest', 'siege', 'aegis']) {
      expect(finalsPerBranch.get(branch) ?? 0).toBeGreaterThanOrEqual(2);
    }
    // Jede der sechs Familien hat genau einen Apex.
    const apexes = PLAYER_CLASS_IDS.filter((id) => CLASS_DEFINITIONS[id].apexOf !== undefined);
    expect(apexes).toHaveLength(8);
    expect(new Set(apexes.map((id) => CLASS_DEFINITIONS[id].apexOf)).size).toBe(8);
    for (const id of apexes) expect(CLASS_DEFINITIONS[id].unlockLevel).toBe(42);
  });

  it('falls back to a legal ancestor after respawn', () => {
    expect(classAvailableAtLevel('lancer', 20)).toBe('railgun');
    expect(classAvailableAtLevel('phantom', 15)).toBe('hunter');
    expect(classAvailableAtLevel('carrier', 4)).toBe('core');
    expect(classAvailableAtLevel('overseer', 6)).toBe('drone');
    // Apex faellt ueber den Familien-Starter zurueck.
    expect(classAvailableAtLevel('vortex', 20)).toBe('rapid');
    expect(classAvailableAtLevel('eidolon', 3)).toBe('core');
  });

  /**
   * Sams Befund (07.08.): „wenn es viele level hat und man stirbt ist man
   * direkt in einer klasse die man davor ausgewählt hat, man sollte aber bei
   * der anfangs klasse wieder sein".
   *
   * Der alte Weg lief über `classAvailableAtLevel(klasse, respawnLevel)` – der
   * sucht den nächsten Vorfahren, der auf dem Respawn-Level erlaubt ist. Wer
   * als Gatling auf 60 starb, kam auf 30 als Gatling zurück: erlaubt, also
   * behalten. Damit war der Wiedereinstieg keine Entscheidung mehr, sondern
   * eine Fortsetzung – und der ganze Baum blieb ungesehen.
   */
  it('setzt nach dem Tod auf die Anfangsklasse zurueck', () => {
    for (const id of PLAYER_CLASS_IDS) expect(respawnClassFrom(id)).toBe('core');
  });

  /**
   * Sams „es gibt jetzt zu viele Upgrades INGAME" hatte einen messbaren Kern:
   * Für die zehn Drohnenklassen waren drei der zwölf Plätze wirkungslos. Sie
   * haben kein Rohr, und Kugeltempo, Durchschlag und Reichweite werden im
   * Server nur dort gelesen, wo aus einem Rohr etwas herauskommt.
   */
  it('haelt Projektil-Upgrades von Klassen ohne Rohr fern', () => {
    const ohneRohr = PLAYER_CLASS_IDS.filter((id) => CLASS_DEFINITIONS[id].barrelCount === 0);
    expect(ohneRohr.length).toBeGreaterThan(0);
    for (const id of ohneRohr) {
      for (const upgrade of PROJECTILE_UPGRADE_IDS) {
        expect(upgradeAppliesTo(id, upgrade), `${id}/${upgrade}`).toBe(false);
      }
      // Alles andere wirkt sehr wohl – Drohnen erben Schaden, Nachladen und
      // Leben ihres Trägers (`drone-tuning.ts`).
      for (const upgrade of ['damage', 'reload', 'maxHealth', 'regen', 'moveSpeed', 'bodyDamage'] as const) {
        expect(upgradeAppliesTo(id, upgrade), `${id}/${upgrade}`).toBe(true);
      }
    }
  });

  it('laesst Klassen mit Rohr jedes Upgrade', () => {
    const mitRohr = PLAYER_CLASS_IDS.filter((id) => CLASS_DEFINITIONS[id].barrelCount > 0);
    for (const id of mitRohr) {
      for (const upgrade of UPGRADE_IDS) expect(upgradeAppliesTo(id, upgrade), `${id}/${upgrade}`).toBe(true);
    }
  });

  it('sanitizes player names', () => {
    expect(sanitizePlayerName('  <Sam>\n Liba  ')).toBe('Sam Liba');
    expect(sanitizePlayerName('<>')).toBe('');
    expect(sanitizePlayerName('12345678901234567890')).toHaveLength(18);
  });

  it('restores one point per retained level after level one', () => {
    expect(upgradePointsAtLevel(1)).toBe(0);
    expect(upgradePointsAtLevel(20)).toBe(19);
    expect(upgradePointsAtLevel(999)).toBe(59);
  });

  it('keeps sustained bullet damage inside intentional role corridors', () => {
    const dps = (id: keyof typeof CLASS_DEFINITIONS): number => {
      const tank = CLASS_DEFINITIONS[id];
      return tank.barrelCount * tank.damage / Math.max(0.001, tank.reload);
    };

    expect(dps('core')).toBeGreaterThanOrEqual(48);
    expect(dps('core')).toBeLessThanOrEqual(58);
    for (const id of ['rapid', 'sniper'] as const) {
      expect(dps(id)).toBeGreaterThanOrEqual(52);
      expect(dps(id)).toBeLessThanOrEqual(66);
    }
    for (const id of ['twin', 'repeater', 'hunter'] as const) {
      expect(dps(id)).toBeGreaterThanOrEqual(64);
      expect(dps(id)).toBeLessThanOrEqual(82);
    }
    for (const id of ['storm', 'gatling', 'phantom'] as const) {
      expect(dps(id)).toBeGreaterThanOrEqual(78);
      expect(dps(id)).toBeLessThanOrEqual(100);
    }
    expect(dps('railgun')).toBeLessThanOrEqual(70);
    expect(dps('lancer')).toBeLessThanOrEqual(70);
  });
});

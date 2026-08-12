import { describe, expect, it } from 'vitest';
import { CLASS_DEFINITIONS, PLAYER_CLASS_IDS, UPGRADE_IDS, upgradeAppliesTo } from '@project-maze/shared';
import {
  FAMILY_LOCK_HINT,
  FAMILY_UNLOCK_LEVEL,
  FAMILY_UPGRADE_IDS,
  UPGRADE_SLOT_IDS,
  familyUpgradeLabel,
  familyUpgradeLocked,
  hotkeyLabelFor,
  isFamilyUpgrade,
  upgradeHotkeyLabel,
  upgradeHotkeySlots
} from './family-upgrades';
import { DEFAULT_PREDICTION, readPredictionChoice } from './prediction-panel';

describe('Familien-Upgrade-Plätze (KL4)', () => {
  it('hängt die Familien-Slots hinten an, ohne die Basiswerte zu verschieben', () => {
    expect(UPGRADE_SLOT_IDS.slice(0, UPGRADE_IDS.length)).toEqual([...UPGRADE_IDS]);
    for (const id of FAMILY_UPGRADE_IDS) expect(UPGRADE_SLOT_IDS).toContain(id);
  });

  it('führt keinen Platz doppelt – auch nicht, wenn shared die IDs bekommt', () => {
    expect(new Set(UPGRADE_SLOT_IDS).size).toBe(UPGRADE_SLOT_IDS.length);
  });

  it('legt den zehnten Platz auf die Taste 0, nicht auf eine Taste „10"', () => {
    expect(upgradeHotkeyLabel(0)).toBe('1');
    expect(upgradeHotkeyLabel(8)).toBe('9');
    expect(upgradeHotkeyLabel(9)).toBe('0');
    /*
     * Ab dem elften Platz gibt es KEINE Taste mehr -- input.ts kennt nur
     * Digit1-Digit9 und Digit0. Vorher stand dort „11" und „12": eine
     * Abkuerzung, die keine Tastatur hat.
     */
    expect(upgradeHotkeyLabel(10)).toBe('');
    expect(upgradeHotkeyLabel(11)).toBe('');
    // Und es sind wirklich mehr Plaetze als Tasten -- sonst ist der Test blind.
    expect(UPGRADE_SLOT_IDS.length).toBeGreaterThan(10);
  });

  // Befund 17: Die Belegung wandert mit der Klasse. Bei core liefen 9 und 0
  // auf die gesperrten Familien-Slots -- der Neuling las im Onboarding
  // "1-9 und 0", drueckte durch, und bei 9/0 passierte nichts, waehrend die
  // zwei nutzbaren Plaetze dahinter keine Taste hatten.
  it('legt bei core die 9 und 0 auf nutzbare Plätze statt auf gesperrte Familien-Slots', () => {
    const slots = upgradeHotkeySlots('core');
    expect(slots).toHaveLength(10);
    expect(slots).not.toContain('signatureRate');
    expect(slots).not.toContain('signaturePower');
    expect(hotkeyLabelFor(slots, 'projectileRange')).toBe('9');
    expect(hotkeyLabelFor(slots, 'moduleCooldown')).toBe('0');
  });

  it('gibt die 9 und 0 nach der Familienwahl an die Signature-Slots zurück', () => {
    const slots = upgradeHotkeySlots('rapid');
    expect(hotkeyLabelFor(slots, 'signatureRate')).toBe('9');
    expect(hotkeyLabelFor(slots, 'signaturePower')).toBe('0');
    // Die Plätze elf und zwölf haben dann wieder keine Taste.
    expect(hotkeyLabelFor(slots, 'projectileRange')).toBe('');
    expect(hotkeyLabelFor(slots, 'moduleCooldown')).toBe('');
  });

  it('vergibt nie eine Taste an einen Platz, der für die Klasse nichts tut', () => {
    for (const playerClass of PLAYER_CLASS_IDS) {
      const slots = upgradeHotkeySlots(playerClass);
      expect(slots.length).toBeLessThanOrEqual(10);
      for (const id of slots) {
        if (isFamilyUpgrade(id)) expect(familyUpgradeLocked(playerClass)).toBe(false);
        else expect(upgradeAppliesTo(playerClass, id)).toBe(true);
      }
    }
  });

  it('erkennt die beiden Familien-Slots', () => {
    expect(isFamilyUpgrade('signatureRate')).toBe(true);
    expect(isFamilyUpgrade('signaturePower')).toBe(true);
    expect(isFamilyUpgrade('reload')).toBe(false);
  });

  it('beschriftet Rapid mit den Momentum-Wörtern', () => {
    expect(familyUpgradeLabel('storm', 'signatureRate')).toBe('Momentum-Aufbau');
    expect(familyUpgradeLabel('gatling', 'signaturePower')).toBe('Momentum-Maximum');
  });

  it('beschriftet Impact so, dass das Tempo auf dem Tempo-Slot steht', () => {
    // „Aufprall-Erholung" ist das Aufbautempo nach einem Stoß und gehört damit
    // auf `signatureRate`; die Skalierung des Körperschadens auf `signaturePower`.
    expect(familyUpgradeLabel('rammer', 'signatureRate')).toBe('Aufprall-Erholung');
    expect(familyUpgradeLabel('juggernaut', 'signaturePower')).toBe('Wucht-Skalierung');
  });

  it('gibt jeder der acht Familien eigene Woerter – nur Core bleibt neutral', () => {
    // Klassen 4.3: Alle acht Signatures stehen und alle acht Slots wirken, also
    // traegt jede Familie ihren eigenen Namen. Neutral bleibt nur, was keine
    // Familie hat – dieselbe Regel wie beim Signature-Balken: lieber namenlos
    // als falsch benannt.
    expect(familyUpgradeLabel('sniper', 'signatureRate')).toBe('Ladetempo');
    expect(familyUpgradeLabel('warden', 'signaturePower')).toBe('Flotten-Stärke');
    expect(familyUpgradeLabel('shade', 'signaturePower')).toBe('Erstschlag-Bonus');
    expect(familyUpgradeLabel('scorch', 'signatureRate')).toBe('Hitze je Schuss');
    expect(familyUpgradeLabel('bombard', 'signaturePower')).toBe('Stellung-Stärke');
    expect(familyUpgradeLabel('reflector', 'signatureRate')).toBe('Schild-Ladung');
    expect(familyUpgradeLabel('core', 'signatureRate')).toBe('Signature-Tempo');
  });

  it('sperrt beide Plätze ohne Familie und gibt sie mit Familie frei', () => {
    expect(familyUpgradeLocked('core')).toBe(true);
    expect(familyUpgradeLocked('storm')).toBe(false);
    expect(familyUpgradeLocked('rammer')).toBe(false);
    expect(familyUpgradeLocked('sniper')).toBe(false);
    expect(familyUpgradeLocked('warden')).toBe(false);
  });
});

/**
 * Am gesperrten Knopf stand fest „Erst mit einer Familie ab Level 10" --
 * die acht Familien-Starter haben aber `unlockLevel: 5`. Ein Spieler auf
 * Level 6 las dort, er muesse noch vier Level warten, waehrend die Wahl
 * laengst offen stand. Deshalb kommt die Zahl jetzt aus den Daten.
 */
describe('Freischaltstufe der Familien', () => {
  it('nennt die Stufe, ab der wirklich eine Familie zur Wahl steht', () => {
    const stufen = PLAYER_CLASS_IDS
      .filter((id) => CLASS_DEFINITIONS[id].branch !== 'core')
      .map((id) => CLASS_DEFINITIONS[id].unlockLevel);
    expect(FAMILY_UNLOCK_LEVEL).toBe(Math.min(...stufen));
    expect(FAMILY_LOCK_HINT).toContain(String(FAMILY_UNLOCK_LEVEL));
  });

  it('nennt keine Stufe, auf der noch gar nichts offen ist', () => {
    const offenVorher = PLAYER_CLASS_IDS.filter(
      (id) => CLASS_DEFINITIONS[id].branch !== 'core' && CLASS_DEFINITIONS[id].unlockLevel < FAMILY_UNLOCK_LEVEL
    );
    expect(offenVorher).toEqual([]);
  });
});

describe('Schalter der Client-Prediction', () => {
  it('ist ohne gespeicherte Wahl aus (Regel 3)', () => {
    expect(DEFAULT_PREDICTION).toBe(false);
    expect(readPredictionChoice(null)).toBe(false);
  });

  it('liest eine gespeicherte Wahl zurück und ignoriert Unsinn', () => {
    expect(readPredictionChoice('on')).toBe(true);
    expect(readPredictionChoice('off')).toBe(false);
    expect(readPredictionChoice('vielleicht')).toBe(DEFAULT_PREDICTION);
  });
});

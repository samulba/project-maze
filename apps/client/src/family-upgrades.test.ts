import { describe, expect, it } from 'vitest';
import { UPGRADE_IDS } from '@project-maze/shared';
import {
  FAMILY_UPGRADE_IDS,
  UPGRADE_SLOT_IDS,
  familyUpgradeLabel,
  familyUpgradeLocked,
  isFamilyUpgrade,
  upgradeHotkeyLabel
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

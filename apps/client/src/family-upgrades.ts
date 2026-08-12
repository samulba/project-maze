import { CLASS_DEFINITIONS, PLAYER_CLASS_IDS, UPGRADE_IDS, upgradeAppliesTo, type PlayerClass, type UpgradeId } from '@project-maze/shared';

/**
 * Die beiden Familien-Upgrade-Slots (Klassen 3.0/KL4).
 *
 * Wie bei `PlayerSnapshot.signature` gibt es **ein** Paar Slots für alle vier
 * Familien; was sie bedeuten, ergibt sich aus `playerClass`. Dieselbe Ableitung
 * wie beim Signature-Balken, ein Muster statt zwei.
 *
 * **Stand:** Die IDs liegen noch nicht in `packages/shared` – 01 baut sie nach
 * 02s Konzept ein (`docs/status/chat-02/12-kl4-familien-upgrades-konzept.md`).
 * Bis dahin sind sie hier clientlokal definiert. `UPGRADE_SLOT_IDS` hängt sie
 * nur an, wenn sie in `UPGRADE_IDS` fehlen – nach dem Merge verschwindet die
 * Dopplung von selbst, ohne dass hier etwas zurückgebaut werden muss.
 */

export const FAMILY_UPGRADE_IDS = ['signatureRate', 'signaturePower'] as const;
export type FamilyUpgradeId = (typeof FAMILY_UPGRADE_IDS)[number];
export type UpgradeSlotId = UpgradeId | FamilyUpgradeId;

const FAMILY_SET = new Set<string>(FAMILY_UPGRADE_IDS);

export function isFamilyUpgrade(id: string): id is FamilyUpgradeId {
  return FAMILY_SET.has(id);
}

/**
 * Alle Upgrade-Plätze in Anzeigereihenfolge. Enthält `UPGRADE_IDS` unverändert
 * und ergänzt die Familien-Slots nur, solange `shared` sie noch nicht kennt.
 */
export const UPGRADE_SLOT_IDS: readonly UpgradeSlotId[] = [
  ...UPGRADE_IDS,
  ...FAMILY_UPGRADE_IDS.filter((id) => !(UPGRADE_IDS as readonly string[]).includes(id))
];

/**
 * Beschriftungen je Familie.
 *
 * `signatureRate` ist immer das Aufbautempo, `signaturePower` immer die Stärke
 * der Wirkung – so hat 02 die beiden Slots geschnitten.
 *
 * Rapid und Impact tragen die Wörter aus 01s Auftrag. Bei Impact ist die
 * Zuordnung bewusst gedreht: „Aufprall-Erholung" beschreibt, wie schnell die
 * Wucht nach einem Stoß wieder dasteht – das ist das Aufbautempo und gehört
 * damit auf `signatureRate`, nicht auf die Skalierung.
 *
 * Precision und Control bekommen ihre Wörter, wenn ihre Signatures stehen. Bis
 * dahin steht dort die neutrale Variante statt eines erfundenen Familienworts –
 * dieselbe Regel wie beim Signature-Balken: lieber namenlos als falsch benannt.
 */
const FAMILY_LABELS: Partial<Record<string, Record<FamilyUpgradeId, string>>> = {
  rapid: { signatureRate: 'Momentum-Aufbau', signaturePower: 'Momentum-Maximum' },
  impact: { signatureRate: 'Aufprall-Erholung', signaturePower: 'Wucht-Skalierung' },
  // Klassen 4.3: Die vier nachgezogenen Familien bekommen ihre eigenen Wörter,
  // weil ihre Slots jetzt wirklich etwas tun. Bis dahin standen dort die
  // neutralen – und der Knopf war klickbar, ohne zu wirken.
  precision: { signatureRate: 'Ladetempo', signaturePower: 'Ladeschuss-Stärke' },
  control: { signatureRate: 'Nachschub-Tempo', signaturePower: 'Flotten-Stärke' },
  specter: { signatureRate: 'Tarn-Aufbau', signaturePower: 'Erstschlag-Bonus' },
  tempest: { signatureRate: 'Hitze je Schuss', signaturePower: 'Hitze-Schaden' },
  siege: { signatureRate: 'Stellung-Aufbau', signaturePower: 'Stellung-Stärke' },
  aegis: { signatureRate: 'Schild-Ladung', signaturePower: 'Entladungs-Schaden' }
};

const NEUTRAL_LABELS: Record<FamilyUpgradeId, string> = {
  signatureRate: 'Signature-Tempo',
  signaturePower: 'Signature-Stärke'
};

/** Beschriftung des Slots für diese Klasse. */
export function familyUpgradeLabel(playerClass: PlayerClass, slot: FamilyUpgradeId): string {
  const branch = CLASS_DEFINITIONS[playerClass]?.branch;
  return (branch ? FAMILY_LABELS[branch]?.[slot] : undefined) ?? NEUTRAL_LABELS[slot];
}

/**
 * Ohne Familie sind beide Slots gesperrt – der Server lehnt sie dort ab
 * (02s Familiensperre). Ein Knopf, der nichts tut, wäre schlimmer als ein
 * sichtbar gesperrter.
 */
export function familyUpgradeLocked(playerClass: PlayerClass): boolean {
  return (CLASS_DEFINITIONS[playerClass]?.branch ?? 'core') === 'core';
}

/**
 * Ab diesem Level steht die erste Familie zur Wahl – **aus den Daten gelesen,
 * nicht aufgeschrieben.**
 *
 * Hier stand fest „Level 10", und das war falsch: Alle acht Familien-Starter
 * haben `unlockLevel: 5`. Ein Spieler auf Level 6 las an seinen beiden
 * gesperrten Plätzen also, er müsse noch vier Level warten – während die
 * Klassenwahl längst offen stand. Wer sich einmal auf eine falsche Zahl
 * verlässt, glaubt der nächsten auch nicht mehr.
 */
export const FAMILY_UNLOCK_LEVEL = Math.min(
  ...PLAYER_CLASS_IDS
    .filter((id) => CLASS_DEFINITIONS[id].branch !== 'core')
    .map((id) => CLASS_DEFINITIONS[id].unlockLevel)
);

/** Erklärung am gesperrten Knopf – sagt, was fehlt, nicht nur dass etwas fehlt. */
export const FAMILY_LOCK_HINT = `Erst mit einer Familie ab Level ${FAMILY_UNLOCK_LEVEL}`;

/**
 * Tastenbeschriftung eines Slots. Der zehnte Platz liegt auf der **0**, nicht
 * auf einer Taste „10" – `Digit0` bildet im Client auf Index 9 ab.
 */
export function upgradeHotkeyLabel(index: number): string {
  /*
   * Nur die zehn Plaetze, die wirklich eine Taste haben.
   *
   * Die Tastatur bedient `Digit1`-`Digit9` und `Digit0` (input.ts) -- also
   * genau zehn. Der elfte und zwoelfte Platz trugen trotzdem die Marken „11"
   * und „12": eine Abkuerzung, die es auf keiner Tastatur gibt. Wer sie sucht,
   * drueckt zweimal die 1 und vergibt zwei Punkte auf den ersten Platz.
   *
   * Ein leerer Text heisst „diesen Platz gibt es nur zum Klicken"; die Marke
   * faellt dann ganz weg (ui.ts).
   */
  if (index === 9) return '0';
  return index < 9 ? String(index + 1) : '';
}

/**
 * Die zehn Zifferntasten gehören den Plätzen, die für DIESE Klasse gerade
 * nutzbar sind – nicht dem festen Index.
 *
 * Bei `core` liefen 9 und 0 auf die gesperrten Familien-Slots: Der Neuling
 * las im Onboarding „Die Zifferntasten 1–9 und 0 vergeben deine Punkte",
 * drückte durch, und bei 9/0 passierte nichts – während die zwei Plätze, die
 * für ihn funktionierten (Reichweite, Fähigkeit), gar keine Taste hatten
 * (Befund 17). Eine Quelle für ui.ts (kbd-Marken) und input.ts (Digit-Tasten),
 * damit Anzeige und Wirkung nicht auseinanderlaufen können.
 */
export function upgradeHotkeySlots(playerClass: PlayerClass): UpgradeSlotId[] {
  const locked = familyUpgradeLocked(playerClass);
  return UPGRADE_SLOT_IDS
    .filter((id) => (isFamilyUpgrade(id) ? !locked : upgradeAppliesTo(playerClass, id as UpgradeId)))
    .slice(0, 10);
}

/** Marke eines Slots innerhalb einer Belegung; leer = keine Taste. */
export function hotkeyLabelFor(slots: readonly UpgradeSlotId[], id: UpgradeSlotId): string {
  const index = slots.indexOf(id);
  if (index < 0 || index > 9) return '';
  return index === 9 ? '0' : String(index + 1);
}

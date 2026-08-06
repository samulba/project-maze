import { CLASS_DEFINITIONS, GAME, type PlayerClass, type UpgradeId, type UpgradeLevels } from '@project-maze/shared';
import { MazeGame } from './game.js';
import type { MomentumConfig } from './signature-rapid.js';
import type { WuchtConfig } from './signature-impact.js';
import type { ChargeConfig } from './signature-precision.js';

/**
 * Klassen 3.0 – KL4: **Familien-Upgrades**.
 *
 * Zwei familienneutrale Slots (`signatureRate`, `signaturePower`) hängen an
 * `UPGRADE_IDS`; was sie bewirken, ergibt sich aus der Familie des Spielers –
 * dasselbe Muster wie `PlayerSnapshot.signature`.
 *
 * **Variante B (von 01 entschieden):** Der bisherige Signature-Festwert wandert
 * in die Punkte-Ökonomie. Statt „Signature gratis + Upgrade obendrauf" gilt
 * „kleiner Sockel + Punkte". Ohne das konkurrierte ein Punkt in
 * `signaturePower` gegen einen kostenlosen Basiswert auf derselben Achse und
 * wäre 0,4× eines `reload`-Punkts wert gewesen – ein toter Slot. Die Rechnung
 * dazu steht in `docs/status/chat-02/12-kl4-familien-upgrades-konzept.md`.
 *
 * Der Preis, offen benannt: Wer nichts investiert, hat eine deutlich schwächere
 * Signature als vor KL4 (Rapid 0,08 statt 0,25 Nachladeabschlag). Ab KL4
 * bezahlt man die Signature.
 *
 * Diese Datei hält drei Dinge zusammen:
 * 1. die Zahlen (`FAMILY_SCALING`) – eine Quelle für Server, Tests und Report,
 * 2. die reinen Umrechnungen, die `signature-rapid`/`signature-impact` im
 *    Tick benutzen,
 * 3. die Schicht `tuneFamilyUpgrades` mit Familiensperre und Bot-Pfaden.
 */

/** Die beiden familienneutralen Slots. */
export const FAMILY_UPGRADE_IDS = ['signatureRate', 'signaturePower'] as const;
export type FamilyUpgradeId = (typeof FAMILY_UPGRADE_IDS)[number];

/** Familien mit eigener Signature. `core` ist bewusst nicht dabei. */
export type SignatureFamily = 'rapid' | 'impact' | 'precision' | 'control';

const FAMILY_UPGRADE_SET = new Set<string>(FAMILY_UPGRADE_IDS);

export const isFamilyUpgrade = (upgrade: UpgradeId): upgrade is FamilyUpgradeId =>
  FAMILY_UPGRADE_SET.has(upgrade);

/**
 * Die Zahlen aus dem KL4-Konzept, Variante B.
 *
 * `buildPerPoint` gilt für alle Familien gleich: Der Aufbau der Signature
 * steigt um 7,2 % je Punkt, beim Cap von 10 Punkten also auf das 1,72-Fache
 * (Rapid: voll geladen nach 1,94 s statt 3,33 s). Klassen 4.0 hat das Cap von
 * 8 auf 10 gehoben; der VOLLAUSBAU behaelt seine alte Staerke, die Steigung
 * streckt sich - sonst waeren alle geeichten Deckel (One-Shot-Viertel,
 * Ladezeit = Nachladezeit) still ueberschritten worden.
 *
 * Die Sockelwerte sind so gewählt, dass der heutige Festwert bei etwa fünf
 * Punkten wieder erreicht ist – der Slot ist damit weder geschenkt noch eine
 * Pflichtabgabe.
 */
export const FAMILY_SCALING = {
  /** `signatureRate`: Aufbaurate ×(1 + 0,072·n) – Cap 10 → ×1,72 wie zuvor. */
  buildPerPoint: 0.072,
  /** `signaturePower` bei RAPID: `maxReloadBonus`. Heutiger Festwert 0,25. */
  rapid: { powerBase: 0.08, powerPerPoint: 0.0272 },
  /** `signaturePower` bei IMPACT: `maxBodyDamageBonus`. Heutiger Festwert 1,5. */
  impact: { powerBase: 0.5, powerPerPoint: 0.152 },
  /**
   * `signaturePower` bei PRECISION: Anteil des vollen Ladebonus auf Größe und
   * Durchschlag. **Nicht auf den Schaden** – der ist beim Ladeschuss nach oben
   * durch die Ein-Schuss-Grenze verriegelt (Lancer trägt heute 86 % des Lebens
   * des dünnsten Gegners seiner Stufe). Sockel 0,40, voll ausgebaut 1,00.
   */
  precision: { powerBase: 0.4, powerPerPoint: 0.06 }
} as const;

/** Punktestand eines Slots, hart auf den erlaubten Bereich begrenzt. */
export const familyUpgradeLevel = (upgrades: UpgradeLevels, id: FamilyUpgradeId): number =>
  Math.max(0, Math.min(GAME.maxUpgradeLevel, upgrades[id] ?? 0));

/** Aufbaurate der Signature bei `n` Punkten in `signatureRate`. */
export const familyBuildRate = (base: number, rateLevel: number): number =>
  base * (1 + FAMILY_SCALING.buildPerPoint * Math.max(0, rateLevel));

/** RAPID: Nachladeabschlag bei vollem Momentum, `n` Punkte in `signaturePower`. */
export const rapidReloadBonus = (powerLevel: number): number =>
  FAMILY_SCALING.rapid.powerBase + FAMILY_SCALING.rapid.powerPerPoint * Math.max(0, powerLevel);

/** IMPACT: Aufschlag auf den Körperschaden bei vollem Anlauf. */
export const impactBodyDamageBonus = (powerLevel: number): number =>
  FAMILY_SCALING.impact.powerBase + FAMILY_SCALING.impact.powerPerPoint * Math.max(0, powerLevel);

/**
 * Momentum-Konfiguration eines Spielers. Nur Aufbau und Nachladeabschlag
 * hängen an Punkten – die Abbauraten und die Bewegungsschwelle bleiben, wie sie
 * sind. Für Tests und den Balance-Report; im Tick rechnen die Schichten mit den
 * beiden Skalaren oben, um je Tick keine Objekte zu erzeugen.
 */
export const momentumConfigFor = (config: MomentumConfig, upgrades: UpgradeLevels): MomentumConfig => ({
  ...config,
  buildPerSecond: familyBuildRate(config.buildPerSecond, familyUpgradeLevel(upgrades, 'signatureRate')),
  maxReloadBonus: rapidReloadBonus(familyUpgradeLevel(upgrades, 'signaturePower'))
});

/**
 * Wucht-Konfiguration eines Spielers.
 *
 * `maxContactShare` bleibt ausdrücklich unangetastet: Der Anteilsdeckel ist die
 * Zusage „kein Ramm-Tod aus dem Nichts" und darf von keinem Upgrade angefasst
 * werden. Genauso `contactDrainPerSecond` – sonst würde ein voll ausgebauter
 * Anlauf länger halten, statt öfter zu kommen.
 */
export const wuchtConfigFor = (config: WuchtConfig, upgrades: UpgradeLevels): WuchtConfig => ({
  ...config,
  buildPerSecond: familyBuildRate(config.buildPerSecond, familyUpgradeLevel(upgrades, 'signatureRate')),
  maxBodyDamageBonus: impactBodyDamageBonus(familyUpgradeLevel(upgrades, 'signaturePower'))
});

/** PRECISION: Anteil des vollen Ladebonus bei `n` Punkten in `signaturePower`. */
export const precisionChargeBonusShare = (powerLevel: number): number =>
  Math.min(1, FAMILY_SCALING.precision.powerBase + FAMILY_SCALING.precision.powerPerPoint * Math.max(0, powerLevel));

/**
 * Ladeschuss-Konfiguration eines Spielers.
 *
 * `signatureRate` verkürzt die Ladezeit – und zwar über alle acht Stufen
 * wirksam: `chargeReloadFactor` ist mit 1,72 genau so gewählt, dass acht Punkte
 * (+9 % je Punkt) die Ladezeit auf eine Nachladezeit drücken. Ein kleinerer
 * Faktor hätte den Slot nach zwei Punkten im Nachlade-Boden sterben lassen.
 *
 * `signaturePower` skaliert Größe und Durchschlag. Der Schadensverlauf bleibt
 * unangetastet: Er endet per Konstruktion beim heutigen Wert.
 */
export const chargeConfigFor = (config: ChargeConfig, upgrades: UpgradeLevels): ChargeConfig => {
  const share = precisionChargeBonusShare(familyUpgradeLevel(upgrades, 'signaturePower'));
  const rate = 1 + FAMILY_SCALING.buildPerPoint * familyUpgradeLevel(upgrades, 'signatureRate');
  return {
    ...config,
    chargeReloadFactor: config.chargeReloadFactor / rate,
    maxRadiusScale: 1 + (config.maxRadiusScale - 1) * share,
    maxPenetrationScale: 1 + (config.maxPenetrationScale - 1) * share
  };
};

interface RuntimePlayer {
  id: string;
  playerClass: PlayerClass;
  availablePoints: number;
  upgrades: UpgradeLevels;
  bot: { style: string; upgradePath: UpgradeId[] } | null;
}

interface FamilyInternals {
  players: Map<string, RuntimePlayer>;
  applyUpgrade(playerId: string, upgrade: UpgradeId): boolean;
  spendBotPoints(player: RuntimePlayer): void;
}

/**
 * Stile, die zuerst auf Tempo statt auf Wucht gehen. Kiter leben von der
 * Wiederbeschleunigung, Controller vom Nachschub – bei beiden ist der
 * Rate-Slot der stilgerechte erste Griff.
 */
const RATE_FIRST_STYLES = new Set(['kiter', 'controller']);

/**
 * Bot-Pfad mit den beiden Familien-Slots auf **Position 2 und 4**.
 *
 * Anhängen würde nichts bringen: `spendBotPoints` arbeitet den Pfad der Reihe
 * nach ab und füllt jeden Eintrag bis zum Deckel. Bei 44 Punkten auf Level 45
 * und 8 Stufen je Wert kommt ein Bot über 5,5 Einträge nicht hinaus – ein
 * angehängter Slot existiert für ihn schlicht nicht.
 */
const familyBotPath = (path: readonly UpgradeId[], style: string): UpgradeId[] => {
  const [second, fourth] = RATE_FIRST_STYLES.has(style)
    ? (['signatureRate', 'signaturePower'] as const)
    : (['signaturePower', 'signatureRate'] as const);
  const merged: UpgradeId[] = [...path];
  merged.splice(1, 0, second);
  merged.splice(3, 0, fourth);
  return merged;
};

/**
 * Hängt die Familiensperre und die erweiterten Bot-Pfade an.
 *
 * `families` ist die Liste der Familien, deren Signature **wirklich läuft**
 * (gebaut *und* eingeschaltet). Eine leere Liste heißt: kein Familien-Slot ist
 * kaufbar, der Server verhält sich exakt wie vor KL4. Das ist bewusst kein
 * einfaches `enabled`-Flag – ein Slot, dessen Signature nicht läuft, wäre ein
 * Punktegrab: Der Spieler zahlt einen Punkt, und nichts passiert.
 *
 * Die Schicht gehört **außerhalb** von `tuneCombatScaling`: Das ersetzt
 * `applyUpgrade` vollständig, statt die vorherige Fassung aufzurufen – innen
 * würde die Sperre kommentarlos überschrieben.
 */
export function tuneFamilyUpgrades<T extends MazeGame>(game: T, families: readonly SignatureFamily[] = []): T {
  const internals = game as unknown as FamilyInternals;
  const open = new Set<string>(families);
  const pathsByStyle = new Map<string, UpgradeId[]>();

  // Die Sperre hängt **immer**, nicht nur bei offenen Familien: `signatureRate`
  // und `signaturePower` stehen mit der Shared-Erweiterung in `UPGRADE_IDS` und
  // wären sonst schon ohne Flag kaufbar – ein Punktegrab, und eine Änderung des
  // Verhaltens ohne Schalter. Bei leerer Liste lehnt sie schlicht alles ab.
  const originalApplyUpgrade = internals.applyUpgrade.bind(internals);
  internals.applyUpgrade = (playerId: string, upgrade: UpgradeId): boolean => {
    if (isFamilyUpgrade(upgrade)) {
      const player = internals.players.get(playerId);
      // Ohne laufende Familie kein Familien-Slot. Core ist damit gesperrt,
      // und ebenso jede Familie, deren Signature noch nicht steht.
      if (!player || !open.has(CLASS_DEFINITIONS[player.playerClass].branch)) return false;
    }
    return originalApplyUpgrade(playerId, upgrade);
  };

  // Auch ohne offene Familie ersetzt: Der Abbruch bei Ablehnung ist die
  // Absicherung gegen eine Endlosschleife, nicht Teil des Features.
  internals.spendBotPoints = (player: RuntimePlayer): void => {
    const bot = player.bot;
    if (!bot) return;
    let path: UpgradeId[] = bot.upgradePath;
    if (open.size > 0) {
      let cached = pathsByStyle.get(bot.style);
      if (!cached) {
        cached = familyBotPath(bot.upgradePath, bot.style);
        pathsByStyle.set(bot.style, cached);
      }
      path = cached;
    }
    for (const upgrade of path) {
      // `applyUpgrade` dynamisch über `internals`, damit die Sperre oben und
      // spätere Schichten mitgelesen werden.
      while (player.availablePoints > 0 && player.upgrades[upgrade] < GAME.maxUpgradeLevel) {
        // Bricht eine Ablehnung ab, die keinen Punkt verbraucht – sonst dreht
        // die Schleife endlos (Bot auf Level 9 mit Punkten und einem
        // Familien-Slot im Pfad hängt den Server auf).
        if (!internals.applyUpgrade(player.id, upgrade)) break;
      }
      if (player.availablePoints <= 0) break;
    }
  };

  return game;
}

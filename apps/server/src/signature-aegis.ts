import { type PlayerClass } from '@project-maze/shared';
import { MazeGame } from './game.js';
import { distanceSquared, normalize } from './physics.js';
import {
  SIGNATURE_MAX,
  advanceSignature,
  classBranch,
  signatureStateFor,
  type SignatureRuntimePlayer
} from './signature.js';

// Der gemeinsame Unterbau liegt in `signature.ts`; hier steht nur, was Aegis
// von den anderen Familien unterscheidet.
export { SIGNATURE_MAX } from './signature.js';

/**
 * Klassen 4.1 – Signature der AEGIS-Familie: **Schild**.
 *
 * Die Idee in einem Satz: Erlittener Schaden lädt den Schild, und die Entladung
 * gibt ihn als Flächenstoß zurück. Aegis ist damit die einzige Familie, deren
 * Signature der GEGNER füllt – sie belohnt nicht gutes Zielen oder gute
 * Positionierung, sondern das Aushalten.
 *
 * Vier Festlegungen, die daraus ein Spiel und keinen Selbstläufer machen:
 *
 * 1. **Die Rüstung wächst mit der Ladung** (ab `armorThreshold` minus
 *    `armorReduction`). Das ist der Grund, den Schild NICHT sofort zu zünden:
 *    Ein voller Schild ist gleichzeitig die beste Rüstung. Wer ihn früh
 *    verpulvert, steht danach nackt da.
 * 2. **Die Rüstung bremst auch das Laden.** Geladen wird der tatsächlich
 *    erlittene Schaden, also der bereits reduzierte. Der Schild zieht sich damit
 *    von selbst gegen das letzte Viertel fest, statt in einer Schlägerei
 *    beliebig schnell zu zünden.
 * 3. **Die Entladung ist automatisch.** Kein Knopf, keine Zieleingabe – der
 *    Schild geht bei 100 los, wo der Träger gerade steht. Ein manueller Auslöser
 *    wäre eine neue Eingabe im Wire-Format; die Automatik hält die Signature
 *    innerhalb der bestehenden Form und macht den Zeitpunkt zur Folge der
 *    Positionierung statt eines Klicks.
 * 4. **Eine Entladung löst keine zweite im selben Aufruf aus.** Zwei
 *    Aegis-Tanks nebeneinander würden sich sonst gegenseitig hochschaukeln, bis
 *    der Stack platzt. Der Kettenschutz ist ein Reentrancy-Flag: Der
 *    Entladungsschaden LÄDT fremde Schilde ganz normal, aber der volle fremde
 *    Schild zündet erst im nächsten Tick (siehe `stepPlayer`). Aus der
 *    Endlosschleife wird damit ein sichtbarer Schlagabtausch im Sekundentakt.
 *
 * Verbündete gibt es in der Arena nicht: Ziel ist jeder andere lebende, nicht
 * unverwundbare Spieler im Radius. Tote und der Träger selbst sind ausgenommen.
 */

export interface SchildConfig {
  /** Ladung je Punkt erlittenen Schadens. 1.4 = 71,5 Schaden bis zur Entladung. */
  readonly chargePerDamage: number;
  /** Schaden der Entladung an jedem Ziel im Radius. */
  readonly dischargeDamage: number;
  /** Wirkradius der Entladung. */
  readonly dischargeRadius: number;
  /** Rückstoß auf die Geschwindigkeit am Zentrum; fällt linear auf 0 am Rand. */
  readonly dischargeImpulse: number;
  /** Oberhalb dieser Ladung greift die Rüstung. */
  readonly armorThreshold: number;
  /** Schadensminderung der Rüstung. 0.18 = −18 %. */
  readonly armorReduction: number;
}

export const DEFAULT_SCHILD: SchildConfig = {
  // 100 / 1.4 = 71,5 erlittener Schaden bis zur Entladung – rund die Hälfte des
  // Lebens eines Aegis (152). Ein Tank zündet damit ein- bis zweimal, bevor er
  // fällt; ein Sanctum (218) öfter. Kandidat für die Telemetrie-Runde.
  chargePerDamage: 1.4,
  dischargeDamage: 34,
  // 240 ist gut das Fünffache des Spielerdurchmessers (44): weit genug, um eine
  // Umzingelung aufzubrechen, zu kurz, um über die halbe Sichtweite (1100) in
  // ein Gefecht hineinzuwirken, an dem der Träger gar nicht beteiligt ist.
  dischargeRadius: 240,
  // 520 liegt über der Höchstgeschwindigkeit jeder Klasse (max. 340): Der Stoß
  // ist als Positionswechsel spürbar, nicht als leichtes Schieben.
  dischargeImpulse: 520,
  armorThreshold: 60,
  armorReduction: 0.18
};

export const isAegisClass = (playerClass: PlayerClass): boolean => classBranch(playerClass) === 'aegis';

type RuntimePlayer = SignatureRuntimePlayer;

interface AegisInternals {
  players: Map<string, RuntimePlayer>;
  stepPlayer(player: RuntimePlayer, dt: number, now: number): void;
  damagePlayer(target: RuntimePlayer, damage: number, attackerId: string | null, now: number): void;
}

/**
 * Hängt den Schild an. `enabled = false` lässt die Schicht komplett weg – der
 * Server verhält sich dann exakt wie vorher, `signature` taucht in keinem
 * Snapshot auf, kein Schaden wird gemindert und nichts entlädt sich.
 */
export function tuneAegisSignature<T extends MazeGame>(
  game: T,
  enabled = false,
  config: SchildConfig = DEFAULT_SCHILD
): T {
  if (!enabled) return game;
  const internals = game as unknown as AegisInternals;
  const schild = signatureStateFor(game, 'aegis');
  /**
   * Kettenschutz: Solange eine Entladung läuft, darf keine zweite starten.
   * Ein Flag statt einer Tiefenzählung – eine Entladung ist ein Ereignis, kein
   * Baum, und genau eine Ebene ist erlaubt.
   */
  let discharging = false;

  /** Schreibt einen Füllstand samt gerundetem Snapshot-Wert. */
  const setSchild = (player: RuntimePlayer, value: number): void => {
    schild.set(player.id, value);
    player.signature = Math.round(value);
  };

  const originalDamagePlayer = internals.damagePlayer.bind(internals);

  const discharge = (owner: RuntimePlayer, now: number): void => {
    // Zuerst leeren, dann austeilen: Der Schild ist im Moment des Zündens
    // verbraucht. Das ist gleichzeitig die zweite Sicherung gegen Rekursion –
    // ein leerer Schild kann nicht noch einmal auslösen, selbst wenn das Flag
    // durch einen künftigen Umbau einmal danebengreifen sollte.
    setSchild(owner, 0);
    discharging = true;
    try {
      const radiusSquared = config.dischargeRadius * config.dischargeRadius;
      // Kopie der Spielerliste: Die Entladung kann töten, und `killPlayer`
      // fasst Projektile und Drohnen an – über eine laufende Iteration der
      // Original-Map wollen wir dabei nicht stolpern.
      for (const target of [...internals.players.values()]) {
        if (target.id === owner.id || target.dead || target.invulnerable) continue;
        const squared = distanceSquared(target.position, owner.position);
        if (squared > radiusSquared) continue;

        // Der Stoß kommt VOR dem Schaden: Tötet die Entladung das Ziel, nullt
        // `killPlayer` dessen Geschwindigkeit gleich wieder – ein Toter soll
        // nicht durch die Arena segeln. Andersherum bliebe er als fliegende
        // Leiche zurück.
        const away = normalize({ x: target.position.x - owner.position.x, y: target.position.y - owner.position.y });
        // Linearer Abfall auf 0 am Radiusrand. Stehen zwei Spieler exakt
        // aufeinander, gibt `normalize` (0,0) zurück: Dann gibt es keine
        // Richtung, und es bleibt beim Schaden – geraten wird nicht.
        const falloff = 1 - Math.sqrt(squared) / config.dischargeRadius;
        target.velocity.x += away.x * config.dischargeImpulse * falloff;
        target.velocity.y += away.y * config.dischargeImpulse * falloff;

        // Über den eigenen Wrap, nicht am ihm vorbei: Der Entladungsschaden
        // soll fremde Schilde ganz normal laden (und deren Rüstung soll ihn
        // mindern). Nur das Zünden ist durch `discharging` gesperrt. Der Wrap
        // trägt die Angreifer-Id des Trägers – so zählen Kills der Entladung
        // ihm, samt Serie, XP und Killfeed.
        applyDamage(target, config.dischargeDamage, owner.id, now);
      }
    } finally {
      discharging = false;
    }
  };

  const applyDamage = (
    target: RuntimePlayer,
    damage: number,
    attackerId: string | null,
    now: number
  ): void => {
    // Wirkungslose Aufrufe unverändert durchreichen: An toten oder
    // unverwundbaren Zielen prallt das Original ohnehin ab, und ein
    // 0-Schaden-Ereignis darf keinen Schild laden.
    if (!isAegisClass(target.playerClass) || target.dead || target.invulnerable || damage <= 0) {
      originalDamagePlayer(target, damage, attackerId, now);
      return;
    }
    // Über die Rüstung entscheidet der Stand VOR dem Treffer: Ein Treffer, der
    // den Schild erst über die Schwelle hebt, wird noch nicht gemindert.
    const before = schild.get(target.id) ?? 0;
    const taken = before > config.armorThreshold ? damage * (1 - config.armorReduction) : damage;
    originalDamagePlayer(target, taken, attackerId, now);

    if (target.dead) {
      // Genau wie `advanceSignature` es beim nächsten Tick täte – nur sofort,
      // damit zwischen Tod und nächstem Tick kein Snapshot einen Schild zeigt,
      // den es nicht mehr gibt.
      schild.delete(target.id);
      target.signature = 0;
      return;
    }
    // Geladen wird der tatsächlich erlittene Schaden, nicht der angesetzte:
    // Die Rüstung bremst damit auch das Nachladen des Schildes.
    const charged = Math.min(SIGNATURE_MAX, before + taken * config.chargePerDamage);
    setSchild(target, charged);
    if (charged >= SIGNATURE_MAX && !discharging) discharge(target, now);
  };

  internals.damagePlayer = applyDamage;

  const originalStepPlayer = internals.stepPlayer.bind(internals);
  internals.stepPlayer = (player: RuntimePlayer, dt: number, now: number): void => {
    originalStepPlayer(player, dt, now);
    const inFamily = isAegisClass(player.playerClass);
    // Rate 0: Der Schild verfällt nicht von allein. `advanceSignature` macht
    // hier ausschließlich die Buchführung des Unterbaus – Snapshot-Feld,
    // Rücksetzen bei Tod, Aufräumen beim Familienwechsel.
    advanceSignature(schild, player, dt, inFamily, 0);
    // Nachzügler: Wer seine 100 während einer fremden Entladung erreicht hat,
    // durfte dort nicht zünden (Kettenschutz) und holt es hier nach. Damit ist
    // „im selben Tick" die Regel und „einen Tick später" die Ausnahme – und
    // ein voller Schild bleibt nie dauerhaft stehen.
    if (inFamily && !player.dead && (schild.get(player.id) ?? 0) >= SIGNATURE_MAX) discharge(player, now);
  };

  const originalRemovePlayer = game.removePlayer.bind(game);
  game.removePlayer = ((id: string): void => {
    schild.delete(id);
    originalRemovePlayer(id);
  }) as T['removePlayer'];

  return game;
}

/** Ungerundeter Füllstand für Tests und Betriebsanzeigen. */
export function schildFor(game: MazeGame, playerId: string): number {
  return signatureStateFor(game, 'aegis').get(playerId) ?? 0;
}

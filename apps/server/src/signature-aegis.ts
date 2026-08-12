import { GAME, type PlayerClass, type WorldSnapshot } from '@project-maze/shared';
import type { DischargeBurst, GameplayWorldExtension } from '@project-maze/shared/gameplay';
import { schildConfigFor } from './family-upgrades.js';
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

/**
 * Wie lange eine gezündete Entladung Snapshots beiliegt (Befund 7). Deutlich
 * länger als jedes Snapshot-Intervall, damit kein Betrachter sie verpasst;
 * doppelt spielt sie trotzdem niemand, die `id` dedupliziert.
 */
const BURST_TTL_MS = 1000;

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
  config: SchildConfig = DEFAULT_SCHILD,
  familyUpgrades = false
): T {
  if (!enabled) return game;
  /*
   * Konfiguration dieses Trägers: ohne Familien-Upgrades der Festwert, mit
   * ihnen Ladetempo und Entladungsschaden aus seinen Punkten. Radius und
   * Rückstoß bleiben unangetastet – ein weiter wirkender Stoß wäre eine andere
   * Fähigkeit, keine stärkere.
   */
  const konfigFuer = (player: RuntimePlayer): SchildConfig =>
    (familyUpgrades ? schildConfigFor(config, player.upgrades) : config);
  const internals = game as unknown as AegisInternals;
  const schild = signatureStateFor(game, 'aegis');
  /**
   * Kettenschutz: Solange eine Entladung läuft, darf keine zweite starten.
   * Ein Flag statt einer Tiefenzählung – eine Entladung ist ein Ereignis, kein
   * Baum, und genau eine Ebene ist erlaubt.
   */
  let discharging = false;

  /**
   * Gezündete Entladungen der letzten Sekunde (Befund 7). Die Entladung selbst
   * ist in einem Tick vorbei – damit jeder Client sie mitbekommt, bleibt sie
   * hier so lange liegen, dass sicher mindestens ein Snapshot je Betrachter
   * sie trägt. Der Client dedupliziert über die monoton wachsende `id`.
   * Muster wie beim Killfeed: kurze Liste im Snapshot statt Ereigniskanal.
   */
  const bursts: Array<DischargeBurst & { at: number }> = [];
  let nextBurstId = 1;

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
    // Radius aus der Basiskonfiguration, wie die Schadensschleife unten –
    // Familien-Upgrades ändern ihn bewusst nicht.
    bursts.push({ id: nextBurstId++, x: owner.position.x, y: owner.position.y, radius: config.dischargeRadius, ownerId: owner.id, at: now });
    if (bursts.length > 32) bursts.shift();
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
        applyDamage(target, konfigFuer(owner).dischargeDamage, owner.id, now);
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
    /*
     * Gemessen statt geraten: Was wirklich vom Leben abgeht, entscheidet.
     *
     * Weiter innen liegt `tuneImpactSignature` (index.ts: Impact INNERHALB von
     * Aegis), und dessen `damagePlayer` multipliziert den Wert bei
     * Koerperkontakt noch einmal mit der Wucht des Rammenden. Aegis sah diesen
     * Aufschlag nie und lud mit `taken`, dem Wert VOR dem Aufschlag --
     * ausgerechnet gegen die eine Familie, deren ganzes Spiel das Rammen ist.
     * Gemessen an einem AEGIS L40 gegen einen RAMMER L40: Bei Wucht 0 kostete
     * der Kontakt 2,32 Leben, bei Wucht 100 waren es 5,74 -- die Ladung stand
     * beide Male auf denselben 3,25. Der Schild fuellte sich also am
     * langsamsten, wenn er am meisten einsteckte.
     *
     * Die Differenz aus Vorher und Nachher kennt jeden Aufschlag jeder Schicht
     * darunter, heute und in Zukunft.
     */
    const lebenVorher = target.health;
    originalDamagePlayer(target, taken, attackerId, now);
    const wirklich = Math.max(0, lebenVorher - target.health);

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
    const charged = Math.min(SIGNATURE_MAX, before + wirklich * konfigFuer(target).chargePerDamage);
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

  const originalSnapshot = game.snapshot.bind(game);
  game.snapshot = ((selfId: string, now = Date.now()): WorldSnapshot => {
    const snapshot = originalSnapshot(selfId, now) as WorldSnapshot & Partial<GameplayWorldExtension>;
    // Verfallene zuerst raus – `at` wächst monoton, vorne liegt das Älteste.
    while (bursts[0] && now - bursts[0].at > BURST_TTL_MS) bursts.shift();
    if (bursts.length === 0) return snapshot;
    // Sichtfeld-Filter wie bei den Entitäten, plus Wirkradius als Rand: Eine
    // Entladung knapp außerhalb ragt noch ins Bild. Ohne eigenen Spieler
    // (Beobachter vor dem Join) gehen alle raus – wie im Basis-Snapshot, der
    // dann um die Arenamitte zentriert.
    const center = internals.players.get(selfId)?.position;
    const sichtbar = bursts.filter((burst) => {
      if (!center) return true;
      const reach = GAME.viewRadius + burst.radius;
      return distanceSquared({ x: burst.x, y: burst.y }, center) <= reach * reach;
    }).map(({ at: _at, ...burst }) => burst);
    if (sichtbar.length > 0) snapshot.dischargeBursts = sichtbar;
    return snapshot;
  }) as T['snapshot'];

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

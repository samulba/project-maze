import { type WorldSnapshot } from '@project-maze/shared';
import type { DamageDirection, GameplayWorldExtension } from '@project-maze/shared/gameplay';
import { MazeGame } from './game.js';

/**
 * Trefferrichtung (Befund 5): Woher kam das?
 *
 * Wer aus dem Off beschossen wird, bekam bisher Bildschirmruckeln und einen
 * fallenden Lebensbalken – aber keine Richtung. Auf dem Weg zur Antwort liegen
 * drei Fakten, die diese Schicht klein halten:
 *
 * 1. **Der Server kennt den Angreifer.** Jeder Schadenspfad (Projektil,
 *    Körperkontakt, Drohne, AEGIS-Entladung) läuft durch `damagePlayer` und
 *    trägt eine `attackerId`. Umgebungsschaden (Royale-Zone) trägt bewusst
 *    `null` – der hat seine eigene Anzeige (roter Rand) und bekommt keinen Keil.
 * 2. **Gemessen wird die Wirkung, nicht die Absicht.** Aufgezeichnet wird nur,
 *    wenn nach dem Aufruf tatsächlich Leben fehlt. Ein Treffer, den Rüstung
 *    oder Barriere komplett schlucken, zeigt keine Richtung an – die Schichten
 *    darüber entscheiden das, diese hier sieht nur das Ergebnis.
 * 3. **Nur der eigene Snapshot trägt das Feld.** Fremde Treffer gehen den
 *    Betrachter nichts an; für Bots wird gar nicht erst gebucht.
 *
 * Die Schicht sitzt direkt über dem Kampf-Tuning, also UNTER allen Signatures
 * und Perks: Jeder Schaden, der wirklich bei der Basis ankommt, passiert sie –
 * auch der aus gebundenen Innenaufrufen wie der AEGIS-Entladung, die an den
 * äußeren Schichten vorbeigehen.
 *
 * Transport wie beim Killfeed und den Entladungen (Befund 7): kurze Liste mit
 * monotonen Ids, ~1 s Vorhaltezeit, Client dedupliziert.
 */

interface RuntimePlayer {
  id: string;
  isBot: boolean;
  dead: boolean;
  health: number;
  position: { x: number; y: number };
}

interface HitInternals {
  players: Map<string, RuntimePlayer>;
  damagePlayer(target: RuntimePlayer, damage: number, attackerId: string | null, now: number): void;
}

/** Vorhaltezeit eines Treffers – gleiche Begründung wie BURST_TTL_MS in signature-aegis.ts. */
const HIT_TTL_MS = 900;
/** Mehr Einträge zeigt der Client ohnehin nicht sinnvoll an. */
const MAX_HITS_PER_PLAYER = 8;

export function tuneHitDirection<T extends MazeGame>(game: T, enabled = true): T {
  if (!enabled) return game;
  const internals = game as unknown as HitInternals;
  const hits = new Map<string, Array<DamageDirection & { at: number }>>();
  let nextId = 1;

  const originalDamagePlayer = internals.damagePlayer.bind(internals);
  internals.damagePlayer = (target: RuntimePlayer, damage: number, attackerId: string | null, now: number): void => {
    const before = target.health;
    originalDamagePlayer(target, damage, attackerId, now);
    if (target.isBot) return;
    if (target.dead) {
      // Tote brauchen keine Keile mehr, und der Respawn soll nicht mit den
      // Richtungen des letzten Lebens beginnen.
      hits.delete(target.id);
      return;
    }
    if (target.health >= before) return;
    const attacker = attackerId && attackerId !== target.id ? internals.players.get(attackerId) : null;
    if (!attacker) return;
    const list = hits.get(target.id) ?? [];
    list.push({
      id: nextId++,
      angle: Math.atan2(attacker.position.y - target.position.y, attacker.position.x - target.position.x),
      at: now
    });
    if (list.length > MAX_HITS_PER_PLAYER) list.shift();
    hits.set(target.id, list);
  };

  const originalSnapshot = game.snapshot.bind(game);
  game.snapshot = ((selfId: string, now = Date.now()): WorldSnapshot => {
    const snapshot = originalSnapshot(selfId, now) as WorldSnapshot & Partial<GameplayWorldExtension>;
    const list = hits.get(selfId);
    if (!list) return snapshot;
    while (list[0] && now - list[0].at > HIT_TTL_MS) list.shift();
    if (list.length === 0) {
      hits.delete(selfId);
      return snapshot;
    }
    snapshot.damageDirections = list.map(({ at: _at, ...hit }) => hit);
    return snapshot;
  }) as T['snapshot'];

  const originalRemovePlayer = game.removePlayer.bind(game);
  game.removePlayer = ((id: string): void => {
    hits.delete(id);
    originalRemovePlayer(id);
  }) as T['removePlayer'];

  return game;
}

import {
  UPGRADE_IDS,
  type KillEvent,
  type LeaderboardEntry,
  type PlayerSnapshot,
  type ServerMessage,
  type ShapeSnapshot,
  type UpgradeId,
  type Wall,
  type WirePlayerSnapshot,
  type WireShapeSnapshot,
  type WireWorldSnapshot,
  type WorldSnapshot
} from '@project-maze/shared';

/**
 * Gegenstück zum Delta-Versand des Servers (`SNAPSHOT_DELTAS`).
 *
 * Der Server lässt Felder weg, die sich selten ändern: Name, Klasse, Bot-Flag
 * und Upgrades eines Spielers, Art/Radius/Max-Leben einer Form sowie Wände,
 * Bestenliste und Killfeed als Ganzes. Er tut das nur, solange er sicher ist,
 * dass genau dieser Client den Stand schon kennt.
 *
 * Deshalb sitzt der Hydrator direkt an der Socket-Grenze: Alles hinter ihm
 * sieht ausschließlich vollständige `WorldSnapshot`s und muss von Deltas nichts
 * wissen. Volle Snapshots (`SNAPSHOT_DELTAS=false`) laufen unverändert durch –
 * sie füllen die Caches und werden sonst nicht angefasst.
 */

/** Felder, die der Server je Spieler auslassen darf. */
export interface PlayerStatics {
  name: string;
  playerClass: PlayerSnapshot['playerClass'];
  isBot: boolean;
  upgrades: Record<UpgradeId, number>;
}

/** Felder, die der Server je Form auslassen darf. */
export interface ShapeStatics {
  kind: ShapeSnapshot['kind'];
  radius: number;
  maxHealth: number;
}

/** Wie eine Snapshot-Nachricht auf der Leitung aussieht, bevor sie hydriert ist. */
export type WireServerMessage = Exclude<ServerMessage, WorldSnapshot> | WireWorldSnapshot;

const EMPTY_UPGRADES = Object.freeze(
  Object.fromEntries(UPGRADE_IDS.map((id) => [id, 0])) as Record<UpgradeId, number>
);

/**
 * Notnagel, wenn der Server ein Feld ausgelassen hat, das dieser Client nie
 * bekommen hat. Das ist immer ein Fehler auf einer der beiden Seiten – aber
 * einen Spieler wegzulassen oder `undefined` durchzureichen wäre schlimmer:
 * `CLASS_DEFINITIONS[undefined]` bringt den Renderer zum Absturz, und ohne den
 * eigenen Spieler zeigt der Client gar nichts mehr.
 */
const PLACEHOLDER_PLAYER: PlayerStatics = {
  name: '…',
  playerClass: 'core',
  isBot: false,
  upgrades: EMPTY_UPGRADES
};

export class SnapshotHydrator {
  private readonly playerStatics = new Map<string, PlayerStatics>();
  private readonly shapeStatics = new Map<string, ShapeStatics>();
  private walls: Wall[] = [];
  private leaderboard: LeaderboardEntry[] = [];
  private killfeed: KillEvent[] = [];
  private missing = 0;

  /**
   * Zähler für Felder, die weder im Snapshot standen noch im Cache lagen.
   * Bleibt im Normalbetrieb bei 0; alles andere ist ein Hinweis auf einen
   * Versatz zwischen Server-Buchführung und Client-Cache.
   */
  get missingStatics(): number {
    return this.missing;
  }

  /**
   * Bei jeder neuen Verbindung leeren: Der Server führt seine Buchführung pro
   * Spieler-ID, und beim Rejoin gibt es eine neue ID – er beginnt also wieder
   * mit vollen Snapshots. Ein alter Cache wäre bestenfalls unnötig und
   * schlimmstenfalls falsch.
   */
  reset(): void {
    this.playerStatics.clear();
    this.shapeStatics.clear();
    this.walls = [];
    this.leaderboard = [];
    this.killfeed = [];
    this.missing = 0;
  }

  /** Ergänzt einen Wire-Snapshot zu einem vollständigen `WorldSnapshot`. */
  hydrate(wire: WireWorldSnapshot): WorldSnapshot {
    // Die Wire-Objekte kommen frisch aus JSON.parse und gehören uns allein –
    // sie werden direkt aufgefüllt, statt 30-mal pro Sekunde Kopien zu bauen.
    const players = wire.players as PlayerSnapshot[];
    for (let index = 0; index < players.length; index += 1) {
      const player = players[index];
      if (player) this.fillPlayer(player);
    }
    const shapes = wire.shapes as ShapeSnapshot[];
    for (let index = 0; index < shapes.length; index += 1) {
      const shape = shapes[index];
      if (shape) this.fillShape(shape);
    }

    if (wire.walls) this.walls = wire.walls;
    if (wire.leaderboard) this.leaderboard = wire.leaderboard;
    if (wire.killfeed) this.killfeed = wire.killfeed;

    const snapshot = wire as unknown as WorldSnapshot;
    snapshot.walls = this.walls;
    snapshot.leaderboard = this.leaderboard;
    snapshot.killfeed = this.killfeed;
    return snapshot;
  }

  private fillPlayer(player: WirePlayerSnapshot): void {
    if (
      player.name !== undefined
      && player.playerClass !== undefined
      && player.isBot !== undefined
      && player.upgrades !== undefined
    ) {
      // Eingefroren, weil derselbe Upgrade-Stand danach in jedem Snapshot
      // dieses Spielers steckt – eine Mutation würde den Cache vergiften.
      this.playerStatics.set(player.id, {
        name: player.name,
        playerClass: player.playerClass,
        isBot: player.isBot,
        upgrades: Object.freeze(player.upgrades)
      });
      return;
    }
    const cached = this.playerStatics.get(player.id);
    if (!cached) this.missing += 1;
    const statics = cached ?? PLACEHOLDER_PLAYER;
    player.name = statics.name;
    player.playerClass = statics.playerClass;
    player.isBot = statics.isBot;
    player.upgrades = statics.upgrades;
  }

  private fillShape(shape: WireShapeSnapshot): void {
    if (shape.kind !== undefined && shape.radius !== undefined && shape.maxHealth !== undefined) {
      this.shapeStatics.set(shape.id, { kind: shape.kind, radius: shape.radius, maxHealth: shape.maxHealth });
      return;
    }
    const cached = this.shapeStatics.get(shape.id);
    if (!cached) {
      this.missing += 1;
      // Ohne bekannte Größe wäre die Form unsichtbar oder ein Nullradius-Kreis;
      // die Standardform ist der harmloseste Ersatz.
      shape.kind ??= 'square';
      shape.radius ??= 18;
      shape.maxHealth ??= Math.max(1, shape.health);
      return;
    }
    shape.kind = cached.kind;
    shape.radius = cached.radius;
    shape.maxHealth = cached.maxHealth;
  }
}

/** Erkennt Snapshot-Nachrichten, bevor sie hydriert werden. */
export function isWireSnapshot(message: WireServerMessage): message is WireWorldSnapshot {
  return message.type === 'snapshot';
}

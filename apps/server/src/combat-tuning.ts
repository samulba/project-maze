import {
  CLASS_DEFINITIONS,
  EMPTY_UPGRADES,
  GAME,
  UPGRADE_IDS,
  classAvailableAtLevel,
  isValidClassChoice,
  movementStatsFor,
  respawnClassFrom,
  respawnScoreFrom,
  upgradeAppliesTo,
  upgradePointsAtLevel,
  xpAtLevelStart,
  xpThresholdForLevel,
  type PlayerClass,
  type PlayerSnapshot,
  type UpgradeId,
  type Vector2
} from '@project-maze/shared';
import {
  PASSIVE_MODIFIER_DEFINITIONS,
  type PassiveModifierId
} from '@project-maze/shared/gameplay';
import { MazeGame } from './game.js';
import { moveVectorToward } from './physics.js';
import { cappedLife, projectileFlightFor, projectileRadiusFor } from './projectile-speed.js';
import { moveCircle } from './world.js';

interface TunedStats {
  maxHealth: number;
  regen: number;
  acceleration: number;
  moveSpeed: number;
  reload: number;
  projectileSpeed: number;
  projectileLife: number;
  damage: number;
  projectileRadius: number;
  penetration: number;
  bodyDamage: number;
  barrelCount: number;
  barrelSpread: number;
  barrelLength: number;
  barrelAngles?: number[] | undefined;
  /** Pro-Lauf-Profile (Klassen 4.2) – muss mit `game.ts`s `RuntimeStats` mitgezogen werden, sonst feuert die Tuning-Schicht jeden Lauf wieder mit demselben Schaden/Tempo. */
  barrels?: Array<{ angle: number; damageScale?: number; speedScale?: number }> | undefined;
  /** Salve statt Fächer (Klassen 4.2) – muss mit `game.ts`s `RuntimeStats` mitgezogen werden, sonst feuert die Tuning-Schicht wieder alle Läufe gleichzeitig. */
  burstDelay?: number | undefined;
  /** Stehendes Projektil (Trapper) – muss mit `game.ts`s `RuntimeStats` mitgezogen werden, sonst fliegen ihre Fallen einfach bis zum Lebensende weiter. */
  trapAfter?: number | undefined;
  droneCount: number;
  droneRespawn: number;
}

interface RuntimePlayer extends PlayerSnapshot {
  move: Vector2;
  aim: Vector2;
  primary: boolean;
  secondary: boolean;
  cooldown: number;
  lastDamageAt: number;
  invulnerableUntil: number;
  bot: unknown | null;
  passiveModifier?: PassiveModifierId;
}

interface CombatInternals {
  players: Map<string, RuntimePlayer>;
  applyUpgrade(playerId: string, upgrade: UpgradeId): boolean;
  chooseClass(playerId: string, target: PlayerClass): boolean;
  stepPlayer(player: RuntimePlayer, dt: number, now: number): void;
  respawn(player: RuntimePlayer, now: number): void;
  updateBot(player: RuntimePlayer, now: number): void;
  maintainDrones(owner: RuntimePlayer, stats: TunedStats, now: number): void;
  fire(player: RuntimePlayer, stats: TunedStats): void;
  removeOwnerDrones(ownerId: string): void;
  spawnInitialDrones(owner: RuntimePlayer, now: number): void;
  spendBotPoints(player: RuntimePlayer): void;
  advanceBotClass(player: RuntimePlayer): void;
  safeSpawn(): Vector2;
  bodyDamageOf(player: RuntimePlayer): number;
}

/**
 * Dämpfer auf die Projektilgeschwindigkeit; die im gleichen Maß verlängerte
 * Lebenszeit hält die Reichweite jeder Waffe exakt konstant. Precision zahlt
 * pro Fehlschuss eine komplette Ladephase (0,5–1,3 s) – der volle Dämpfer
 * träfe die Linie 2–7× härter als Rapid, obwohl er sie physikalisch am
 * wenigsten verändert (Analyse 02, .probe/damper2.mjs). Deshalb dort nur 0.9.
 */
const projectileSpeedScaleFor = (branch: string): number => (branch === 'precision' ? 0.9 : 0.75);

// Tempo und Beschleunigung rechnet  aus shared – dieselbe
// Funktion, die auch die Client-Vorhersage benutzt. Zwei Fassungen derselben
// Formel waeren in jedem Tick sichtbares Gummiband (siehe CLIENT_PREDICTION.md).

export function tunedStatsFor(player: RuntimePlayer): TunedStats {
  const base = CLASS_DEFINITIONS[player.playerClass];
  const modifier = PASSIVE_MODIFIER_DEFINITIONS[player.passiveModifier ?? 'standard'];
  const speedScale = projectileSpeedScaleFor(base.branch);
  // Projektiltempo 2.0 hängt am Level und rechnet mit Deckel und Boden; ohne
  // Schalter kommen exakt die beiden Werte zurück, die hier hereingereicht
  // werden. Der Modifikator des Rahmens greift in beiden Fällen danach.
  const flight = projectileFlightFor(
    base,
    player.level ?? 1,
    player.upgrades,
    base.projectileSpeed * speedScale * (1 + player.upgrades.projectileSpeed * 0.04),
    base.projectileLife / speedScale
  );
  // Eine Quelle fuer Tempo und Beschleunigung – der Client rechnet dieselbe.
  const bewegung = movementStatsFor(base, player.upgrades.moveSpeed, modifier.moveMultiplier);
  /*
   * Punkte-Ökonomie (BAL1) – Sam: „als LVL 60 Vortex fühlt man sich
   * unbesiegbar: mega schnell, mega viel HP … überall fehlt das komplette
   * Balancing." Gemessen war der Grund kein Klassenwert, sondern die
   * Punkte selbst: voll investiert bringt Schaden+Nachladen zusammen 2,84×
   * DPS, aber volles Leben nur 1,90× und volles Tempo nur 1,30× – ein
   * Offensiv-Build lohnt sich strukturell mehr als derselbe Punkteeinsatz in
   * Überleben oder Flucht, weil DPS aus ZWEI Feldern zusammenmultipliziert
   * (Schaden × Nachladen), Leben und Tempo aber je nur aus einem.
   *
   * Diese vier Werte hier bleiben die einzigen, an denen gedreht wird –
   * spürbar näher beieinander (2,21× / 2,25× / 1,50×), aber nicht
   * gleichgezogen: Ein Punkt bleibt ein Punkt, kein Ersatz für Balance
   * zwischen einzelnen Klassenwerten (Vortex-Spread bleibt ein eigenes,
   * noch offenes Thema).
   */
  return {
    maxHealth: Math.round(base.maxHealth * (1 + player.upgrades.maxHealth * 0.125) * modifier.healthMultiplier),
    regen: base.regen + player.upgrades.regen * 0.5,
    acceleration: bewegung.acceleration,
    moveSpeed: bewegung.moveSpeed,
    reload: Math.max(0.09, base.reload * modifier.reloadMultiplier * Math.pow(0.965, player.upgrades.reload)),
    projectileSpeed: flight.speed * modifier.projectileSpeedMultiplier,
    // Reichweite ist seit Klassen 4.0 eine bewusste Entscheidung (eigener
    // Slot) statt eines Nebeneffekts des Tempo-Upgrades. Multiplikativ auf die
    // fertige Lebenszeit, damit es mit beiden Tempo-Pfaden (alt und V2)
    // identisch zusammensetzt.
    // Deckel ganz zum Schluss, NACH dem Reichweiten-Slot und dem Rahmen:
    // Genau deren Multiplikation war der Grund, dass ein Lancer auf Level 60
    // 7825 px weit schoss (projectile-speed.ts: DEFAULT_RANGE_CAP).
    projectileLife: cappedLife(
      flight.life * (1 + player.upgrades.projectileRange * 0.06),
      flight.speed * modifier.projectileSpeedMultiplier
    ),
    damage: base.damage * (1 + player.upgrades.damage * 0.055),
    // Sams „zu klein" und „beim Leveln groesser, wie in Diep.io": Der Radius
    // war eine reine Klassenkonstante und auf Stufe 60 exakt so gross wie auf
    // Stufe 1. Jetzt Grundgroesse mal Skala, plus Levelrampe.
    projectileRadius: projectileRadiusFor(base, player.level ?? 1),
    penetration: base.penetration * (1 + player.upgrades.penetration * 0.085),
    /*
     * Smasher (rohrloser Nahkämpfer, Klassen 4.2 Schritt 3) hat keinen
     * Schuss, den der `damage`-Punkt treffen könnte – ohne diese Ausnahme
     * wäre er der einzige Platz von zwölf, der bei dieser einen Klasse
     * nichts täte (genau das Muster, das die Projektil-Upgrade-Sperre für
     * rohrlose Klassen schon einmal beheben musste). Er wirkt hier
     * stattdessen zusätzlich zum eigenen bodyDamage-Slot auf den Körperschaden.
     */
    bodyDamage: base.bodyDamage * (1 + player.upgrades.bodyDamage * 0.1)
      * (player.playerClass === 'smasher' ? 1 + player.upgrades.damage * 0.07 : 1),
    barrelCount: base.barrelCount,
    barrelSpread: base.barrelSpread,
    barrelLength: base.barrelLength,
    burstDelay: base.burstDelay,
    trapAfter: base.trapAfter,
    barrelAngles: base.barrelAngles,
    barrels: base.barrels,
    droneCount: base.droneCount,
    droneRespawn: Math.max(0.4, base.droneRespawn * Math.pow(0.96, player.upgrades.reload))
  };
}

/**
 * Replaces exponential snowball scaling while keeping the existing upgrade UI.
 *
 * ## Achtung: Diese Schicht ERSETZT, sie umschliesst nicht
 *
 * `applyUpgrade`, `chooseClass`, `respawn`, `stepPlayer` und `bodyDamageOf`
 * werden komplett neu geschrieben, ohne das Original zu binden oder
 * aufzurufen.
 *
 * Hier stand lange, das sei „die einzige Stelle im Server". Nachgezaehlt am
 * 12.08. ueber alle Nicht-Test-Dateien: 113 Zuweisungen an Methoden der Basis,
 * davon 13 echte Ersetzungen ohne jede Bindung ans Original, verteilt auf
 * FUENF Schichten – neben dieser noch `simulation-hardening`, `drone-tuning`,
 * `bot-brain` und `family-upgrades`. Die Entwarnung war teurer als der Fehler,
 * den sie deckte: Weil die Pflicht unten nur hier stand, liefen in `game.ts`
 * und in `drone-tuning.ts` zwei weitere Regeln unbemerkt auseinander.
 *
 * Daraus folgt eine Pflicht, die zweimal verletzt wurde und beide Male
 * monatelang unbemerkt blieb: **Jede Regel, die in `MazeGame` steht, muss hier
 * mitgeschrieben werden.** Der Kommentar in der Basis („steht hier, damit jede
 * Tuning-Schicht sie erbt") gilt fuer diese Schicht ausdruecklich nicht.
 *
 * Was verlorengegangen war:
 *
 * * `upgradeAppliesTo` – ein Controller konnte Kugeltempo kaufen und den Punkt
 *   verlieren, obwohl er kein Rohr hat.
 * * `respawnClassFrom` – nach dem Tod blieb die alte Klasse erhalten, also
 *   genau das Verhalten, das Sam am 07.08. gemeldet hatte und das laut
 *   Basis-Kommentar behoben war.
 *
 * Beide sind wieder da, und beide werden durch die echte Produktionskette
 * getestet (`family-upgrades.test.ts`), nicht gegen die Basis. Geprueft und in
 * Ordnung sind ausserdem `chooseClass` (getreue Spiegelung der Basis) und
 * `stepPlayer` (getreue Obermenge: zusaetzlich Chill-Regeneration und
 * Lebensverhaeltnis beim Maximalwechsel).
 *
 * Wer hier eine weitere Methode ersetzt, vergleicht sie vorher Zeile fuer Zeile
 * mit der Basis – und schreibt einen Test, der durch die Kette geht. Dieselbe
 * Pflicht gilt fuer die anderen vier Schichten oben.
 */
export function tuneCombatScaling<T extends MazeGame>(game: T): T {
  const internals = game as unknown as CombatInternals;

  internals.applyUpgrade = (playerId: string, upgrade: UpgradeId): boolean => {
    const player = internals.players.get(playerId);
    if (!player || player.dead || player.availablePoints <= 0 || !UPGRADE_IDS.includes(upgrade) || player.upgrades[upgrade] >= GAME.maxUpgradeLevel) return false;
    /*
     * Kein Punkt fuer etwas, das bei dieser Klasse nichts tut.
     *
     * Dieselbe Pruefung steht in `MazeGame.applyUpgrade` mit dem Kommentar
     * „steht hier in der Basis, damit jede Tuning-Schicht sie erbt". Das stimmt
     * nur fuer Schichten, die die Basis AUFRUFEN. Diese hier ersetzt sie
     * vollstaendig – und weil `tuneCombatScaling` fest in der Produktionskette
     * haengt, war die Pruefung serverseitig wirkungslos: Ein Controller konnte
     * Kugeltempo kaufen und den Punkt verlieren, obwohl es bei ihm kein Rohr
     * gibt. Aufgefallen ist es erst, als dieselbe Regel fuer die
     * Signature-Slots dazukam und der Test sie nicht durchsetzen konnte.
     */
    if (!upgradeAppliesTo(player.playerClass, upgrade)) return false;
    const previousMaximum = player.maxHealth;
    player.upgrades[upgrade] += 1;
    player.availablePoints -= 1;
    const stats = tunedStatsFor(player);
    player.maxHealth = stats.maxHealth;
    if (upgrade === 'maxHealth') player.health = Math.min(player.maxHealth, player.health + player.maxHealth - previousMaximum);
    return true;
  };

  internals.chooseClass = (playerId: string, target: PlayerClass): boolean => {
    const player = internals.players.get(playerId);
    if (!player || player.dead || !isValidClassChoice(player.playerClass, target, player.level)) return false;
    const healthRatio = player.health / Math.max(1, player.maxHealth);
    player.playerClass = target;
    const stats = tunedStatsFor(player);
    player.maxHealth = stats.maxHealth;
    player.health = Math.max(1, player.maxHealth * healthRatio);
    player.cooldown = Math.min(player.cooldown, stats.reload);
    internals.removeOwnerDrones(player.id);
    internals.spawnInitialDrones(player, Date.now());
    return true;
  };

  internals.stepPlayer = (player: RuntimePlayer, dt: number, now: number): void => {
    if (player.dead) return;
    if (player.bot) internals.updateBot(player, now);
    const stats = tunedStatsFor(player);
    const previousMaximum = Math.max(1, player.maxHealth);
    if (stats.maxHealth !== player.maxHealth) {
      const healthRatio = player.health / previousMaximum;
      player.maxHealth = stats.maxHealth;
      player.health = Math.max(1, Math.min(player.maxHealth, player.maxHealth * healthRatio));
    }
    player.invulnerable = now < player.invulnerableUntil;
    const desired = { x: player.move.x * stats.moveSpeed, y: player.move.y * stats.moveSpeed };
    player.velocity = moveVectorToward(player.velocity, desired, stats.acceleration * dt);
    const moved = moveCircle(player.position, player.velocity, dt, GAME.playerRadius);
    player.position = moved.position;
    player.velocity = moved.velocity;
    if (Math.hypot(player.aim.x, player.aim.y) > 0.01) player.angle = Math.atan2(player.aim.y, player.aim.x);
    player.cooldown = Math.max(0, player.cooldown - dt);
    if (now - player.lastDamageAt > 3500 && player.health < player.maxHealth) {
      // Chill-Regeneration: Wer dem Gefecht wirklich entkommt, ist nach rund
      // 30 Sekunden wieder voll, statt minutenlang angeschlagen zu bleiben.
      // Der Bonus wächst über 4 s auf +4 % des Max-Lebens pro Sekunde an –
      // prozentual, damit auch dicke Tanks eine echte Verschnaufpause haben.
      // Im Gefecht (unter 3,5 s seit dem letzten Treffer) ändert sich nichts.
      const outOfCombatSeconds = (now - player.lastDamageAt - 3500) / 1000;
      const chillRegen = Math.min(1, outOfCombatSeconds / 4) * 0.04 * player.maxHealth;
      player.health = Math.min(player.maxHealth, player.health + (stats.regen + chillRegen) * dt);
    }
    if (stats.droneCount > 0) internals.maintainDrones(player, stats, now);
    // barrelCount 0 bei einer Nicht-Drohnen-Klasse (Klassen 4.2, Stufe 4,
    // Schritt 3 – der rohrlose Smasher): kein Rohr, also nichts zu feuern.
    // Ohne diese Wache riefe `fire()` trotzdem `fireBarrel` fuer Lauf 0 auf
    // und legte ein Geister-Projektil mit Tempo 0 und Lebenszeit 0 an.
    else if (stats.barrelCount > 0 && player.primary && player.cooldown <= 0) {
      internals.fire(player, stats);
      player.cooldown = stats.reload;
    }
  };

  /*
   * Koerperschaden aus derselben Quelle wie alles andere.
   *
   * Die Kurve stand dreimal im Server: `statsFor` in der Basis (+13 % je
   * Punkt), `tunedStatsFor` hier (+10 %) und noch einmal woertlich in
   * `simulation-hardening.ts`. Gelten tut die von hardening -- die Schicht
   * ERSETZT `resolvePlayerCollisions`, die Zeile in der Basis ist also
   * unerreichbar, und der Rammschaden war zum Glueck nie falsch. Genau das ist
   * aber die Falle: Drei Fassungen, von denen zwei unbemerkt auseinanderliefen.
   * Mit dieser Naht gibt es eine.
   */
  internals.bodyDamageOf = (player: RuntimePlayer): number => tunedStatsFor(player).bodyDamage;

  internals.respawn = (player: RuntimePlayer, now: number): void => {
    const retainedLevel = Math.max(1, player.respawnLevel);
    /*
     * Zurueck auf die Anfangsklasse -- Sams Befund vom 07.08.: „wenn es viele
     * level hat und man stirbt ist man direkt in einer klasse die man davor
     * ausgewaehlt hat, man sollte aber bei der anfangs klasse wieder sein".
     *
     * Hier stand `classAvailableAtLevel(player.playerClass, retainedLevel)` --
     * also genau das beklagte Verhalten: Wer als Gatling auf 60 starb, kam auf
     * 30 als Gatling zurueck, weil das auf der Stufe erlaubt ist. Der Fix ging
     * in `MazeGame.respawn`, aber diese Schicht ersetzt die Basis vollstaendig
     * und haengt fest in der Produktionskette. Der Bug war also nie behoben,
     * und der Test dazu prueft `respawnClassFrom` direkt statt den Weg durch
     * die Kette -- er blieb gruen, waehrend das Spiel das Gegenteil tat.
     */
    player.playerClass = respawnClassFrom(player.playerClass);
    player.position = internals.safeSpawn();
    player.velocity = { x: 0, y: 0 };
    player.level = retainedLevel;
    player.xp = xpAtLevelStart(retainedLevel);
    player.xpForNextLevel = xpThresholdForLevel(retainedLevel);
    player.availablePoints = upgradePointsAtLevel(retainedLevel);
    player.upgrades = EMPTY_UPGRADES();
    player.score = respawnScoreFrom(player.score);
    player.streak = 0;
    player.bestStreak = 0;
    player.dead = false;
    player.health = tunedStatsFor(player).maxHealth;
    player.maxHealth = player.health;
    player.invulnerable = true;
    player.invulnerableUntil = now + GAME.respawnInvulnerabilityMs;
    player.lastDamageAt = now;
    player.canRespawnAt = 0;
    player.autoRespawnAt = 0;
    player.killerName = '';
    if (player.bot) {
      internals.spendBotPoints(player);
      internals.advanceBotClass(player);
    }
    internals.spawnInitialDrones(player, now);
  };

  return game;
}

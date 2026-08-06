import { describe, expect, it } from 'vitest';
import { ACCELERATION_SCALE, CLASS_DEFINITIONS, GAME, type PlayerSnapshot, type Wall, type WorldSnapshot } from '@project-maze/shared';
import {
  HARD_CORRECTION_UNITS,
  PREDICTION_DT,
  PredictionEngine,
  clampMagnitude,
  isFree,
  moveCircle,
  moveVectorToward,
  predictionStats,
  signatureFamily,
  stepPrediction,
  type PredictedState
} from './prediction';

/**
 * Die Vorhersage darf nicht „ungefähr" stimmen: Jede Abweichung von der
 * Serverrechnung zieht bei jedem Snapshot dagegen und wird als Ruckeln
 * sichtbar. Deshalb prüfen die Tests unten Zahlen, keine Tendenzen – die
 * Erwartungswerte sind von Hand aus `docs/CLIENT_PREDICTION.md` gerechnet.
 */

const NO_WALLS: Wall[] = [];
const CORE_STATS = { moveSpeed: 270, acceleration: 1500 * ACCELERATION_SCALE };

const state = (x: number, y: number, vx = 0, vy = 0, signature = 0): PredictedState => ({
  position: { x, y },
  velocity: { x: vx, y: vy },
  signature
});

const player = (overrides: Partial<PlayerSnapshot> = {}): PlayerSnapshot => ({
  id: 'p1',
  name: 'Ich',
  playerClass: 'core',
  position: { x: 1000, y: 1000 },
  velocity: { x: 0, y: 0 },
  angle: 0,
  health: 100,
  maxHealth: 100,
  level: 1,
  xp: 0,
  xpForNextLevel: 73,
  availablePoints: 0,
  upgrades: {
    maxHealth: 0, regen: 0, moveSpeed: 0, reload: 0,
    damage: 0, projectileSpeed: 0, penetration: 0, bodyDamage: 0
  },
  score: 0,
  kills: 0,
  deaths: 0,
  streak: 0,
  bestStreak: 0,
  invulnerable: false,
  isBot: false,
  dead: false,
  deathLevel: 0,
  respawnLevel: 1,
  canRespawnAt: 0,
  autoRespawnAt: 0,
  killerName: '',
  ...overrides
});

const snapshotOf = (self: PlayerSnapshot, lastProcessedInput: number, walls: Wall[] = NO_WALLS): WorldSnapshot => ({
  type: 'snapshot',
  selfId: self.id,
  tick: 1,
  serverTime: 0,
  players: [self],
  projectiles: [],
  drones: [],
  shapes: [],
  walls,
  leaderboard: [],
  killfeed: [],
  lastProcessedInput
});

const input = (sequence: number, move = { x: 0, y: 0 }, primary = false) => ({
  type: 'input' as const,
  sequence,
  move,
  aim: { x: 1, y: 0 },
  primary,
  secondary: false
});

/** Steuerbare Uhr – ohne sie wäre die Ausblendkurve der Korrektur nicht prüfbar. */
class Clock {
  now = 0;
  readonly read = (): number => this.now;
  advance(ms: number): void { this.now += ms; }
}

describe('Bausteine der Integration', () => {
  it('kürzt den Bewegungsvektor, statt ihn zu normieren', () => {
    // Der Kern der Falle: Ein halb ausgelenkter Stick ist halbes Tempo. Wer
    // normiert, läuft dauerhaft zu schnell.
    expect(clampMagnitude({ x: 0.5, y: 0 }, 1)).toEqual({ x: 0.5, y: 0 });
    const shortened = clampMagnitude({ x: 3, y: 4 }, 1);
    expect(shortened.x).toBeCloseTo(0.6, 9);
    expect(shortened.y).toBeCloseTo(0.8, 9);
    expect(clampMagnitude({ x: 0, y: 0 }, 1)).toEqual({ x: 0, y: 0 });
  });

  it('nähert die Geschwindigkeit vektoriell an und rastet exakt ein', () => {
    expect(moveVectorToward({ x: 0, y: 0 }, { x: 270, y: 0 }, 42)).toEqual({ x: 42, y: 0 });
    // Rest kleiner als die Schrittweite: exakt das Ziel, kein Überschwingen.
    expect(moveVectorToward({ x: 252, y: 0 }, { x: 270, y: 0 }, 42)).toEqual({ x: 270, y: 0 });
    // Richtungswechsel dreht den Vektor, statt achsenweise zu rechnen.
    const turned = moveVectorToward({ x: 100, y: 0 }, { x: 0, y: 100 }, 50);
    expect(Math.hypot(turned.x - 100, turned.y)).toBeCloseTo(50, 6);
  });

  it('erreicht die Höchstgeschwindigkeit nach genau sieben Ticks', () => {
    // 1500 · 1,12 · 0,025 = 42 pro Tick, 270 / 42 = 6,43 – der siebte Tick rastet ein.
    let velocity = { x: 0, y: 0 };
    const perTick = CORE_STATS.acceleration * PREDICTION_DT;
    for (let tick = 0; tick < 6; tick += 1) velocity = moveVectorToward(velocity, { x: 270, y: 0 }, perTick);
    expect(velocity.x).toBeCloseTo(252, 6);
    velocity = moveVectorToward(velocity, { x: 270, y: 0 }, perTick);
    expect(velocity.x).toBe(270);
  });

  it('prüft Wandkontakt strikt kleiner als der Radius', () => {
    const wall: Wall = { id: 'w', x: 1000, y: 400, width: 100, height: 200 };
    // Genau eine Radiuslänge von der Wandkante entfernt zählt noch als frei –
    // eine Zehntel Einheit näher nicht mehr.
    expect(isFree({ x: 978, y: 500 }, 22, [wall])).toBe(true);
    expect(isFree({ x: 978.1, y: 500 }, 22, [wall])).toBe(false);
  });

  it('hält den Radius als Rand zur Weltgrenze ein', () => {
    expect(isFree({ x: 22, y: 500 }, 22, NO_WALLS)).toBe(true);
    expect(isFree({ x: 21.9, y: 500 }, 22, NO_WALLS)).toBe(false);
    expect(isFree({ x: GAME.worldWidth - 22, y: 500 }, 22, NO_WALLS)).toBe(true);
    expect(isFree({ x: GAME.worldWidth - 21.9, y: 500 }, 22, NO_WALLS)).toBe(false);
  });

  it('teilt schnelle Bewegungen in Substeps', () => {
    // 700 U/s: 700 · 0,025 / 12,1 = 1,45 → zwei Substeps. Mit nur einem
    // Schritt bliebe der Tank bei x = 965 stehen, statt bis 973,75 zu kommen.
    const wall: Wall = { id: 'w', x: 1000, y: 400, width: 100, height: 200 };
    const result = moveCircle({ x: 965, y: 500 }, { x: 700, y: 0 }, PREDICTION_DT, 22, [wall]);
    expect(result.position.x).toBeCloseTo(973.75, 6);
    expect(result.velocity.x).toBe(0);
  });

  it('nullt die blockierte Achse und lässt die andere laufen', () => {
    const wall: Wall = { id: 'w', x: 1000, y: 400, width: 100, height: 200 };
    const result = moveCircle({ x: 975, y: 500 }, { x: 300, y: 300 }, PREDICTION_DT, 22, [wall]);
    expect(result.position.x).toBe(975);
    expect(result.position.y).toBeCloseTo(507.5, 6);
    expect(result.velocity).toEqual({ x: 0, y: 300 });
  });

  it('testet Y mit dem bereits aktualisierten X', () => {
    // Die Wand liegt links unten. Erst der X-Schritt bringt den Tank an ihr
    // vorbei – in umgekehrter Reihenfolge wäre Y blockiert und der Tank bliebe
    // an der Wandkante hängen, obwohl er frei ist.
    const wall: Wall = { id: 'w', x: 900, y: 520, width: 80, height: 180 };
    const result = moveCircle({ x: 996, y: 505 }, { x: 300, y: 300 }, PREDICTION_DT, 22, [wall]);
    expect(result.position.x).toBeCloseTo(1003.5, 6);
    expect(result.position.y).toBeCloseTo(512.5, 6);
    expect(result.velocity).toEqual({ x: 300, y: 300 });
    // Gegenprobe: Y allein, vom selben Startpunkt aus, ist blockiert.
    expect(isFree({ x: 996, y: 512.5 }, 22, [wall])).toBe(false);
  });
});

describe('Getunte Werte', () => {
  it('spiegelt ACCELERATION_SCALE aus shared statt eines abgeschriebenen Werts', () => {
    const stats = predictionStats(player(), 'standard');
    expect(stats.moveSpeed).toBeCloseTo(270, 9);
    expect(stats.acceleration).toBeCloseTo(CLASS_DEFINITIONS.core.acceleration * ACCELERATION_SCALE, 9);
    // Ohne den Faktor läge die Beschleunigung 12 % daneben – konstant, in jedem Tick.
    expect(stats.acceleration).not.toBeCloseTo(CLASS_DEFINITIONS.core.acceleration, 3);
  });

  it('rechnet Bewegungs-Upgrades und Frame-Multiplikator ein', () => {
    const stats = predictionStats(
      player({ upgrades: { ...player().upgrades, moveSpeed: 4 } }),
      'lightweight'
    );
    expect(stats.moveSpeed).toBeCloseTo(270 * 1.12 * 1.06, 9);
    expect(stats.acceleration).toBeCloseTo(1500 * ACCELERATION_SCALE * 1.072 * 1.06, 9);
  });

  it('fällt ohne Loadout auf den Standard-Frame zurück', () => {
    expect(predictionStats(player(), undefined)).toEqual(predictionStats(player(), 'standard'));
  });
});

describe('Signature (Momentum und Wucht)', () => {
  it('ordnet nur Rapid und Impact eine vorhersagbare Familie zu', () => {
    expect(signatureFamily('storm')).toBe('rapid');
    expect(signatureFamily('rammer')).toBe('impact');
    expect(signatureFamily('core')).toBeNull();
    expect(signatureFamily('sniper')).toBeNull();
    expect(signatureFamily('warden')).toBeNull();
  });

  it('baut Momentum am gehaltenen Feuer auf, nicht am Schuss', () => {
    // In Fahrt und Feuertaste gehalten: +30/s → +0,75 je Tick. Ungerundet.
    const moving = state(1000, 1000, 270, 0, 10);
    const next = stepPrediction(moving, { move: { x: 1, y: 0 }, primary: true }, CORE_STATS, NO_WALLS, 'rapid');
    expect(next.signature).toBeCloseTo(10.75, 9);
  });

  it('baut Momentum langsam ab, wenn gefahren aber nicht gefeuert wird', () => {
    const moving = state(1000, 1000, 270, 0, 10);
    const next = stepPrediction(moving, { move: { x: 1, y: 0 }, primary: false }, CORE_STATS, NO_WALLS, 'rapid');
    expect(next.signature).toBeCloseTo(9.75, 9);
  });

  it('baut im Stand schnell ab – auch mit gehaltener Feuertaste', () => {
    const still = state(1000, 1000, 0, 0, 10);
    const next = stepPrediction(still, { move: { x: 0, y: 0 }, primary: true }, CORE_STATS, NO_WALLS, 'rapid');
    expect(next.signature).toBeCloseTo(8.75, 9);
  });

  it('lädt Wucht allein durch Fahren, ohne Feuertaste', () => {
    const moving = state(1000, 1000, 270, 0, 10);
    const next = stepPrediction(moving, { move: { x: 1, y: 0 }, primary: false }, CORE_STATS, NO_WALLS, 'impact');
    expect(next.signature).toBeCloseTo(10.75, 9);
  });

  it('misst „in Fahrt" an der tatsächlichen Geschwindigkeit, nicht an der Eingabe', () => {
    // Volle Eingabe gegen eine Wand: Der Server nullt die blockierte Achse, die
    // Geschwindigkeit ist danach 0 – und der Füllstand fällt, statt zu steigen.
    const wall: Wall = { id: 'w', x: 1000, y: 0, width: 200, height: 2000 };
    const pressing = state(977.5, 500, 270, 0, 40);
    const next = stepPrediction(pressing, { move: { x: 1, y: 0 }, primary: true }, CORE_STATS, [wall], 'rapid');
    expect(next.velocity.x).toBe(0);
    expect(next.signature).toBeCloseTo(38.75, 9);
  });

  it('deckelt den Füllstand bei 0 und 100', () => {
    const full = state(1000, 1000, 270, 0, 99.9);
    expect(stepPrediction(full, { move: { x: 1, y: 0 }, primary: true }, CORE_STATS, NO_WALLS, 'rapid').signature).toBe(100);
    const empty = state(1000, 1000, 0, 0, 0.2);
    expect(stepPrediction(empty, { move: { x: 0, y: 0 }, primary: false }, CORE_STATS, NO_WALLS, 'rapid').signature).toBe(0);
  });

  it('rührt den Füllstand ohne Familie nicht an', () => {
    const moving = state(1000, 1000, 270, 0, 10);
    expect(stepPrediction(moving, { move: { x: 1, y: 0 }, primary: true }, CORE_STATS, NO_WALLS, null).signature).toBe(10);
  });
});

describe('Abgleich mit dem Server', () => {
  it('sagt ohne Quittungsfeld gar nichts voraus', () => {
    const engine = new PredictionEngine(new Clock().read);
    const self = player();
    const snapshot = snapshotOf(self, 0);
    delete (snapshot as Partial<WorldSnapshot>).lastProcessedInput;
    expect(engine.reconcile(snapshot, self, 'standard')).toBeNull();
    expect(engine.running).toBe(false);
  });

  it('übernimmt beim ersten Snapshot exakt die Serverposition', () => {
    const engine = new PredictionEngine(new Clock().read);
    const self = player();
    const sample = engine.reconcile(snapshotOf(self, -1), self, 'standard');
    expect(sample?.position.x).toBeCloseTo(1000, 9);
    expect(sample?.position.y).toBeCloseTo(1000, 9);
    expect(engine.running).toBe(true);
  });

  it('verwirft quittierte Eingaben und behält den Rest', () => {
    const engine = new PredictionEngine(new Clock().read);
    const self = player();
    engine.reconcile(snapshotOf(self, -1), self, 'standard');
    for (let sequence = 1; sequence <= 5; sequence += 1) engine.record(input(sequence, { x: 1, y: 0 }));
    expect(engine.pendingCount).toBe(5);
    engine.reconcile(snapshotOf(self, 2), self, 'standard');
    expect(engine.pendingCount).toBe(3);
  });

  it('erzeugt keine Korrektur, wenn der Server dasselbe gerechnet hat', () => {
    const clock = new Clock();
    const engine = new PredictionEngine(clock.read);
    const self = player();
    engine.reconcile(snapshotOf(self, -1), self, 'standard');

    // Drei Ticks volle Fahrt nach rechts – einmal im Client, einmal als
    // Referenz „so hätte der Server gerechnet".
    let reference: PredictedState = state(1000, 1000);
    for (let sequence = 1; sequence <= 3; sequence += 1) {
      const message = input(sequence, { x: 1, y: 0 });
      clock.advance(25);
      engine.record(message);
      reference = stepPrediction(reference, message, CORE_STATS, NO_WALLS, null);
    }

    // Der Server rundet Positionen auf eine Nachkommastelle – ein Restfehler
    // von 0,05 Einheiten ist normal und darf nichts auslösen.
    const acknowledged = player({
      position: { x: Math.round(reference.position.x * 10) / 10, y: Math.round(reference.position.y * 10) / 10 },
      velocity: reference.velocity
    });
    const sample = engine.reconcile(snapshotOf(acknowledged, 3), acknowledged, 'standard');
    expect(sample).not.toBeNull();
    expect(Math.hypot(sample!.position.x - reference.position.x, sample!.position.y - reference.position.y))
      .toBeLessThan(0.1);
    expect(engine.pendingCount).toBe(0);
    expect(engine.hardCorrectionCount).toBe(0);
  });

  it('rechnet offene Eingaben auf der Serverposition nach', () => {
    const clock = new Clock();
    const engine = new PredictionEngine(clock.read);
    const self = player();
    engine.reconcile(snapshotOf(self, -1), self, 'standard');
    for (let sequence = 1; sequence <= 4; sequence += 1) {
      clock.advance(25);
      engine.record(input(sequence, { x: 1, y: 0 }));
    }
    // Der Server hat erst zwei Eingaben verarbeitet. Die beiden offenen müssen
    // auf seiner Position erneut laufen – sonst hinkt die Anzeige zwei Ticks.
    let expected = state(1000, 1000);
    for (let tick = 0; tick < 2; tick += 1) {
      expected = stepPrediction(expected, { move: { x: 1, y: 0 }, primary: false }, CORE_STATS, NO_WALLS, null);
    }
    const server = player({ position: { ...expected.position }, velocity: { ...expected.velocity } });
    for (let tick = 0; tick < 2; tick += 1) {
      expected = stepPrediction(expected, { move: { x: 1, y: 0 }, primary: false }, CORE_STATS, NO_WALLS, null);
    }
    const sample = engine.reconcile(snapshotOf(server, 2), server, 'standard');
    expect(sample!.position.x).toBeCloseTo(expected.position.x, 6);
    expect(sample!.velocity.x).toBeCloseTo(expected.velocity.x, 6);
  });

  it('blendet einen kleinen Restfehler weich aus, statt zu springen', () => {
    const clock = new Clock();
    const engine = new PredictionEngine(clock.read);
    const self = player();
    engine.reconcile(snapshotOf(self, -1), self, 'standard');
    const before = engine.sample()!.position.x;

    // Der Server meldet 10 Einheiten weiter rechts – unter der Hartschwelle.
    const server = player({ position: { x: 1010, y: 1000 } });
    const corrected = engine.reconcile(snapshotOf(server, -1), server, 'standard')!;
    // Im Moment der Korrektur bewegt sich der sichtbare Punkt nicht.
    expect(corrected.position.x).toBeCloseTo(before, 6);
    expect(engine.hardCorrectionCount).toBe(0);

    // Nach der Hälfte der Ausblendzeit liegt er dazwischen …
    clock.advance(45);
    const middle = engine.sample()!.position.x;
    expect(middle).toBeGreaterThan(1000.5);
    expect(middle).toBeLessThan(1009.5);
    // … und nach 150 ms ist vom Fehler weniger als eine halbe Einheit übrig,
    // nach 250 ms praktisch nichts mehr. Das ist der Bereich, den die Doku für
    // die Einblendung nennt.
    clock.advance(105);
    expect(1010 - engine.sample()!.position.x).toBeLessThan(0.5);
    clock.advance(100);
    expect(1010 - engine.sample()!.position.x).toBeLessThan(0.05);
  });

  it('zieht über der Schwelle hart nach', () => {
    const clock = new Clock();
    const engine = new PredictionEngine(clock.read);
    const self = player();
    engine.reconcile(snapshotOf(self, -1), self, 'standard');
    // Ein Dash versetzt weiter, als der Client vorhersagen kann – dann ist
    // Weichzeichnen falsch, der Serverwert gilt sofort.
    const jumped = player({ position: { x: 1000 + HARD_CORRECTION_UNITS + 40, y: 1000 } });
    const sample = engine.reconcile(snapshotOf(jumped, -1), jumped, 'standard')!;
    expect(sample.position.x).toBeCloseTo(jumped.position.x, 6);
    expect(engine.hardCorrectionCount).toBe(1);
  });

  it('hält im Tod an und leert den Puffer', () => {
    const engine = new PredictionEngine(new Clock().read);
    const self = player();
    engine.reconcile(snapshotOf(self, -1), self, 'standard');
    engine.record(input(1, { x: 1, y: 0 }));
    expect(engine.reconcile(snapshotOf(player({ dead: true }), 1), player({ dead: true }), 'standard')).toBeNull();
    expect(engine.running).toBe(false);
    expect(engine.pendingCount).toBe(0);
    // Nach dem Respawn läuft sie wieder an – auf der neuen Serverposition.
    const respawned = player({ position: { x: 300, y: 300 } });
    const sample = engine.reconcile(snapshotOf(respawned, 1), respawned, 'standard')!;
    expect(sample.position.x).toBeCloseTo(300, 6);
  });

  it('schiebt zwischen zwei Eingaben linear weiter – höchstens einen Tick', () => {
    const clock = new Clock();
    const engine = new PredictionEngine(clock.read);
    const self = player({ velocity: { x: 200, y: 0 } });
    engine.reconcile(snapshotOf(self, -1), self, 'standard');
    const start = engine.sample()!.position.x;
    clock.advance(12.5);
    expect(engine.sample()!.position.x).toBeCloseTo(start + 200 * 0.0125, 6);
    // Gedeckelt: Ein Tab im Hintergrund darf nicht in die Wand extrapolieren.
    clock.advance(5000);
    expect(engine.sample()!.position.x).toBeCloseTo(start + 200 * PREDICTION_DT, 6);
  });

  it('meldet keine Signature, solange der Server keine schickt', () => {
    const engine = new PredictionEngine(new Clock().read);
    const self = player({ playerClass: 'storm' });
    const sample = engine.reconcile(snapshotOf(self, -1), self, 'standard')!;
    expect(sample.signature).toBeNull();
  });

  it('schreibt die gemeldete Signature ungerundet fort', () => {
    const clock = new Clock();
    const engine = new PredictionEngine(clock.read);
    const self = player({ playerClass: 'storm', signature: 20, velocity: { x: 400, y: 0 } });
    engine.reconcile(snapshotOf(self, -1), self, 'standard');
    clock.advance(25);
    engine.record(input(1, { x: 1, y: 0 }, true));
    // Ein Tick bei +30/s sind 0,75 – wer den gerundeten Wert weiterakkumuliert,
    // würde hier 21 zeigen und mit jeder Korrektur weiter wegdriften.
    expect(engine.sample()!.signature).toBeCloseTo(20.75, 9);
  });
});

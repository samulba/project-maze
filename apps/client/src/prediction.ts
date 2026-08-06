import {
  ACCELERATION_SCALE,
  CLASS_DEFINITIONS,
  GAME,
  type InputMessage,
  type PlayerClass,
  type PlayerSnapshot,
  type UpgradeLevels,
  type Vector2,
  type Wall,
  type WorldSnapshot
} from '@project-maze/shared';
import { PASSIVE_MODIFIER_DEFINITIONS, type PassiveModifierId } from '@project-maze/shared/gameplay';

/**
 * Client-Prediction (MASTERPLAN N2).
 *
 * Der Client rechnet die eigene Bewegung sofort, statt auf die Serverantwort zu
 * warten. Das funktioniert nur, wenn er **exakt dieselbe Rechnung** ausführt –
 * jede Abweichung zeigt sich als Ruckeln, weil die Korrektur bei jedem Snapshot
 * dagegenzieht. Maßgeblich ist `docs/CLIENT_PREDICTION.md`; die Formeln unten
 * sind Zeile für Zeile daraus übernommen.
 *
 * Reine Logik – kein DOM, kein PixiJS, keine Uhr außer der injizierten. Damit
 * ist die gesamte Integration deterministisch testbar, was bei einem Modul,
 * dessen Fehler sich nur als Gefühl äußern, der einzige belastbare Nachweis ist.
 *
 * Was hier bewusst NICHT vorhergesagt wird (Doku, Abschnitt 5): Rückstoß,
 * Repulse-Schub, Kollisionen zwischen Tanks, Dash und der Wucht-Verbrauch im
 * Körperkontakt. Alles davon entsteht außerhalb der eigenen Eingabe – der
 * Client übernimmt es aus der Korrektur, statt es zu raten.
 */

/** Der Server rechnet immer mit `1 / tickRate`, nie mit der Framezeit. */
export const PREDICTION_DT = 1 / GAME.tickRate;
/** Darüber ist etwas Größeres passiert (Dash, Respawn) – dann hart nachziehen. */
export const HARD_CORRECTION_UNITS = 60;
/** Zeitkonstante der weichen Korrektur: nach ~3τ ≈ 135 ms ist der Rest weg. */
export const ERROR_TAU_SECONDS = 0.045;
/** Positionen kommen auf eine Nachkommastelle gerundet an – darunter ist nichts zu korrigieren. */
export const IGNORED_ERROR_UNITS = 0.06;
/** 3 s bei 40 Hz. Wächst der Puffer darüber hinaus, antwortet der Server nicht mehr. */
export const MAX_PENDING_INPUTS = 120;
/** Wert von `lastProcessedInput`, solange der Server nichts gerechnet hat. */
export const NO_INPUT_PROCESSED = -1;

/**
 * Aufbau- und Abbauraten der Familien-Signature (Doku, Abschnitte 6 und 7).
 *
 * Die Zahlen stehen im Server in `DEFAULT_MOMENTUM`/`DEFAULT_WUCHT`. Der Client
 * darf `apps/server` nicht importieren, also stehen sie hier ein zweites Mal –
 * die einzige abgeschriebene Zahlengruppe in diesem Modul. Vorschlag an 01 im
 * Statusbericht: nach `packages/shared`, mit derselben Begründung wie bei
 * `ACCELERATION_SCALE`.
 */
export const SIGNATURE_TUNING = {
  /** Anteil der eigenen Höchstgeschwindigkeit, ab dem „in Fahrt" gilt. */
  moveThreshold: 0.45,
  buildPerSecond: 30,
  decayPerSecond: 50,
  /** Nur Rapid: fährt, hält die Feuertaste aber nicht. */
  holdDecayPerSecond: 10,
  maximum: 100
} as const;

/** Familien mit einer Signature, die sich aus der eigenen Eingabe ergibt. */
export type SignatureFamily = 'rapid' | 'impact';

export interface PredictionStats {
  moveSpeed: number;
  acceleration: number;
}

/** Zustand, den die Vorhersage fortschreibt. `signature` ist ungerundet. */
export interface PredictedState {
  position: Vector2;
  velocity: Vector2;
  signature: number;
}

/** Was ein Tick aus einer Eingabe braucht – Zielen ist reine Anzeige. */
export interface PredictionInput {
  move: Vector2;
  primary: boolean;
}

export interface SelfSample {
  position: Vector2;
  velocity: Vector2;
  /** Ungerundeter Füllstand; `null`, solange der Server keine Signature meldet. */
  signature: number | null;
}

const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.max(minimum, Math.min(maximum, value));

/**
 * Kürzt einen Vektor auf eine Höchstlänge. **Normiert bewusst nicht:** Ein
 * `move` der Länge 0,5 ist halbes Tempo. Wer im Client normiert, läuft
 * dauerhaft zu schnell und driftet in jedem Tick weiter weg.
 */
export function clampMagnitude(vector: Vector2, maximum: number): Vector2 {
  const length = Math.hypot(vector.x, vector.y);
  if (!Number.isFinite(length) || length < 0.00001 || maximum <= 0) return { x: 0, y: 0 };
  if (length <= maximum) return { x: vector.x, y: vector.y };
  const scale = maximum / length;
  return { x: vector.x * scale, y: vector.y * scale };
}

/**
 * Die gesamte „Reibung" des Spiels: Die Geschwindigkeit läuft mit fester Rate
 * gegen die Zielgeschwindigkeit. Bremsen ist derselbe Vorgang wie Beschleunigen
 * – bei `move = (0,0)` ist das Ziel der Nullvektor. Die Annäherung ist
 * *vektoriell*, nicht achsenweise: Bei einem Richtungswechsel dreht der Vektor.
 */
export function moveVectorToward(current: Vector2, target: Vector2, maximumDelta: number): Vector2 {
  const difference = { x: target.x - current.x, y: target.y - current.y };
  const distance = Math.hypot(difference.x, difference.y);
  if (distance <= maximumDelta || distance < 0.00001) return { x: target.x, y: target.y };
  const scale = maximumDelta / distance;
  return { x: current.x + difference.x * scale, y: current.y + difference.y * scale };
}

/** Kreis gegen Wand-Rechteck. `< r²` ist strikt – Berührung zählt noch als frei. */
export function circleHitsWall(position: Vector2, radius: number, wall: Wall): boolean {
  const nearestX = clamp(position.x, wall.x, wall.x + wall.width);
  const nearestY = clamp(position.y, wall.y, wall.y + wall.height);
  const dx = position.x - nearestX;
  const dy = position.y - nearestY;
  return dx * dx + dy * dy < radius * radius;
}

/**
 * Freier Platz für einen Kreis. Die Weltgrenzen tragen den Radius als Rand.
 *
 * `walls` ist die Liste aus dem Snapshot – sie enthält bereits nur **aktive**
 * Wände, vom Fracture-Event geöffnete Segmente fehlen darin. Genau so soll der
 * Client rechnen. Mit `SNAPSHOT_DELTAS` kommt das Feld nur bei Änderung; der
 * Aufrufer reicht deshalb den Stand aus dem Hydrator herein, nie das rohe Feld.
 */
export function isFree(position: Vector2, radius: number, walls: readonly Wall[]): boolean {
  if (
    position.x < radius
    || position.y < radius
    || position.x > GAME.worldWidth - radius
    || position.y > GAME.worldHeight - radius
  ) return false;
  for (const wall of walls) {
    if (circleHitsWall(position, radius, wall)) return false;
  }
  return true;
}

/**
 * Bewegung mit Wandkollision – die drei Fallen aus der Doku, die alle drei
 * Ruckeln erzeugen, wenn der Client sie anders baut:
 *
 * 1. **Substeps.** Bei Radius 22 ist die Schrittweite `max(8, 12,1) = 12,1`.
 *    Ein Schritt statt zwei liefert bei Wandkontakt eine andere Endposition.
 * 2. **X vor Y**, und Y wird mit dem bereits aktualisierten X getestet.
 * 3. **Blockierte Achse wird genullt**, nicht gespiegelt und nicht abgeglitten –
 *    und die Null bleibt für die restlichen Substeps dieses Ticks stehen.
 */
export function moveCircle(
  position: Vector2,
  velocity: Vector2,
  dt: number,
  radius: number,
  walls: readonly Wall[]
): { position: Vector2; velocity: Vector2 } {
  const distance = Math.hypot(velocity.x, velocity.y) * dt;
  const steps = Math.max(1, Math.ceil(distance / Math.max(8, radius * 0.55)));
  const stepDt = dt / steps;
  const next = { x: position.x, y: position.y };
  const resolved = { x: velocity.x, y: velocity.y };
  for (let step = 0; step < steps; step += 1) {
    const xCandidate = { x: next.x + resolved.x * stepDt, y: next.y };
    if (isFree(xCandidate, radius, walls)) next.x = xCandidate.x;
    else resolved.x = 0;
    const yCandidate = { x: next.x, y: next.y + resolved.y * stepDt };
    if (isFree(yCandidate, radius, walls)) next.y = yCandidate.y;
    else resolved.y = 0;
  }
  return { position: next, velocity: resolved };
}

/**
 * Die getunten Werte, mit denen der Server rechnet (Doku, Abschnitt 4).
 *
 * `ACCELERATION_SCALE` kommt aus `packages/shared` und wird **nicht** von Hand
 * gespiegelt: Ein zweiter Zahlenwert im Client liefe bei der nächsten
 * Balance-Runde still auseinander – 12 % daneben, konstant, in jede Richtung.
 */
export function predictionStats(
  player: { playerClass: PlayerClass; upgrades: UpgradeLevels },
  modifier: PassiveModifierId | undefined
): PredictionStats {
  const base = CLASS_DEFINITIONS[player.playerClass] ?? CLASS_DEFINITIONS.core;
  const frame = PASSIVE_MODIFIER_DEFINITIONS[modifier ?? 'standard'] ?? PASSIVE_MODIFIER_DEFINITIONS.standard;
  const moveUpgrade = player.upgrades?.moveSpeed ?? 0;
  return {
    moveSpeed: base.moveSpeed * (1 + moveUpgrade * 0.03) * frame.moveMultiplier,
    acceleration: base.acceleration * ACCELERATION_SCALE * (1 + moveUpgrade * 0.018) * frame.moveMultiplier
  };
}

/** Familie mit vorhersagbarer Signature, oder `null` (Core, Precision, Control). */
export function signatureFamily(playerClass: PlayerClass): SignatureFamily | null {
  const branch = CLASS_DEFINITIONS[playerClass]?.branch;
  return branch === 'rapid' || branch === 'impact' ? branch : null;
}

/**
 * Änderung des Füllstands pro Sekunde.
 *
 * Zwei Unterschiede zwischen den Familien, beide aus der Doku:
 * - **Rapid** baut nur auf, solange die Feuertaste *gehalten* wird – nicht nur
 *   bei tatsächlichen Schüssen. Wer das verwechselt, lädt bei einer Gatling
 *   fünfmal langsamer als bei einer Rapid.
 * - **Impact** lädt allein durch Fahren; `primary` spielt keine Rolle.
 */
export function signatureRate(family: SignatureFamily, moving: boolean, primary: boolean): number {
  if (!moving) return -SIGNATURE_TUNING.decayPerSecond;
  if (family === 'impact') return SIGNATURE_TUNING.buildPerSecond;
  return primary ? SIGNATURE_TUNING.buildPerSecond : -SIGNATURE_TUNING.holdDecayPerSecond;
}

/**
 * Ein Tick, exakt so wie der Server ihn rechnet.
 *
 * Reihenfolge ist Teil des Vertrags: erst Zielgeschwindigkeit, dann Annäherung,
 * dann Bewegung mit Kollision – und die Signature **danach**, mit der
 * tatsächlichen Geschwindigkeit nach dem Tick. Wer gegen eine Wand drückt, hat
 * volle Eingabe und `speed = 0`; der Server baut dann ab, und der Client muss
 * das genauso sehen.
 */
export function stepPrediction(
  state: PredictedState,
  input: PredictionInput,
  stats: PredictionStats,
  walls: readonly Wall[],
  family: SignatureFamily | null,
  dt: number = PREDICTION_DT
): PredictedState {
  const move = clampMagnitude(input.move, 1);
  const desired = { x: move.x * stats.moveSpeed, y: move.y * stats.moveSpeed };
  const accelerated = moveVectorToward(state.velocity, desired, stats.acceleration * dt);
  const moved = moveCircle(state.position, accelerated, dt, GAME.playerRadius, walls);
  let signature = state.signature;
  if (family) {
    const speed = Math.hypot(moved.velocity.x, moved.velocity.y);
    const moving = speed >= SIGNATURE_TUNING.moveThreshold * stats.moveSpeed;
    signature = clamp(
      signature + signatureRate(family, moving, input.primary) * dt,
      0,
      SIGNATURE_TUNING.maximum
    );
  }
  return { position: moved.position, velocity: moved.velocity, signature };
}

interface PendingInput extends PredictionInput {
  sequence: number;
}

/**
 * Puffer, Abgleich und weiche Korrektur.
 *
 * Der Ablauf ist der aus Abschnitt 1 der Doku: jede gesendete Eingabe merken,
 * bei jedem Snapshot auf die Serverwerte zurücksetzen, alles bis einschließlich
 * `lastProcessedInput` verwerfen und den Rest neu durchrechnen.
 *
 * Der Rest der Klasse ist die Antwort auf Abschnitt 5: Der Server ist nicht
 * warteschlangengesteuert, das Nachrechnen ist prinzipbedingt eine Näherung im
 * Bereich eines Ticks. Deshalb wird der Restfehler über ~135 ms eingeblendet
 * statt hart gesetzt – nur über `HARD_CORRECTION_UNITS` ist etwas passiert, das
 * der Client gar nicht vorhersagen konnte, und dann wird sofort übernommen.
 */
export class PredictionEngine {
  private active = false;
  private pending: PendingInput[] = [];
  private state: PredictedState = { position: { x: 0, y: 0 }, velocity: { x: 0, y: 0 }, signature: 0 };
  private error: Vector2 = { x: 0, y: 0 };
  private errorAt = 0;
  private steppedAt = 0;
  private stats: PredictionStats = { moveSpeed: 0, acceleration: 0 };
  private walls: readonly Wall[] = [];
  private family: SignatureFamily | null = null;
  private serverSendsSignature = false;
  private hardCorrections = 0;
  private droppedInputs = 0;

  constructor(private readonly clock: () => number = () => performance.now()) {}

  /** Läuft die Vorhersage gerade? Vor dem ersten Snapshot und im Tod: nein. */
  get running(): boolean { return this.active; }
  /** Diagnose: noch nicht quittierte Eingaben. Im Normalbetrieb einstellig. */
  get pendingCount(): number { return this.pending.length; }
  /** Diagnose: wie oft die Vorhersage hart nachgezogen wurde (Dash, Respawn, Rückstoß). */
  get hardCorrectionCount(): number { return this.hardCorrections; }
  /** Diagnose: verworfene Eingaben, weil der Puffer voll lief (Server antwortet nicht). */
  get droppedInputCount(): number { return this.droppedInputs; }

  /** Vollständig zurück auf Anfang – bei neuer Verbindung und beim Abschalten. */
  reset(): void {
    this.active = false;
    this.pending = [];
    this.state = { position: { x: 0, y: 0 }, velocity: { x: 0, y: 0 }, signature: 0 };
    this.error = { x: 0, y: 0 };
    this.errorAt = 0;
    this.steppedAt = 0;
    this.family = null;
    this.serverSendsSignature = false;
    this.hardCorrections = 0;
    this.droppedInputs = 0;
  }

  /**
   * Eine gesendete Eingabe puffern und die Vorhersage einen Tick vorrücken.
   * Wird direkt nach dem Absenden gerufen – dieselbe Nachricht, dieselbe
   * Sequenznummer, sonst passt die Quittung nicht dazu.
   */
  record(input: InputMessage): void {
    if (!this.active) return;
    this.pending.push({ sequence: input.sequence, move: input.move, primary: input.primary });
    // Läuft der Puffer voll, kommen keine Quittungen mehr. Dann ist die
    // Verbindung das Problem, nicht die Vorhersage – der älteste Eintrag geht,
    // damit der Speicher nicht mitwächst.
    while (this.pending.length > MAX_PENDING_INPUTS) {
      this.pending.shift();
      this.droppedInputs += 1;
    }
    this.state = stepPrediction(this.state, input, this.stats, this.walls, this.predictedFamily());
    this.steppedAt = this.clock();
  }

  /**
   * Serverzustand übernehmen und die noch offenen Eingaben darauf nachrechnen.
   *
   * `self` muss der Spieler aus `snapshot.selfId` sein – **nicht** der aus der
   * `welcome`-Nachricht: Mit `SHORT_NET_IDS` sind die beiden verschieden.
   */
  reconcile(
    snapshot: WorldSnapshot,
    self: PlayerSnapshot,
    modifier: PassiveModifierId | undefined
  ): SelfSample | null {
    const acknowledged = snapshot.lastProcessedInput;
    // Ein Server ohne Quittung kann nicht vorhergesagt werden – dann bleibt es
    // bei der Interpolation, statt blind zu raten.
    if (acknowledged === undefined) {
      this.reset();
      return null;
    }
    const now = this.clock();
    this.walls = snapshot.walls;
    this.stats = predictionStats(self, modifier);
    this.family = signatureFamily(self.playerClass);
    this.serverSendsSignature = self.signature !== undefined;

    // Tod und Respawn setzen Position und Geschwindigkeit hart: Puffer leeren
    // und den Serverzustand übernehmen, statt über den Sprung zu interpolieren.
    if (self.dead) {
      this.active = false;
      this.pending = [];
      this.error = { x: 0, y: 0 };
      this.state = { position: { ...self.position }, velocity: { ...self.velocity }, signature: 0 };
      return null;
    }

    const renderedBefore = this.active ? this.renderedPosition(now) : null;
    this.pending = this.pending.filter((entry) => entry.sequence > acknowledged);

    let state: PredictedState = {
      position: { ...self.position },
      velocity: { ...self.velocity },
      signature: self.signature ?? 0
    };
    const family = this.predictedFamily();
    for (const entry of this.pending) {
      state = stepPrediction(state, entry, this.stats, this.walls, family);
    }
    this.state = state;
    this.steppedAt = now;
    this.active = true;

    // Der sichtbare Punkt darf sich durch die Korrektur nicht bewegen: Was
    // vorher zu sehen war, wird zum Startwert des Restfehlers und läuft von
    // dort weich aus. Ohne das wäre jeder Snapshot ein kleiner Sprung.
    const dx = renderedBefore ? renderedBefore.x - state.position.x : 0;
    const dy = renderedBefore ? renderedBefore.y - state.position.y : 0;
    const distance = Math.hypot(dx, dy);
    if (!renderedBefore || distance < IGNORED_ERROR_UNITS || distance > HARD_CORRECTION_UNITS) {
      if (renderedBefore && distance > HARD_CORRECTION_UNITS) this.hardCorrections += 1;
      this.error = { x: 0, y: 0 };
    } else {
      this.error = { x: dx, y: dy };
    }
    this.errorAt = now;
    return this.sample(now);
  }

  /**
   * Der Punkt, den der Renderer zeichnen soll – Vorhersage plus linearer
   * Zwischenschritt bis zur nächsten Eingabe plus auslaufender Restfehler.
   * `null` heißt „keine Vorhersage", dann bleibt es bei der Interpolation.
   */
  sample(now: number = this.clock()): SelfSample | null {
    if (!this.active) return null;
    return {
      position: this.renderedPosition(now),
      velocity: { x: this.state.velocity.x, y: this.state.velocity.y },
      signature: this.predictedFamily() ? this.state.signature : null
    };
  }

  /** Signature nur vorhersagen, wenn der Server sie überhaupt meldet. */
  private predictedFamily(): SignatureFamily | null {
    return this.serverSendsSignature ? this.family : null;
  }

  private renderedPosition(now: number): Vector2 {
    // Eingaben gehen mit 40 Hz raus, gezeichnet wird mit 60+ Hz. Zwischen zwei
    // Ticks wird linear weitergeschoben – gedeckelt auf einen Tick, damit eine
    // Lücke (Tab im Hintergrund) nicht in die Wand extrapoliert.
    const age = clamp((now - this.steppedAt) / 1000, 0, PREDICTION_DT);
    const decay = Math.exp(-Math.max(0, (now - this.errorAt) / 1000) / ERROR_TAU_SECONDS);
    return {
      x: this.state.position.x + this.state.velocity.x * age + this.error.x * decay,
      y: this.state.position.y + this.state.velocity.y * age + this.error.y * decay
    };
  }
}

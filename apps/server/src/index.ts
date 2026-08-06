import { existsSync } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import cors from 'cors';
import express, { type Request, type Response } from 'express';
import WebSocket, { WebSocketServer, type RawData } from 'ws';
import { z } from 'zod';
import {
  GAME,
  PLAYER_CLASS_IDS,
  UPGRADE_IDS,
  sanitizePlayerName,
  type ClientMessage,
  type ServerMessage
} from '@project-maze/shared';
import {
  ACTIVE_MODULE_IDS,
  PASSIVE_MODIFIER_IDS,
  type GameplayClientMessage
} from '@project-maze/shared/gameplay';
import { attachAchievementSnapshots, tuneAchievements } from './achievements.js';
import { tuneArenaDirector } from './arena-director.js';
import { tuneArenaEvents } from './arena-events.js';
import { tuneArenaSystems } from './arena-systems.js';
import { authStatus, initAuth, verifyAuthToken } from './auth.js';
import {
  CLIENT_METRICS_BODY_LIMIT,
  CLIENT_METRICS_COST,
  clientMetricsHandler,
  clientMetricsSummary
} from './client-metrics.js';
import { tuneClassMechanics } from './class-mechanics.js';
import { tuneCombatScaling } from './combat-tuning.js';
import {
  applyDebugBuild,
  clearDebugDummies,
  clearDebugProjectiles,
  healDebugPlayer,
  setDebugBotsPaused,
  setDebugGodMode,
  spawnDebugDummy,
  tuneDebugRules,
  type DebugPreset
} from './debug-lab.js';
import { DEFAULT_BOT_PACING, tuneBotBrain } from './bot-brain.js';
import { tuneDrones } from './drone-tuning.js';
import { tuneFamilyUpgrades, type SignatureFamily } from './family-upgrades.js';
import { MazeGame } from './game.js';
import { tuneInputAck } from './input-ack.js';
import { activateModule, equipLoadout, tuneLoadoutSystem } from './loadout-system.js';
import { tuneProgression } from './progression-tuning.js';
import { tuneProjectileSpeed } from './projectile-speed.js';
import { createRateLimiter, messageKindOf, rateLimitsEnabled } from './rate-limits.js';
import {
  PROFILE_BODY_LIMIT,
  PROFILE_WRITE_COST,
  flushPersistence,
  leaderboardHandler,
  linkPlayerToUser,
  persistenceStats,
  profileHandler,
  profileUpdateHandler,
  tunePersistence
} from './persistence.js';
import { DEFAULT_BUDGET, tuneControlSignature } from './signature-control.js';
import { DEFAULT_CHARGE, tunePrecisionSignature } from './signature-precision.js';
import { DEFAULT_MOMENTUM, tuneRapidBots, tuneRapidSignature } from './signature-rapid.js';
import { DEFAULT_WUCHT, tuneImpactSignature } from './signature-impact.js';
import { hardenSimulation } from './simulation-hardening.js';
import { tuneSpectator } from './spectator.js';
import { tuneSnapshotEncoding } from './snapshot-encoding.js';
import { createGracefulShutdown, installSignalHandlers } from './shutdown.js';
import { metricsHandler, tuneTelemetry } from './telemetry.js';

function integerEnvironment(name: string, fallback: number, minimum: number, maximum: number): number {
  const parsed = Number.parseInt(process.env[name] ?? '', 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(minimum, Math.min(maximum, parsed));
}

const PORT = integerEnvironment('PORT', 2567, 1, 65535);
/** In Produktion hinter Reverse-Proxy auf 127.0.0.1 binden – nur Caddy/nginx erreicht den Prozess. */
const HOST = process.env.HOST?.trim() || '0.0.0.0';
const BOT_COUNT = integerEnvironment('BOT_COUNT', 8, 0, 18);
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN?.trim() || '*';
const ENABLE_DEV_TOOLS = process.env.ENABLE_DEV_TOOLS === 'true';
/**
 * Lässt unveränderte Statik- und Wandfelder aus dem Snapshot weg. Setzt einen
 * Client voraus, der den letzten Stand puffert – bis der ausgeliefert ist,
 * bleibt der Schalter aus. Das Runden der Zahlen läuft unabhängig davon.
 */
const SNAPSHOT_DELTAS = process.env.SNAPSHOT_DELTAS === 'true';
/**
 * Serverseitige Achievement-Engine. Rein beobachtend und nur im Arbeitsspeicher;
 * ohne den Schalter wird die Schicht gar nicht erst angehängt.
 */
const ACHIEVEMENTS_ENABLED = process.env.ACHIEVEMENTS_ENABLED === 'true';
/**
 * Ersetzt UUIDs im Snapshot durch kurze Zahlen. Setzt – wie SNAPSHOT_DELTAS –
 * einen Client voraus, der die neue Feldform kennt; bis dahin aus.
 */
const SHORT_NET_IDS = process.env.SHORT_NET_IDS === 'true';
/**
 * Nach dem Tod live dem eigenen Killer zusehen. Braucht einen Client, der die
 * Kamera auf `spectatorTargetId` zentriert; bis dahin aus.
 */
const SPECTATOR_ENABLED = process.env.SPECTATOR_ENABLED === 'true';
/**
 * Arena-Direktor: hält die Bot-Population passend zur Zahl der Menschen.
 * Standardmäßig an; `false` friert die Population auf `BOT_COUNT` ein.
 */
// Opt-out-Flag: Auch 'FALSE', '0' und 'off' müssen abschalten – ein Tippfehler
// darf nicht kommentarlos in die riskante Richtung „an" fallen.
const ARENA_DIRECTOR_ENABLED = !['false', '0', 'off']
  .includes((process.env.ARENA_DIRECTOR_ENABLED ?? '').trim().toLowerCase());
/**
 * Aggro-Pacing der Bots: Verschnaufpause nach einem Abschuss, Jagd-Timeout,
 * harter Angreifer-Deckel und stilabhängige Angriffslust. Standardmäßig an;
 * `false` stellt die Zielwahl exakt auf den Stand davor zurück.
 */
const BOT_PACING_ENABLED = !['false', '0', 'off']
  .includes((process.env.BOT_PACING_ENABLED ?? '').trim().toLowerCase());
/**
 * Klassen 3.0, erste Familie: Momentum für RAPID. Standardmäßig aus – ohne den
 * Schalter wird die Schicht gar nicht erst angehängt, `signature` taucht in
 * keinem Snapshot auf und die Nachladezeiten sind exakt die alten. An, sobald
 * der Momentum-Balken im Client steht.
 */
const SIGNATURE_RAPID_ENABLED = process.env.SIGNATURE_RAPID_ENABLED === 'true';
/**
 * Klassen 3.0, zweite Familie: Wucht für IMPACT. Der Anlauf-Skalar erhöht den
 * Körperschaden und wird beim Aufprall verbraucht. Standardmäßig aus – ohne den
 * Schalter wird die Schicht gar nicht erst angehängt.
 */
const SIGNATURE_IMPACT_ENABLED = process.env.SIGNATURE_IMPACT_ENABLED === 'true';
/**
 * Klassen 3.0, dritte Familie: Ladeschuss für PRECISION. Halten lädt, Loslassen
 * schießt, ein Sofortklick ist ein schwacher Schuss. Der Schaden steigt dabei
 * nie über den heutigen Wert – ein Lancer trägt schon jetzt 86 % des Lebens des
 * dünnsten Gegners seiner Stufe. Standardmäßig aus.
 */
const SIGNATURE_PRECISION_ENABLED = process.env.SIGNATURE_PRECISION_ENABLED === 'true';
/**
 * Klassen 3.0, vierte Familie: Einheiten-Budget für CONTROL. Der Zeitgeber, der
 * verlorene Drohnen ersetzt, wird durch ein Nachschub-Konto abgelöst: volles
 * Budget = eine komplette Flotte. Im Mittel dasselbe Tempo wie heute, aber wer
 * zweimal kurz hintereinander verliert, steht ohne Nachschub da.
 */
const SIGNATURE_CONTROL_ENABLED = process.env.SIGNATURE_CONTROL_ENABLED === 'true';
/**
 * Klassen 3.0, KL4: Familien-Upgrades. Die beiden Slots `signatureRate` und
 * `signaturePower` werden kaufbar, und die Signature-Stärke wandert aus dem
 * Festwert in die Punkte-Ökonomie (Sockel + Punkte). Standardmäßig aus – ohne
 * den Schalter ist kein Slot kaufbar und beide Signatures rechnen mit ihren
 * bisherigen Festwerten.
 */
const FAMILY_UPGRADES_ENABLED = process.env.FAMILY_UPGRADES_ENABLED === 'true';
/**
 * Für welche Familien die Slots wirklich kaufbar sind: nur die, deren Signature
 * gebaut **und** eingeschaltet ist. Ein Slot ohne laufende Signature wäre ein
 * Punktegrab – der Spieler zahlt, und nichts passiert. Precision und Control
 * kommen automatisch dazu, sobald ihre Signature hier eingehängt wird.
 */
const FAMILY_UPGRADE_BRANCHES: SignatureFamily[] = FAMILY_UPGRADES_ENABLED
  ? ([
      SIGNATURE_RAPID_ENABLED ? 'rapid' : null,
      SIGNATURE_IMPACT_ENABLED ? 'impact' : null,
      SIGNATURE_PRECISION_ENABLED ? 'precision' : null,
      SIGNATURE_CONTROL_ENABLED ? 'control' : null
    ].filter(Boolean) as SignatureFamily[])
  : [];
/**
 * Projektiltempo 2.0: Dämpfer für alle Zweige, ein mit dem Level fallender
 * Deckel und ein Boden, unter den keine Kugel fällt. Dazu ein flacheres
 * Upgrade und ein Vorhalt-Ausgleich für die Bots. Standardmäßig aus – ohne
 * den Schalter fliegen die Kugeln exakt wie bisher.
 */
const PROJECTILE_SPEED_V2 = process.env.PROJECTILE_SPEED_V2 === 'true';
/**
 * Rate-Limits und Missbrauchsschutz. Standardmäßig an; `false` schaltet sie
 * vollständig ab (dann verhält sich der Server wie vor dem Modul).
 */
const RATE_LIMITS_ENABLED = rateLimitsEnabled();
const allowedOrigins = ALLOWED_ORIGIN === '*'
  ? null
  : new Set(ALLOWED_ORIGIN.split(',').map((value) => value.trim()).filter(Boolean));

function originAllowed(origin: string | undefined): boolean {
  if (!allowedOrigins || !origin) return true;
  return allowedOrigins.has(origin);
}

// Login-Verifikation vorbereiten. Ohne AUTH_ENABLED=true bleibt sie inaktiv;
// die Join-Message trägt noch kein Token (siehe docs/SUPABASE.md).
initAuth();

const rateLimiter = createRateLimiter();

const app = express();
app.disable('x-powered-by');
app.use(cors({ origin: allowedOrigins ? [...allowedOrigins] : true }));
const server = createServer(app);
const wss = new WebSocketServer({ server, maxPayload: 4096 });
// Reihenfolge der äußeren Schichten: Encoding zuallerletzt, damit nur das
// komprimiert wird, was wirklich über die Leitung geht – Persistenz und
// Telemetrie sehen weiterhin vollständige Snapshots.
const encodedGame = tuneSnapshotEncoding(
  tunePersistence(
    tuneTelemetry(
      tuneDebugRules(
        tuneAchievements(
          tuneArenaEvents(
            tuneArenaSystems(
              tuneLoadoutSystem(
                tuneProgression(
                  tuneArenaDirector(
                    // Bewegungsregel für Rapid-Bots von außen: `tuneBotBrain`
                    // ersetzt `updateBot` komplett, innen ginge sie verloren.
                    tuneRapidBots(
                      tuneBotBrain(
                        tuneClassMechanics(
                          // Einheiten-Budget ausserhalb von tuneDrones: Es
                          // bezahlt und verstaerkt die fertige Einheit.
                          tuneControlSignature(
                          tuneDrones(
                            // Momentum direkt um das Kampf-Tuning: Dort entsteht
                            // der Cooldown, den die Signature verkürzt.
                            tuneImpactSignature(
                              tuneRapidSignature(
                                // Familiensperre direkt außerhalb des
                                // Kampf-Tunings: Das ersetzt `applyUpgrade`
                                // vollständig, weiter innen ginge die Sperre
                                // kommentarlos verloren.
                                // Ladeschuss direkt um das Kampf-Tuning: Dort
                                // steht die Zeile, die bei gehaltener Taste
                                // sofort feuert – genau die setzt er aus.
                                tunePrecisionSignature(
                                tuneFamilyUpgrades(
                                  tuneCombatScaling(
                                    // Projektiltempo vor allem anderen: Es
                                    // aendert die Statik, aus der jede weitere
                                    // Schicht ihre Werte zieht.
                                    tuneProjectileSpeed(
                                      tuneSpectator(hardenSimulation(new MazeGame(BOT_COUNT)), SPECTATOR_ENABLED),
                                      PROJECTILE_SPEED_V2
                                    )
                                  ),
                                  FAMILY_UPGRADE_BRANCHES
                                ),
                                SIGNATURE_PRECISION_ENABLED,
                                DEFAULT_CHARGE,
                                FAMILY_UPGRADES_ENABLED
                                ),
                                SIGNATURE_RAPID_ENABLED,
                                DEFAULT_MOMENTUM,
                                FAMILY_UPGRADES_ENABLED
                              ),
                              SIGNATURE_IMPACT_ENABLED,
                              DEFAULT_WUCHT,
                              FAMILY_UPGRADES_ENABLED
                            )
                          ),
                          SIGNATURE_CONTROL_ENABLED,
                          DEFAULT_BUDGET,
                          FAMILY_UPGRADES_ENABLED
                          )
                        ),
                        BOT_PACING_ENABLED ? DEFAULT_BOT_PACING : null
                      ),
                      SIGNATURE_RAPID_ENABLED
                    ),
                    ARENA_DIRECTOR_ENABLED
                  )
                )
              )
            )
          ),
          ACHIEVEMENTS_ENABLED
        )
      )
    )
  ),
  SNAPSHOT_DELTAS,
  SHORT_NET_IDS
);
// Achievement-Drain als äußerste Schicht: nur echte, an Clients gehende
// Snapshots leeren die Warteschlange (Telemetrie-Round-Robin bleibt außen vor).
// Input-Quittung ganz außen: Dort ist `selfId` garantiert der Empfänger, auch
// wenn der Snapshot inhaltlich aus der Perspektive des Killers gebaut wurde.
const game = tuneInputAck(ACHIEVEMENTS_ENABLED ? attachAchievementSnapshots(encodedGame) : encodedGame);
const socketPlayerIds = new WeakMap<WebSocket, string>();
const socketAlive = new WeakMap<WebSocket, boolean>();

const joinSchema = z.object({
  type: z.literal('join'),
  name: z.string().transform(sanitizePlayerName).pipe(z.string().min(1).max(18)),
  authToken: z.string().min(1).max(4096).optional()
}).strict();
const inputSchema = z.object({
  type: z.literal('input'),
  sequence: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  move: z.object({ x: z.number().finite().min(-2).max(2), y: z.number().finite().min(-2).max(2) }),
  aim: z.object({
    x: z.number().finite().min(-GAME.maxAimDistance * 1.25).max(GAME.maxAimDistance * 1.25),
    y: z.number().finite().min(-GAME.maxAimDistance * 1.25).max(GAME.maxAimDistance * 1.25)
  }),
  primary: z.boolean(),
  secondary: z.boolean()
}).strict();
const upgradeSchema = z.object({ type: z.literal('upgrade'), upgrade: z.enum(UPGRADE_IDS) }).strict();
const classSchema = z.object({ type: z.literal('chooseClass'), playerClass: z.enum(PLAYER_CLASS_IDS) }).strict();
const respawnSchema = z.object({ type: z.literal('respawn') }).strict();
const pingSchema = z.object({ type: z.literal('ping'), sentAt: z.number().finite() }).strict();
const equipLoadoutSchema = z.object({
  type: z.literal('equipLoadout'),
  activeModule: z.enum(ACTIVE_MODULE_IDS),
  passiveModifier: z.enum(PASSIVE_MODIFIER_IDS)
}).strict();
const activateModuleSchema = z.object({ type: z.literal('activateModule') }).strict();
const debugSchema = z.discriminatedUnion('action', [
  z.object({
    type: z.literal('debug'),
    action: z.literal('setBuild'),
    playerClass: z.enum(PLAYER_CLASS_IDS),
    level: z.number().int().min(1).max(GAME.maxLevel),
    preset: z.enum(['blank', 'balanced', 'offense', 'defense', 'mobility'])
  }).strict(),
  z.object({ type: z.literal('debug'), action: z.literal('heal') }).strict(),
  z.object({ type: z.literal('debug'), action: z.literal('clearProjectiles') }).strict(),
  z.object({ type: z.literal('debug'), action: z.literal('setGod'), enabled: z.boolean() }).strict(),
  z.object({ type: z.literal('debug'), action: z.literal('pauseBots'), paused: z.boolean() }).strict(),
  z.object({ type: z.literal('debug'), action: z.literal('spawnDummy'), playerClass: z.enum(PLAYER_CLASS_IDS) }).strict(),
  z.object({ type: z.literal('debug'), action: z.literal('clearDummies') }).strict()
]);
type DebugMessage = z.infer<typeof debugSchema>;

function send(socket: WebSocket, message: ServerMessage, allowDrop = false): void {
  if (socket.readyState !== WebSocket.OPEN) return;
  if (allowDrop && socket.bufferedAmount > GAME.snapshotBackpressureBytes) return;
  socket.send(JSON.stringify(message));
}

wss.on('connection', (socket, request) => {
  if (!originAllowed(request.headers.origin)) {
    socket.close(1008, 'Origin not allowed');
    return;
  }
  // Verbindungslimit je IP, bevor irgendetwas anderes passiert.
  const admission = rateLimiter.accept(request);
  if (!admission.allowed) {
    socket.close(1013, admission.reason ?? 'Rate limit');
    return;
  }
  const guard = admission.guard;

  socketAlive.set(socket, true);
  let playerId: string | null = null;

  socket.on('pong', () => socketAlive.set(socket, true));
  socket.on('message', (raw: RawData) => {
    const now = Date.now();
    const rawSize = Array.isArray(raw) ? raw.reduce((total, part) => total + part.byteLength, 0) : raw.byteLength;
    if (rawSize > 4096) {
      socket.close(1009, 'Message too large');
      return;
    }

    try {
      const rawText = Array.isArray(raw) ? Buffer.concat(raw).toString() : raw.toString();
      const message = JSON.parse(rawText) as ClientMessage | GameplayClientMessage | DebugMessage;
      // Erst drosseln, dann trennen: Eine gedrosselte Nachricht fällt still
      // weg, erst anhaltender Missbrauch beendet die Verbindung.
      const verdict = guard.admit(messageKindOf(message), now);
      if (verdict === 'disconnect') {
        socket.close(1008, 'Rate limit exceeded');
        return;
      }
      if (verdict === 'throttle') return;

      if (message.type === 'join') {
        const parsed = joinSchema.safeParse(message);
        if (!parsed.success || playerId || game.humanCount >= GAME.maxPlayers) {
          send(socket, { type: 'error', message: game.humanCount >= GAME.maxPlayers ? 'Die Arena ist voll.' : 'Beitritt nicht möglich.' });
          return;
        }
        // Join-Versuche je IP begrenzen – auch gescheiterte zählen mit.
        if (!guard.admitJoin(now)) {
          send(socket, { type: 'error', message: 'Zu viele Beitritte. Bitte kurz warten.' });
          return;
        }
        playerId = game.addPlayer(parsed.data.name);
        socketPlayerIds.set(socket, playerId);
        send(socket, { type: 'welcome', selfId: playerId });
        // Login ist optional und darf den Join nie verzögern: Der Spieler ist schon
        // drin, das Konto wird ein paar Millisekunden später angeheftet.
        if (parsed.data.authToken) {
          const joinedId = playerId;
          void verifyAuthToken(parsed.data.authToken)
            .then((user) => { if (user) linkPlayerToUser(game, joinedId, user); });
        }
        return;
      }
      if (message.type === 'equipLoadout' && playerId) {
        const parsed = equipLoadoutSchema.safeParse(message);
        if (parsed.success) equipLoadout(game, playerId, parsed.data.activeModule, parsed.data.passiveModifier, now);
        return;
      }
      if (message.type === 'activateModule' && playerId) {
        const parsed = activateModuleSchema.safeParse(message);
        if (parsed.success) activateModule(game, playerId, now);
        return;
      }
      if (message.type === 'debug' && playerId) {
        if (!ENABLE_DEV_TOOLS) return;
        const parsed = debugSchema.safeParse(message);
        if (!parsed.success) return;
        if (parsed.data.action === 'setBuild') {
          applyDebugBuild(game, playerId, {
            playerClass: parsed.data.playerClass,
            level: parsed.data.level,
            preset: parsed.data.preset as DebugPreset
          }, now);
        } else if (parsed.data.action === 'heal') {
          healDebugPlayer(game, playerId);
        } else if (parsed.data.action === 'clearProjectiles') {
          clearDebugProjectiles(game);
        } else if (parsed.data.action === 'setGod') {
          setDebugGodMode(game, playerId, parsed.data.enabled);
        } else if (parsed.data.action === 'pauseBots') {
          setDebugBotsPaused(game, parsed.data.paused);
        } else if (parsed.data.action === 'spawnDummy') {
          spawnDebugDummy(game, playerId, parsed.data.playerClass, now);
        } else {
          clearDebugDummies(game);
        }
        return;
      }
      if (message.type === 'input' && playerId) {
        const parsed = inputSchema.safeParse(message);
        if (parsed.success) game.applyInput(playerId, parsed.data);
        return;
      }
      if (message.type === 'upgrade' && playerId) {
        const parsed = upgradeSchema.safeParse(message);
        if (parsed.success) game.applyUpgrade(playerId, parsed.data.upgrade);
        return;
      }
      if (message.type === 'chooseClass' && playerId) {
        const parsed = classSchema.safeParse(message);
        if (parsed.success) game.chooseClass(playerId, parsed.data.playerClass);
        return;
      }
      if (message.type === 'respawn' && playerId) {
        const parsed = respawnSchema.safeParse(message);
        if (parsed.success) game.requestRespawn(playerId, now);
        return;
      }
      if (message.type === 'ping') {
        const parsed = pingSchema.safeParse(message);
        if (parsed.success) send(socket, { type: 'pong', sentAt: parsed.data.sentAt, serverTime: now });
      }
    } catch {
      if (!guard.admitMalformed()) socket.close(1008, 'Too many invalid messages');
    }
  });

  socket.on('close', () => {
    if (playerId) game.removePlayer(playerId);
    socketPlayerIds.delete(socket);
    socketAlive.delete(socket);
    guard.release();
  });
  socket.on('error', () => {});
});

const tickTimer = setInterval(() => game.step(1 / GAME.tickRate), 1000 / GAME.tickRate);
const snapshotTimer = setInterval(() => {
  for (const socket of wss.clients) {
    const playerId = socketPlayerIds.get(socket);
    if (!playerId || socket.readyState !== WebSocket.OPEN) continue;
    // Backpressure vor dem Bauen prüfen: Ein verworfener Snapshot hätte beim
    // Delta-Versand Felder mitgenommen, die der Server als übertragen verbucht.
    // Spart nebenbei die Serialisierung, die ohnehin niemand bekommen hätte.
    if (socket.bufferedAmount > GAME.snapshotBackpressureBytes) continue;
    send(socket, game.snapshot(playerId));
  }
}, 1000 / GAME.snapshotRate);
const heartbeatTimer = setInterval(() => {
  for (const socket of wss.clients) {
    if (socketAlive.get(socket) === false) {
      socket.terminate();
      continue;
    }
    socketAlive.set(socket, false);
    socket.ping();
  }
}, 30000);
tickTimer.unref();
snapshotTimer.unref();
heartbeatTimer.unref();

// Railway schickt bei jedem Redeploy SIGTERM: Clients bekommen einen sauberen
// Close-Frame und reconnecten sofort, statt in einen Timeout zu laufen.
const gracefulShutdown = createGracefulShutdown({
  server,
  wss,
  timers: [tickTimer, snapshotTimer, heartbeatTimer],
  drainMs: integerEnvironment('SHUTDOWN_DRAIN_MS', 0, 0, 30_000),
  // Gepufferte Runs noch wegschreiben, bevor der Prozess geht.
  beforeClose: async () => {
    rateLimiter.stop();
    await flushPersistence(game);
  },
  log: (message: string) => console.log(`[shutdown] ${message}`)
});
installSignalHandlers(gracefulShutdown);

app.get('/health', (_request: Request, response: Response) => {
  const draining = gracefulShutdown.isShuttingDown();
  // Ohne diesen Header antwortet Express mit ETag, und ein Browser-Tab zeigt
  // nach dem Neuladen den alten Stand. Genau daran haben wir am 06.08. einen
  // Deploy-Stillstand diagnostiziert, den es nicht gab: /health ist unser
  // Testprotokoll und darf als einziger Endpunkt nie aus dem Cache kommen.
  response.setHeader('Cache-Control', 'no-store');
  // Während des Drainens 503, damit der Loadbalancer keinen Traffic mehr schickt.
  return response.status(draining ? 503 : 200).json({
    ok: !draining,
    draining,
    humans: game.humanCount,
    ...game.entityCounts,
    mode: 'maze-alpha',
    version: '1.0.0-alpha',
    // Zeigt, welcher Stand wirklich ausgeliefert wird – Railway setzt die Variable beim Build.
    commit: (process.env.RAILWAY_GIT_COMMIT_SHA ?? process.env.GIT_COMMIT ?? 'unbekannt').slice(0, 7),
    // ACHTUNG: fester Text im Quelltext, keine Build-Information. Er ändert
    // sich nur, wenn jemand ihn hier ändert, und beweist deshalb nichts über
    // den laufenden Stand – dafür ist `commit` da, und daneben `uptimeSeconds`.
    build: 'sprint-b2+static-renderers',
    // Wie lange dieser Prozess schon läuft. Das ist die einzige Alterangabe,
    // die ohne die Railway-Variable auskommt: Steht hier ein Wert von Tagen,
    // hat es seit Tagen keinen Deploy gegeben – auch dann, wenn `commit` etwas
    // anderes behauptet, weil die Variable irgendwo fest verdrahtet wurde.
    uptimeSeconds: Math.round(process.uptime()),
    // 01 und 04 hatten unabhängig voneinander dieselbe Idee; `uptimeSeconds`
    // hat gewonnen, weil die Deploy-Wache darauf zugreift. `deploymentId` sagt
    // etwas anderes und bleibt deshalb: welche Auslieferung hier läuft. Wenn
    // die sich ändert und `commit` nicht, ist die Git-Variable fest verdrahtet.
    deploymentId: (process.env.RAILWAY_DEPLOYMENT_ID ?? 'lokal').slice(0, 8),
    snapshotRate: GAME.snapshotRate,
    debugTools: ENABLE_DEV_TOOLS,
    // Macht die Feature-Schalter von außen prüfbar – sonst sieht man einer
    // falsch geschriebenen ENV-Variable nie an, dass sie nicht greift.
    // Jedes Flag, das Spielgefühl verändert, gehört hier hinein: /health ist das
    // Testprotokoll, wenn Sam sagt „geht nicht". Die Signatures fehlten – genau
    // die, deren Wirkung gerade beurteilt werden soll.
    features: { achievements: ACHIEVEMENTS_ENABLED, snapshotDeltas: SNAPSHOT_DELTAS, shortNetIds: SHORT_NET_IDS, arenaDirector: ARENA_DIRECTOR_ENABLED, rateLimits: RATE_LIMITS_ENABLED, spectator: SPECTATOR_ENABLED, signatureRapid: SIGNATURE_RAPID_ENABLED, signatureImpact: SIGNATURE_IMPACT_ENABLED, familyUpgrades: FAMILY_UPGRADES_ENABLED, familyUpgradeBranches: FAMILY_UPGRADE_BRANCHES, projectileSpeedV2: PROJECTILE_SPEED_V2, signaturePrecision: SIGNATURE_PRECISION_ENABLED, signatureControl: SIGNATURE_CONTROL_ENABLED },
    persistence: persistenceStats(game),
    auth: authStatus(),
    clientMetrics: (({ buckets: _buckets, rejected: _rejected, ...rest }) => rest)(clientMetricsSummary()),
    abuse: rateLimiter.stats()
  });
});
app.get('/metrics', metricsHandler(game));
// Öffentliche Routen: gehen im Zweifel an die Datenbank, deshalb mit Limit.
// /health bleibt ungebremst – daran hängt der Health-Check der Plattform.
const publicGuard = rateLimiter.httpGuard();
app.get('/leaderboard', publicGuard, leaderboardHandler(game));
app.get('/profile/:userId', publicGuard, profileHandler(game));
// Schreibzugriff: teurer im selben IP-Budget (rund 20/min) und mit engem
// Body-Limit – ein einzelnes Textfeld braucht nie mehr als ein Kilobyte.
app.post(
  '/profile',
  rateLimiter.httpGuard({ cost: PROFILE_WRITE_COST }),
  express.json({ limit: PROFILE_BODY_LIMIT }),
  profileUpdateHandler(game)
);
// Anonyme Perf-Berichte des Clients: kein Token, winziger Body, eigenes
// Kostengewicht im IP-Budget. Höchstens ein Bericht pro Minute und Client.
app.post(
  '/client-metrics',
  rateLimiter.httpGuard({ cost: CLIENT_METRICS_COST }),
  express.json({ limit: CLIENT_METRICS_BODY_LIMIT }),
  clientMetricsHandler()
);

// Single-Service-Deploy: der Server liefert den Client-Build selbst aus
// (eine URL, gleiche Origin für HTTP und WebSocket, kein CORS nötig).
// CLIENT_DIST überschreibt den Pfad; leerer String deaktiviert das Ausliefern.
const defaultClientDist = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '../../client/dist');
const CLIENT_DIST = process.env.CLIENT_DIST !== undefined
  ? process.env.CLIENT_DIST.trim()
  : existsSync(path.join(defaultClientDist, 'index.html')) ? defaultClientDist : '';
if (CLIENT_DIST) {
  const clientRoot = path.resolve(CLIENT_DIST);
  app.use(express.static(clientRoot));
  app.use((request: Request, response: Response, next: () => void) => {
    if (request.method !== 'GET') return next();
    // Fehlende Assets müssen 404 bleiben: index.html als Antwort auf eine .js-Anfrage
    // lässt dynamische Imports mit einem MIME-Fehler scheitern statt sichtbar zu failen.
    if (/\.[a-z0-9]+$/i.test(request.path)) return next();
    response.sendFile(path.join(clientRoot, 'index.html'));
  });
}

server.listen(PORT, HOST, () => console.log(`Project Maze server listening on http://${HOST}:${PORT}`));

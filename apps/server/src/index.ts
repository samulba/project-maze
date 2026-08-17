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
  type ServerMessage,
  ARENA_MODES,
  ARENA_MODE_IDS,
  isArenaMode,
  type ArenaMode
} from '@project-maze/shared';
import {
  ACTIVE_MODULE_IDS,
  PASSIVE_MODIFIER_IDS,
  type GameplayClientMessage
} from '@project-maze/shared/gameplay';
import { attachAchievementSnapshots, tuneAchievements } from './achievements.js';
import { tuneArenaDirector } from './arena-director.js';
import { tuneArenaEvents } from './arena-events.js';
import { DEFAULT_ROYALE, tuneRoyale } from './arena-royale.js';
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
import { tuneFireRecoil } from './fire-recoil.js';
import { tuneHitDirection } from './hit-direction.js';
import { MazeGame } from './game.js';
import { tuneInputAck } from './input-ack.js';
import { tuneInputIdle } from './input-idle.js';
import { activateModule, equipLoadout, tuneLoadoutSystem } from './loadout-system.js';
import { tuneProgression } from './progression-tuning.js';
import { DEFAULT_RANGE_CAP, setProjectileRangeCap, tuneProjectileSpeed } from './projectile-speed.js';
import { tunePerks } from './perks.js';
import { createRateLimiter, messageKindOf, rateLimitsEnabled } from './rate-limits.js';
import { preflightMeldung, supabasePreflight, type PreflightErgebnis } from './supabase-preflight.js';
import {
  PROFILE_BODY_LIMIT,
  PROFILE_WRITE_COST,
  flushPersistence,
  leaderboardHandler,
  linkPlayerToUser,
  persistenceConfig,
  persistenceStats,
  profileHandler,
  profileUpdateHandler,
  tunePersistence
} from './persistence.js';
import {
  beginSession,
  flushSessions,
  linkSessionToUser,
  sessionsStats,
  tuneSessions
} from './sessions.js';
import { adminGuard, createAdminRoutes } from './admin.js';
import { DEFAULT_BUDGET, tuneControlSignature } from './signature-control.js';
import { DEFAULT_CHARGE, tunePrecisionSignature } from './signature-precision.js';
import { DEFAULT_MOMENTUM, tuneRapidBots, tuneRapidSignature } from './signature-rapid.js';
import { DEFAULT_SCHILD, tuneAegisSignature } from './signature-aegis.js';
import { DEFAULT_STELLUNG, tuneSiegeSignature } from './signature-siege.js';
import { DEFAULT_STEALTH, tuneSpecterSignature } from './signature-specter.js';
import { DEFAULT_HEAT, tuneTempestSignature } from './signature-tempest.js';
import { DEFAULT_WUCHT, tuneImpactSignature } from './signature-impact.js';
import { hardenSimulation } from './simulation-hardening.js';
import { tuneSpectator } from './spectator.js';
import { tuneSnapshotEncoding } from './snapshot-encoding.js';
import { createGracefulShutdown, installSignalHandlers } from './shutdown.js';
import { createSiteGate, siteGateConfig } from './site-gate.js';
import { servePrecompressed } from './static-assets.js';
import { metricsHandler, telemetryTickHealth, tuneTelemetry } from './telemetry.js';
import { mapInfo, setArenaMode } from './world.js';

function integerEnvironment(name: string, fallback: number, minimum: number, maximum: number): number {
  const parsed = Number.parseInt(process.env[name] ?? '', 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(minimum, Math.min(maximum, parsed));
}

const PORT = integerEnvironment('PORT', 2567, 1, 65535);
/** In Produktion hinter Reverse-Proxy auf 127.0.0.1 binden – nur Caddy/nginx erreicht den Prozess. */
const HOST = process.env.HOST?.trim() || '0.0.0.0';
/**
 * Startpopulation der Arena. Der Standard folgt `DEFAULT_DIRECTOR_CONFIG`
 * (Platz je Bot, nicht nackte Zahl); die Obergrenze liegt bewusst darüber,
 * damit sich die Arena ohne Deploy dichter stellen lässt.
 */
const BOT_COUNT = integerEnvironment('BOT_COUNT', 18, 0, 40);
/**
 * Der Modus dieser Arena – `maze` (Standard), `ffa` oder `royale`.
 *
 * Eine Arena je Prozess, wie `WALLS` und `BOT_COUNT`: Wer beide Modi anbieten
 * will, startet zwei Dienste. Das spart eine Menge Zustand, den sonst jede
 * Regel mitschleppen müsste, und ist derselbe Weg, den die Konfiguration hier
 * ohnehin schon geht.
 *
 * Ein Tippfehler fällt auf den Standard zurück und schreibt eine Zeile ins Log
 * – still in einen unerwarteten Modus zu starten wäre schlimmer.
 */
const ARENA_MODE: ArenaMode = (() => {
  const roh = (process.env.ARENA_MODE ?? '').trim().toLowerCase();
  if (roh === '') return 'maze';
  if (isArenaMode(roh)) return roh;
  console.warn(`ARENA_MODE="${roh}" ist unbekannt – starte als "maze". Gueltig: ${ARENA_MODE_IDS.join(', ')}`);
  return 'maze';
})();
/**
 * Zeitraffer für die Royale-Zone. `1` ist Normaltempo, `10` macht aus zehn
 * Minuten eine.
 *
 * Es gibt ihn aus zwei Gründen, und beide sind praktisch: Die Endphase eines
 * Battle Royale liegt sonst zehn Minuten hinter jedem Start – wer sie ansehen
 * oder abstimmen will, wartet jedes Mal. Und ein Test, der die Warnung am
 * Bildschirmrand belegen soll, kann nicht minutenlang auf den ersten Ring
 * warten.
 *
 * Bewusst kein Opt-out-Flag: Der Standard ist Normaltempo, und wer ihn
 * verstellt, will es.
 */
const ROYALE_SPEED = integerEnvironment('ROYALE_SPEED', 1, 1, 60);
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN?.trim() || '*';
const ENABLE_DEV_TOOLS = process.env.ENABLE_DEV_TOOLS === 'true';
/**
 * Lässt unveränderte Statik- und Wandfelder aus dem Snapshot weg.
 *
 * Die Bedingung dafür stand als Kommentar hier: „Setzt einen Client voraus, der
 * den letzten Stand puffert – bis der ausgeliefert ist, bleibt der Schalter
 * aus." Der Client ist ausgeliefert. `snapshot-hydrator.ts` sitzt an der
 * Socket-Grenze und routet *jeden* Snapshot durch den Hydrator; volle
 * Snapshots laufen dort unverändert durch. Damit ist der Schalter jetzt an.
 *
 * Gemessen (32 Clients, 30 s): 229,6 → 142,1 KB/s pro Spieler, also −38 %.
 * Das ist keine Kosmetik – siehe `docs/GOAL.md`, Entscheidung 3: Ohne diese
 * Ersparnis ist eine größere Karte mit mehr Spielern das teuerste Szenario
 * überhaupt, mit ihr das günstigste pro Kopf.
 *
 * Opt-out-Flag: `false` stellt exakt den Stand davor wieder her.
 */
const SNAPSHOT_DELTAS = !['false', '0', 'off']
  .includes((process.env.SNAPSHOT_DELTAS ?? '').trim().toLowerCase());
/**
 * Serverseitige Achievement-Engine. Rein beobachtend und nur im Arbeitsspeicher;
 * ohne den Schalter wird die Schicht gar nicht erst angehängt.
 *
 * **Opt-out seit dem 12.08.** Vorher stand hier `=== 'true'` – ein Opt-in, und
 * niemand hat es je gesetzt: `.env.example` sagte `false`, `docs/DEPLOY.md`
 * sagte „aus", und `railway.json` setzt gar keine Variablen. In Produktion lief
 * das Erfolgssystem also nie.
 *
 * Das war einmal richtig: Als der Schalter entstand, gab es serverseitig eine
 * Engine und sonst nichts. Inzwischen sind alle drei Teile da – der Client
 * zeigt Popups (`achievement-popups.ts`), die Profilkarte listet sie
 * (`profile.ts`), und die Persistenz schreibt sie (Migration 0003). Fertige
 * Arbeit hinter einem Schalter, den niemand setzt, ist keine Arbeit; genau
 * dieses Muster hat `docs/status/chat-04/17` schon einmal für drei andere
 * Schalter aufgeräumt.
 *
 * Der Preis ist klein und bekannt: eine Prüfung je Snapshot
 * (`drainUnlockedAchievements`), die im Normalfall eine leere Liste
 * zurückgibt, und ein Feld im Snapshot **nur im Moment einer Freischaltung**.
 */
const ACHIEVEMENTS_ENABLED = !['false', '0', 'off']
  .includes((process.env.ACHIEVEMENTS_ENABLED ?? '').trim().toLowerCase());
/**
 * Ersetzt UUIDs im Snapshot durch kurze Zahlen. Dieselbe Bedingung wie bei
 * `SNAPSHOT_DELTAS`, und dieselbe Antwort: Der Client kennt die Feldform
 * (`snapshot-hydrator.ts`, „überführt kurze Zahlen-IDs (SHORT_NET_IDS) in
 * Strings"), also ist der Schalter an.
 *
 * Gemessen obendrauf: 142,1 → 118,8 KB/s pro Spieler. Zusammen mit den Deltas
 * −48 % gegenüber vorher.
 *
 * Opt-out-Flag: `false` stellt exakt den Stand davor wieder her.
 */
const SHORT_NET_IDS = !['false', '0', 'off']
  .includes((process.env.SHORT_NET_IDS ?? '').trim().toLowerCase());
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
 * Klassen 3.0, erste Familie: Momentum für RAPID. Seit 06.08. standardmäßig **an**; `false` hängt die
 * Schicht gar nicht erst an, `signature` taucht dann in keinem Snapshot auf
 * und die Nachladezeiten sind exakt die alten.
 */
const SIGNATURE_RAPID_ENABLED = !['false', '0', 'off']
  .includes((process.env.SIGNATURE_RAPID_ENABLED ?? '').trim().toLowerCase());
/**
 * Klassen 3.0, zweite Familie: Wucht für IMPACT. Der Anlauf-Skalar erhöht den
 * Körperschaden und wird beim Aufprall verbraucht. Seit 06.08. standardmäßig
 * **an**; `false` hängt die Schicht gar nicht erst an.
 */
const SIGNATURE_IMPACT_ENABLED = !['false', '0', 'off']
  .includes((process.env.SIGNATURE_IMPACT_ENABLED ?? '').trim().toLowerCase());
/**
 * Klassen 3.0, dritte Familie: Ladeschuss für PRECISION. Halten lädt, Loslassen
 * schießt, ein Sofortklick ist ein schwacher Schuss. Der Schaden steigt dabei
 * nie über den heutigen Wert – ein Lancer trägt schon jetzt 86 % des Lebens des
 * dünnsten Gegners seiner Stufe.
 */
// Opt-out wie die beiden anderen Signatures, die Sam in Railway ohnehin gesetzt
// hat. Rapid und Impact liefen live, Precision nicht – dieselbe Familie, drei
// verschiedene Zustände, je nachdem wer wann welchen Schalter angefasst hat.
const SIGNATURE_PRECISION_ENABLED = !['false', '0', 'off']
  .includes((process.env.SIGNATURE_PRECISION_ENABLED ?? '').trim().toLowerCase());
/**
 * Klassen 3.0, vierte Familie: Einheiten-Budget für CONTROL. Der Zeitgeber, der
 * verlorene Drohnen ersetzt, wird durch ein Nachschub-Konto abgelöst: volles
 * Budget = eine komplette Flotte. Im Mittel dasselbe Tempo wie heute, aber wer
 * zweimal kurz hintereinander verliert, steht ohne Nachschub da.
 */
const SIGNATURE_CONTROL_ENABLED = !['false', '0', 'off']
  .includes((process.env.SIGNATURE_CONTROL_ENABLED ?? '').trim().toLowerCase());
/**
 * Klassen 3.0, KL4: Familien-Upgrades. Die beiden Slots `signatureRate` und
 * `signaturePower` werden kaufbar, und die Signature-Stärke wandert aus dem
 * Festwert in die Punkte-Ökonomie (Sockel + Punkte). Standardmäßig aus – ohne
 * den Schalter ist kein Slot kaufbar und die Signatures rechnen mit ihren
 * bisherigen Festwerten. Seit 06.08. standardmäßig **an**.
 */
// Opt-out (01, 06.08.): Die Sperre, wegen der das aus bleiben musste – die tote
// Digit0-Taste –, ist mit 03s Paket 13 gefallen. Danach gab es keinen Grund
// mehr, außer dass niemand den Schalter umgelegt hat.
const FAMILY_UPGRADES_ENABLED = !['false', '0', 'off']
  .includes((process.env.FAMILY_UPGRADES_ENABLED ?? '').trim().toLowerCase());
/**
 * Projektiltempo 2.0: Dämpfer für alle Zweige, ein mit dem Level fallender
 * Deckel und ein Boden, unter den keine Kugel fällt. Dazu ein flacheres
 * Upgrade und ein Vorhalt-Ausgleich für die Bots. Standardmäßig aus – ohne
 * den Schalter fliegen die Kugeln exakt wie bisher.
 */
// Opt-out, nicht Opt-in (01, 06.08.): Als Opt-in hat dieses Paket Sam nie
// erreicht – er hat zweimal „die Kugeln sind zu schnell" gemeldet, während der
// Schalter aus war und die Kugeln unverändert flogen. Ein Fix, den erst jemand
// von Hand einschalten muss, ist für ihn kein Fix. `false`, `0` oder `off`
// stellen das alte Tempo wieder her.
/**
 * Der Dash faehrt, statt zu springen: dieselbe Strecke, aber ueber die 180 ms
 * seiner Wirkdauer verteilt. Ohne den Schalter springt der Tank in einem
 * einzigen Tick um bis zu 189 px – beim Client kommt eine Positionsaenderung
 * zwischen zwei Snapshots an, und genau so sieht es aus. Standardmaessig aus:
 * gehoert zusammen mit 03s Spur eingeschaltet.
 */
// Opt-out nach der Regel vom 06.08.: Der Dash war buchstäblich ein Teleport –
// die ganzen 189 px in einem einzigen Tick –, und genau das hat Sam gemeldet.
// Ein Fix dafür hinter einem Schalter, den jemand erst setzen muss, wäre der
// dritte Anlauf desselben Fehlers. `false`/`0`/`off` stellt den Sprung zurück.
const DASH_TRAVEL_ENABLED = !['false', '0', 'off']
  .includes((process.env.DASH_TRAVEL_ENABLED ?? '').trim().toLowerCase());
/**
 * Rueckstoss beim Feuern (Sams Spieltest vom 13.08.). Getragen ueber die
 * Position, damit die Geschwindigkeits-Schwellen von SIEGE, Reparatur und
 * Stillstands-Perk unberuehrt bleiben - siehe fire-recoil.ts.
 * Opt-out: `false`/`0`/`off` stellt den Zustand ohne Rueckstoss her.
 */
const FIRE_RECOIL_ENABLED = !['false', '0', 'off']
  .includes((process.env.FIRE_RECOIL_ENABLED ?? '').trim().toLowerCase());
/**
 * Klassen 4.0, fuenfte Familie: Tarnung fuer SPECTER. Nicht schiessen baut
 * Tarnung auf, der Erstschlag aus voller Tarnung traegt Bonus. Opt-out.
 */
const SIGNATURE_SPECTER_ENABLED = !['false', '0', 'off']
  .includes((process.env.SIGNATURE_SPECTER_ENABLED ?? '').trim().toLowerCase());
/**
 * Klassen 4.0, sechste Familie: Hitze fuer TEMPEST. Feuern heizt (+Schaden),
 * bei 100 Ueberhitzung mit Feuersperre. Opt-out.
 */
const SIGNATURE_TEMPEST_ENABLED = !['false', '0', 'off']
  .includes((process.env.SIGNATURE_TEMPEST_ENABLED ?? '').trim().toLowerCase());
/**
 * Klassen 4.0, Welle B: Perks - je Klasse ab L15 ein benanntes
 * Alleinstellungsmerkmal (Daten in shared/perks, Wirkung in perks.ts).
 * Opt-out nach der Regel vom 06.08.
 */
const PERKS_ENABLED = !['false', '0', 'off']
  .includes((process.env.PERKS_ENABLED ?? '').trim().toLowerCase());
/**
 * Klassen 4.1, siebte Familie: Stellung fuer SIEGE. Stillstand macht Schuesse
 * haerter und weitreichender - das Gegenteil von Momentum. Opt-out.
 */
const SIGNATURE_SIEGE_ENABLED = !['false', '0', 'off']
  .includes((process.env.SIGNATURE_SIEGE_ENABLED ?? '').trim().toLowerCase());
/**
 * Klassen 4.1, achte Familie: Schild fuer AEGIS. Erlittener Schaden laedt, die
 * volle Ladung entlaedt sich als Schockwelle. Opt-out.
 */
const SIGNATURE_AEGIS_ENABLED = !['false', '0', 'off']
  .includes((process.env.SIGNATURE_AEGIS_ENABLED ?? '').trim().toLowerCase());

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
      SIGNATURE_CONTROL_ENABLED ? 'control' : null,
      // Klassen 4.3: Diese vier fehlten. Ihre Signatures liefen, aber die
      // beiden Slots blieben gesperrt – im Client sahen sie sogar frei aus.
      SIGNATURE_SPECTER_ENABLED ? 'specter' : null,
      SIGNATURE_TEMPEST_ENABLED ? 'tempest' : null,
      SIGNATURE_SIEGE_ENABLED ? 'siege' : null,
      SIGNATURE_AEGIS_ENABLED ? 'aegis' : null
    ].filter(Boolean) as SignatureFamily[])
  : [];
/**
 * Der Rueckstoss des Repulse wird ueber die Wirkdauer getragen, statt sofort
 * von der Bewegungsintegration gefressen zu werden. Ohne den Schalter legt ein
 * Getroffener gemessene **44 px** zurueck – einen Tankdurchmesser, bei 195 px
 * Wirkradius und 12 s Abklingzeit. Mit ihm ist es dieselbe Stossstaerke, aber
 * ueber die 260 ms Wirkdauer: rund 107 px auf 100 px Abstand.
 *
 * Standardmaessig **aus**, anders als die Dash-Fahrt: Die trug dieselbe Strecke
 * nur anders aus, das hier ist eine Verdopplung der Wirkung – eine
 * Balance-Entscheidung, und die trifft 01. (01: bleibt aus bis zur Messrunde
 * von Welle C - eine Verdopplung gehoert gemessen, nicht gefuehlt.)
 */
const REPULSE_TRAVEL_ENABLED = (process.env.REPULSE_TRAVEL_ENABLED ?? '').trim().toLowerCase() === 'true';
const PROJECTILE_SPEED_V2 = !['false', '0', 'off']
  .includes((process.env.PROJECTILE_SPEED_V2 ?? '').trim().toLowerCase());
/**
 * Obergrenze der Schussreichweite in Weltpixeln (Sams "die Schuesse gehen noch
 * immer zu weit"). `0` schaltet den Deckel ab. Begruendung der Standardzahl
 * steht bei DEFAULT_RANGE_CAP in projectile-speed.ts.
 */
const PROJECTILE_RANGE_CAP = (() => {
  const roh = (process.env.PROJECTILE_RANGE_CAP ?? '').trim();
  if (roh === '') return DEFAULT_RANGE_CAP;
  const zahl = Number(roh);
  return Number.isFinite(zahl) && zahl >= 0 ? zahl : DEFAULT_RANGE_CAP;
})();
setProjectileRangeCap(PROJECTILE_RANGE_CAP);
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

/*
 * Passwort-Tor. Es steht bewusst als ERSTE Schicht nach CORS – vor `/metrics`,
 * vor `/leaderboard`, vor dem Client-Build, vor allem.
 *
 * Die Alternative waere gewesen, es einzeln vor jede Route zu haengen. Genau
 * so entsteht die eine vergessene Route: `/map` und `/client-metrics` sind
 * nach `/leaderboard` dazugekommen, und wer sie damals nicht mitgedacht
 * haette, haette es nie gemerkt. Als aeusserste Schicht gilt die Regel
 * „geschlossen, ausser ausdruecklich offen" auch fuer jede Route, die es hier
 * noch gar nicht gibt.
 *
 * `/health` bleibt frei (siehe site-gate.ts) – daran haengt der Healthcheck
 * von Railway und die Deploy-Wache der CI.
 */
// Drei Kopfzeilen, die nichts kosten und je einen Weg zumachen: kein
// MIME-Raten, kein Einbetten der pausierten Seite in einen fremden Rahmen,
// keine Weitergabe der eigenen Adresse an Ziele, die jemand hier verlinkt.
// Bewusst ohne CSP – die waere hier nicht mit ein paar Zeilen richtig zu
// bekommen und eine halb richtige CSP macht nur die Konsole voll.
app.use((_request: Request, response: Response, next: () => void) => {
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('X-Frame-Options', 'DENY');
  response.setHeader('Referrer-Policy', 'no-referrer');
  next();
});

const siteGate = createSiteGate();
// Nur die Torseite selbst braucht einen Body-Parser, und der bekommt ein enges
// Limit: Ein Passwortfeld ist nie ein Kilobyte gross.
app.post('/gate/login', express.urlencoded({ extended: false, limit: '1kb' }), express.json({ limit: '1kb' }));
app.use(siteGate.middleware);
if (siteGate.enabled) {
  console.log(
    siteGate.usesDefaultPassword
      ? '[gate] Seite ist passwortgeschuetzt – ACHTUNG: Standardpasswort aus dem oeffentlichen Repo. Fuer echten Schutz SITE_PASSWORD setzen.'
      : '[gate] Seite ist passwortgeschuetzt (SITE_PASSWORD gesetzt).'
  );
} else {
  console.warn('[gate] SITE_GATE_ENABLED=false – die Seite ist oeffentlich erreichbar.');
}

const server = createServer(app);
const wss = new WebSocketServer({ server, maxPayload: 4096 });
// Reihenfolge der äußeren Schichten: Encoding zuallerletzt, damit nur das
// komprimiert wird, was wirklich über die Leitung geht – Persistenz und
// Telemetrie sehen weiterhin vollständige Snapshots.
/*
 * Der Modus muss VOR dem Bau der Arena stehen. Der Konstruktor von `MazeGame`
 * verteilt sofort 562 Formen und die Bots über die Karte und fragt dabei über
 * `isFree` bereits die *wirksamen* Wände ab. Wer erst danach umschaltet, hat
 * eine FFA-Arena, deren Startaufstellung noch um Wände herum gebaut wurde, die
 * es gar nicht gibt – Formenlöcher an Stellen, wo für den Spieler nichts steht.
 */
setArenaMode(ARENA_MODE);

const encodedGame = tuneSnapshotEncoding(
  // Sitzungserfassung außerhalb der Persistenz: Sie liest dieselben Ereignisse
  // (Tod, Verlassen), schreibt aber in eigene Tabellen und darf ausfallen, ohne
  // das Leaderboard mitzunehmen.
  tuneSessions(
  tunePersistence(
    tuneTelemetry(
      tuneDebugRules(
        tuneAchievements(
          // Die Royale-Zone aussen um die Arena-Events: Sie liest nur Positionen
          // und teilt Schaden aus, haengt aber ihren Zonenstand an den Snapshot.
          // Weiter innen wuerde eine Schicht, die den Snapshot neu baut, das Feld
          // wieder verlieren.
          tuneRoyale(
          tuneArenaEvents(
            tuneArenaSystems(
              // Rueckstoss ganz aussen um das Loadout-System: Weiter innen
              // ginge der Stoss waehrend eines Dashs verloren, weil die
              // Dash-Fahrt die Position aus einem vorher gemerkten Punkt neu
              // rechnet und alles ueberschreibt, was innen dazukam.
              tuneFireRecoil(
              tuneLoadoutSystem(
                tuneProgression(
                  tuneArenaDirector(
                    // Bewegungsregel für Rapid-Bots von außen: `tuneBotBrain`
                    // ersetzt `updateBot` komplett, innen ginge sie verloren.
                    tuneRapidBots(
                      tuneBotBrain(
                        // Perks aussen um den ganzen Kampfblock: Sie wickeln
                        // fire/damage/killPlayer und muessen sehen, was
                        // Signatures und Klassenmechanik fertig gerechnet haben.
                        tunePerks(
                        tuneClassMechanics(
                          // Einheiten-Budget ausserhalb von tuneDrones: Es
                          // bezahlt und verstaerkt die fertige Einheit.
                          tuneControlSignature(
                          tuneDrones(
                            // Tarnung und Hitze aussen um die uebrigen
                            // Signatures: Tarnung skaliert die fertigen
                            // Projektile der Salve, Hitze haengt an fire -
                            // beide muessen sehen, was innen herausfaellt.
                            // Stellung und Schild aussen um die uebrigen
                            // Signatures: Stellung skaliert die fertige Salve,
                            // der Schild haengt am Schadenspfad.
                            tuneSiegeSignature(
                            tuneAegisSignature(
                            tuneSpecterSignature(
                            tuneTempestSignature(
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
                                  // Trefferrichtung direkt ueber dem Kampf-
                                  // Tuning (Befund 5): Hier laeuft JEDER
                                  // Schaden durch, auch gebundene Innenaufrufe
                                  // wie die AEGIS-Entladung, die aussen nicht
                                  // vorbeikommen.
                                  tuneHitDirection(
                                  // Hier stand bis zum 14.08. abends die
                                  // Halbautomatik (`tuneFireCadence`): ein Klick
                                  // = eine Salve, Dauerfeuer erst nach 200 ms
                                  // Halten. Sam hat sie im selben Spieltest
                                  // wieder abbestellt – „zäh beim Reagieren".
                                  // Die Begruendung steht in Bericht 34; kurz:
                                  // Die Schwelle betraf nur Klassen unter
                                  // 150 ms Nachladezeit, und genau dort war die
                                  // Luecke am deutlichsten zu spueren.
                                  tuneCombatScaling(
                                    // Projektiltempo vor allem anderen: Es
                                    // aendert die Statik, aus der jede weitere
                                    // Schicht ihre Werte zieht.
                                    tuneProjectileSpeed(
                                      tuneSpectator(hardenSimulation(new MazeGame(BOT_COUNT)), SPECTATOR_ENABLED),
                                      PROJECTILE_SPEED_V2
                                    )
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
                            ),
                            SIGNATURE_TEMPEST_ENABLED,
                            DEFAULT_HEAT,
                            FAMILY_UPGRADES_ENABLED
                            ),
                            SIGNATURE_SPECTER_ENABLED,
                            DEFAULT_STEALTH,
                            FAMILY_UPGRADES_ENABLED
                            ),
                            SIGNATURE_AEGIS_ENABLED,
                            DEFAULT_SCHILD,
                            FAMILY_UPGRADES_ENABLED
                            ),
                            SIGNATURE_SIEGE_ENABLED,
                            DEFAULT_STELLUNG,
                            FAMILY_UPGRADES_ENABLED
                            )
                          ),
                          SIGNATURE_CONTROL_ENABLED,
                          DEFAULT_BUDGET,
                          FAMILY_UPGRADES_ENABLED
                          )
                        ),
                        PERKS_ENABLED
                        ),
                        BOT_PACING_ENABLED ? DEFAULT_BOT_PACING : null
                      ),
                      SIGNATURE_RAPID_ENABLED
                    ),
                    ARENA_DIRECTOR_ENABLED
                  )
                )
              ,
                DASH_TRAVEL_ENABLED,
                REPULSE_TRAVEL_ENABLED
              )
              , FIRE_RECOIL_ENABLED)
            )
          )
          , {
            ...DEFAULT_ROYALE,
            graceMs: Math.round(DEFAULT_ROYALE.graceMs / ROYALE_SPEED),
            shrinkMs: Math.round(DEFAULT_ROYALE.shrinkMs / ROYALE_SPEED),
            holdMs: Math.round(DEFAULT_ROYALE.holdMs / ROYALE_SPEED)
          }),
          ACHIEVEMENTS_ENABLED
        )
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
// Eingabe-Zeitfenster ganz aussen: Es liest jede Eingabe, die tatsaechlich
// angenommen wurde, und raeumt bei Stille nur die drei Eingabefelder auf --
// gegen den Geist-Tank, der nach einem stillen Verbindungsverlust weiterfuhr
// und weiterfeuerte, bis der Heartbeat ihn fand.
const game = tuneInputAck(
  tuneInputIdle(ACHIEVEMENTS_ENABLED ? attachAchievementSnapshots(encodedGame) : encodedGame)
);
const socketPlayerIds = new WeakMap<WebSocket, string>();
const socketAlive = new WeakMap<WebSocket, boolean>();

const joinSchema = z.object({
  type: z.literal('join'),
  name: z.string().transform(sanitizePlayerName).pipe(z.string().min(1).max(18)),
  authToken: z.string().min(1).max(4096).optional(),
  // Zufalls-ID aus dem localStorage des Browsers – die einzige Möglichkeit,
  // einen wiederkehrenden Gast als denselben zu erkennen. Optional: Ein Client,
  // der sie nicht schickt (alte Fassung, blockierter Speicher), spielt normal
  // weiter und taucht in der Besuchszählung nicht auf.
  deviceId: z.string().regex(/^[0-9a-zA-Z_-]{8,64}$/).optional()
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
  secondary: z.boolean(),
  // Der echte Zeigerbefehl ohne Auto-Modus (Drohnensteuerung, siehe
  // `InputMessage`). Optional, damit ein Client mit gepuffertem Bündel nach
  // einem Deploy nicht an `.strict()` scheitert.
  klick: z.boolean().optional()
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
  /*
   * Dasselbe Tor wie fuer HTTP, nur hier.
   *
   * Ohne diese vier Zeilen waere die Passwortabfrage Fassade: Die HTML-Seite
   * ist nur die Verpackung, gespielt wird ueber diesen Socket. Wer die
   * WS-Adresse kennt, braucht die Seite gar nicht – ein Skript mit `new
   * WebSocket(...)` und einer `join`-Nachricht saesse in der Arena, waehrend
   * die Startseite brav nach dem Passwort fragt.
   *
   * Der Browser schickt das Tor-Cookie beim Handshake automatisch mit (gleiche
   * Origin); nginx reicht den Cookie-Header im Compose-Pfad unveraendert
   * weiter.
   */
  if (!siteGate.darfVerbinden(request)) {
    socket.close(1008, 'Locked');
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
        beginSession(game, playerId, parsed.data.deviceId ?? null, parsed.data.name, now);
        // `achievements` sagt dem Client, ob die Galerie ein Versprechen ist,
        // das dieser Server einloesen kann (Befund 60).
        send(socket, { type: 'welcome', selfId: playerId, mode: ARENA_MODE, achievements: ACHIEVEMENTS_ENABLED });
        // Login ist optional und darf den Join nie verzögern: Der Spieler ist schon
        // drin, das Konto wird ein paar Millisekunden später angeheftet.
        if (parsed.data.authToken) {
          const joinedId = playerId;
          void verifyAuthToken(parsed.data.authToken)
            .then((user) => {
              if (!user) return;
              linkPlayerToUser(game, joinedId, user);
              linkSessionToUser(game, joinedId, user.userId);
            });
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
  /*
   * Zehn Sekunden, nicht dreissig.
   *
   * Getrennt wird erst beim UEBERNAECHSTEN Durchlauf (erst `false` setzen und
   * pingen, dann beim naechsten Lauf `terminate`) -- bei 30 s blieb ein
   * stumm gewordener Client also 30 bis 60 Sekunden lang eingeloggt und
   * belegte dabei einen Platz, waehrend der echte Spieler laengst unter neuer
   * ID daneben stand. Mit 10 s sind es 10 bis 20. Der Preis ist ein Ping je
   * Socket alle zehn Sekunden.
   */
}, 10_000);
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
    siteGate.stop();
    // Beide Puffer: Runs speisen das Leaderboard, Sitzungen das Admin-Portal.
    // Wer beim Deploy gerade spielt, soll trotzdem als Besuch gezählt werden.
    await Promise.all([flushPersistence(game), flushSessions(game)]);
  },
  log: (message: string) => console.log(`[shutdown] ${message}`)
});
installSignalHandlers(gracefulShutdown);

/**
 * Der gemeinsame Live-Zustand von `/health` und dem Admin-Portal.
 *
 * Bewusst eine Funktion und keine zwei Listen: `/health` ist das Testprotokoll,
 * wenn Sam sagt „geht nicht", und das Portal ist der Ort, an dem er täglich
 * hinsieht. Wenn die beiden auseinanderlaufen, ist genau dann etwas nicht zu
 * sehen, wenn man es braucht.
 */
const liveState = (): Record<string, unknown> => ({
  humans: game.humanCount,
  ...game.entityCounts,
  mode: ARENA_MODE,
  modeLabel: ARENA_MODES[ARENA_MODE].label,
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
  // Jedes Flag, das Spielgefühl verändert, gehört hier hinein.
  features: { achievements: ACHIEVEMENTS_ENABLED, snapshotDeltas: SNAPSHOT_DELTAS, shortNetIds: SHORT_NET_IDS, arenaDirector: ARENA_DIRECTOR_ENABLED, rateLimits: RATE_LIMITS_ENABLED, spectator: SPECTATOR_ENABLED, signatureRapid: SIGNATURE_RAPID_ENABLED, signatureImpact: SIGNATURE_IMPACT_ENABLED, familyUpgrades: FAMILY_UPGRADES_ENABLED, familyUpgradeBranches: FAMILY_UPGRADE_BRANCHES, projectileSpeedV2: PROJECTILE_SPEED_V2, projectileRangeCap: PROJECTILE_RANGE_CAP, dashTravel: DASH_TRAVEL_ENABLED, repulseTravel: REPULSE_TRAVEL_ENABLED, fireRecoil: FIRE_RECOIL_ENABLED, signaturePrecision: SIGNATURE_PRECISION_ENABLED, signatureControl: SIGNATURE_CONTROL_ENABLED, signatureSpecter: SIGNATURE_SPECTER_ENABLED, signatureTempest: SIGNATURE_TEMPEST_ENABLED, perks: PERKS_ENABLED, signatureSiege: SIGNATURE_SIEGE_ENABLED, signatureAegis: SIGNATURE_AEGIS_ENABLED },
  // Wie gesund der Takt läuft. Im Portal die Zeile, an der man einen
  // überlasteten Server erkennt, bevor Spieler es melden.
  tick: telemetryTickHealth(game),
  persistence: { ...persistenceStats(game), schema: schemaZusammenfassung() },
  sessions: sessionsStats(game),
  auth: authStatus(),
  // Der einzige Weg, das Tor von aussen zu pruefen, ohne hindurchzugehen –
  // `/health` ist die einzige Route davor. `defaultPassword: true` heisst:
  // laeuft noch mit dem Passwort aus dem oeffentlichen Repo.
  gate: siteGate.stats(),
  clientMetrics: (({ buckets: _buckets, rejected: _rejected, ...rest }) => rest)(clientMetricsSummary()),
  abuse: rateLimiter.stats()
});

/*
 * Ergebnis der Schema-Vorabpruefung, sobald sie durch ist. `null` heisst
 * entweder „keine Datenbank konfiguriert" oder „laeuft noch" – beides wird in
 * `/health` unterschieden, damit niemand ein fehlendes Feld als Entwarnung
 * liest.
 */
let schemaBefund: PreflightErgebnis | null = null;

/** Kurzfassung fuer `/health`: nur, was eine Entscheidung veraendert. */
const schemaZusammenfassung = (): {
  geprueft: boolean;
  vollstaendig: boolean;
  fehlend: string[];
  offeneMigrationen: string[];
} => ({
  geprueft: schemaBefund !== null,
  vollstaendig: schemaBefund?.vollstaendig ?? false,
  fehlend: (schemaBefund?.befunde ?? []).filter((b) => b.stand === 'fehlt').map((b) => b.relation.name),
  offeneMigrationen: [...(schemaBefund?.offeneMigrationen ?? [])]
});

app.get('/health', (_request: Request, response: Response) => {
  const draining = gracefulShutdown.isShuttingDown();
  // Ohne diesen Header antwortet Express mit ETag, und ein Browser-Tab zeigt
  // nach dem Neuladen den alten Stand. Genau daran haben wir am 06.08. einen
  // Deploy-Stillstand diagnostiziert, den es nicht gab: /health ist unser
  // Testprotokoll und darf als einziger Endpunkt nie aus dem Cache kommen.
  response.setHeader('Cache-Control', 'no-store');
  // Während des Drainens 503, damit der Loadbalancer keinen Traffic mehr schickt.
  return response.status(draining ? 503 : 200).json({ ok: !draining, draining, ...liveState() });
});
app.get('/metrics', metricsHandler(game));
// Öffentliche Routen: gehen im Zweifel an die Datenbank, deshalb mit Limit.
// /health bleibt ungebremst – daran hängt der Health-Check der Plattform.
const publicGuard = rateLimiter.httpGuard();
app.get('/leaderboard', publicGuard, leaderboardHandler(game));
app.get('/profile/:userId', publicGuard, profileHandler(game));
// Statisches Kartenlayout (Sam: Minimap soll die ganze Karte zeigen). WALLS
// und HAUPTPLAETZE aendern sich nie waehrend der Laufzeit des Prozesses -
// lange Cache-Zeit, der Client holt es ohnehin nur einmal beim Start.
app.get('/map', publicGuard, (_request: Request, response: Response) => {
  response.setHeader('Cache-Control', 'public, max-age=3600');
  response.json(mapInfo());
});
// Schreibzugriff: teurer im selben IP-Budget (rund 20/min) und mit engem
// Body-Limit – ein einzelnes Textfeld braucht nie mehr als ein Kilobyte.
app.post(
  '/profile',
  rateLimiter.httpGuard({ cost: PROFILE_WRITE_COST }),
  express.json({ limit: PROFILE_BODY_LIMIT }),
  profileUpdateHandler(game)
);
// Admin-Portal. `/admin/api/session` steht bewusst **vor** dem Torwächter: Sie
// ist der einzige Weg, die eigene Konto-ID zu erfahren, und ohne die kommt
// niemand je in die Allowlist. Sie verrät nur, wer der Fragende selbst ist.
const adminRoutes = createAdminRoutes({
  game,
  live: () => ({ ...liveState(), draining: gracefulShutdown.isShuttingDown() })
});
app.get('/admin/api/session', publicGuard, adminRoutes.session);
app.get('/admin/api/overview', publicGuard, adminGuard, adminRoutes.overview);
app.get('/admin/api/players', publicGuard, adminGuard, adminRoutes.players);
app.get('/admin/api/backlog', publicGuard, adminGuard, adminRoutes.backlog);
app.get('/admin/api/retention', publicGuard, adminGuard, adminRoutes.retention);

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
  // Vor express.static: Gibt es eine vorkomprimierte Fassung, geht die raus.
  // Fehlt sie, faellt es still auf das Original zurueck.
  app.use(servePrecompressed(clientRoot));
  app.use(express.static(clientRoot));
  // Das Admin-Portal ist eine eigene Seite mit eigenem Bündel – es hat mit dem
  // Spiel nichts zu tun und soll dessen 680 kB nicht laden. Der Eintrag muss
  // **vor** dem SPA-Rückfall stehen, sonst bekäme /admin die Spielseite.
  app.get(/^\/admin(?:\/.*)?$/, (_request: Request, response: Response, next: () => void) => {
    const page = path.join(clientRoot, 'admin.html');
    if (!existsSync(page)) return next();
    response.setHeader('Cache-Control', 'no-store');
    response.sendFile(page);
  });
  app.use((request: Request, response: Response, next: () => void) => {
    if (request.method !== 'GET') return next();
    // Fehlende Assets müssen 404 bleiben: index.html als Antwort auf eine .js-Anfrage
    // lässt dynamische Imports mit einem MIME-Fehler scheitern statt sichtbar zu failen.
    if (/\.[a-z0-9]+$/i.test(request.path)) return next();
    response.sendFile(path.join(clientRoot, 'index.html'));
  });
}

server.listen(PORT, HOST, () => console.log(`Project Maze server listening on http://${HOST}:${PORT}`));

/*
 * Schema-Vorabpruefung, sobald der Server steht.
 *
 * Sie laeuft NACH `listen` und blockiert nichts: Das Spiel darf nie an der
 * Statistik haengen. Ihr Zweck ist die Zweideutigkeit, die sonst erst Wochen
 * spaeter auffaellt -- ein Admin-Portal voller Nullen sieht bei fehlender
 * Tabelle genauso aus wie bei fehlenden Spielern. Ohne diese Zeilen merkt man
 * eine vergessene Migration erst, wenn der erste Spieler wieder GEHT, und dann
 * nur als gedrosselte Fehlerzeile im laufenden Log.
 */
const supabaseConfig = persistenceConfig();
if (supabaseConfig) {
  void supabasePreflight(supabaseConfig)
    .then((ergebnis) => {
      schemaBefund = ergebnis;
      for (const zeile of preflightMeldung(ergebnis)) {
        if (ergebnis.vollstaendig) console.log(zeile);
        else console.warn(zeile);
      }
    })
    .catch((error) => console.warn(`[supabase] Vorabpruefung nicht moeglich: ${String(error)}`));
}

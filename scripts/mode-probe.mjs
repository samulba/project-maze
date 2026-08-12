/**
 * Modus-Probe: Bekommt man auf der Leitung wirklich den Modus, den man
 * konfiguriert hat?
 *
 * Warum es das braucht: „Mehrere Modi" ist eine Zeile des Ziels, und ihr Beweis
 * war ungleich verteilt. Battle Royale hat `npm run royale-probe` – eine ganze
 * Runde im echten Browser. Maze und FFA hatten Unit-Tests und einen Blick von
 * Hand. Ein Unit-Test prüft aber `activeWalls`, nicht den Snapshot, der beim
 * Spieler ankommt: Zwischen beiden liegen Sichtfeld-Filter, Delta-Kodierung und
 * kurze IDs, also drei Schichten, die ein Feld verlieren können.
 *
 * Diese Probe hängt sich deshalb als **echter Client** an einen laufenden
 * Server – kein Browser, nur die Leitung – und prüft je Modus genau das
 * Versprechen, das ihn ausmacht:
 *
 * | Modus  | Versprechen | Gemessen |
 * | --- | --- | --- |
 * | maze   | Wände in Bahnen | mindestens eine Wand kommt an |
 * | ffa    | offene Arena    | über den ganzen Lauf **keine** Wand |
 * | royale | schrumpfende Zone | in jedem Snapshot ein Zonenfeld, dazu Wände |
 *
 * Dazu, für alle drei: Die `welcome`-Nachricht nennt denselben Modus wie
 * `/health` – sonst zeigt der Client ein Etikett, das nicht zur Arena passt.
 *
 * Der Maze-Fall ist bewusst „mindestens eine": Wände werden nur im Sichtfeld
 * geschickt. Gemessen kommen auf der Standardkarte binnen sechs Sekunden
 * welche an (vier im Probelauf); bliebe es bei null, wäre das ein Befund, den
 * man ansehen will – entweder steht der Spieler im freien Feld, oder die Wände
 * kommen gar nicht mehr durch.
 *
 * Aufruf – der Server muss laufen, der Modus steht in seiner Umgebung:
 *
 *   ARENA_MODE=ffa PORT=2630 node apps/server/dist/index.js &
 *   URL=http://127.0.0.1:2630 npm run mode-probe
 *
 * Umgebung: `URL` (HTTP-Adresse des Servers), `SEKUNDEN` (Standard 6).
 */
import WebSocket from 'ws';

const URL = (process.env.URL ?? 'http://127.0.0.1:2567').replace(/\/+$/, '');
const SEKUNDEN = Number(process.env.SEKUNDEN ?? 6);

const gesundheit = await fetch(`${URL}/health`).then((antwort) => antwort.json());
const modus = gesundheit.mode;

const wsUrl = URL.replace(/^http/, 'ws');
const socket = new WebSocket(wsUrl);

const gesehen = {
  snapshots: 0,
  maxWaende: 0,
  /** Snapshots MIT Zonenfeld – im Royale müssen das alle sein. */
  mitZone: 0,
  welcomeModus: null,
  zoneBeispiel: null
};

socket.on('open', () => socket.send(JSON.stringify({ type: 'join', name: 'ModeProbe' })));
socket.on('message', (roh) => {
  const nachricht = JSON.parse(String(roh));
  if (nachricht.type === 'welcome') {
    gesehen.welcomeModus = nachricht.mode ?? null;
    return;
  }
  if (nachricht.type !== 'snapshot') return;
  gesehen.snapshots += 1;
  // Fehlende Felder sind im Delta-Betrieb normal – gezählt wird, was ankommt.
  if (Array.isArray(nachricht.walls)) gesehen.maxWaende = Math.max(gesehen.maxWaende, nachricht.walls.length);
  if (nachricht.royaleZone) {
    gesehen.mitZone += 1;
    gesehen.zoneBeispiel ??= {
      radius: Math.round(nachricht.royaleZone.radius),
      phase: nachricht.royaleZone.phase,
      alive: nachricht.royaleZone.alive
    };
  }
});
socket.on('error', (fehler) => {
  console.error(`mode-probe: Verbindung gescheitert – ${String(fehler)}`);
  process.exit(2);
});

/*
 * Waehrend der Messung wird GEFAHREN, nicht gestanden.
 *
 * Waende kommen nur im Sichtfenster an. Ein Spieler, der auf einem der zehn
 * festen Spawnpunkte stehen bleibt, kann im freien Feld stehen -- dann meldet
 * die Probe "keine einzige Wand" und faellt durch, obwohl das Labyrinth in
 * Ordnung ist. Genau das ist am 12.08. einmal passiert (maxWaende 0), und im
 * naechsten Lauf standen 3 da: eine Probe, die vom Zufall des Spawnpunkts
 * abhaengt, ist keine.
 *
 * Also fahren: ein Richtungswechsel je Sekunde deckt in sechs Sekunden ein
 * Vielfaches des Startfensters ab.
 */
const RICHTUNGEN = [
  { x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }, { x: 0, y: -1 },
  { x: 0.7, y: 0.7 }, { x: -0.7, y: 0.7 }
];
let folge = 0;
const fahren = setInterval(() => {
  if (socket.readyState !== socket.OPEN) return;
  const richtung = RICHTUNGEN[folge % RICHTUNGEN.length];
  socket.send(JSON.stringify({
    type: 'input',
    sequence: ++folge,
    move: richtung,
    aim: { x: 400 * richtung.x, y: 400 * richtung.y },
    primary: false,
    secondary: false
  }));
}, 200);

await new Promise((fertig) => setTimeout(fertig, SEKUNDEN * 1000));
clearInterval(fahren);
socket.close();

// Auch die Telemetrie muss denselben Modus nennen (Befund 65): Dort stand
// jahrelang das hartkodierte 'maze-alpha' -- zwei Dienste (Maze + Royale)
// waren in Prometheus nicht auseinanderzuhalten, und genau diese Luecke hat
// die Probe nicht gesehen, weil sie nur welcome und /health verglich.
// Telemetrie kann per TELEMETRY_ENABLED aus sein -- dann ist der Endpunkt
// 404 und der Vergleich entfaellt, statt falsch rot zu melden.
let telemetrieModus = null;
try {
  const antwort = await fetch(`${URL}/metrics?format=json`);
  if (antwort.ok) telemetrieModus = (await antwort.json()).mode ?? null;
} catch { /* Ohne Telemetrie kein Vergleich. */ }

const befunde = {
  modusGemeldet: Boolean(modus),
  // Der Client beschriftet sein Etikett aus `welcome` – läuft das auseinander,
  // steht in der Statuspille ein anderer Modus als in der Arena.
  etikettPasst: gesehen.welcomeModus === modus,
  snapshotsKommen: gesehen.snapshots > 0
};
if (telemetrieModus !== null) befunde.telemetrieNenntModus = telemetrieModus === modus;

if (modus === 'maze') befunde.waendeKommenAn = gesehen.maxWaende > 0;
if (modus === 'ffa') befunde.keineWand = gesehen.maxWaende === 0;
if (modus === 'royale') {
  befunde.zoneInJedemSnapshot = gesehen.snapshots > 0 && gesehen.mitZone === gesehen.snapshots;
  // Royale behält seine Wände – ohne sie wäre die Endphase ein Kreis ohne Deckung.
  befunde.waendeKommenAn = gesehen.maxWaende > 0;
}

const okay = Object.values(befunde).every(Boolean);

console.log(JSON.stringify({ okay, modus, label: gesundheit.modeLabel, befunde, gesehen }, null, 1));

if (!okay) {
  console.error('\nmode-probe: Befund.');
  if (!befunde.etikettPasst) {
    console.error(`  welcome meldet "${gesehen.welcomeModus}", /health sagt "${modus}" – das Etikett im Client lügt.`);
  }
  if (befunde.keineWand === false) console.error('  FFA liefert Waende – die offene Arena ist nicht offen.');
  if (befunde.waendeKommenAn === false) console.error('  Keine einzige Wand im Sichtfeld – Labyrinth kommt nicht an.');
  if (befunde.zoneInJedemSnapshot === false) {
    console.error(`  Zone fehlt in ${gesehen.snapshots - gesehen.mitZone} von ${gesehen.snapshots} Snapshots.`);
  }
  if (!befunde.snapshotsKommen) console.error('  Gar keine Snapshots – der Join hat nicht geklappt.');
}
process.exit(okay ? 0 : 1);

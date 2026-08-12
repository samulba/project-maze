/**
 * Messlauf Befund 64: Was gewinnt und was kostet die Client-Prediction?
 *
 * Kein Browser, aber auch keine Nachbildung: Hier laufen die ECHTE
 * PredictionEngine und der ECHTE SnapshotHydrator aus apps/client/src gegen
 * einen echten Server (Deltas, kurze IDs, Eingabe-Quittungen – alles an, wie
 * in Produktion). Gemessen wird beides in einem Lauf:
 *
 * 1. **Was AUS kostet** (Stellung heute): die Quittungs-Latenz – wie lange es
 *    dauert, bis eine gesendete Eingabe in einem Snapshot verrechnet zurück
 *    ist. Genau diese Zeit sieht man ohne Prediction seinem eigenen Tank
 *    hinterher. Auf localhost ist das die Untergrenze (Tick + Snapshot-Takt);
 *    echte Leitungen addieren ihre halbe RTT eins zu eins obendrauf.
 * 2. **Was AN kostet**: die Korrekturen. Je Snapshot rechnet die Engine nach,
 *    wo der Tank wirklich war; die Differenz zum gezeichneten Punkt ist der
 *    Fehler, der weich (unter 60 Einheiten) oder hart (darüber) korrigiert
 *    wird. Weiche Korrekturen sind unsichtbar eingeblendet, harte sind der
 *    „Gummiband"-Moment.
 *
 * Bewegungsprofil: 40-Hz-Eingaben wie der echte Client, Richtungswechsel alle
 * 400 ms über acht Richtungen – Richtungswechsel und Wandkontakt sind genau
 * die Momente, in denen eine falsche Vorhersage sichtbar würde (Maze-Modus,
 * die Wände sind absichtlich dabei).
 */
import WebSocket from 'ws';
import { PredictionEngine } from '../../apps/client/src/prediction';
import { SnapshotHydrator, isWireSnapshot } from '../../apps/client/src/snapshot-hydrator';

const URL = (process.env.URL ?? 'http://127.0.0.1:2790').replace(/\/+$/, '').replace(/^http/, 'ws');
const SEKUNDEN = Number(process.env.SEKUNDEN ?? 30);

const engine = new PredictionEngine();
const hydrator = new SnapshotHydrator();
const socket = new WebSocket(URL);

let sequence = 0;
const gesendet = new Map<number, number>();      // sequence -> Sendezeit
const ackLatenzen: number[] = [];
const weicheKorrekturen: number[] = [];
let snapshots = 0;
let reconcileNull = 0;
let tode = 0;
let warTot = false;

const RICHTUNGEN = [
  { x: 1, y: 0 }, { x: 0.7, y: 0.7 }, { x: 0, y: 1 }, { x: -0.7, y: 0.7 },
  { x: -1, y: 0 }, { x: -0.7, y: -0.7 }, { x: 0, y: -1 }, { x: 0.7, y: -0.7 }
];

socket.on('open', () => socket.send(JSON.stringify({ type: 'join', name: 'PredictionMess' })));

socket.on('message', (roh) => {
  const nachricht = JSON.parse(String(roh));
  if (!isWireSnapshot(nachricht)) return;
  const ankunft = performance.now();
  const snapshot = hydrator.hydrate(nachricht);
  snapshots += 1;

  // Quittungs-Latenz: alles bis lastProcessedInput ist jetzt verrechnet.
  const quittiert = (snapshot as any).lastProcessedInput ?? -1;
  for (const [seq, zeit] of gesendet) {
    if (seq <= quittiert) {
      ackLatenzen.push(ankunft - zeit);
      gesendet.delete(seq);
    }
  }

  const self = snapshot.players.find((player) => player.id === snapshot.selfId);
  if (!self) return;
  if (self.dead && !warTot) tode += 1;
  warTot = self.dead;

  const modifier = (snapshot as any).gameplay?.[self.id]?.passiveModifier;
  const sample = engine.reconcile(snapshot, self, modifier);
  if (sample === null) {
    reconcileNull += 1;
    return;
  }
  // Der Fehler, den reconcile gerade zum weichen Ausblenden angesetzt hat.
  const fehler = (engine as any).error as { x: number; y: number };
  const betrag = Math.hypot(fehler.x, fehler.y);
  if (betrag > 0) weicheKorrekturen.push(betrag);
});

socket.on('error', (fehler) => {
  console.error(`prediction-messlauf: Verbindung gescheitert – ${String(fehler)}`);
  process.exit(2);
});

const start = performance.now();
const eingaben = setInterval(() => {
  if (socket.readyState !== socket.OPEN) return;
  const phase = Math.floor((performance.now() - start) / 400);
  const richtung = RICHTUNGEN[phase % RICHTUNGEN.length]!;
  const nachricht = {
    type: 'input' as const,
    sequence: ++sequence,
    move: richtung,
    aim: { x: 300 * richtung.x, y: 300 * richtung.y },
    primary: phase % 4 === 0,
    secondary: false
  };
  socket.send(JSON.stringify(nachricht));
  gesendet.set(sequence, performance.now());
  engine.record(nachricht as any);
}, 1000 / 40);

await new Promise((fertig) => setTimeout(fertig, SEKUNDEN * 1000));
clearInterval(eingaben);
socket.close();

const perzentil = (werte: number[], p: number): number => {
  if (werte.length === 0) return 0;
  const sortiert = [...werte].sort((a, b) => a - b);
  return Math.round(sortiert[Math.min(sortiert.length - 1, Math.floor((p / 100) * sortiert.length))]! * 10) / 10;
};

console.log(JSON.stringify({
  laufzeitSekunden: SEKUNDEN,
  snapshots,
  eingabenGesendet: sequence,
  tode,
  reconcileOhneErgebnis: reconcileNull,
  hydratorFehlendeStatik: hydrator.missingStatics,
  stellungAus: {
    beschreibung: 'Quittungs-Latenz je Eingabe (ms) – so alt ist der eigene Tank ohne Prediction, localhost = Untergrenze',
    anzahl: ackLatenzen.length,
    p50: perzentil(ackLatenzen, 50),
    p90: perzentil(ackLatenzen, 90),
    p99: perzentil(ackLatenzen, 99),
    max: perzentil(ackLatenzen, 100)
  },
  stellungAn: {
    beschreibung: 'Korrekturen der Vorhersage je Snapshot (Weltpixel; 1 Tankradius = 22)',
    snapshotsMitWeicherKorrektur: weicheKorrekturen.length,
    anteilWeich: `${Math.round((weicheKorrekturen.length / Math.max(1, snapshots)) * 1000) / 10} %`,
    weichP50: perzentil(weicheKorrekturen, 50),
    weichP90: perzentil(weicheKorrekturen, 90),
    weichMax: perzentil(weicheKorrekturen, 100),
    harteKorrekturen: engine.hardCorrectionCount,
    verworfeneEingaben: engine.droppedInputCount,
    offeneEingabenAmEnde: engine.pendingCount
  }
}, null, 1));
process.exit(0);

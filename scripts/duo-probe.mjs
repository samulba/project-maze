/**
 * Zwei Menschen in einer Arena – die einzige Frage, die keine Probe stellte.
 *
 * Warum es das braucht: MAZERS ist ein Mehrspieler-Spiel, und **jede** Probe
 * bis heute spielt allein. `wire-probe`, `progress-probe`, `touch-probe`,
 * `mode-probe`, `royale-probe`, `first-run-probe`: ein Client, sonst Bots. Der
 * ganze Weg zwischen zwei echten Spielern – sehen, treffen, sterben, richtig
 * zugeordnet werden – war nie am Stück geprüft, obwohl er das Versprechen des
 * Spiels ist.
 *
 * Geprüft wird an vier Stellen, alle auf der Leitung:
 *
 * 1. **Beide kommen herein.** Zwei `welcome`, zwei Snapshot-Ströme.
 * 2. **Jeder sieht den anderen.** Der Name des Gegenübers steht in `players` –
 *    und zwar bei beiden. Ein einseitiger Befund wäre der interessantere:
 *    Dann stimmte etwas mit dem Sichtfenster oder dem Delta-Versand nicht.
 * 3. **Schaden fließt.** Mindestens einer verliert Leben, während nur der
 *    andere in der Nähe ist.
 * 4. **Der Abschuss wird zugeordnet.** Im Snapshot des Gefallenen steht der
 *    NAME des anderen als `killerName` – nicht „Arena", nicht leer.
 *
 * ## Warum FFA und eine leere Arena
 *
 * `ARENA_MODE=ffa` hat keine Wände: Zwei Clients, die stur auf die Kartenmitte
 * zufahren, treffen sich dort auch. Im Maze bleibt dieselbe Fahrt an der ersten
 * Wand hängen – gemessen 3235 Einheiten Restabstand nach 45 Sekunden. Das ist
 * kein Befund über das Spiel, sondern über die Navigation dieser Probe, und
 * genau deshalb wird sie hier ausgeschlossen.
 *
 * `BOT_COUNT=0 ARENA_DIRECTOR_ENABLED=false` aus demselben Grund: Mit Bots
 * starben in der Messung **beide** Menschen binnen 45 Sekunden, bevor sie sich
 * begegneten (Killer „Nyx" und „Flux"). Die Probe soll den Weg zwischen zwei
 * Spielern prüfen, nicht die Bot-Dichte.
 *
 * ## Aufruf
 *
 *   npm run build
 *   ARENA_MODE=ffa BOT_COUNT=0 ARENA_DIRECTOR_ENABLED=false \
 *     PORT=2652 HOST=127.0.0.1 node apps/server/dist/index.js &
 *   URL=http://127.0.0.1:2652 npm run duo-probe
 *
 * Umgebung: `URL`, `GEDULD_MS` (Standard 60000).
 */
import WebSocket from 'ws';

const URL = (process.env.URL ?? 'http://127.0.0.1:2652').replace(/^http/, 'ws');
const GEDULD_MS = Number(process.env.GEDULD_MS ?? 60_000);
/** Kartenmitte – beide fahren dorthin, damit sie sich sicher begegnen. */
const TREFFPUNKT = { x: 4500, y: 3000 };

const verbinde = (name) => new Promise((fertig, scheitern) => {
  const ws = new WebSocket(URL);
  const zustand = {
    name, ws, selfId: null, snapshots: 0, position: null,
    gesehen: new Set(), leben: null, minLeben: null, kills: 0, tode: 0, killerName: null
  };
  const zeit = setTimeout(() => scheitern(new Error(`${name}: kein welcome innerhalb von 10 s`)), 10_000);
  ws.on('open', () => ws.send(JSON.stringify({ type: 'join', name })));
  ws.on('error', (fehler) => scheitern(new Error(`${name}: ${String(fehler)}`)));
  ws.on('message', (roh) => {
    const nachricht = JSON.parse(String(roh));
    if (nachricht.type === 'welcome') { clearTimeout(zeit); fertig(zustand); return; }
    if (nachricht.type !== 'snapshot') return;
    zustand.snapshots += 1;
    /*
     * Massgeblich ist `selfId` DES SNAPSHOTS, nicht die UUID aus `welcome`.
     * Mit SHORT_NET_IDS tragen die Entitäten kurze Zahlen-IDs; wer gegen die
     * UUID vergleicht, findet seinen eigenen Tank nie und zählt sich selbst
     * als „gesehenen Gegner". Genau so ist der erste Anlauf gescheitert.
     */
    if (nachricht.selfId !== undefined && nachricht.selfId !== null) zustand.selfId = nachricht.selfId;
    for (const spieler of nachricht.players ?? []) {
      if (spieler.id !== zustand.selfId) {
        if (spieler.name) zustand.gesehen.add(spieler.name);
        continue;
      }
      if (spieler.position) zustand.position = spieler.position;
      if (typeof spieler.health === 'number') {
        zustand.leben = spieler.health;
        zustand.minLeben = zustand.minLeben === null ? spieler.health : Math.min(zustand.minLeben, spieler.health);
      }
      if (typeof spieler.kills === 'number') zustand.kills = Math.max(zustand.kills, spieler.kills);
      if (typeof spieler.deaths === 'number') zustand.tode = Math.max(zustand.tode, spieler.deaths);
      if (spieler.killerName) zustand.killerName = spieler.killerName;
    }
  });
});

const a = await verbinde('AlphaMensch');
const b = await verbinde('BetaMensch');

let folge = 0;
const fahren = setInterval(() => {
  for (const client of [a, b]) {
    if (client.ws.readyState !== WebSocket.OPEN || !client.position) continue;
    const dx = TREFFPUNKT.x - client.position.x;
    const dy = TREFFPUNKT.y - client.position.y;
    const laenge = Math.max(1, Math.hypot(dx, dy));
    client.ws.send(JSON.stringify({
      type: 'input',
      sequence: ++folge,
      move: { x: dx / laenge, y: dy / laenge },
      // Zielen in Fahrtrichtung: Wer zuerst ankommt, steht in der Mitte, der
      // andere faehrt auf ihn zu und hat ihn damit vor dem Rohr.
      aim: { x: (dx / laenge) * 400, y: (dy / laenge) * 400 },
      primary: true,
      secondary: false
    }));
  }
}, 100);

const erfuellt = () =>
  a.gesehen.has('BetaMensch') && b.gesehen.has('AlphaMensch')
  && (a.tode > 0 || b.tode > 0)
  && (a.killerName === 'BetaMensch' || b.killerName === 'AlphaMensch');

const bis = Date.now() + GEDULD_MS;
while (Date.now() < bis && !erfuellt()) await new Promise((r) => setTimeout(r, 250));
clearInterval(fahren);

const abstand = a.position && b.position
  ? Math.round(Math.hypot(a.position.x - b.position.x, a.position.y - b.position.y))
  : null;

const befunde = {
  beideDrin: a.snapshots > 0 && b.snapshots > 0,
  aSiehtB: a.gesehen.has('BetaMensch'),
  bSiehtA: b.gesehen.has('AlphaMensch'),
  // Schaden zwischen ihnen: In der leeren Arena gibt es nichts anderes, was
  // Leben kostet -- keine Bots, keine Zone. Nur Formen, und die stehen still.
  schadenGeflossen: (a.minLeben !== null && a.minLeben < (a.leben ?? 0) + 0.001 && a.minLeben < 110)
    || (b.minLeben !== null && b.minLeben < 110),
  abschussZugeordnet: a.killerName === 'BetaMensch' || b.killerName === 'AlphaMensch'
};

const okay = Object.values(befunde).every(Boolean);
console.log(JSON.stringify({
  okay,
  befunde,
  gesehen: {
    abstand,
    aSnapshots: a.snapshots, bSnapshots: b.snapshots,
    aLeben: a.leben, aMinLeben: a.minLeben, aTode: a.tode, aKiller: a.killerName,
    bLeben: b.leben, bMinLeben: b.minLeben, bTode: b.tode, bKiller: b.killerName
  }
}, null, 1));

if (!okay) {
  console.error('\nduo-probe: Befund. Der Weg zwischen zwei Spielern traegt nicht.');
  if (!befunde.aSiehtB || !befunde.bSiehtA) {
    console.error('  Sie sehen einander nicht -- Sichtfenster oder Delta-Versand pruefen.');
  }
  if (!befunde.abschussZugeordnet) console.error('  Kein zugeordneter Abschuss -- killerName pruefen.');
}
a.ws.close();
b.ws.close();
process.exit(okay ? 0 : 1);

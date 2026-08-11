import type { RoyaleZoneSnapshot } from '@project-maze/shared/gameplay';
import type { WorldSnapshot } from '@project-maze/shared';

/**
 * Der Rundenstand im Battle Royale – die Zahlen, die dort das Spiel sind.
 *
 * ## Warum das überhaupt eine eigene Anzeige braucht
 *
 * Im Maze und in FFA ist der Tod ein Zwischenfall: Man kommt zurück, der Score
 * bleibt, weiter geht's. Im Royale ist er das Ende der Runde – und ab da gelten
 * andere Zahlen. Wie viele leben noch? Wann wird es enger? Wer hat gewonnen,
 * und wann geht es wieder los? Der Server weiß das alles seit Teil 2, aber es
 * stand nirgends auf dem Bildschirm: Die Zone war zu sehen, die *Runde* nicht.
 *
 * ## Warum eine Leiste statt mehrerer Anzeigen
 *
 * Sieg, Ausscheiden und Zonenstand sind derselbe Gegenstand – der Stand der
 * Runde. Drei Elemente dafür hieße, sie an drei Stellen gleichzeitig richtig
 * halten zu müssen; das Ergebnis wäre ein Bildschirm, auf dem zwei Kästen
 * einander widersprechen können. Es ist deshalb eine Leiste, die ihren Text
 * wechselt: Wer wissen will, wie die Runde steht, schaut immer an dieselbe
 * Stelle.
 *
 * Die Texte stehen als reine Funktionen hier, nicht im DOM-Code – so sind sie
 * ohne Browser prüfbar, und die Regeln „am Mindestradius kein Countdown" und
 * „tot heißt im Royale etwas anderes" haben einen Ort, an dem sie festgehalten
 * sind.
 */

export type RoyaleTone = 'ruhig' | 'warnung' | 'sieg';

export interface RoyaleHudView {
  /** Wie viele noch leben – die Zahl, die im Battle Royale zählt. */
  alive: number;
  /** Was die Zone gerade tut, in Worten. */
  status: string;
  tone: RoyaleTone;
}

type ExtendedSnapshot = WorldSnapshot & { royaleZone?: RoyaleZoneSnapshot | null };

/** Zone eines Snapshots, oder `null` in jedem anderen Modus. */
export const royaleZoneOf = (snapshot: WorldSnapshot): RoyaleZoneSnapshot | null =>
  (snapshot as ExtendedSnapshot).royaleZone ?? null;

/**
 * Sekunden für die Anzeige. Aufgerundet, weil eine Anzeige, die „0 s" sagt,
 * während noch 800 ms übrig sind, in genau dem Moment falsch ist, in dem man
 * ihr am meisten glaubt.
 */
const sekunden = (ms: number): number => Math.max(0, Math.ceil(ms / 1000));

/** Ab hier ist die Verengung keine Ankündigung mehr, sondern ein Auftrag. */
const DRINGEND_AB_MS = 10_000;

/** Der Stand der Runde in einer Zeile – `null`, wenn gar kein Royale läuft. */
export function royaleHudView(zone: RoyaleZoneSnapshot | null): RoyaleHudView | null {
  if (!zone) return null;
  return { alive: zone.alive, status: royaleStatusText(zone), tone: royaleTone(zone) };
}

function royaleStatusText(zone: RoyaleZoneSnapshot): string {
  if (zone.roundOver) {
    const wer = zone.winnerName ? `SIEGER: ${zone.winnerName.toUpperCase()}` : 'RUNDE VORBEI';
    return `${wer} · NEUE RUNDE IN ${sekunden(zone.nextRoundInMs)} S`;
  }
  if (zone.phase === 'schrumpft') return 'ZONE SCHRUMPFT';
  if (zone.nextShrinkInMs > 0) {
    // Vor der ersten Stufe kostet Draußenstehen nichts – „enger" wäre dort die
    // falsche Auskunft, weil es noch gar keine Grenze gibt, die wehtut.
    const was = zone.stage === 0 ? 'ZONE STARTET IN' : 'ENGER IN';
    return `${was} ${sekunden(zone.nextShrinkInMs)} S`;
  }
  // Kein Countdown mehr: Die Zone ist am Mindestradius angekommen und bleibt.
  return 'ENDPHASE · KLEINSTE ZONE';
}

const royaleTone = (zone: RoyaleZoneSnapshot): RoyaleTone => {
  if (zone.roundOver) return 'sieg';
  if (zone.phase === 'schrumpft') return 'warnung';
  if (zone.nextShrinkInMs > 0) return zone.nextShrinkInMs <= DRINGEND_AB_MS && zone.stage > 0 ? 'warnung' : 'ruhig';
  return 'warnung';
};

/**
 * Was auf dem Death-Screen steht, solange Royale läuft – `null` in jedem
 * anderen Modus, dort bleibt der gewohnte Respawn-Countdown stehen.
 *
 * Der Grund für diese Funktion ist ein handfester Fehler: Der Server schiebt
 * `canRespawnAt` im Royale auf Unendlich, und der Death-Screen rechnete daraus
 * ungerührt „Respawn verfügbar in Infinitys". Ein Knopf, der nie freigeht, und
 * eine Zahl, die es nicht gibt – der Spieler wüsste nicht, dass er auf die
 * nächste Runde wartet statt auf einen Countdown.
 */
export function royaleDeathText(zone: RoyaleZoneSnapshot | null): string | null {
  if (!zone) return null;
  if (zone.roundOver) {
    const wer = zone.winnerName ? `${zone.winnerName} gewinnt die Runde` : 'Die Zone hat den Rest geholt';
    return `${wer} · neue Runde in ${sekunden(zone.nextRoundInMs)} s`;
  }
  const uebrig = Math.max(0, zone.alive);
  const wieViele = uebrig === 1 ? 'Noch einer im Spiel' : `Noch ${uebrig} im Spiel`;
  return `Ausgeschieden · ${wieViele} · du bist zurück, wenn die Runde vorbei ist`;
}

/**
 * Anzeige des Rundenstands im HUD.
 *
 * Hängt wie das Zuschauer-Band im `#hud` und meldet sich von selbst ab, sobald
 * kein Royale läuft – so kostet der Modus in Maze und FFA kein einziges Pixel.
 */
export class RoyaleBar {
  private readonly bar: HTMLElement;
  private readonly count: HTMLElement;
  private readonly statusText: HTMLElement;
  private letzterText = '';

  constructor(root: HTMLElement) {
    this.bar = document.createElement('div');
    this.bar.className = 'royale-bar';
    this.bar.hidden = true;
    this.bar.setAttribute('role', 'status');
    this.count = document.createElement('b');
    const label = document.createElement('span');
    label.className = 'royale-bar-label';
    label.textContent = 'ÜBRIG';
    const trenner = document.createElement('i');
    this.statusText = document.createElement('span');
    this.statusText.className = 'royale-bar-status';
    this.bar.append(this.count, label, trenner, this.statusText);
    (root.querySelector<HTMLElement>('#hud') ?? root).append(this.bar);
  }

  update(snapshot: WorldSnapshot): void {
    const view = royaleHudView(royaleZoneOf(snapshot));
    if (!view) {
      this.reset();
      return;
    }
    // Der Countdown läuft jede Sekunde weiter – geschrieben wird trotzdem nur,
    // wenn sich der Text wirklich ändert, sonst zwei Layout-Läufe je Tick.
    const text = `${view.alive}|${view.status}|${view.tone}`;
    if (text === this.letzterText) return;
    this.letzterText = text;
    this.count.textContent = String(view.alive);
    this.statusText.textContent = view.status;
    this.bar.dataset.tone = view.tone;
    this.bar.hidden = false;
  }

  reset(): void {
    if (this.letzterText === '') return;
    this.letzterText = '';
    this.bar.hidden = true;
  }
}

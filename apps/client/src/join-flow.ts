/**
 * Was passiert, wenn der Server einen Beitritt ablehnt.
 *
 * Der Server schickt bei „Arena voll", „Zu viele Beitritte" und „Beitritt
 * nicht möglich" jeweils nur `{type:'error'}` und **lässt den Socket offen**.
 * Für den Client sah das lange aus wie ein Endzustand: Der Toast erschien, und
 * weil ein Wiederverbinden ausschliesslich im `close`-Handler geplant wird –
 * der nie feuerte –, passierte danach nie wieder etwas. Wer schon einmal
 * gespielt hatte (`enteredGame`), bekam nicht einmal den Startscreen zurück:
 * Die Arena stand still, oben „VERBINDUNG VERLOREN", und nur ein Neuladen der
 * Seite half.
 *
 * Erreichbar ist das im Normalbetrieb, nicht nur im Labor: Das Join-Limit
 * gilt **pro IP** (20/min), und der Wiederverbindungs-Rhythmus liegt bei
 * 1,2 s. Ein Funkloch im Zug, ein paar Versuche – und der Zähler ist voll,
 * ausgerechnet für alle im selben WLAN.
 *
 * Deshalb steht die Entscheidung hier als reine Funktion: Sie ist die einzige
 * Stelle, an der „Ablehnung" in „was jetzt" übersetzt wird, und sie lässt sich
 * prüfen, ohne einen Browser zu starten.
 */

export type JoinRejectionAction =
  /** Zurück auf den Startscreen mit der Begründung am Knopf. */
  | 'startscreen'
  /** Verbindung schliessen und über den bestehenden Backoff neu versuchen. */
  | 'wiederholen'
  /** Wir spielen bereits – die Meldung gehört nicht zum Beitritt. */
  | 'ignorieren';

export interface JoinFlowState {
  /** Hat dieser Client in dieser Sitzung schon einmal die Arena betreten? */
  readonly enteredGame: boolean;
  /** Läuft gerade ein Spiel (Welcome empfangen, noch kein Close)? */
  readonly joined: boolean;
}

export function joinRejectionAction(state: JoinFlowState): JoinRejectionAction {
  if (state.joined) return 'ignorieren';
  if (!state.enteredGame) return 'startscreen';
  return 'wiederholen';
}

/**
 * Der Text, der oben stehen bleibt, solange wir es weiter versuchen.
 *
 * „VERBINDUNG VERLOREN" wäre hier schlicht falsch – die Leitung steht, der
 * Server hat geantwortet. Wer eine falsche Diagnose liest, sucht den Fehler
 * bei sich (Router, WLAN, Neustart), statt einfach zu warten.
 */
export function joinRejectionLabel(message: string): string {
  const text = message.toLowerCase();
  if (text.includes('voll')) return 'ARENA VOLL · NEUER VERSUCH';
  if (text.includes('beitritte')) return 'ZU VIELE VERSUCHE · WARTET';
  return 'BEITRITT ABGELEHNT · NEUER VERSUCH';
}

/**
 * Der nächste Wartewert.
 *
 * Wichtig ist weniger die Kurve als der Ort, an dem sie **zurückgesetzt**
 * wird: nicht beim Öffnen des Sockets, sondern erst beim `welcome`. Sonst
 * wäre eine volle Arena eine Endlosschleife im 1,2-Sekunden-Takt – jeder
 * Versuch öffnet erfolgreich einen Socket, setzt den Backoff zurück und wird
 * abgelehnt. Genau in dieses Muster läuft auch das Join-Limit von 20/min.
 */
export const JOIN_BACKOFF_START_MS = 1_200;
export const JOIN_BACKOFF_MAX_MS = 8_000;
export const nextJoinBackoff = (aktuell: number): number =>
  Math.min(JOIN_BACKOFF_MAX_MS, Math.round(aktuell * 1.65));

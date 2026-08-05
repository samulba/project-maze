import type { Server as HttpServer } from 'node:http';
import WebSocket, { type WebSocketServer } from 'ws';

/**
 * Geordnetes Herunterfahren für Redeploys.
 *
 * Railway (und jede andere Plattform mit rollierendem Deploy) schickt beim
 * Neustart ein `SIGTERM` und tötet den Prozess kurz darauf hart. Ohne Handler
 * reißt die TCP-Verbindung ab: Der Browser merkt das erst über einen Timeout
 * und hängt sekundenlang in „Verbindung verloren“. Mit einem sauberen
 * Close-Frame (1001 „going away“) feuert das `close`-Event sofort und der
 * Client startet seinen Reconnect umgehend.
 */

/** RFC-6455-Code für „Endpunkt verschwindet“ – exakt der Redeploy-Fall. */
export const GOING_AWAY = 1001;

export interface GracefulShutdownOptions {
  server: HttpServer;
  wss: WebSocketServer;
  /** Intervalle, die beim Herunterfahren gestoppt werden (Tick, Snapshot, Heartbeat). */
  timers?: readonly NodeJS.Timeout[];
  closeCode?: number;
  closeReason?: string;
  /**
   * Vorlauf, in dem `/health` bereits 503 meldet, der Listener aber noch offen
   * ist. Railway nimmt die Instanz schon beim Signal aus dem Verkehr und
   * braucht das nicht (Standard 0); Setups mit vorgelagertem Loadbalancer oder
   * Reverse Proxy geben ihm hier ein paar hundert Millisekunden.
   */
  drainMs?: number;
  /** Wartezeit, bis Clients ihren Close-Handshake abgeschlossen haben. */
  graceMs?: number;
  /** Absolute Obergrenze, danach wird hart abgeräumt. */
  hardDeadlineMs?: number;
  /**
   * Läuft nach dem Drain, bevor der Listener schließt – hier gehören Puffer
   * hin, die noch weggeschrieben werden müssen (z. B. offene Runs). Fehler
   * werden geloggt und halten das Herunterfahren nicht auf.
   */
  beforeClose?: () => Promise<void>;
  log?: (message: string) => void;
}

export interface GracefulShutdown {
  shutdown(signal?: string): Promise<void>;
  isShuttingDown(): boolean;
}

// Bewusst NICHT unref: Nach dem Schließen von Listener und Sockets wäre dieser
// Timer der letzte lebendige Handle. Unreft stirbt der Event-Loop mitten im
// Shutdown – Abschluss-Log und exit(0) würden nie erreicht. Der Prozess endet
// ohnehin über installSignalHandlers.
const delay = (ms: number): Promise<void> => new Promise((resolve) => {
  setTimeout(resolve, ms);
});

export function createGracefulShutdown(options: GracefulShutdownOptions): GracefulShutdown {
  const {
    server,
    wss,
    timers = [],
    closeCode = GOING_AWAY,
    closeReason = 'Server restart',
    drainMs = 0,
    beforeClose,
    graceMs = 1_500,
    hardDeadlineMs = 8_000,
    log = (): void => {}
  } = options;

  let shuttingDown = false;
  let pending: Promise<void> | null = null;

  const closeClients = (): number => {
    let closed = 0;
    for (const socket of wss.clients) {
      if (socket.readyState !== WebSocket.OPEN && socket.readyState !== WebSocket.CONNECTING) continue;
      socket.close(closeCode, closeReason);
      closed += 1;
    }
    return closed;
  };

  const waitForClients = async (deadline: number): Promise<void> => {
    while (wss.clients.size > 0 && Date.now() < deadline) await delay(10);
  };

  const run = async (signal: string): Promise<void> => {
    const startedAt = Date.now();
    log(`${signal} empfangen – Arena wird geordnet geschlossen.`);
    // Die Simulation läuft im Vorlauf normal weiter; nur /health meldet 503.
    if (drainMs > 0) {
      log(`/health meldet ${drainMs} ms lang 503, bevor der Listener schließt.`);
      await delay(drainMs);
    }
    for (const timer of timers) clearInterval(timer);

    if (beforeClose) {
      try {
        await beforeClose();
      } catch (error: unknown) {
        log(`beforeClose fehlgeschlagen: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    // Ab hier keine neuen Verbindungen mehr; offene HTTP-Keep-Alives lösen.
    const closingAt = Date.now();
    const httpClosed = new Promise<void>((resolve) => server.close(() => resolve()));
    server.closeIdleConnections();
    wss.close();

    const closed = closeClients();
    log(`${closed} WebSocket-Verbindung(en) mit Code ${closeCode} geschlossen.`);

    await waitForClients(closingAt + graceMs);
    // Wer den Close-Handshake ignoriert, darf den Redeploy nicht aufhalten.
    for (const socket of wss.clients) socket.terminate();
    server.closeAllConnections();

    await Promise.race([httpClosed, delay(Math.max(0, hardDeadlineMs - (Date.now() - closingAt)))]);
    // Die close-Events der abgeräumten Sockets laufen erst im nächsten
    // Loop-Durchgang durch; erst danach ist wirklich alles zu.
    await waitForClients(Date.now() + 250);
    log(`Shutdown abgeschlossen nach ${Date.now() - startedAt} ms.`);
  };

  return {
    isShuttingDown: (): boolean => shuttingDown,
    shutdown(signal = 'SIGTERM'): Promise<void> {
      if (pending) return pending;
      shuttingDown = true;
      pending = run(signal).catch((error: unknown) => {
        log(`Shutdown mit Fehler beendet: ${error instanceof Error ? error.message : String(error)}`);
      });
      return pending;
    }
  };
}

export interface SignalHandlerOptions {
  signals?: readonly NodeJS.Signals[];
  exit?: (code: number) => void;
  target?: Pick<NodeJS.Process, 'on'>;
}

/**
 * Verdrahtet die Signale. Ein zweites Signal während des Herunterfahrens
 * bricht sofort ab – wer zweimal Strg+C drückt, will nicht warten.
 */
export function installSignalHandlers(handle: GracefulShutdown, options: SignalHandlerOptions = {}): void {
  const {
    signals = ['SIGTERM', 'SIGINT'],
    exit = (code: number): void => { process.exit(code); },
    target = process
  } = options;

  let forced = false;
  for (const signal of signals) {
    target.on(signal, () => {
      if (handle.isShuttingDown()) {
        if (forced) return;
        forced = true;
        exit(1);
        return;
      }
      void handle.shutdown(signal).then(() => exit(0));
    });
  }
}

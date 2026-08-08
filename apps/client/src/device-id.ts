/**
 * Die Wiedererkennung eines Browsers – und nichts darüber hinaus.
 *
 * Damit das Admin-Portal „haben wir neue Spieler?" beantworten kann, muss ein
 * zweiter Besuch als *zweiter* erkennbar sein. Bei angemeldeten Spielern
 * erledigt das die Konto-ID; Gäste – der Normalfall – haben keine.
 *
 * Also gibt sich der Browser selbst eine Zufallsnummer und merkt sie sich. Sie
 * wird **nicht** aus Geräteeigenschaften berechnet: kein Canvas-Fingerprint,
 * keine Schriftenliste, keine Auflösung, nichts, was zwei Browser desselben
 * Menschen verbinden oder die Löschung überleben könnte. Wer die Website-Daten
 * löscht, ist am nächsten Tag ein neuer Spieler – das ist keine Schwäche der
 * Zählung, sondern die Zusage an den Spieler.
 *
 * Ist localStorage nicht verfügbar (privater Modus, blockierte Speicherung),
 * gibt es keine ID. Der Join läuft dann unverändert, der Besuch taucht nur in
 * der Statistik nicht auf. Zählen ist nie wichtiger als Spielen.
 */

export const DEVICE_ID_KEY = 'mazers-device';

/** Serverseitig geprüftes Format (`sessions.device_id`, 8–64 Zeichen). */
const PATTERN = /^[0-9a-zA-Z_-]{8,64}$/;

/** 32 Hexzeichen aus dem Zufallsgenerator des Browsers. */
function generate(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Liefert die ID dieses Browsers, legt sie beim ersten Aufruf an. `null`, wenn
 * der Speicher nicht zur Verfügung steht – dann wird nichts gezählt.
 */
export function deviceId(storage: Storage | null = safeStorage()): string | null {
  if (!storage) return null;
  try {
    const stored = storage.getItem(DEVICE_ID_KEY);
    if (stored && PATTERN.test(stored)) return stored;
    const fresh = generate();
    storage.setItem(DEVICE_ID_KEY, fresh);
    return fresh;
  } catch {
    return null;
  }
}

/** localStorage, aber nur wenn es wirklich benutzbar ist. */
export function safeStorage(): Storage | null {
  try {
    const storage = window.localStorage;
    // Vorhandensein reicht nicht: Safari im privaten Modus wirft erst beim
    // Schreiben, und dann mitten im Join.
    const probe = '__mazers_probe__';
    storage.setItem(probe, '1');
    storage.removeItem(probe);
    return storage;
  } catch {
    return null;
  }
}

/**
 * Wie lange dieser Run gedauert hat – und warum das eine eigene Funktion ist.
 *
 * Der Death-Screen rechnete die Laufzeit bei **jedem** Snapshot neu gegen
 * `Date.now()`, also zwanzigmal pro Sekunde, auch lange nach dem Tod. Im
 * Battle Royale gibt es keinen Wiedereinstieg und eine Runde dauert rund zehn
 * Minuten: Aus „Überlebt 1m 30s" wurde beim Zusehen „Überlebt 7m 30s", und in
 * der Zeile darüber stand dieselbe falsche Zahl noch einmal. Eine Kachel, die
 * beim Hinsehen wächst, ist keine Bilanz, sondern eine Stoppuhr für einen
 * Lauf, der vorbei ist.
 *
 * `ende = null` heisst „lebt noch" – dann läuft die Uhr zu Recht weiter (der
 * Wert steht in dem Fall nirgends auf dem Schirm, aber die Funktion soll
 * darüber nicht stolpern).
 */
export function runSeconds(start: number, ende: number | null, jetzt: number): number {
  const bis = ende ?? jetzt;
  return Math.max(0, Math.round((bis - start) / 1000));
}

/** „1m 30s" ab einer Minute, sonst „45s". */
export function runDurationText(sekunden: number): string {
  const gesamt = Math.max(0, Math.round(sekunden));
  return gesamt >= 60 ? `${Math.floor(gesamt / 60)}m ${gesamt % 60}s` : `${gesamt}s`;
}

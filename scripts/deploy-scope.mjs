/**
 * Was löst überhaupt einen Deploy aus?
 *
 * Am 13.08. kam Sam eine Serie von „Run failed"-Mails – und dahinter stand
 * kein kaputter Code, sondern eine falsche Annahme in der Deploy-Wache:
 * **Sie hielt jeden Push auf `main` für einen Deploy.** Railway deployt aber
 * nur, was seine Watch-Paths abdecken; ein Commit, der ausschließlich
 * `docs/` anfasst, ändert am laufenden Dienst nichts und wird zu Recht
 * übersprungen.
 *
 * Die Wache wartete trotzdem ihre vollen 15 Minuten auf einen Commit, der nie
 * kommen konnte, und wurde rot. Gemessen an den letzten 30 Läufen: **fünf von
 * sechs Fehlschlägen** waren Commits ohne eine einzige Datei unter `apps/`
 * oder `packages/` – reine Doku-, README- und Skript-Commits. Jeder davon hat
 * 15 Minuten Actions-Kontingent verbrannt und eine Alarmmail ausgelöst.
 *
 * Dieses Modul ist die eine Stelle, an der steht, was „deploybar" heißt.
 *
 * ## Die Liste muss zu Railway passen
 *
 * `DEPLOY_PATHS` spiegelt die Watch-Paths des Railway-Dienstes. Sie stehen
 * dort in der Oberfläche, nicht in `railway.json` – die Datei hier ist also
 * eine **Kopie einer Einstellung, die woanders lebt**. Wer die Watch-Paths in
 * Railway ändert, muss diese Liste mitziehen, sonst wartet die Wache wieder
 * auf etwas, das nicht kommt (Liste zu weit) oder übersieht einen echten
 * Deploy-Stopp (Liste zu eng).
 *
 * Im Zweifel lieber zu eng als zu weit: Eine zu enge Liste kostet eine
 * verpasste Warnung, eine zu weite kostet 15 Minuten und eine Fehlmeldung –
 * und eine Wache, die regelmäßig grundlos rot steht, wird nach drei Tagen
 * ignoriert. Genau das war hier passiert.
 */

/**
 * Präfixe, die einen Deploy auslösen. Verzeichnisse ohne Schrägstrich am Ende
 * meinen den ganzen Teilbaum; alles andere ist ein exakter Dateiname im
 * Wurzelverzeichnis.
 */
export const DEPLOY_PATHS = Object.freeze([
  'apps/',
  'packages/',
  'package.json',
  'package-lock.json',
  'railway.json',
  'docker-compose.yml',
  'Dockerfile'
]);

/**
 * Ändert diese eine Datei den ausgelieferten Dienst?
 *
 * `scripts/` ist bewusst NICHT dabei, obwohl `npm run check` von dort
 * `precompress.mjs` benutzt: Der Build läuft in Railways eigener Pipeline,
 * und ein geändertes Messskript ändert nichts am laufenden Server. Die CI
 * prüft solche Commits weiterhin – nur die Deploy-Wache schweigt dazu.
 */
export function istDeploybar(datei) {
  const pfad = String(datei ?? '').trim().replace(/^\.\//, '');
  if (!pfad) return false;
  return DEPLOY_PATHS.some((muster) => (muster.endsWith('/') ? pfad.startsWith(muster) : pfad === muster));
}

/** Die deploybaren aus einer Liste geänderter Dateien – leer heißt „kein Deploy". */
export function deploybareDateien(dateien) {
  if (!Array.isArray(dateien)) return [];
  return dateien.filter((datei) => istDeploybar(datei));
}

/**
 * Auf welchen Commit muss die Wache warten?
 *
 * `gepusht` ist der Commit des Pushes, `letzterDeploybarer` der jüngste
 * Commit der Historie, der `DEPLOY_PATHS` berührt (der Aufrufer holt ihn per
 * `git log`). Sind beide gleich, ist der Push selbst der Deploy. Sonst ändert
 * dieser Push nichts Deploybares – dann muss live der ältere Stand stehen,
 * und genau das prüft die Wache dann: Steht er da, ist alles in Ordnung;
 * steht etwas noch Älteres da, ist der Deploy WIRKLICH stehengeblieben.
 *
 * Ohne `letzterDeploybarer` (kein Git, flacher Klon, leere Historie) bleibt
 * es beim gepushten Commit – lieber die alte, zu strenge Prüfung als gar keine.
 */
export function erwarteterCommit(gepusht, letzterDeploybarer) {
  const push = String(gepusht ?? '').trim();
  const deploybar = String(letzterDeploybarer ?? '').trim();
  if (!deploybar) return { commit: push, eigenerDeploy: true, grund: 'ohne Git-Historie' };
  if (deploybar === push) return { commit: push, eigenerDeploy: true, grund: 'dieser Push ist der Deploy' };
  return {
    commit: deploybar,
    eigenerDeploy: false,
    grund: 'dieser Push ändert nichts, was Railway deployt'
  };
}

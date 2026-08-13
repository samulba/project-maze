/**
 * Deploy-Wache: Kommt der gepushte Stand auch wirklich live an?
 *
 * Am 05.08. blieb der Auto-Deploy stehen und niemand merkte es. Zwölf Commits
 * lang beurteilte Sam eine Seite, die es so nicht mehr gab – darunter ein
 * kompletter Design-Umbau. Ein grüner Push ist eben kein Beweis, dass der Stand
 * live ist; das beweist nur `/health` mit dem erwarteten Commit.
 *
 * Genau das macht dieses Skript: Nach einem Push auf `main` pollt es `/health`,
 * bis dort der erwartete Commit steht, und schlägt fehl, wenn er ausbleibt.
 *
 *   EXPECTED_COMMIT=<sha> node scripts/deploy-watch.mjs
 *
 * Umgebung:
 *   EXPECTED_COMMIT   Voller oder gekürzter SHA (Pflicht)
 *   HEALTH_URL        Default https://www.mazers.de/health
 *   TIMEOUT_SECONDS   Default 900 (15 min)
 *   INTERVAL_SECONDS  Default 20
 *
 * Bewusst ohne Abhängigkeiten und ohne Token: `/health` ist öffentlich und
 * ungebremst – daran hängt der Health-Check der Plattform.
 *
 * ## Nicht jeder Push ist ein Deploy (13.08.)
 *
 * Diese Wache hielt anfangs JEDEN Push auf `main` für einen Deploy. Railway
 * deployt aber nur, was seine Watch-Paths abdecken – ein reiner Doku-Commit
 * wird übersprungen, und zwar richtigerweise. Die Wache wartete trotzdem ihre
 * vollen 15 Minuten und wurde rot: fünf von sechs Fehlschlägen in den letzten
 * dreißig Läufen waren Commits ohne eine einzige Datei unter `apps/` oder
 * `packages/`. Jeder kostete 15 Minuten Actions-Kontingent und eine
 * Alarmmail – bis niemand die Mails mehr ernst nahm.
 *
 * Seitdem fragt die Wache zuerst `git log`, welcher Commit zuletzt etwas
 * Deploybares angefasst hat (`deploy-scope.mjs`), und wartet auf DEN. Bei
 * einem Doku-Push ist das der Stand, der ohnehin schon live ist: Die Wache ist
 * dann nach einem Abgriff grün statt nach 15 Minuten rot – und meldet trotzdem
 * weiter, wenn live etwas noch Älteres steht.
 *
 * Das setzt eine vollständige Historie voraus (`fetch-depth: 0` im Checkout).
 * Fehlt sie, fällt die Wache auf das alte, strengere Verhalten zurück.
 */
import { execFileSync } from 'node:child_process';
import { DEPLOY_PATHS, erwarteterCommit } from './deploy-scope.mjs';

/**
 * Jüngster Commit der Historie, der etwas Deploybares anfasst. `null`, wenn
 * kein Git da ist, der Klon flach ist oder nichts passt – der Aufrufer fällt
 * dann auf den gepushten Commit zurück.
 */
function letzterDeploybarerCommit() {
  try {
    const ausgabe = execFileSync(
      'git',
      ['log', '-1', '--format=%H', '--', ...DEPLOY_PATHS],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
    ).trim();
    return ausgabe || null;
  } catch {
    return null;
  }
}

/** Dateien des gepushten Commits – nur für die Begründung im Log. */
function dateienVon(sha) {
  try {
    return execFileSync('git', ['show', '--name-only', '--format=', sha], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    }).split('\n').map((zeile) => zeile.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

const gepusht = (process.env.EXPECTED_COMMIT ?? '').trim();
const ziel = erwarteterCommit(gepusht, letzterDeploybarerCommit());
const expected = ziel.commit;
const healthUrl = (process.env.HEALTH_URL ?? 'https://www.mazers.de/health').trim();
const timeoutMs = Number(process.env.TIMEOUT_SECONDS ?? 900) * 1_000;
const intervalMs = Number(process.env.INTERVAL_SECONDS ?? 20) * 1_000;

if (!expected) {
  console.error('EXPECTED_COMMIT fehlt – ohne erwarteten Stand kann nichts geprüft werden.');
  process.exit(2);
}

/**
 * Beide Seiten auf sieben Zeichen bringen, bevor verglichen wird. `/health`
 * kürzt heute selbst – wer das dort einmal ändert, würde diese Wache sonst
 * still lahmlegen: Sie liefe gegen einen vollen SHA und käme nie mehr grün
 * heraus, ohne dass jemand den Grund sähe.
 */
const short = (sha) => String(sha ?? '').slice(0, 7);
const want = short(expected);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Sekunden lesbar machen – „läuft seit 3 Tagen" sagt mehr als „seit 271 844 s". */
const dauer = (sekunden) => {
  if (sekunden < 90) return `${Math.round(sekunden)} s`;
  if (sekunden < 5_400) return `${Math.round(sekunden / 60)} min`;
  if (sekunden < 172_800) return `${(sekunden / 3_600).toFixed(1)} h`;
  return `${(sekunden / 86_400).toFixed(1)} Tagen`;
};

/**
 * Ein Abgriff. Netzwerkfehler sind hier kein Abbruch: Während eines Deploys
 * ist der Dienst kurz weg, und genau dann läuft diese Wache.
 */
async function probe() {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    const response = await fetch(healthUrl, {
      signal: controller.signal,
      headers: { accept: 'application/json' }
    });
    clearTimeout(timer);
    if (!response.ok) return { error: `HTTP ${response.status}` };
    const body = await response.json();
    return {
      commit: typeof body.commit === 'string' ? body.commit : undefined,
      uptime: typeof body.uptimeSeconds === 'number' ? body.uptimeSeconds : undefined,
      deploymentId: typeof body.deploymentId === 'string' ? body.deploymentId : undefined,
      body
    };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Ab wann gilt ein Prozess als „frisch hochgekommen"? Wer jünger ist als diese
 * Spanne, kann nicht schon vor dem Push gelaufen sein – der Deploy ist also
 * angekommen, auch wenn `commit` etwas anderes behauptet.
 */
const freshSeconds = Number(process.env.FRESH_UPTIME_SECONDS ?? 900);

const started = Date.now();
let last = null;
let attempt = 0;
/** Erster gesehener Stand – Vergleichspunkt für „hat sich etwas bewegt?". */
let firstUptime;
let firstDeploymentId;
/** Harte Belege dafür, dass zwischendurch ein neuer Prozess hochkam. */
let sawRestart = false;
let sawNewDeployment = false;

if (ziel.eigenerDeploy) {
  console.log(`Deploy-Wache: erwarte ${want} auf ${healthUrl}`);
} else {
  // Kein Deploy zu erwarten – aber der zuletzt deployte Stand muss stehen.
  const dateien = dateienVon(gepusht);
  console.log(
    `Deploy-Wache: ${ziel.grund}.\n` +
      `  Gepusht: ${short(gepusht)}${dateien.length > 0 ? ` (${dateien.slice(0, 6).join(', ')}${dateien.length > 6 ? ', …' : ''})` : ''}\n` +
      `  Geprüft wird deshalb, ob der letzte Code-Stand ${want} live steht.`
  );
}

while (Date.now() - started < timeoutMs) {
  attempt += 1;
  const result = await probe();
  const seconds = Math.round((Date.now() - started) / 1_000);

  if (result.error) {
    console.log(`  [${seconds}s] noch nicht erreichbar (${result.error})`);
  } else if (short(result.commit) === want) {
    console.log(`\n✓ ${want} ist nach ${seconds}s live (${attempt} Abgriffe).`);
    process.exit(0);
  } else if (result.commit === 'unbekannt' || result.commit === undefined) {
    // Ohne gesetzte Commit-Variable kann diese Wache gar nichts beweisen. Das
    // ist kein Erfolg und darf nicht als solcher durchgehen.
    console.error(
      `\n✗ /health meldet keinen Commit (${result.commit ?? 'Feld fehlt'}).\n` +
        '  Damit ist nicht feststellbar, welcher Stand läuft. In Railway muss\n' +
        '  RAILWAY_GIT_COMMIT_SHA ankommen (oder GIT_COMMIT gesetzt sein).'
    );
    process.exit(1);
  } else {
    last = result.commit;
    // Bewegt sich der Prozess, obwohl `commit` stehenbleibt? Ein Rückgang der
    // Laufzeit oder eine neue Deployment-Kennung sind harte Belege dafür, dass
    // ein neuer Prozess hochgekommen ist – dann liegt es nicht am Deploy.
    if (firstUptime === undefined) firstUptime = result.uptime;
    if (firstDeploymentId === undefined) firstDeploymentId = result.deploymentId;
    if (result.uptime !== undefined && firstUptime !== undefined && result.uptime < firstUptime) {
      sawRestart = true;
    }
    if (result.deploymentId !== undefined && firstDeploymentId !== undefined
      && result.deploymentId !== firstDeploymentId) {
      sawNewDeployment = true;
    }
    const alter = result.uptime === undefined ? '' : `, läuft seit ${dauer(result.uptime)}`;
    console.log(`  [${seconds}s] live steht noch ${result.commit}, erwartet ${want}${alter}`);
  }
  await sleep(intervalMs);
}

const waited = Math.round((Date.now() - started) / 1_000);

/**
 * Zwei sehr verschiedene Befunde teilen sich dasselbe Symptom „`commit` stimmt
 * nicht". Sie auseinanderzuhalten ist der ganze Zweck dieser Wache:
 *
 * - **Der Deploy kam an, die Git-Variable lügt.** Der Prozess ist frisch
 *   hochgekommen, `commit` bleibt trotzdem stehen – dann ist
 *   `RAILWAY_GIT_COMMIT_SHA` fest verdrahtet. Ein Betriebsproblem, aber kein
 *   Deploy-Stopp, und der Job darf deswegen nicht rot werden: Eine Wache, die
 *   dauerhaft rot steht, wird nach drei Tagen ignoriert – und meldet dann auch
 *   den echten Stillstand nicht mehr.
 * - **Der Deploy kam nicht an.** Der Prozess läuft seit Stunden unverändert.
 *   Das ist der Fall, für den es diese Wache gibt.
 */
const frisch = firstUptime !== undefined && firstUptime < freshSeconds;
if (sawRestart || sawNewDeployment || frisch) {
  const grund = sawRestart ? 'die Laufzeit ist zwischendurch zurückgesprungen'
    : sawNewDeployment ? 'die Deployment-Kennung hat gewechselt'
    : `der Prozess läuft erst seit ${dauer(firstUptime)}`;
  // GitHub hebt das in der Oberfläche hervor, ohne den Job rot zu färben.
  console.log(`::warning::/health meldet ${last}, obwohl ${want} gepusht wurde – die Commit-Variable ist unzuverlässig.`);
  console.log(
    `\n⚠ Der Deploy IST angekommen – ${grund}.\n` +
      `  Trotzdem steht in /health weiter ${last} statt ${want}.\n` +
      '\n  Das ist kein Deploy-Stopp, sondern eine unzuverlässige Anzeige:\n' +
      '  RAILWAY_GIT_COMMIT_SHA ist vermutlich von Hand als Service-Variable\n' +
      '  gesetzt und überschreibt den echten Wert. In Railway aus den\n' +
      '  Service-Variablen entfernen – danach stimmt `commit` wieder, und diese\n' +
      '  Wache kann ihre eigentliche Aufgabe erfüllen.\n' +
      '\n  Der Job bleibt bewusst grün: Der ausgelieferte Stand ist aktuell.'
  );
  process.exit(0);
}

console.error(
  `\n✗ Nach ${waited}s steht live immer noch ${last ?? 'ein unbekannter Stand'} statt ${want}` +
    `${firstUptime === undefined ? '' : `, und der Prozess läuft unverändert seit ${dauer(firstUptime)}`}.\n` +
    '\n  Der Auto-Deploy ist vermutlich stehengeblieben. Erste Verdächtige:\n' +
    '    1. Railway-Watch-Paths – ein Muster, das auf nichts passt, überspringt\n' +
    '       jeden Deploy stillschweigend ("No changes to watched files").\n' +
    '       Deckt sich die Liste dort noch mit DEPLOY_PATHS in\n' +
    '       scripts/deploy-scope.mjs? Weicht sie ab, wartet diese Wache auf\n' +
    '       einen Deploy, den Railway bewusst überspringt – das war am 13.08.\n' +
    '       die Ursache einer ganzen Serie von Fehlmails.\n' +
    '    2. Auto-Deploy für den Service aus, oder das GitHub-Repo abgehängt.\n' +
    '    3. Ein fehlgeschlagener Build: Railway behält dann den alten Stand.\n' +
    '\n  Prüfen lässt sich das nur in der Railway-Oberfläche: Deployments-Liste\n' +
    '  auf den Zeitpunkt des letzten Pushes ansehen. Steht dort gar kein\n' +
    '  Eintrag, hat der Trigger nicht ausgelöst (Fall 1 oder 2); steht dort ein\n' +
    '  roter, ist es Fall 3 und das Build-Log sagt, warum.'
);
process.exit(1);

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
 */

const expected = (process.env.EXPECTED_COMMIT ?? '').trim();
const healthUrl = (process.env.HEALTH_URL ?? 'https://www.mazers.de/health').trim();
const timeoutMs = Number(process.env.TIMEOUT_SECONDS ?? 900) * 1_000;
const intervalMs = Number(process.env.INTERVAL_SECONDS ?? 20) * 1_000;

if (!expected) {
  console.error('EXPECTED_COMMIT fehlt – ohne erwarteten Stand kann nichts geprüft werden.');
  process.exit(2);
}

/** `/health` kürzt selbst auf sieben Zeichen; hier derselbe Schnitt. */
const short = (sha) => sha.slice(0, 7);
const want = short(expected);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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
    return { commit: typeof body.commit === 'string' ? body.commit : undefined, body };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

const started = Date.now();
let last = null;
let attempt = 0;

console.log(`Deploy-Wache: erwarte ${want} auf ${healthUrl}`);

while (Date.now() - started < timeoutMs) {
  attempt += 1;
  const result = await probe();
  const seconds = Math.round((Date.now() - started) / 1_000);

  if (result.error) {
    console.log(`  [${seconds}s] noch nicht erreichbar (${result.error})`);
  } else if (result.commit === want) {
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
    console.log(`  [${seconds}s] live steht noch ${result.commit}, erwartet ${want}`);
  }
  await sleep(intervalMs);
}

const waited = Math.round((Date.now() - started) / 1_000);
console.error(
  `\n✗ Nach ${waited}s steht live immer noch ${last ?? 'ein unbekannter Stand'} statt ${want}.\n` +
    '\n  Der Auto-Deploy ist vermutlich stehengeblieben. Erste Verdächtige:\n' +
    '    1. Railway-Watch-Paths – ein Muster, das auf nichts passt, überspringt\n' +
    '       jeden Deploy stillschweigend ("No changes to watched files").\n' +
    '    2. Auto-Deploy für den Service aus, oder das GitHub-Repo abgehängt.\n' +
    '    3. Ein fehlgeschlagener Build: Railway behält dann den alten Stand.\n' +
    '\n  Prüfen lässt sich das nur in der Railway-Oberfläche: Deployments-Liste\n' +
    '  auf den Zeitpunkt des letzten Pushes ansehen. Steht dort gar kein\n' +
    '  Eintrag, hat der Trigger nicht ausgelöst (Fall 1 oder 2); steht dort ein\n' +
    '  roter, ist es Fall 3 und das Build-Log sagt, warum.'
);
process.exit(1);

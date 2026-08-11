import { dauer, komma, kurzId, seit, tag, trend, zahl, zeitpunkt } from './format';
import type { ClassUsage, DailyRow, DeviceRow, Overview, Summary } from './types';

/**
 * Die Ansicht des Portals.
 *
 * Reines HTML aus Daten – kein Framework, keine Diagrammbibliothek. Die
 * Verlaufskurve ist ein handgeschriebenes SVG mit knapp vierzig Zeilen; eine
 * Bibliothek dafür wäre größer als alles andere auf dieser Seite zusammen.
 *
 * Reihenfolge der Abschnitte = Reihenfolge der Fragen: Läuft es? Wachsen wir?
 * Wie wird gespielt? Wer war da? Und ganz unten, für den Fehlerfall, was der
 * Betrieb meldet.
 */

const escape = (value: unknown): string => String(value)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Eine Kennzahl mit Beschriftung, optional mit Vergleich zur Vorperiode. */
function kachel(label: string, wert: string, fuss?: string, vergleich?: ReturnType<typeof trend>): string {
  const trendMarkup = vergleich
    ? `<em class="trend ${vergleich.richtung}">${escape(vergleich.text)}</em>`
    : '';
  return `<div class="kachel">
    <span class="kachel-label">${escape(label)}</span>
    <strong class="kachel-wert">${escape(wert)}${trendMarkup}</strong>
    ${fuss ? `<small>${escape(fuss)}</small>` : ''}
  </div>`;
}

/**
 * Verlauf als gestapelte Balken: wiederkehrende Spieler unten, neue oben.
 *
 * Gestapelt und nicht nebeneinander, weil die Frage „wie viele waren da" und
 * die Frage „wie viele davon waren neu" dieselbe Säule teilen – nebeneinander
 * müsste man zwei Höhen addieren, um die erste zu beantworten.
 */
function verlauf(rows: readonly DailyRow[]): string {
  if (rows.length === 0) return '<p class="leer">Noch keine Tage mit Besuchen.</p>';
  const breite = 1000;
  const hoehe = 220;
  const oben = 12;
  const unten = 26;
  const hoechst = Math.max(1, ...rows.map((row) => row.players));
  const spalte = breite / rows.length;
  const balken = Math.max(2, Math.min(38, spalte * 0.62));

  const saeulen = rows.map((row, index) => {
    const x = spalte * (index + 0.5) - balken / 2;
    const gesamt = (row.players / hoechst) * (hoehe - oben - unten);
    const neu = (Math.min(row.newPlayers, row.players) / hoechst) * (hoehe - oben - unten);
    const basis = hoehe - unten;
    return `<g class="saeule">
      <title>${escape(tag(row.day))} · ${row.players} Spieler, davon ${row.newPlayers} neu · ${row.sessions} Besuche</title>
      <rect x="${x.toFixed(1)}" y="${(basis - gesamt).toFixed(1)}" width="${balken.toFixed(1)}" height="${Math.max(0, gesamt).toFixed(1)}" rx="2" class="balken-alt"/>
      <rect x="${x.toFixed(1)}" y="${(basis - neu).toFixed(1)}" width="${balken.toFixed(1)}" height="${Math.max(0, neu).toFixed(1)}" rx="2" class="balken-neu"/>
    </g>`;
  }).join('');

  // Höchstens acht Beschriftungen, sonst überlappen sie sich bei 90 Tagen.
  const schritt = Math.max(1, Math.ceil(rows.length / 8));
  const beschriftet: number[] = [];
  for (let index = 0; index < rows.length; index += schritt) beschriftet.push(index);
  // Der letzte Tag ist der wichtigste – aber nur, wenn er nicht auf seinem
  // Vorgänger klebt. Bei 30 Tagen und Schritt 4 landete er sonst direkt neben
  // Tag 28, und aus „7.8." und „8.8." wurde ein „7.88.8.".
  const letzter = rows.length - 1;
  if (letzter - (beschriftet[beschriftet.length - 1] ?? 0) >= Math.ceil(schritt / 2)) beschriftet.push(letzter);

  const marken = beschriftet.map((index) => {
    // An den Rändern nach innen ausrichten, sonst schneidet die viewBox das
    // erste und das letzte Datum an.
    const anker = index === 0 ? 'start' : index === letzter ? 'end' : 'middle';
    const x = index === 0 ? 0 : index === letzter ? breite : spalte * (index + 0.5);
    return `<text x="${x.toFixed(1)}" y="${hoehe - 8}" text-anchor="${anker}" class="marke">${escape(tag(rows[index]!.day))}</text>`;
  }).join('');

  return `<figure class="verlauf">
    <svg viewBox="0 0 ${breite} ${hoehe}" role="img" aria-label="Spieler je Tag">
      <line x1="0" y1="${hoehe - unten}" x2="${breite}" y2="${hoehe - unten}" class="achse"/>
      ${saeulen}${marken}
    </svg>
    <figcaption>
      <span><i class="punkt neu"></i> neu</span>
      <span><i class="punkt alt"></i> wiederkehrend</span>
      <span class="rechts">Höchstwert ${zahl(hoechst)} Spieler/Tag</span>
    </figcaption>
  </figure>`;
}

function klassenTabelle(classes: readonly ClassUsage[], ungenutzt: readonly string[]): string {
  if (classes.length === 0) {
    return '<p class="leer">In diesem Zeitraum wurde keine Runde beendet.</p>';
  }
  const zeilen = classes.slice(0, 20).map((entry) => `<tr>
    <td><i class="familie branch-${escape(entry.branch)}"></i>${escape(entry.label)}</td>
    <td class="zahl">${zahl(entry.runs)}</td>
    <td class="anteil">
      <span class="anteil-balken"><b style="width:${Math.max(1, entry.share)}%"></b></span>
      <em>${komma(entry.share)} %</em>
    </td>
    <td class="zahl">${komma(entry.avgLevel)}</td>
    <td class="zahl">${zahl(entry.avgScore)}</td>
    <td class="zahl">${dauer(entry.avgSeconds)}</td>
  </tr>`).join('');

  // Die ungespielten Klassen sind für einen Product Owner die interessantere
  // Hälfte der Tabelle: Sie zeigen, was gebaut wurde und niemand findet.
  const rest = ungenutzt.length > 0
    ? `<p class="hinweis"><b>Nie gespielt (${ungenutzt.length}):</b> ${escape(ungenutzt.join(' · '))}</p>`
    : '<p class="hinweis">Jede Klasse wurde mindestens einmal gespielt.</p>';

  return `<table class="tabelle">
    <thead><tr><th>Klasse</th><th class="zahl">Runden</th><th>Anteil</th><th class="zahl">Ø Level</th><th class="zahl">Ø Score</th><th class="zahl">Ø Dauer</th></tr></thead>
    <tbody>${zeilen}</tbody>
  </table>${rest}`;
}

function spielerTabelle(rows: readonly DeviceRow[], total: number, sortierung: string): string {
  if (rows.length === 0) return '<p class="leer">Noch keine Besuche aufgezeichnet.</p>';
  const zeilen = rows.map((row) => `<tr>
    <td>
      <strong>${escape(row.lastName ?? 'Gast')}</strong>
      ${row.lastUserId ? '<em class="marke-konto">Konto</em>' : ''}
      <small>${escape(kurzId(row.deviceId))}</small>
    </td>
    <td>${escape(zeitpunkt(row.firstSeen))}</td>
    <td>${escape(seit(row.lastSeen))}</td>
    <td class="zahl">${zahl(row.sessions)}</td>
    <td class="zahl">${zahl(row.runs)}</td>
    <td class="zahl">${dauer(row.totalSeconds)}</td>
    <td class="zahl">${zahl(row.bestScore)}</td>
    <td class="zahl">${zahl(row.bestLevel)}</td>
  </tr>`).join('');
  return `<table class="tabelle">
    <thead><tr>
      <th>Spieler</th><th>Erster Besuch</th><th>Zuletzt</th>
      <th class="zahl">Besuche</th><th class="zahl">Runden</th><th class="zahl">Spielzeit</th>
      <th class="zahl">Bester Score</th><th class="zahl">Bestes Level</th>
    </tr></thead>
    <tbody>${zeilen}</tbody>
  </table>
  <p class="hinweis">${zahl(rows.length)} von ${zahl(total)} Geräten, sortiert nach ${sortierung}.</p>`;
}

/** Feature-Schalter als Ampelreihe – falsch gesetzte ENV-Variablen sieht man hier. */
function schalter(features: Record<string, unknown> | undefined): string {
  if (!features) return '';
  const eintraege = Object.entries(features).map(([name, value]) => {
    const an = value === true || (typeof value === 'string' && value.length > 0);
    const text = typeof value === 'string' ? value : an ? 'an' : 'aus';
    return `<span class="flag ${an ? 'an' : 'aus'}"><b>${escape(name)}</b>${escape(text)}</span>`;
  });
  return `<div class="flags">${eintraege.join('')}</div>`;
}

const ampel = (ok: boolean): string => `<i class="ampel ${ok ? 'gut' : 'schlecht'}"></i>`;

function betrieb(overview: Overview): string {
  const live = overview.live;
  const tick = live.tick ?? {};
  const auth = live.auth ?? {};
  const sessions = (overview.sessions ?? {}) as Record<string, number | boolean | null>;
  const persistence = (overview.persistence ?? {}) as Record<string, number | boolean | null>;
  const zeilen: Array<[string, string, boolean]> = [
    ['Takt', `Ø ${komma(Number(tick.averageMs ?? 0))} ms · p95 ${komma(Number(tick.p95Ms ?? 0))} ms · Spitze ${komma(Number(tick.maxMs ?? 0))} ms · ${zahl(Number(tick.overrunsTotal ?? 0))} Überläufe bei ${zahl(Number(tick.ticksTotal ?? 0))} Ticks`,
      // Nicht am Mittelwert messen, sondern an der Auslastung: Ein Takt, der im
      // Schnitt schnell ist und in jeder zehnten Runde das Budget reißt, ruckelt.
      Number(tick.busyRatio ?? 0) < 0.5 && Number(tick.overrunsTotal ?? 0) === 0],
    ['Login', `${auth.enabled ? `an (${escape(String(auth.mode ?? ''))})` : 'aus'} · ${zahl(Number(auth.verified ?? 0))} geprüft · ${zahl(Number(auth.rejected ?? 0))} abgelehnt`,
      Boolean(auth.enabled)],
    ['Runs-Puffer', `${zahl(Number(persistence['queued'] ?? 0))} wartend · ${zahl(Number(persistence['written'] ?? 0))} geschrieben · ${zahl(Number(persistence['dropped'] ?? 0))} verworfen`,
      Number(persistence['dropped'] ?? 0) === 0 && persistence['enabled'] === true],
    ['Sitzungs-Puffer', `${zahl(Number(sessions['open'] ?? 0))} offen · ${zahl(Number(sessions['queued'] ?? 0))} wartend · ${zahl(Number(sessions['written'] ?? 0))} geschrieben · ${zahl(Number(sessions['discarded'] ?? 0))} zu kurz`,
      Number(sessions['dropped'] ?? 0) === 0 && sessions['enabled'] === true]
  ];
  const liste = zeilen.map(([name, wert, ok]) => `<li>${ampel(ok)}<b>${escape(name)}</b><span>${wert}</span></li>`).join('');
  return `<ul class="betrieb">${liste}</ul>${schalter(live.features)}`;
}

/**
 * Vergleicht die zweite Hälfte des Zeitraums mit der ersten – **gleich lange
 * Hälften**, sonst vergleicht die Kachel Äpfel mit Birnen.
 *
 * Der erste Anlauf teilte bei `Math.floor(länge / 2)` und gab der jüngeren
 * Hälfte den Rest. Bei sieben Tagen standen damit vier Tage gegen drei: Eine
 * vollkommen flache Woche – jeden Tag dieselben zehn Spieler – meldete auf
 * jeder Kachel **+33 %**. Das ist die schlimmste Sorte Fehler in einem Portal,
 * in das man täglich zehn Sekunden schaut: Die Zahl sieht nach Wachstum aus,
 * das Wachstum kommt aus der Division.
 *
 * Betroffen war nicht nur die Sieben-Tage-Ansicht. Fehlt in einem längeren
 * Fenster ein Tag ohne Daten – bei einem jungen Spiel der Normalfall –, ist die
 * Zeilenzahl ungerade, und derselbe Aufschlag entsteht.
 *
 * Bei ungerader Zeilenzahl fällt deshalb der **älteste** Tag heraus: Verglichen
 * werden die letzten k Tage mit den k davor.
 */
export function haelften(rows: readonly DailyRow[]): { jung: Summary; alt: Summary } | null {
  if (rows.length < 4) return null;
  const k = Math.floor(rows.length / 2);
  const summe = (teil: readonly DailyRow[]): Summary => teil.reduce((acc, row) => ({
    players: acc.players + row.players,
    newPlayers: acc.newPlayers + row.newPlayers,
    sessions: acc.sessions + row.sessions,
    accounts: acc.accounts + row.accounts,
    runs: acc.runs + row.runs,
    kills: acc.kills + row.kills,
    totalSeconds: acc.totalSeconds + row.totalSeconds,
    avgSessionSeconds: 0
  }), { players: 0, newPlayers: 0, sessions: 0, accounts: 0, runs: 0, kills: 0, totalSeconds: 0, avgSessionSeconds: 0 });
  return { alt: summe(rows.slice(rows.length - 2 * k, rows.length - k)), jung: summe(rows.slice(rows.length - k)) };
}

export interface ViewState {
  overview: Overview;
  players: DeviceRow[];
  playersTotal: number;
  sortierung: 'new' | 'active';
  tage: number;
  aktualisiert: number;
}

export function renderPortal(state: ViewState): string {
  const { overview } = state;
  const live = overview.live;
  const heute = overview.today;
  const fenster = overview.window;
  const vergleich = haelften(overview.daily);

  const online = Number(live.humans ?? 0);
  const kopf = `<header class="kopf">
    <div>
      <span class="marke">MAZERS</span>
      <h1>Zentrale</h1>
    </div>
    <div class="kopf-rechts">
      <span class="live ${live.draining ? 'draining' : online > 0 ? 'aktiv' : 'ruhig'}">
        <i></i>${live.draining ? 'fährt herunter' : `${zahl(online)} online`}
      </span>
      <select id="tage" aria-label="Zeitraum">
        ${[7, 14, 30, 90].map((d) => `<option value="${d}"${d === state.tage ? ' selected' : ''}>${d} Tage</option>`).join('')}
      </select>
      <button id="neu" type="button">Aktualisieren</button>
      <button id="abmelden" type="button" class="leise">Abmelden</button>
    </div>
  </header>`;

  const jetzt = `<section class="block">
    <h2>Jetzt</h2>
    <div class="kacheln">
      ${kachel('Spieler online', zahl(online), `${zahl(Number(live.bots ?? 0))} Bots in der Arena`)}
      ${kachel('Projektile', zahl(Number(live.projectiles ?? 0)), `${zahl(Number(live.drones ?? 0))} Drohnen · ${zahl(Number(live.shapes ?? 0))} Formen`)}
      ${kachel('Läuft seit', dauer(Number(live.uptimeSeconds ?? 0)), `Stand ${escape(String(live.commit ?? '?'))} · Deploy ${escape(String(live.deploymentId ?? '?'))}`)}
      ${kachel('Takt', `${komma(Number(live.tick?.averageMs ?? 0))} ms`, `Budget ${zahl(Number(live.tick?.budgetMs ?? 25))} ms · ${Math.round(Number(live.tick?.busyRatio ?? 0) * 100)} % ausgelastet · ${zahl(Number(live.tick?.overrunsTotal ?? 0))} Überläufe`)}
    </div>
  </section>`;

  const wachstum = `<section class="block">
    <h2>Heute</h2>
    <div class="kacheln">
      ${kachel('Spieler', zahl(heute.players), `${zahl(heute.sessions)} Besuche`)}
      ${kachel('Davon neu', zahl(heute.newPlayers), heute.players > 0 ? `${Math.round(heute.newPlayers / heute.players * 100)} % der Besucher` : 'noch niemand da')}
      ${kachel('Runden', zahl(heute.runs), `${zahl(heute.kills)} Abschüsse`)}
      ${kachel('Spielzeit', dauer(heute.totalSeconds), `Ø ${dauer(heute.avgSessionSeconds)} je Besuch`)}
    </div>
  </section>

  <section class="block">
    <h2>Letzte ${state.tage} Tage</h2>
    <div class="kacheln">
      ${kachel('Spielertage', zahl(fenster.players), 'Summe der Tageswerte – wer an drei Tagen spielt, zählt dreimal',
        vergleich ? trend(vergleich.jung.players, vergleich.alt.players) : undefined)}
      ${kachel('Neue Spieler', zahl(fenster.newPlayers), 'exakt: jedes Gerät ist an genau einem Tag neu',
        vergleich ? trend(vergleich.jung.newPlayers, vergleich.alt.newPlayers) : undefined)}
      ${kachel('Besuche', zahl(fenster.sessions), `Ø ${dauer(fenster.avgSessionSeconds)} lang`,
        vergleich ? trend(vergleich.jung.sessions, vergleich.alt.sessions) : undefined)}
      ${kachel('Spielzeit', dauer(fenster.totalSeconds), `${zahl(fenster.runs)} Runden · ${zahl(fenster.kills)} Abschüsse`,
        vergleich ? trend(vergleich.jung.totalSeconds, vergleich.alt.totalSeconds) : undefined)}
    </div>
    ${verlauf(overview.daily)}
  </section>`;

  const klassen = `<section class="block">
    <h2>Wie gespielt wird</h2>
    ${klassenTabelle(overview.classes, overview.unusedClasses)}
  </section>`;

  const spieler = `<section class="block">
    <h2>Spieler
      <span class="schalterreihe">
        <button type="button" data-sort="active" class="${state.sortierung === 'active' ? 'an' : ''}">zuletzt da</button>
        <button type="button" data-sort="new" class="${state.sortierung === 'new' ? 'an' : ''}">neu</button>
      </span>
    </h2>
    ${spielerTabelle(state.players, state.playersTotal, state.sortierung === 'new' ? 'erstem Besuch' : 'letztem Besuch')}
  </section>`;

  const bestenliste = overview.top.length > 0
    ? `<section class="block">
        <h2>Bestenliste</h2>
        <table class="tabelle">
          <thead><tr><th>#</th><th>Name</th><th class="zahl">Score</th><th class="zahl">Level</th><th>Klasse</th><th class="zahl">Dauer</th><th>Wann</th></tr></thead>
          <tbody>${overview.top.map((run) => `<tr>
            <td class="zahl">${run.rank}</td>
            <td><strong>${escape(run.playerName)}</strong></td>
            <td class="zahl">${zahl(run.score)}</td>
            <td class="zahl">${zahl(run.level)}</td>
            <td>${escape(run.playerClass)}</td>
            <td class="zahl">${dauer(run.durationSeconds)}</td>
            <td>${escape(seit(run.achievedAt))}</td>
          </tr>`).join('')}</tbody>
        </table>
      </section>`
    : '';

  const technik = `<section class="block">
    <h2>Betrieb</h2>
    ${betrieb(overview)}
  </section>`;

  const warnung = overview.database
    ? ''
    : `<p class="warnung">${escape(overview.hint ?? 'Ohne Datenbank gibt es keinen Verlauf.')}</p>`;

  return `${kopf}${warnung}${jetzt}${wachstum}${klassen}${spieler}${bestenliste}${technik}
    <footer class="fuss">Zuletzt aktualisiert ${escape(zeitpunkt(new Date(state.aktualisiert).toISOString()))} · aktualisiert sich alle 20 Sekunden</footer>`;
}

/** Der Zustand vor dem Login – und der, in dem die Allowlist noch leer ist. */
export function renderTor(zustand: {
  authEnabled: boolean;
  userId: string | null;
  allowlistSize: number;
  fehler: string | null;
  laedt: boolean;
}): string {
  if (zustand.laedt) return '<div class="tor"><p>Einen Moment …</p></div>';

  if (!zustand.authEnabled) {
    return `<div class="tor">
      <span class="marke">MAZERS</span>
      <h1>Zentrale</h1>
      <p class="warnung">Der Login ist auf diesem Server abgeschaltet. Das Portal braucht ihn.</p>
      <p>Setze in Railway <code>AUTH_ENABLED=true</code> (dazu <code>SUPABASE_JWT_SECRET</code> oder die JWKS-Konfiguration, siehe <code>docs/SUPABASE.md</code>) und starte neu.</p>
    </div>`;
  }

  if (zustand.userId) {
    // Angemeldet, aber nicht eingetragen: Hier steht die ID, die in die
    // Allowlist gehört. Ohne diesen Bildschirm käme niemand je hinein.
    return `<div class="tor">
      <span class="marke">MAZERS</span>
      <h1>Zentrale</h1>
      <p class="warnung">${zustand.allowlistSize === 0
        ? 'Es ist noch kein Admin eingetragen.'
        : 'Dieses Konto steht nicht auf der Liste.'}</p>
      <p>Deine Konto-ID:</p>
      <code class="id" id="konto-id">${escape(zustand.userId)}</code>
      <button id="kopieren" type="button">ID kopieren</button>
      <p class="klein">Trage sie in Railway unter <code>ADMIN_USER_IDS</code> ein (mehrere durch Komma getrennt) und starte den Dienst neu. Danach lädst du diese Seite neu.</p>
      <button id="abmelden" type="button" class="leise">Abmelden</button>
    </div>`;
  }

  return `<div class="tor">
    <span class="marke">MAZERS</span>
    <h1>Zentrale</h1>
    <p>Anmelden, um die Zahlen zu sehen.</p>
    ${zustand.fehler ? `<p class="warnung">${escape(zustand.fehler)}</p>` : ''}
    <button id="anmelden" type="button" class="gross">Mit Google anmelden</button>
  </div>`;
}
